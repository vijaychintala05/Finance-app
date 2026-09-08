import { db } from '../database/db';
import { newId } from '../utils/ids';
import { databaseMoney } from '../utils/money';
import { ServerPostingEngine } from '../accounting/postingEngine';

export interface OpeningBalanceInputLine {
  accountId?: string;
  accountCode: string;
  accountName?: string;
  accountType?: string;
  classification?: string;
  debit: number;
  credit: number;
  description?: string;
}

export interface OpeningBalancePreviewResult {
  totalDebits: number;
  totalCredits: number;
  variance: number;
  isBalanced: boolean;
  validLinesCount: number;
  errors: Array<{ lineIndex: number; error: string }>;
  suggestedEquityAdjustment?: {
    accountId: string;
    accountCode: string;
    accountName: string;
    debit: number;
    credit: number;
  };
}

export class DataMigrationService {
  /**
   * Previews opening balance migration lines and enforces double-entry validation.
   */
  public static async previewOpeningBalances(
    orgId: string,
    lines: OpeningBalanceInputLine[]
  ): Promise<OpeningBalancePreviewResult> {
    if (!lines || !Array.isArray(lines) || lines.length === 0) {
      return {
        totalDebits: 0,
        totalCredits: 0,
        variance: 0,
        isBalanced: true,
        validLinesCount: 0,
        errors: [{ lineIndex: 0, error: 'No opening balance lines provided' }],
      };
    }

    const errors: Array<{ lineIndex: number; error: string }> = [];
    let totalDebits = 0;
    let totalCredits = 0;
    let validLinesCount = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const debit = Number(line.debit || 0);
      const credit = Number(line.credit || 0);

      if (!line.accountCode && !line.accountId) {
        errors.push({ lineIndex: i + 1, error: 'Account code or ID is required' });
        continue;
      }

      if (debit < 0 || credit < 0) {
        errors.push({ lineIndex: i + 1, error: 'Debit and Credit amounts must be non-negative' });
        continue;
      }

      if (debit > 0 && credit > 0) {
        errors.push({ lineIndex: i + 1, error: 'A single line cannot have both Debit and Credit' });
        continue;
      }

      if (debit === 0 && credit === 0) {
        continue; // skip zero balance lines
      }

      totalDebits += debit;
      totalCredits += credit;
      validLinesCount++;
    }

    totalDebits = Math.round(totalDebits * 100) / 100;
    totalCredits = Math.round(totalCredits * 100) / 100;
    const variance = Math.round(Math.abs(totalDebits - totalCredits) * 100) / 100;
    const isBalanced = variance < 0.005;

    let suggestedEquityAdjustment;
    if (!isBalanced) {
      if (totalDebits > totalCredits) {
        suggestedEquityAdjustment = {
          accountId: 'acc-opening-balance-equity',
          accountCode: '3999',
          accountName: 'Opening Balance Equity',
          debit: 0,
          credit: variance,
        };
      } else {
        suggestedEquityAdjustment = {
          accountId: 'acc-opening-balance-equity',
          accountCode: '3999',
          accountName: 'Opening Balance Equity',
          debit: variance,
          credit: 0,
        };
      }
    }

