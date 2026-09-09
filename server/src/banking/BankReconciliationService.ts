import crypto from 'crypto';
import { db } from '../database/db';
import {
  AccountingTransactionType,
  BankAccount,
  BankReconciliationMatch,
  BankReconciliationRule,
  BankReconciliationSession,
  BankStatementImport,
  BankStatementSourceFormat,
  BankStatementTransaction,
  CSVColumnMapping,
  MatchSuggestion,
} from '../../../src/types/banking';
import { AccountingCandidate, BankMatchingEngine } from './BankMatchingEngine';
import { BankRulesEngine } from './BankRulesEngine';
import { BankStatementParserFactory } from './parsers/BankStatementParserFactory';
import { newId } from '../utils/ids';
import { AccountingPeriodService } from '../accounting/AccountingPeriodService';
import { ServerPostingEngine } from '../accounting/postingEngine';
import { MonetaryAccountPolicy } from '../accounting/monetaryAccountPolicy';
import { FinancialDestructiveActionsService } from '../accounting/FinancialDestructiveActionsService';

/**
 * BANK RECONCILIATION SERVICE
 * 
 * ACCOUNTING ARCHITECTURE NOTE:
 * The General Ledger (GL) is the authoritative source of truth for all financial and accounting balances.
 * bank_accounts.current_balance is a cached, denormalized representation used for fast reads/previews.
 * It is maintained atomically during posted transactions, and can be completely recalculated from the
 * General Ledger at any time using rebuildBankBalancesFromGL(orgId).
 */
export class BankReconciliationService {
  // --- 1. BANK ACCOUNTS ---
  public static async getBankAccounts(orgId: string): Promise<BankAccount[]> {
    const res = await db.transaction(
      (client) => client.query<BankAccount>(
        `SELECT * FROM bank_accounts WHERE organization_id = $1 AND is_active = TRUE ORDER BY created_at DESC`,
        [orgId]
      ),
      { organizationId: orgId }
    );
    return (res.rows || []).map((r) => this.formatBankAccount(r));
  }