    return {
      totalDebits,
      totalCredits,
      variance,
      isBalanced,
      validLinesCount,
      errors,
      suggestedEquityAdjustment,
    };
  }

  /**
   * Posts opening balances as a balanced opening journal entry.
   */
  public static async postOpeningBalances(
    orgId: string,
    options: {
      asOfDate: string;
      lines: OpeningBalanceInputLine[];
      autoBalanceWithEquity?: boolean;
    },
    userId: string
  ): Promise<{
    journalEntryId: string;
    entryNumber: string;
    totalDebits: number;
    totalCredits: number;
    linesPosted: number;
  }> {
    const preview = await this.previewOpeningBalances(orgId, options.lines);

    if (preview.errors.length > 0) {
      throw new Error(`MIGRATION_VALIDATION_FAILED: ${preview.errors.map(e => `Line ${e.lineIndex}: ${e.error}`).join('; ')}`);
    }

    const linesToPost: OpeningBalanceInputLine[] = [...options.lines];

    if (!preview.isBalanced) {
      if (options.autoBalanceWithEquity && preview.suggestedEquityAdjustment) {
        linesToPost.push(preview.suggestedEquityAdjustment);
      } else {
        throw new Error(
          `MIGRATION_OUT_OF_BALANCE: Opening balances must be in balance. Total Debits: ${preview.totalDebits}, Total Credits: ${preview.totalCredits}, Variance: ${preview.variance}`
        );
      }
    }

    return db.transaction(async (tx) => {
      // 1. Ensure all accounts exist, creating any missing accounts
      const resolvedLines: Array<{
        accountId: string;
        accountCode: string;
        accountName: string;
        debit: number;
        credit: number;
        description: string;
      }> = [];

      for (const line of linesToPost) {
        const debit = Math.round(Number(line.debit || 0) * 100) / 100;
        const credit = Math.round(Number(line.credit || 0) * 100) / 100;
        if (debit === 0 && credit === 0) continue;

        let accountId = line.accountId;
        let accountCode = line.accountCode;
        let accountName = line.accountName || (accountCode ? `Account ${accountCode}` : 'Migrated Account');

        let matched = false;
        if (accountId) {
          const accRes = await tx.query(
            `SELECT id, code, name FROM accounts WHERE organization_id = $1 AND id = $2`,
            [orgId, accountId]
          );
          if (accRes.rows.length > 0) {
            accountCode = accRes.rows[0].code || accountCode;
            accountName = accRes.rows[0].name || accountName;
            matched = true;
          }
        }

        if (!matched && accountCode) {
          const codeRes = await tx.query(
            `SELECT id, code, name FROM accounts WHERE organization_id = $1 AND code = $2`,
            [orgId, accountCode]
          );
          if (codeRes.rows.length > 0) {
            accountId = codeRes.rows[0].id;
            accountName = codeRes.rows[0].name || accountName;
            matched = true;
          }
        }

        if (!matched) {
          // Auto-create account
          accountId = accountId || newId('acc');
          accountCode = accountCode || '3999';
          const classification = line.classification || (accountCode.startsWith('1') ? 'Asset' : accountCode.startsWith('2') ? 'Liability' : accountCode.startsWith('3') ? 'Equity' : accountCode.startsWith('4') ? 'Income' : 'Expense');
          const normalBalance = (classification === 'Asset' || classification === 'Expense') ? 'Debit' : 'Credit';

          await tx.query(
            `INSERT INTO accounts (id, organization_id, code, name, type, sub_type, normal_balance, status, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'Active', CURRENT_TIMESTAMP)`,
            [accountId, orgId, accountCode, accountName, classification, classification, normalBalance]
          );
        }

        resolvedLines.push({
          accountId: accountId!,
          accountCode,
          accountName,
          debit,
          credit,
          description: line.description || 'Opening balance migration',
        });
      }

      // Calculate final verified totals
      let finalDebits = 0;
      let finalCredits = 0;
      for (const rl of resolvedLines) {
        finalDebits += rl.debit;
        finalCredits += rl.credit;
      }
      finalDebits = Math.round(finalDebits * 100) / 100;
      finalCredits = Math.round(finalCredits * 100) / 100;

      if (Math.abs(finalDebits - finalCredits) > 0.005) {
        throw new Error(`CRITICAL_LEDGER_IMBALANCE: Debits (${finalDebits}) must equal Credits (${finalCredits})`);
      }

      const countRes = await tx.query(
        `SELECT COUNT(*) as cnt FROM journal_entries WHERE organization_id = $1 AND entry_number LIKE 'JE-OPENING-BAL%'`,
        [orgId]
      );
      const count = parseInt(countRes.rows[0]?.cnt || '0', 10);
      const entryNumber = count === 0 ? 'JE-OPENING-BAL' : `JE-OPENING-BAL-${count + 1}`;
      const asOfDate = options.asOfDate || new Date().toISOString().split('T')[0];

      // 2. Post Journal Entry through ServerPostingEngine to enforce accounting invariants, period locks & balance sync
      const { entryId: journalId } = await ServerPostingEngine.postEntry(
        {
          organizationId: orgId,
          entryNumber,
          date: asOfDate,
          reference: 'MIGRATION-OPENING',
          description: 'Opening Balances Migration Entry',
          lines: resolvedLines.map((line) => ({
            accountId: line.accountId,
            accountCode: line.accountCode,
            accountName: line.accountName,
            debit: line.debit,
            credit: line.credit,
            description: line.description,
          })),
        },
        tx
      );

      // 4. Audit Log
      await tx.query(
        `INSERT INTO audit_logs (id, organization_id, user_id, action, entity_type, entity_id, after_state)
         VALUES ($1, $2, $3, 'OPENING_BALANCES_MIGRATED', 'JournalEntry', $4, $5)`,
        [
          newId('aud'),
          orgId,
          userId,
          journalId,
          JSON.stringify({ entryNumber, finalDebits, finalCredits, lineCount: resolvedLines.length }),
        ]
      );

      return {
        journalEntryId: journalId,
        entryNumber,
        totalDebits: finalDebits,
        totalCredits: finalCredits,
        linesPosted: resolvedLines.length,
      };
    });
  }

  /**
   * Bulk imports master data records (customers, vendors, accounts) with deduplication.
   */
  public static async importMasterData(
    orgId: string,
    type: 'CUSTOMERS' | 'VENDORS' | 'ACCOUNTS',
    records: any[]
  ): Promise<{ imported: number; skipped: number; errors: Array<{ row: number; error: string }> }> {
    if (!records || !Array.isArray(records)) {
      throw new Error('Records must be an array');
    }

    let imported = 0;
    let skipped = 0;
    const errors: Array<{ row: number; error: string }> = [];

    for (let i = 0; i < records.length; i++) {
      const rowNum = i + 1;
      const rec = records[i];

      try {
        if (type === 'CUSTOMERS') {
          const name = rec.name || rec.displayName || rec.companyName;
          if (!name || !name.trim()) {
            errors.push({ row: rowNum, error: 'Customer name is required' });
            continue;
          }

          const existing = await db.query(
            `SELECT id FROM customers WHERE organization_id = $1 AND (display_name ILIKE $2 OR legal_name ILIKE $2) LIMIT 1`,
            [orgId, name.trim()]
          );
          if (existing.rows.length > 0) {
            skipped++;
            continue;
          }

          await db.query(
            `INSERT INTO customers (id, organization_id, display_name, legal_name, email, phone, currency, created_at)
             VALUES ($1, $2, $3, $3, $4, $5, 'USD', CURRENT_TIMESTAMP)`,
            [newId('cust'), orgId, name.trim(), rec.email || null, rec.phone || null]
          );
          imported++;
        } else if (type === 'VENDORS') {
          const name = rec.name || rec.companyName;
          if (!name || !name.trim()) {
            errors.push({ row: rowNum, error: 'Vendor name is required' });
            continue;
          }

          const existing = await db.query(
            `SELECT id FROM vendors WHERE organization_id = $1 AND (name ILIKE $2 OR company_name ILIKE $2) LIMIT 1`,
            [orgId, name.trim()]
          );
          if (existing.rows.length > 0) {
            skipped++;
            continue;
          }

          await db.query(
            `INSERT INTO vendors (id, organization_id, name, company_name, email, phone, currency, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, 'USD', CURRENT_TIMESTAMP)`,
            [newId('ven'), orgId, name.trim(), name.trim(), rec.email || null, rec.phone || null]
          );
          imported++;
        } else if (type === 'ACCOUNTS') {
          const code = rec.code;
          const name = rec.name;
          if (!code || !name) {
            errors.push({ row: rowNum, error: 'Account code and name are required' });
            continue;
          }

          const existing = await db.query(
            `SELECT id FROM accounts WHERE organization_id = $1 AND code = $2 LIMIT 1`,
            [orgId, code.trim()]
          );
          if (existing.rows.length > 0) {
            skipped++;
            continue;
          }

          const classification = rec.classification || (code.startsWith('1') ? 'Asset' : code.startsWith('2') ? 'Liability' : code.startsWith('3') ? 'Equity' : code.startsWith('4') ? 'Income' : 'Expense');
          const normalBal = (classification === 'Asset' || classification === 'Expense') ? 'DEBIT' : 'CREDIT';

          await db.query(
            `INSERT INTO accounts (id, organization_id, code, name, type, classification, normal_balance, is_active, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, CURRENT_TIMESTAMP)`,
            [newId('acc'), orgId, code.trim(), name.trim(), rec.type || classification, classification, normalBal]
          );
          imported++;
        }
      } catch (err: any) {
        errors.push({ row: rowNum, error: err.message || 'Failed to import row' });
      }
    }

    return { imported, skipped, errors };
  }
}