  public static async createBankAccount(orgId: string, data: Partial<BankAccount>, actorId: string = 'system'): Promise<BankAccount> {
    const accountName = typeof data.accountName === 'string' ? data.accountName.trim() : '';
    const bankName = typeof data.bankName === 'string' ? data.bankName.trim() : '';
    const accountNumber = typeof data.accountNumber === 'string' ? data.accountNumber.replace(/[\s-]/g, '') : '';
    if (!data.ledgerAccountId || !accountName || !bankName || !/^[A-Za-z0-9]{4,34}$/.test(accountNumber)) {
      throw new Error('A tenant ledger account, account name, bank name, and valid account identifier are required');
    }
    if (!data.currency || !/^[A-Z]{3}$/.test(data.currency) || !data.openingBalanceDate || !/^\d{4}-\d{2}-\d{2}$/.test(data.openingBalanceDate)) {
      throw new Error('A three-letter currency and opening date in YYYY-MM-DD format are required');
    }
    if (Number(data.currentBalance || 0) !== 0) {
      throw new Error('Bank balances must be established through balanced ledger postings');
    }
    const id = data.id || newId('bank-acc');
    const maskedNumber = data.accountNumber ? `•••• ${data.accountNumber.slice(-4)}` : '•••• 0000';

    const account: BankAccount = {
      id,
      organizationId: orgId,
      ledgerAccountId: data.ledgerAccountId,
      accountName,
      accountNumber: maskedNumber,
      maskedAccountNumber: maskedNumber,
      bankName,
      accountType: data.accountType || 'Checking',
      currency: data.currency,
      country: data.country || '',
      currentBalance: 0,
      openingBalanceDate: data.openingBalanceDate,
      statementImportEnabled: true,
      status: 'Active',
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await db.transaction(async (client) => {
      const ledgerAccount = await client.query(
        `SELECT id FROM accounts
          WHERE organization_id = $1 AND id = $2 AND type = 'Asset' AND status = 'Active'
            AND LOWER(COALESCE(sub_type, '')) IN ('bank', 'cash', 'wallet')`,
        [orgId, data.ledgerAccountId]
      );
      if (ledgerAccount.rows.length !== 1) {
        throw new Error('Bank account must link to an active tenant bank, cash, or wallet ledger account');
      }
      await client.query(
        `INSERT INTO bank_accounts (id, organization_id, ledger_account_id, account_name, account_number, masked_account_number, bank_name, account_type, currency, country, current_balance, opening_balance_date, statement_import_enabled, status, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
        [account.id, account.organizationId, account.ledgerAccountId, account.accountName,
          account.accountNumber, account.maskedAccountNumber, account.bankName, account.accountType,
          account.currency, account.country, 0, account.openingBalanceDate,
          account.statementImportEnabled, account.status, account.isActive]
      );
      await client.query(
        `INSERT INTO audit_logs (id, organization_id, user_id, action, entity_type, entity_id, after_state)
         VALUES ($1, $2, $3, 'BANK_ACCOUNT_CREATED', 'BankAccount', $4, $5)`,
        [newId('aud'), orgId, actorId, id, JSON.stringify({ accountName, bankName, maskedAccountNumber: maskedNumber, ledgerAccountId: data.ledgerAccountId })]
      );
    }, { organizationId: orgId });

    return account;
  }

  public static async deleteBankAccount(
    orgId: string,
    bankAccountIdOrLedgerId: string,
    actorId: string = 'system'
  ): Promise<{ id: string; ledgerAccountId: string | null; accountName: string }> {
    const targetId = String(bankAccountIdOrLedgerId || '').trim();
    if (!targetId) {
      throw new Error('BANK_ACCOUNT_ID_REQUIRED: A bank account identifier is required');
    }

    return await db.transaction(async (client) => {
      const bankResult = await client.query(
        `SELECT * FROM bank_accounts
          WHERE organization_id = $1 AND (id = $2 OR ledger_account_id = $2)
          FOR UPDATE`,
        [orgId, targetId]
      );
      if (bankResult.rows.length === 0) {
        throw new Error('BANK_ACCOUNT_NOT_FOUND: Bank account does not exist');
      }
      const bankAccount = bankResult.rows[0];

      // 1. Balance check on bank account
      if (Math.abs(Number(bankAccount.current_balance || 0)) > 0.0001) {
        throw new Error('BANK_ACCOUNT_DELETE_BALANCE: Bank accounts with a non-zero balance cannot be deleted. Please transfer or adjust the balance first.');
      }

      // 2. Statement import check
      const importCheck = await client.query(
        `SELECT 1 FROM bank_statement_imports WHERE organization_id = $1 AND bank_account_id = $2 LIMIT 1`,
        [orgId, bankAccount.id]
      );
      if (importCheck.rows.length > 0) {
        throw new Error('BANK_ACCOUNT_DELETE_IN_USE: This bank account has statement import history and cannot be deleted. Archive the account instead.');
      }

      // 3. Statement transactions check
      const txCheck = await client.query(
        `SELECT 1 FROM bank_statement_transactions WHERE organization_id = $1 AND bank_account_id = $2 LIMIT 1`,
        [orgId, bankAccount.id]
      );
      if (txCheck.rows.length > 0) {
        throw new Error('BANK_ACCOUNT_DELETE_IN_USE: This bank account has imported transactions and cannot be deleted. Archive the account instead.');
      }

      // 4. Reconciliation sessions check
      const reconCheck = await client.query(
        `SELECT 1 FROM bank_reconciliation_sessions WHERE organization_id = $1 AND bank_account_id = $2 LIMIT 1`,
        [orgId, bankAccount.id]
      );
      if (reconCheck.rows.length > 0) {
        throw new Error('BANK_ACCOUNT_DELETE_IN_USE: This bank account has reconciliation sessions and cannot be deleted.');
      }

      // 5. Linked ledger account check
      const ledgerAccountId = bankAccount.ledger_account_id;
      if (ledgerAccountId) {
        const ledgerResult = await client.query(
          `SELECT * FROM accounts WHERE organization_id = $1 AND id = $2 FOR UPDATE`,
          [orgId, ledgerAccountId]
        );
        if (ledgerResult.rows.length > 0) {
          const ledgerAccount = ledgerResult.rows[0];
          if (ledgerAccount.is_system_account || ledgerAccount.is_locked) {
            throw new Error('ACCOUNT_DELETE_PROTECTED: System and locked accounts cannot be deleted.');
          }
          if (Math.abs(Number(ledgerAccount.balance || 0)) > 0.0001) {
            throw new Error('BANK_ACCOUNT_DELETE_BALANCE: The linked ledger account has a non-zero balance and cannot be deleted.');
          }

          // Check if used in journals, expenses, payments, etc.
          const usageChecks: Array<{ label: string; sql: string }> = [
            { label: 'customer payment', sql: `SELECT 1 FROM payments_received WHERE organization_id = $1 AND deposit_to_account_id = $2 LIMIT 1` },
            { label: 'vendor payment', sql: `SELECT 1 FROM payments_made WHERE organization_id = $1 AND paid_from_account_id = $2 LIMIT 1` },
            { label: 'customer refund', sql: `SELECT 1 FROM customer_refunds WHERE organization_id = $1 AND refund_account_id = $2 LIMIT 1` },
            { label: 'vendor refund', sql: `SELECT 1 FROM vendor_refunds WHERE organization_id = $1 AND deposit_to_account_id = $2 LIMIT 1` },
            { label: 'expense', sql: `SELECT 1 FROM expenses WHERE organization_id = $1 AND (expense_account_id = $2 OR paid_from_account_id = $2) LIMIT 1` },
            { label: 'journal entry', sql: `SELECT 1 FROM journal_lines jl LEFT JOIN journal_entries je ON je.id = jl.journal_entry_id WHERE jl.account_id = $2 AND COALESCE(jl.organization_id, je.organization_id) = $1 LIMIT 1` },
            { label: 'accounting default', sql: `SELECT 1 FROM accounting_defaults WHERE organization_id = $1 AND account_id = $2 LIMIT 1` },
            { label: 'bank rule', sql: `SELECT 1 FROM bank_reconciliation_rules WHERE organization_id = $1 AND suggested_account_id = $2 LIMIT 1` },
            { label: 'child account', sql: `SELECT 1 FROM accounts WHERE organization_id = $1 AND parent_account_id = $2 LIMIT 1` },
          ];

          for (const check of usageChecks) {
            const ref = await client.query(check.sql, [orgId, ledgerAccountId]);
            if (ref.rows.length > 0) {
              throw new Error(`BANK_ACCOUNT_DELETE_IN_USE: The linked ledger account is used by a ${check.label}. Remove that reference or archive the account instead.`);
            }
          }

          // Delete ledger account
          await client.query(`DELETE FROM accounts WHERE organization_id = $1 AND id = $2`, [orgId, ledgerAccountId]);
        }
      }

      // 6. Delete bank_accounts record
      await client.query(
        `DELETE FROM bank_accounts WHERE organization_id = $1 AND id = $2`,
        [orgId, bankAccount.id]
      );

      // 7. Audit log
      await client.query(
        `INSERT INTO audit_logs (id, organization_id, user_id, action, entity_type, entity_id, before_state)
         VALUES ($1, $2, $3, 'BANK_ACCOUNT_DELETED', 'BankAccount', $4, $5)`,
        [
          newId('aud'),
          orgId,
          actorId,
          bankAccount.id,
          JSON.stringify({
            id: bankAccount.id,
            accountName: bankAccount.account_name,
            bankName: bankAccount.bank_name,
            maskedAccountNumber: bankAccount.masked_account_number,
            ledgerAccountId: bankAccount.ledger_account_id,
          }),
        ]
      );

      return {
        id: bankAccount.id,
        ledgerAccountId: bankAccount.ledger_account_id,
        accountName: bankAccount.account_name,
      };
    }, { organizationId: orgId });
  }

  /**
   * REBUILD BANK BALANCES FROM GENERAL LEDGER
   * 
   * Re-calculates bank_accounts.current_balance strictly from posted General Ledger journal lines.
   * Ensures the General Ledger remains the absolute source of truth.
   */
  public static async rebuildBankBalancesFromGL(orgId: string): Promise<{ bankAccountId: string; oldBalance: number; newBalance: number }[]> {
    const bankAccounts = await this.getBankAccounts(orgId);
    const results: { bankAccountId: string; oldBalance: number; newBalance: number }[] = [];

    for (const bankAcc of bankAccounts) {
      let glBalance = 0;
      if (bankAcc.ledgerAccountId) {
        const glRes = await db.query(
          `SELECT COALESCE(SUM(jl.debit) - SUM(jl.credit), 0) AS net_balance
           FROM journal_lines jl
           JOIN journal_entries je ON jl.journal_entry_id = je.id
           WHERE je.organization_id = $1 AND je.status = 'Posted' AND jl.account_id = $2`,
          [orgId, bankAcc.ledgerAccountId]
        );
        glBalance = parseFloat(glRes.rows?.[0]?.net_balance || '0');
      } else {
        const glRes = await db.query(
          `SELECT COALESCE(SUM(jl.debit) - SUM(jl.credit), 0) AS net_balance
           FROM journal_lines jl
           JOIN journal_entries je ON jl.journal_entry_id = je.id
           JOIN accounts a ON jl.account_id = a.id OR jl.account_code = a.code
           WHERE je.organization_id = $1 AND je.status = 'Posted' AND a.organization_id = $1 AND (a.code = '1010' OR a.type = 'Bank')`,
          [orgId]
        );
        glBalance = parseFloat(glRes.rows?.[0]?.net_balance || '0');
      }

      const oldBalance = bankAcc.currentBalance;
      bankAcc.currentBalance = glBalance;

      await db.query(
        `UPDATE bank_accounts SET current_balance = $1, updated_at = CURRENT_TIMESTAMP WHERE organization_id = $2 AND id = $3`,
        [glBalance, orgId, bankAcc.id]
      );

      results.push({
        bankAccountId: bankAcc.id,
        oldBalance,
        newBalance: glBalance,
      });
    }

    return results;
  }

  // --- 2. STATEMENT PREVIEW & IMPORT ---
  public static async previewStatement(
    orgId: string,
    bankAccountId: string,
    filename: string,
    content: string,
    sourceFormat?: BankStatementSourceFormat,
    mapping?: CSVColumnMapping
  ): Promise<{
    detectedFormat: BankStatementSourceFormat;
    isValid: boolean;
    validationErrors: string[];
    fileHash: string;
    totalTransactions: number;
    duplicateCount: number;
    newTransactionsCount: number;
    statementFrom?: string;
    statementTo?: string;
    openingBalance?: number;
    closingBalance?: number;
    previewTransactions: Array<{
      transactionDate: string;
      valueDate?: string;
      amount: number;
      direction: 'CREDIT' | 'DEBIT';
      narration: string;
      reference?: string;
      runningBalance?: number;
      isDuplicate: boolean;
      ruleMatch?: any;
    }>;
  }> {
    const validationErrors: string[] = [];
    const detectedFormat = sourceFormat || BankStatementParserFactory.detectFormat(content);
    const fileHash = crypto.createHash('sha256').update(content).digest('hex');

    // 1. Validate bank account existence & currency
    const accountResult = await db.query(
      `SELECT currency FROM bank_accounts WHERE organization_id = $1 AND id = $2 AND is_active = TRUE`,
      [orgId, bankAccountId]
    );
    if (accountResult.rows.length === 0) {
      validationErrors.push('Bank account does not exist or is inactive');
    }
    const accountCurrency = String(accountResult.rows[0]?.currency || '');

    // 2. Parse statement
    let parsed: any;
    try {
      parsed = BankStatementParserFactory.parseStatement(content, bankAccountId, detectedFormat, mapping);
    } catch (err: any) {
      validationErrors.push(`Failed to parse statement format ${detectedFormat}: ${err?.message || err}`);
      return {
        detectedFormat,
        isValid: false,
        validationErrors,
        fileHash,
        totalTransactions: 0,
        duplicateCount: 0,
        newTransactionsCount: 0,
        previewTransactions: [],
      };
    }

    // 3. Currency validation
    const statementCurrency = String(parsed.currency || accountCurrency).toUpperCase();
    if (accountCurrency && statementCurrency !== accountCurrency) {
      validationErrors.push(`Statement currency (${statementCurrency}) does not match bank account currency (${accountCurrency})`);
    }

    // 4. Duplicate checks
    const existingTxs = await this.getTransactions(orgId, { bankAccountId, limit: 100000 });
    const existingFingerprints = new Set(existingTxs.map((t) => t.fingerprint));

    const rules = await this.getRules(orgId);
    let duplicateCount = 0;
    const previewTransactions = parsed.transactions.map((tx: any) => {
      const isDuplicate = existingFingerprints.has(tx.fingerprint);
      if (isDuplicate) duplicateCount++;

      const ruleMatch = BankRulesEngine.evaluateRules(
        { ...tx, organizationId: orgId, bankAccountId, reconciliationStatus: 'UNMATCHED', currency: statementCurrency } as any,
        rules as any
      );

      return {
        transactionDate: tx.transactionDate,
        valueDate: tx.valueDate,
        amount: tx.amount,
        direction: tx.direction,
        narration: tx.narration,
        reference: tx.reference,
        runningBalance: tx.runningBalance,
        isDuplicate,
        ruleMatch: ruleMatch || undefined,
      };
    });

    const newTransactionsCount = previewTransactions.length - duplicateCount;

    return {
      detectedFormat,
      isValid: validationErrors.length === 0,
      validationErrors,
      fileHash,
      totalTransactions: previewTransactions.length,
      duplicateCount,
      newTransactionsCount,
      statementFrom: parsed.statementFrom,
      statementTo: parsed.statementTo,
      openingBalance: parsed.openingBalance,
      closingBalance: parsed.closingBalance,
      previewTransactions: previewTransactions.slice(0, 100),
    };
  }

  public static async importStatement(
    orgId: string,
    bankAccountId: string,
    filename: string,
    content: string,
    sourceFormat?: BankStatementSourceFormat,
    mapping?: CSVColumnMapping,
    importedBy?: string
  ): Promise<{ import: BankStatementImport; newTransactionsCount: number; duplicateCount: number; discrepancy: number }> {
    const fileHash = crypto.createHash('sha256').update(content).digest('hex');

    // Check Duplicate Statement Import by file hash
    const existingImports = await this.getStatementImports(orgId, bankAccountId);
    const dupImport = existingImports.find((imp) => imp.fileHash === fileHash);

    if (dupImport) {
      return {
        import: dupImport,
        newTransactionsCount: 0,
        duplicateCount: dupImport.transactionCount,
        discrepancy: 0,
      };
    }

    // Parse Statement
    const parsed = BankStatementParserFactory.parseStatement(content, bankAccountId, sourceFormat, mapping);
    const accountResult = await db.query(
      `SELECT currency FROM bank_accounts WHERE organization_id = $1 AND id = $2 AND is_active = TRUE`,
      [orgId, bankAccountId]
    );
    const accountCurrency = String(accountResult.rows[0]?.currency || '');
    if (!/^[A-Z]{3}$/.test(accountCurrency)) throw new Error('Bank account currency is not configured');
    const statementCurrency = String(parsed.currency || accountCurrency).toUpperCase();
    if (statementCurrency !== accountCurrency) throw new Error('Statement currency does not match the bank account currency');

    // Existing Transactions Fingerprint check for overlapping imports
    const existingTxs = await this.getTransactions(orgId, { bankAccountId, limit: 100000 });
    const existingFingerprints = new Set(existingTxs.map((t) => t.fingerprint));

    const importId = newId('imp');
    let newTxCount = 0;
    let duplicateCount = 0;

    let newTransactions: BankStatementTransaction[] = [];

    for (const tx of parsed.transactions) {
      if (existingFingerprints.has(tx.fingerprint)) {
        duplicateCount++;
        continue;
      }

      const txId = newId('btx');
      const statementTx: BankStatementTransaction = {
        id: txId,
        organizationId: orgId,
        bankAccountId,
        statementImportId: importId,
        transactionDate: tx.transactionDate,
        valueDate: tx.valueDate,
        amount: tx.amount,
        direction: tx.direction,
        runningBalance: tx.runningBalance,
        narration: tx.narration,
        reference: tx.reference,
        transactionType: tx.transactionType,
        utr: tx.utr,
        rrn: tx.rrn,
        upiReference: tx.upiReference,
        chequeNumber: tx.chequeNumber,
        counterpartyName: tx.counterpartyName,
        currency: statementCurrency,
        reconciliationStatus: 'UNMATCHED',
        fingerprint: tx.fingerprint,
        rawData: tx.rawData,
        createdAt: new Date().toISOString(),
      };

      // Evaluate rules engine
      const rules = await this.getRules(orgId);
      const ruleMatch = BankRulesEngine.evaluateRules(statementTx, rules);
      if (ruleMatch) {
        statementTx.reconciliationStatus = 'SUGGESTED';
      }

      newTransactions.push(statementTx);
      existingFingerprints.add(tx.fingerprint);
      newTxCount++;
    }

    const importRecord: BankStatementImport = {
      id: importId,
      organizationId: orgId,
      bankAccountId,
      sourceFormat: sourceFormat || BankStatementParserFactory.detectFormat(content),
      originalFilename: filename,
      fileHash,
      parserVersion: parsed.parserVersion,
      statementFrom: parsed.statementFrom,
      statementTo: parsed.statementTo,
      openingBalance: parsed.openingBalance,
      closingBalance: parsed.closingBalance,
      currency: statementCurrency,
      importedBy,
      importedAt: new Date().toISOString(),
      transactionCount: newTxCount,
      status: 'Completed',
    };

    await db.transaction(async (client) => {
    await client.query(
      `INSERT INTO bank_statement_imports (id, organization_id, bank_account_id, source_format, original_filename, file_hash, parser_version, statement_from, statement_to, opening_balance, closing_balance, currency, imported_by, imported_at, transaction_count, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
      [
        importRecord.id,
        importRecord.organizationId,
        importRecord.bankAccountId,
        importRecord.sourceFormat,
        importRecord.originalFilename,
        importRecord.fileHash,
        importRecord.parserVersion || '1.0',
        importRecord.statementFrom || null,
        importRecord.statementTo || null,
        importRecord.openingBalance || 0,
        importRecord.closingBalance || 0,
        importRecord.currency,
        importRecord.importedBy || null,
        importRecord.importedAt || new Date().toISOString(),
        importRecord.transactionCount || 0,
        importRecord.status || 'Completed',
      ]
    );

    const insertedTxs: BankStatementTransaction[] = [];
    for (const tx of newTransactions) {
      const checkDb = await client.query(
        `SELECT id FROM bank_statement_transactions WHERE organization_id = $1 AND fingerprint = $2`,
        [tx.organizationId, tx.fingerprint]
      );
      if (checkDb.rows && checkDb.rows.length > 0) {
        duplicateCount++;
        newTxCount--;
        continue;
      }

      await client.query(
        `INSERT INTO bank_statement_transactions (id, organization_id, bank_account_id, statement_import_id, transaction_date, value_date, amount, direction, running_balance, narration, reference, transaction_type, utr, rrn, upi_reference, cheque_number, counterparty_name, currency, reconciliation_status, fingerprint, raw_data, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)`,
        [
          tx.id,
          tx.organizationId,
          tx.bankAccountId,
          tx.statementImportId,
          tx.transactionDate,
          tx.valueDate || null,
          tx.amount,
          tx.direction,
          tx.runningBalance ?? null,
          tx.narration,
          tx.reference || null,
          tx.transactionType || null,
          tx.utr || null,
          tx.rrn || null,
          tx.upiReference || null,
          tx.chequeNumber || null,
          tx.counterpartyName || null,
          tx.currency,
          tx.reconciliationStatus || 'UNMATCHED',
          tx.fingerprint,
          JSON.stringify(tx.rawData || {}),
          tx.createdAt || new Date().toISOString(),
        ]
      );
      insertedTxs.push(tx);
    }
    newTransactions = insertedTxs;
    await client.query(
      `INSERT INTO audit_logs (id, organization_id, user_id, action, entity_type, entity_id, after_state)
       VALUES ($1, $2, $3, 'BANK_STATEMENT_IMPORTED', 'BankStatementImport', $4, $5)`,
      [newId('aud'), orgId, importedBy || 'system', importId, JSON.stringify({ bankAccountId, filename, fileHash, newTransactionsCount: newTxCount, duplicateCount })]
    );
    });

    // INVARIANT CHECK: Statement import MUST produce ZERO change to General Ledger / Trial Balance / P&L
    return {
      import: importRecord,
      newTransactionsCount: newTxCount,
      duplicateCount,
      discrepancy: parsed.discrepancy || 0,
    };
  }

  public static async getStatementImports(orgId: string, bankAccountId?: string): Promise<BankStatementImport[]> {
    let query = `SELECT * FROM bank_statement_imports WHERE organization_id = $1`;
    const params: any[] = [orgId];
    if (bankAccountId) {
      query += ` AND bank_account_id = $2`;
      params.push(bankAccountId);
    }
    query += ` ORDER BY imported_at DESC`;
    const res = await db.query<BankStatementImport>(query, params);
    return (res.rows || []).map((r) => this.formatImport(r));
  }

  // --- 3. TRANSACTIONS ---
  public static async getTransactions(
    orgId: string,
    options: {
      bankAccountId?: string;
      status?: string;
      search?: string;
      fromDate?: string;
      toDate?: string;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<BankStatementTransaction[]> {
    let query = `SELECT * FROM bank_statement_transactions WHERE organization_id = $1`;
    const params: any[] = [orgId];
    let pIdx = 2;

    if (options.bankAccountId) {
      query += ` AND bank_account_id = $${pIdx++}`;
      params.push(options.bankAccountId);
    }
    if (options.status) {
      query += ` AND reconciliation_status = $${pIdx++}`;
      params.push(options.status);
    }
    if (options.fromDate) {
      query += ` AND transaction_date >= $${pIdx++}`;
      params.push(options.fromDate);
    }
    if (options.toDate) {
      query += ` AND transaction_date <= $${pIdx++}`;
      params.push(options.toDate);
    }
    if (options.search) {
      query += ` AND (narration ILIKE $${pIdx} OR reference ILIKE $${pIdx} OR utr ILIKE $${pIdx})`;
      params.push(`%${options.search}%`);
      pIdx++;
    }

    query += ` ORDER BY transaction_date DESC, created_at DESC`;

    if (options.limit) {
      query += ` LIMIT $${pIdx++}`;
      params.push(options.limit);
    }
    if (options.offset) {
      query += ` OFFSET $${pIdx++}`;
      params.push(options.offset);
    }

    const res = await db.query<BankStatementTransaction>(query, params);
    return (res.rows || []).map((r) => this.formatTransaction(r));
  }

  // --- 4. MATCHING ENGINE & MATCH ACTIONS ---
  public static async findMatchSuggestions(
    orgId: string,
    statementTxId: string,
    candidates: AccountingCandidate[]
  ): Promise<MatchSuggestion[]> {
    const res = await db.query<BankStatementTransaction>(
      `SELECT * FROM bank_statement_transactions WHERE organization_id = $1 AND id = $2`,
      [orgId, statementTxId]
    );
    let tx: BankStatementTransaction | undefined;
    if (res.rows?.[0]) tx = this.formatTransaction(res.rows[0]);

    if (!tx) return [];
    return BankMatchingEngine.findMatches(tx, candidates);
  }

  public static async getMatchingSuggestions(
    orgId: string,
    statementTxId: string,
    candidates: AccountingCandidate[]
  ): Promise<MatchSuggestion[]> {
    return this.findMatchSuggestions(orgId, statementTxId, candidates);
  }

  public static async getMatchesForTransaction(orgId: string, statementTxId: string): Promise<BankReconciliationMatch[]> {
    const res = await db.query<BankReconciliationMatch>(
      `SELECT * FROM bank_reconciliation_matches WHERE organization_id = $1 AND statement_transaction_id = $2`,
      [orgId, statementTxId]
    );
    return (res.rows || []).map((r) => this.formatMatch(r));
  }

  public static async matchTransaction(
    orgId: string,
    statementTxId: string,
    accountingType: string,
    accountingId: string,
    matchedAmount: number,
    confidenceScore: number = 100,
    reasons: any[] = [{ code: 'MANUAL_OR_RULE_MATCH', description: 'Matched by user or deterministic rule', weight: 100 }],
    matchedBy: string = 'System',
    validateAccountingDocument: boolean = false
  ): Promise<BankReconciliationMatch> {
    const validTypes = new Set(['invoice', 'payment_received', 'bill', 'payment_made', 'expense', 'transfer', 'journal', 'customer_refund', 'vendor_refund']);
    if (!validTypes.has(accountingType)) throw new Error('Unsupported accounting transaction type');
    if (!Number.isFinite(matchedAmount) || matchedAmount <= 0 || Math.abs(matchedAmount * 100 - Math.round(matchedAmount * 100)) > 1e-7) throw new Error('Matched amount must be positive with at most two decimals');
    return db.transaction(async (client) => {
    const txResult = await client.query(`SELECT * FROM bank_statement_transactions WHERE organization_id = $1 AND id = $2 FOR UPDATE`, [orgId, statementTxId]);
    if (txResult.rows.length !== 1) throw new Error('Statement transaction was not found in this organization');
    const statementTx = this.formatTransaction(txResult.rows[0]);
    if (statementTx.reconciliationStatus === 'RECONCILED') throw new Error('A completed reconciliation must be reopened before its matches can change');
    const accountingTableByType: Record<string, string> = {
      invoice: 'invoices',
      payment_received: 'payments_received',
      bill: 'bills',
      payment_made: 'payments_made',
      expense: 'expenses',
      journal: 'journal_entries',
      transfer: 'journal_entries',
      customer_refund: 'customer_refunds',
      vendor_refund: 'vendor_refunds',
    };
    if (validateAccountingDocument) {
      const accountingDocument = await client.query(`SELECT id FROM ${accountingTableByType[accountingType]} WHERE organization_id = $1 AND id = $2`, [orgId, accountingId]);
      if (accountingDocument.rows.length !== 1) throw new Error('Accounting document was not found in this organization');
    }
    const existing = await client.query(`SELECT matched_amount FROM bank_reconciliation_matches WHERE organization_id = $1 AND statement_transaction_id = $2 AND status = 'MATCHED'`, [orgId, statementTxId]);
    const existingSum = existing.rows.reduce((sum, row) => sum + Number(row.matched_amount || 0), 0);
    if (existingSum + matchedAmount > statementTx.amount + 0.001) throw new Error('Total matched amount exceeds statement transaction amount');
    const newStatus = Math.abs(existingSum + matchedAmount - statementTx.amount) < 0.01 ? 'MATCHED' : 'PARTIALLY_MATCHED';
    const matchId = newId('match');
    const match: BankReconciliationMatch = { id: matchId, organizationId: orgId, statementTransactionId: statementTxId, accountingTransactionType: accountingType as AccountingTransactionType, accountingTransactionId: accountingId, matchedAmount, matchConfidence: confidenceScore, matchReasons: reasons, matchedBy, matchedAt: new Date().toISOString(), status: 'MATCHED' };
    await client.query(
      `INSERT INTO bank_reconciliation_matches (id, organization_id, statement_transaction_id, accounting_transaction_type, accounting_transaction_id, matched_amount, match_confidence, match_reasons, matched_by, matched_at, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        match.id,
        match.organizationId,
        match.statementTransactionId,
        match.accountingTransactionType,
        match.accountingTransactionId,
        match.matchedAmount,
        match.matchConfidence,
        JSON.stringify(match.matchReasons),
        match.matchedBy,
        match.matchedAt,
        match.status,
      ]
    );

    await client.query(
      `UPDATE bank_statement_transactions SET reconciliation_status = $1 WHERE organization_id = $2 AND id = $3`,
      [newStatus, orgId, statementTxId]
    );

    await client.query(
      `INSERT INTO audit_logs (id, organization_id, user_id, action, entity_type, entity_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        newId('aud'),
        orgId,
        matchedBy,
        'BANK_TRANSACTION_MATCHED',
        'BankStatementTransaction',
        statementTxId,
        JSON.stringify({ matchId, accountingType, accountingId, matchedAmount }),
      ]
    );

    return match;
    });
  }

  public static async reconcileMatch(
    orgId: string,
    statementTxId: string,
    accountingType: string,
    accountingId: string,
    matchedAmount: number,
    confidenceScore: number = 100,
    reasons: any[] = [],
    matchedBy: string = 'System'
  ): Promise<BankReconciliationMatch> {
    return this.matchTransaction(orgId, statementTxId, accountingType, accountingId, matchedAmount, confidenceScore, reasons, matchedBy);
  }

  public static async unreconcileTransaction(
    orgId: string,
    statementTxId: string,
    unreconciledBy: string = 'System'
  ): Promise<boolean> {
    const matches = await this.getMatchesForTransaction(orgId, statementTxId);
    const newStatus = matches.length > 0 ? 'MATCHED' : 'UNMATCHED';

    await db.query(
      `UPDATE bank_statement_transactions SET reconciliation_status = $1 WHERE organization_id = $2 AND id = $3`,
      [newStatus, orgId, statementTxId]
    );

    await db.query(
      `INSERT INTO audit_logs (id, organization_id, user_id, action, entity_type, entity_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        newId('aud'),
        orgId,
        unreconciledBy,
        'BANK_TRANSACTION_UNRECONCILED',
        'BankStatementTransaction',
        statementTxId,
        JSON.stringify({ statementTxId, previousStatus: 'RECONCILED', newStatus }),
      ]
    );

    return true;
  }

  public static async createTransactionFromStatement(
    orgId: string,
    statementTxId: string,
    targetAccountId: string,
    description?: string,
    createdBy: string = 'System'
  ): Promise<{ journalEntryId: string; match: BankReconciliationMatch }> {
    const txResult = await db.query<BankStatementTransaction>(
      `SELECT * FROM bank_statement_transactions WHERE organization_id = $1 AND id = $2`,
      [orgId, statementTxId]
    );
    if (!txResult.rows || txResult.rows.length === 0) {
      throw new Error(`Statement transaction ${statementTxId} not found`);
    }
    const statementTx = this.formatTransaction(txResult.rows[0]);

    const bankAccs = await this.getBankAccounts(orgId);
    const bankAcc = bankAccs.find((b) => b.id === statementTx.bankAccountId);
    const bankLedgerAccId = bankAcc?.ledgerAccountId || `acc-bank-${statementTx.bankAccountId}`;

    return db.transaction(async (client) => {
      const entryNum = `JE-${Date.now().toString().slice(-6)}`;
      const date = (statementTx.transactionDate as any) instanceof Date
        ? (statementTx.transactionDate as any as Date).toISOString().slice(0, 10)
        : String(statementTx.transactionDate).slice(0, 10);
      const ref = statementTx.reference || statementTx.utr || 'Create-from-Bank';
      const desc = description || statementTx.narration;

      const isDebit = statementTx.direction === 'DEBIT';

      const bankAccount = await MonetaryAccountPolicy.resolve(
        client,
        orgId,
        bankLedgerAccId,
        isDebit ? 'OUTFLOW' : 'INFLOW',
        'statement_bank_account'
      );
      const posting = await ServerPostingEngine.postEntry({
        organizationId: orgId,
        entryNumber: entryNum,
        date,
        reference: ref,
        description: desc,
        lines: isDebit
          ? [
              { accountId: targetAccountId, debit: statementTx.amount, credit: 0, description: desc },
              { accountId: bankAccount.id, debit: 0, credit: statementTx.amount, description: desc },
            ]
          : [
              { accountId: bankAccount.id, debit: statementTx.amount, credit: 0, description: desc },
              { accountId: targetAccountId, debit: 0, credit: statementTx.amount, description: desc },
            ],
      }, client);
      const journalId = posting.entryId;

      const matchId = newId('match');
      await client.query(
        `INSERT INTO bank_reconciliation_matches (id, organization_id, statement_transaction_id, accounting_transaction_type, accounting_transaction_id, matched_amount, match_confidence, match_reasons, matched_by, matched_at, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          matchId,
          orgId,
          statementTxId,
          'journal',
          journalId,
          statementTx.amount,
          100,
          JSON.stringify([{ code: 'CREATE_FROM_BANK', description: 'Created from bank statement', weight: 100 }]),
          createdBy,
          new Date().toISOString(),
          'MATCHED',
        ]
      );

      await client.query(
        `UPDATE bank_statement_transactions SET reconciliation_status = 'MATCHED' WHERE organization_id = $1 AND id = $2`,
        [orgId, statementTxId]
      );

      await client.query(
        `INSERT INTO audit_logs (id, organization_id, user_id, action, entity_type, entity_id, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          newId('aud'),
          orgId,
          createdBy,
          'BANK_TRANSACTION_CREATED_AND_MATCHED',
          'BankStatementTransaction',
          statementTxId,
          JSON.stringify({ journalId, targetAccountId, amount: statementTx.amount }),
        ]
      );

      const match: BankReconciliationMatch = {
        id: matchId,
        organizationId: orgId,
        statementTransactionId: statementTxId,
        accountingTransactionType: 'journal',
        accountingTransactionId: journalId,
        matchedAmount: statementTx.amount,
        matchConfidence: 100,
        matchReasons: [{ code: 'CREATE_FROM_BANK', description: 'Created from bank statement', weight: 100 }],
        matchedBy: createdBy,
        matchedAt: new Date().toISOString(),
        status: 'MATCHED',
      };

      statementTx.reconciliationStatus = 'MATCHED';
      return { journalEntryId: journalId, match };
    });
  }

  public static async createInternalTransfer(
    orgId: string,
    fromBankAccountId: string,
    toBankAccountId: string,
    amount: number,
    transferDate: string,
    reference?: string,
    description?: string,
    createdBy: string = 'System'
  ): Promise<{ transferId: string; journalEntryId: string }> {
    if (fromBankAccountId === toBankAccountId) {
      throw new Error('INVALID_TRANSFER: Source and destination bank accounts must be different');
    }

    if (!Number.isFinite(amount) || amount <= 0 || Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-7) {
      throw new Error('INVALID_AMOUNT: Transfer amount must be positive with at most two decimals');
    }

    const bankAccs = await this.getBankAccounts(orgId);
    const fromBank = bankAccs.find((b) => b.id === fromBankAccountId);
    const toBank = bankAccs.find((b) => b.id === toBankAccountId);

    if (!fromBank) {
      throw new Error(`BANK_ACCOUNT_NOT_FOUND: Source bank account ${fromBankAccountId} was not found in this organization`);
    }
    if (!toBank) {
      throw new Error(`BANK_ACCOUNT_NOT_FOUND: Destination bank account ${toBankAccountId} was not found in this organization`);
    }

    const fromLedgerId = fromBank.ledgerAccountId || `acc-bank-${fromBankAccountId}`;
    const toLedgerId = toBank.ledgerAccountId || `acc-bank-${toBankAccountId}`;

    if (fromLedgerId === toLedgerId) {
      throw new Error('INVALID_TRANSFER: Source and destination ledger accounts must be different');
    }

    const entryNum = `TR-${Date.now().toString().slice(-6)}-${Math.floor(1000 + Math.random() * 9000)}`;
    const ref = reference || 'Internal Transfer';
    const desc = description || `Internal Transfer from ${fromBank.bankName || 'Source Bank'} to ${toBank.bankName || 'Destination Bank'}`;
    const transferId = newId('bank-transfer');
    let journalId: string | undefined;

    await db.transaction(async (client) => {
      const fromAccount = await MonetaryAccountPolicy.resolve(client, orgId, fromLedgerId, 'TRANSFER', 'source_bank_account');
      const toAccount = await MonetaryAccountPolicy.resolve(client, orgId, toLedgerId, 'TRANSFER', 'destination_bank_account');
      const posting = await ServerPostingEngine.postEntry({
        organizationId: orgId,
        entryNumber: entryNum,
        date: transferDate,
        reference: ref,
        description: desc,
        lines: [
          { accountId: toAccount.id, debit: amount, credit: 0, description: desc },
          { accountId: fromAccount.id, debit: 0, credit: amount, description: desc },
        ],
      }, client);
      journalId = posting.entryId;

      await client.query(
        `INSERT INTO bank_transfers
          (id, organization_id, transfer_number, transfer_date, from_bank_account_id, to_bank_account_id,
           from_ledger_account_id, to_ledger_account_id, amount, reference, description, status,
           journal_entry_id, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'POSTED', $12, $13)`,
        [transferId, orgId, entryNum, transferDate, fromBankAccountId, toBankAccountId,
          fromAccount.id, toAccount.id, amount, ref, desc, journalId, createdBy]
      );

      await client.query(
        `INSERT INTO audit_logs (id, organization_id, user_id, action, entity_type, entity_id, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          newId('aud'),
          orgId,
          createdBy,
          'INTERNAL_TRANSFER_CREATED',
          'BankTransfer',
          transferId,
          JSON.stringify({ fromBankAccountId, toBankAccountId, amount, transferDate, journalEntryId: journalId }),
        ]
      );

    });

    return { transferId, journalEntryId: journalId! };
  }

  public static async getInternalTransfers(orgId: string, limit: number = 50): Promise<any[]> {
    const result = await db.query(
      `SELECT * FROM bank_transfers
        WHERE organization_id = $1
        ORDER BY transfer_date DESC, created_at DESC
        LIMIT $2`,
      [orgId, Math.max(1, Math.min(100, Number(limit) || 50))]
    );
    return result.rows;
  }

  public static async reverseInternalTransfer(
    orgId: string,
    transferId: string,
    reversedBy: string,
    reason: string
  ): Promise<{ transferId: string; reversalJournalEntryId: string }> {
    const normalizedReason = String(reason || '').trim();
    if (normalizedReason.length < 3 || normalizedReason.length > 1000) {
      throw new Error('REVERSAL_REASON_INVALID: A reversal reason containing 3-1000 characters is required');
    }

    return db.transaction(async (client) => {
      const transferResult = await client.query(
        `SELECT * FROM bank_transfers
          WHERE organization_id = $1 AND id = $2
          FOR UPDATE`,
        [orgId, transferId]
      );
      if (transferResult.rows.length !== 1) throw new Error('BANK_TRANSFER_NOT_FOUND: Transfer was not found in this organization');
      const transfer = transferResult.rows[0];
      if (String(transfer.status).toUpperCase() !== 'POSTED' || transfer.reversal_journal_id) {
        throw new Error('BANK_TRANSFER_ALREADY_REVERSED: Transfer has already been reversed');
      }

      const reconciled = await client.query(
        `SELECT id FROM bank_reconciliation_matches
          WHERE organization_id = $1
            AND accounting_transaction_id = $2
            AND status = 'MATCHED'
          LIMIT 1`,
        [orgId, transfer.journal_entry_id]
      );
      if (reconciled.rows.length > 0) {
        throw new Error('BANK_TRANSFER_RECONCILED: Unmatch the reconciled statement transaction before reversing this transfer');
      }

      const reversalJournalEntryId = await FinancialDestructiveActionsService.reversePostedJournal(
        client,
        orgId,
        transfer.journal_entry_id,
        reversedBy,
        normalizedReason,
        `bank transfer ${transfer.transfer_number}`
      );
      const updated = await client.query(
        `UPDATE bank_transfers
            SET status = 'REVERSED', reversal_journal_id = $1, reversed_at = CURRENT_TIMESTAMP,
                reversed_by = $2, reversal_reason = $3
          WHERE organization_id = $4 AND id = $5 AND status = 'POSTED' AND reversal_journal_id IS NULL`,
        [reversalJournalEntryId, reversedBy, normalizedReason, orgId, transferId]
      );
      if (updated.rowCount !== 1) throw new Error('BANK_TRANSFER_CONFLICT: Transfer state changed concurrently');

      await client.query(
        `INSERT INTO audit_logs (id, organization_id, user_id, action, entity_type, entity_id, before_state, after_state)
         VALUES ($1, $2, $3, 'INTERNAL_TRANSFER_REVERSED', 'BankTransfer', $4, $5, $6)`,
        [newId('aud'), orgId, reversedBy, transferId, JSON.stringify(transfer), JSON.stringify({ status: 'REVERSED', reversalJournalEntryId })]
      );
      return { transferId, reversalJournalEntryId };
    });
  }

  public static async unmatchTransaction(
    orgId: string,
    matchId: string,
    unmatchedBy: string = 'System'
  ): Promise<boolean> {
    return db.transaction(async (client) => {
      const matchResult = await client.query(
        `SELECT statement_transaction_id, accounting_transaction_type, accounting_transaction_id, match_reasons
           FROM bank_reconciliation_matches
          WHERE organization_id = $1 AND id = $2 FOR UPDATE`,
        [orgId, matchId]
      );
      if (matchResult.rows.length !== 1) return false;
      const matchRow = matchResult.rows[0];
      const reasons = typeof matchRow.match_reasons === 'string'
        ? JSON.parse(matchRow.match_reasons || '[]')
        : (matchRow.match_reasons || []);
      if (matchRow.accounting_transaction_type === 'journal' && reasons.some((item: any) => item?.code === 'CREATE_FROM_BANK')) {
        throw new Error('CREATED_BANK_TRANSACTION_REQUIRES_REVERSAL: Reverse the created accounting transaction instead of only removing its match');
      }
      const statementTransactionId = matchRow.statement_transaction_id;
      await client.query(`DELETE FROM bank_reconciliation_matches WHERE organization_id = $1 AND id = $2`, [orgId, matchId]);
      const remaining = await client.query(
        `SELECT id FROM bank_reconciliation_matches
          WHERE organization_id = $1 AND statement_transaction_id = $2 AND status = 'MATCHED' LIMIT 1`,
        [orgId, statementTransactionId]
      );
      await client.query(
        `UPDATE bank_statement_transactions SET reconciliation_status = $1 WHERE organization_id = $2 AND id = $3`,
        [remaining.rows.length > 0 ? 'MATCHED' : 'UNMATCHED', orgId, statementTransactionId]
      );
      await client.query(
        `INSERT INTO audit_logs (id, organization_id, user_id, action, entity_type, entity_id, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [newId('aud'), orgId, unmatchedBy, 'BANK_TRANSACTION_UNMATCHED', 'BankReconciliationMatch', matchId, JSON.stringify({ statementTransactionId })]
      );
      return true;
    });
  }

  public static async reverseTransactionCreatedFromStatement(
    orgId: string,
    statementTransactionId: string,
    reversedBy: string,
    reason: string
  ): Promise<{ statementTransactionId: string; reversalJournalEntryId: string }> {
    const normalizedReason = String(reason || '').trim();
    if (normalizedReason.length < 3 || normalizedReason.length > 1000) {
      throw new Error('REVERSAL_REASON_INVALID: A reversal reason containing 3-1000 characters is required');
    }
    return db.transaction(async (client) => {
      const matchResult = await client.query(
        `SELECT * FROM bank_reconciliation_matches
          WHERE organization_id = $1 AND statement_transaction_id = $2 AND status = 'MATCHED'
          FOR UPDATE`,
        [orgId, statementTransactionId]
      );
      const createdMatch = matchResult.rows.find((row) => {
        const reasons = typeof row.match_reasons === 'string' ? JSON.parse(row.match_reasons || '[]') : (row.match_reasons || []);
        return row.accounting_transaction_type === 'journal' && reasons.some((item: any) => item?.code === 'CREATE_FROM_BANK');
      });
      if (!createdMatch) throw new Error('CREATED_BANK_TRANSACTION_NOT_FOUND: No posted transaction created from this statement line was found');

      const reversalJournalEntryId = await FinancialDestructiveActionsService.reversePostedJournal(
        client, orgId, createdMatch.accounting_transaction_id, reversedBy, normalizedReason,
        `statement-created transaction ${statementTransactionId}`
      );
      await client.query(
        `UPDATE bank_reconciliation_matches SET status = 'REVERSED'
          WHERE organization_id = $1 AND id = $2 AND status = 'MATCHED'`,
        [orgId, createdMatch.id]
      );
      await client.query(
        `UPDATE bank_statement_transactions SET reconciliation_status = 'UNMATCHED'
          WHERE organization_id = $1 AND id = $2`,
        [orgId, statementTransactionId]
      );
      await client.query(
        `INSERT INTO audit_logs (id, organization_id, user_id, action, entity_type, entity_id, before_state, after_state)
         VALUES ($1, $2, $3, 'BANK_CREATED_TRANSACTION_REVERSED', 'BankStatementTransaction', $4, $5, $6)`,
        [newId('aud'), orgId, reversedBy, statementTransactionId,
          JSON.stringify({ matchId: createdMatch.id, journalEntryId: createdMatch.accounting_transaction_id }),
          JSON.stringify({ matchStatus: 'REVERSED', reversalJournalEntryId, reason: normalizedReason })]
      );
      return { statementTransactionId, reversalJournalEntryId };
    });
  }

  // --- 5. RULES ENGINE CRUD ---
  public static async getRules(orgId: string): Promise<BankReconciliationRule[]> {
    const res = await db.query<BankReconciliationRule>(
      `SELECT * FROM bank_reconciliation_rules WHERE organization_id = $1 ORDER BY priority ASC`,
      [orgId]
    );
    return (res.rows || []).map((r) => this.formatRule(r));
  }

  public static async createRule(orgId: string, ruleData: Partial<BankReconciliationRule>): Promise<BankReconciliationRule> {
    const id = newId('rule');
    const rule: BankReconciliationRule = {
      id,
      organizationId: orgId,
      ruleName: ruleData.ruleName || 'Default Rule',
      priority: ruleData.priority || 1,
      narrationPattern: ruleData.narrationPattern || '',
      direction: ruleData.direction || 'BOTH',
      suggestedCategory: ruleData.suggestedCategory,
      suggestedAccountId: ruleData.suggestedAccountId,
      isEnabled: ruleData.isEnabled !== false,
      createdAt: new Date().toISOString(),
    };

    await db.query(
      `INSERT INTO bank_reconciliation_rules (id, organization_id, rule_name, priority, narration_pattern, direction, suggested_category, suggested_account_id, is_enabled, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        rule.id,
        rule.organizationId,
        rule.ruleName,
        rule.priority,
        rule.narrationPattern,
        rule.direction,
        rule.suggestedCategory,
        rule.suggestedAccountId,
        rule.isEnabled,
        rule.createdAt,
      ]
    );

    return rule;
  }

  public static async deleteRule(orgId: string, ruleId: string): Promise<boolean> {
    await db.query(`DELETE FROM bank_reconciliation_rules WHERE organization_id = $1 AND id = $2`, [orgId, ruleId]);

    return true;
  }

  // --- 6. RECONCILIATION SUMMARY & SESSION ---
  public static async getReconciliationSummary(
    orgId: string,
    bankAccountId: string,
    statementEndDate: string,
    statementClosingBalance: number,
    trustedGlBankBalanceForInternalVerification?: number
  ): Promise<{
    statementClosingBalance: number;
    glBankBalance: number;
    matchedDepositsTotal: number;
    matchedWithdrawalsTotal: number;
    unmatchedDepositsTotal: number;
    unmatchedWithdrawalsTotal: number;
    difference: number;
    status: 'BALANCED' | 'DISCREPANCY';
  }> {
    const accountResult = await db.query(`SELECT ledger_account_id FROM bank_accounts WHERE organization_id = $1 AND id = $2 AND is_active = TRUE`, [orgId, bankAccountId]);
    if (accountResult.rows.length !== 1) throw new Error('Bank account was not found in this organization');
    const balanceResult = await db.query(
      `SELECT COALESCE(SUM(jl.debit) - SUM(jl.credit), 0) AS balance FROM journal_lines jl
       JOIN journal_entries je ON je.id = jl.journal_entry_id
       WHERE je.organization_id = $1 AND je.status = 'Posted' AND je.date <= $2 AND jl.account_id = $3`,
      [orgId, statementEndDate, accountResult.rows[0].ledger_account_id]
    );
    const glBankBalance = trustedGlBankBalanceForInternalVerification === undefined
      ? Number(balanceResult.rows[0]?.balance || 0)
      : trustedGlBankBalanceForInternalVerification;
    const txs = await this.getTransactions(orgId, { bankAccountId, toDate: statementEndDate, limit: 100000 });

    let matchedDepositsTotal = 0;
    let matchedWithdrawalsTotal = 0;
    let unmatchedDepositsTotal = 0;
    let unmatchedWithdrawalsTotal = 0;

    for (const t of txs) {
      const isMatched = ['MATCHED', 'RECONCILED'].includes(t.reconciliationStatus);
      if (t.direction === 'CREDIT') {
        if (isMatched) matchedDepositsTotal += t.amount;
        else unmatchedDepositsTotal += t.amount;
      } else {
        if (isMatched) matchedWithdrawalsTotal += t.amount;
        else unmatchedWithdrawalsTotal += t.amount;
      }
    }

    const difference = Number((statementClosingBalance - (glBankBalance + unmatchedDepositsTotal - unmatchedWithdrawalsTotal)).toFixed(2));

    return {
      statementClosingBalance,
      glBankBalance,
      matchedDepositsTotal,
      matchedWithdrawalsTotal,
      unmatchedDepositsTotal,
      unmatchedWithdrawalsTotal,
      difference,
      status: Math.abs(difference) < 0.01 ? 'BALANCED' : 'DISCREPANCY',
    };
  }

  public static async completeReconciliationSession(
    orgId: string,
    bankAccountId: string,
    statementEndDate: string,
    statementClosingBalance: number,
    glBankBalance?: number,
    _periodLocks: any[] = [],
    userId: string = 'System'
  ): Promise<BankReconciliationSession> {
    if (await AccountingPeriodService.isPeriodLocked(orgId, statementEndDate)) {
      throw new Error(`Cannot finalize reconciliation in locked accounting period (${statementEndDate}).`);
    }

    const summary = await this.getReconciliationSummary(orgId, bankAccountId, statementEndDate, statementClosingBalance, glBankBalance);
    if (summary.status !== 'BALANCED') throw new Error(`Reconciliation cannot complete with a difference of ${summary.difference.toFixed(2)}`);

    const sessionId = newId('session');
    const session: BankReconciliationSession = {
      id: sessionId,
      organizationId: orgId,
      bankAccountId,
      statementEndDate,
      statementClosingBalance,
      ledgerBalance: summary.glBankBalance,
      difference: summary.difference,
      reconciledBy: userId,
      reconciledAt: new Date().toISOString(),
      status: 'COMPLETED',
    };

    return db.transaction(async (client) => {
    await client.query(
      `INSERT INTO bank_reconciliation_sessions (id, organization_id, bank_account_id, statement_end_date, statement_closing_balance, ledger_balance, difference, reconciled_by, reconciled_at, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        session.id,
        session.organizationId,
        session.bankAccountId,
        session.statementEndDate,
        session.statementClosingBalance,
        session.ledgerBalance,
        session.difference,
        session.reconciledBy,
        session.reconciledAt,
        session.status,
      ]
    );

    await client.query(
      `UPDATE bank_statement_transactions SET reconciliation_status = 'RECONCILED'
       WHERE organization_id = $1 AND bank_account_id = $2 AND transaction_date <= $3 AND reconciliation_status = 'MATCHED'`,
      [orgId, bankAccountId, statementEndDate]
    );

    await client.query(
      `INSERT INTO audit_logs (id, organization_id, user_id, action, entity_type, entity_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        newId('aud'),
        orgId,
        userId,
        'BANK_RECONCILIATION_COMPLETED',
        'BankReconciliationSession',
        sessionId,
        JSON.stringify(session),
      ]
    );

    return session;
    });
  }

  // Formatting helpers
  private static formatBankAccount(row: any): BankAccount {
    return {
      id: row.id,
      organizationId: row.organization_id || row.organizationId,
      ledgerAccountId: row.ledger_account_id || row.ledgerAccountId,
      accountName: row.account_name || row.accountName,
      accountNumber: row.account_number || row.accountNumber,
      maskedAccountNumber: row.masked_account_number || row.maskedAccountNumber || '•••• 0000',
      bankName: row.bank_name || row.bankName,
      accountType: row.account_type || row.accountType || 'Checking',
      currency: row.currency,
      country: row.country || '',
      currentBalance: parseFloat(row.current_balance || row.currentBalance || 0),
      openingBalanceDate: row.opening_balance_date || row.openingBalanceDate,
      statementImportEnabled: row.statement_import_enabled !== false,
      status: row.status || 'Active',
      isActive: row.is_active !== false,
      createdAt: row.created_at || row.createdAt || new Date().toISOString(),
      updatedAt: row.updated_at || row.updatedAt || new Date().toISOString(),
    };
  }

  private static formatImport(row: any): BankStatementImport {
    return {
      id: row.id,
      organizationId: row.organization_id || row.organizationId,
      bankAccountId: row.bank_account_id || row.bankAccountId,
      sourceFormat: row.source_format || row.sourceFormat,
      originalFilename: row.original_filename || row.originalFilename,
      fileHash: row.file_hash || row.fileHash,
      parserVersion: row.parser_version || row.parserVersion || '1.0',
      statementFrom: row.statement_from || row.statementFrom,
      statementTo: row.statement_to || row.statementTo,
      openingBalance: parseFloat(row.opening_balance || row.openingBalance || 0),
      closingBalance: parseFloat(row.closing_balance || row.closingBalance || 0),
      currency: row.currency,
      importedBy: row.imported_by || row.importedBy,
      importedAt: row.imported_at || row.importedAt || new Date().toISOString(),
      transactionCount: parseInt(row.transaction_count || row.transactionCount || 0, 10),
      status: row.status || 'Completed',
    };
  }

  private static formatTransaction(row: any): BankStatementTransaction {
    let raw = row.raw_data || row.rawData;
    if (typeof raw === 'string') {
      try {
        raw = JSON.parse(raw);
      } catch (e) {
        raw = {};
      }
    }
    return {
      id: row.id,
      organizationId: row.organization_id || row.organizationId,
      bankAccountId: row.bank_account_id || row.bankAccountId,
      statementImportId: row.statement_import_id || row.statementImportId,
      transactionDate: row.transaction_date || row.transactionDate,
      valueDate: row.value_date || row.valueDate,
      amount: parseFloat(row.amount || 0),
      direction: row.direction,
      runningBalance: row.running_balance !== null && row.running_balance !== undefined ? parseFloat(row.running_balance) : undefined,
      narration: row.narration,
      reference: row.reference,
      transactionType: row.transaction_type || row.transactionType,
      utr: row.utr,
      rrn: row.rrn,
      upiReference: row.upi_reference || row.upiReference,
      chequeNumber: row.cheque_number || row.chequeNumber,
      counterpartyName: row.counterparty_name || row.counterpartyName,
      currency: row.currency,
      reconciliationStatus: row.reconciliation_status || row.reconciliationStatus || 'UNMATCHED',
      fingerprint: row.fingerprint,
      rawData: raw,
      createdAt: row.created_at || row.createdAt || new Date().toISOString(),
    };
  }

  private static formatMatch(row: any): BankReconciliationMatch {
    let reasons = row.match_reasons || row.matchReasons || [];
    if (typeof reasons === 'string') {
      try {
        reasons = JSON.parse(reasons);
      } catch (e) {
        reasons = [];
      }
    }
    return {
      id: row.id,
      organizationId: row.organization_id || row.organizationId,
      statementTransactionId: row.statement_transaction_id || row.statementTransactionId,
      accountingTransactionType: row.accounting_transaction_type || row.accountingTransactionType,
      accountingTransactionId: row.accounting_transaction_id || row.accountingTransactionId,
      matchedAmount: parseFloat(row.matched_amount || row.matchedAmount || 0),
      matchConfidence: parseInt(row.match_confidence || row.matchConfidence || 100, 10),
      matchReasons: reasons,
      matchedBy: row.matched_by || row.matchedBy || 'System',
      matchedAt: row.matched_at || row.matchedAt || new Date().toISOString(),
      status: row.status || 'MATCHED',
    };
  }

  private static formatRule(row: any): BankReconciliationRule {
    return {
      id: row.id,
      organizationId: row.organization_id || row.organizationId,
      ruleName: row.rule_name || row.ruleName,
      priority: parseInt(row.priority || 1, 10),
      narrationPattern: row.narration_pattern || row.narrationPattern,
      direction: row.direction || 'BOTH',
      suggestedCategory: row.suggested_category || row.suggestedCategory,
      suggestedAccountId: row.suggested_account_id || row.suggestedAccountId,
      isEnabled: row.is_enabled !== false,
      createdAt: row.created_at || row.createdAt || new Date().toISOString(),
    };
  }
}
