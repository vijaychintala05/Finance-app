import { describe, it, expect, beforeAll } from 'vitest';
import { BankStatementParserFactory } from '../banking/parsers/BankStatementParserFactory';
import { BankReconciliationService } from '../banking/BankReconciliationService';
import { db } from '../database/db';
import { MigrationRunner } from '../database/migrationRunner';

const ORG_ID = 'org-realworld-banking-test';

describe('Real-World Bank Statement Parsing & Import Suite', () => {
  beforeAll(async () => {
    await MigrationRunner.runMigrations();
    await db.query(
      `INSERT INTO organizations (id, uuid, public_org_id, org_code, name, country, base_currency, currency_symbol, owner_user_id, status)
       VALUES ($1, 'uuid-realworld-1', 'pub-rw1', 'RWBNK', 'RealWorld Bank Org', 'IN', 'INR', '₹', 'usr-test', 'Active')
       ON CONFLICT (id) DO NOTHING`,
      [ORG_ID]
    );
  });

  it('1. Parses ICICI Bank OpTransactionHistory statement with 12+ preamble lines and 2-digit years', async () => {
    const iciciExport = `
<html>
<body>
<table>
<tr><td colspan="8">ICICI Bank Detailed Statement</td></tr>
<tr><td>Account Number</td><td colspan="7">001105001234</td></tr>
<tr><td>Customer Name</td><td colspan="7">Acme Technologies Pvt Ltd</td></tr>
<tr><td>Account Branch</td><td colspan="7">Bandra Kurla Complex, Mumbai</td></tr>
<tr><td>Statement Period</td><td colspan="7">01/09/2026 to 13/09/2026</td></tr>
<tr><td>Opening Balance</td><td colspan="7">100000.00</td></tr>
<tr><td>Closing Balance</td><td colspan="7">125000.00</td></tr>
<tr><td>IFSC Code</td><td colspan="7">ICIC0000011</td></tr>
<tr><td>Currency</td><td colspan="7">INR</td></tr>
<tr><td colspan="8">&nbsp;</td></tr>
<tr><td colspan="8">&nbsp;</td></tr>
<tr><td colspan="8"><b>Transactions List</b></td></tr>
<tr>
  <td>S No.</td>
  <td>Value Date</td>
  <td>Transaction Date</td>
  <td>Cheque Number</td>
  <td>Transaction Remarks</td>
  <td>Withdrawal Amount (INR )</td>
  <td>Deposit Amount (INR )</td>
  <td>Balance (INR )</td>
</tr>
<tr>
  <td>1</td>
  <td>02/09/2026</td>
  <td>02/09/2026</td>
  <td>-</td>
  <td>NEFT-N09260012345-INFOSYS TECH-SALARY</td>
  <td></td>
  <td>50,000.00</td>
  <td>150,000.00</td>
</tr>
<tr>
  <td>2</td>
  <td>05/09/2026</td>
  <td>05/09/2026</td>
  <td>-</td>
  <td>UPI/123456789012/Office Supplies/user@okhdfcbank</td>
  <td>5,000.00</td>
  <td></td>
  <td>145,000.00</td>
</tr>
<tr>
  <td>3</td>
  <td>10/09/2026</td>
  <td>10/09/2026</td>
  <td>401928</td>
  <td>CHQ CLG / 401928 / OFFICE RENT SEPT</td>
  <td>20,000.00</td>
  <td></td>
  <td>125,000.00</td>
</tr>
</table>
</body>
</html>
`;

    const parsed = await BankStatementParserFactory.parseStatement(
      iciciExport,
      'acc-icici-1',
      'XLS',
      undefined,
      'OpTransactionHistory13-09-2026.xls'
    );

    expect(parsed.detectedBankName).toBe('ICICI Bank');
    expect(parsed.detectedAccountNumber).toBe('001105001234');
    expect(parsed.transactions.length).toBe(3);

    // Row 1: Deposit (Credit) 50,000
    expect(parsed.transactions[0].transactionDate).toBe('2026-09-02');
    expect(parsed.transactions[0].direction).toBe('CREDIT');
    expect(parsed.transactions[0].amount).toBe(50000);
    expect(parsed.transactions[0].narration).toContain('INFOSYS');

    // Row 2: Withdrawal (Debit) 5,000
    expect(parsed.transactions[1].transactionDate).toBe('2026-09-05');
    expect(parsed.transactions[1].direction).toBe('DEBIT');
    expect(parsed.transactions[1].amount).toBe(5000);

    // Row 3: Cheque Withdrawal 20,000
    expect(parsed.transactions[2].transactionDate).toBe('2026-09-10');
    expect(parsed.transactions[2].direction).toBe('DEBIT');
    expect(parsed.transactions[2].amount).toBe(20000);
    expect(parsed.transactions[2].chequeNumber).toBe('401928');
  });

  it('2. UPI VPA handles (@okhdfcbank, @okaxis) in narrations do not misidentify bank name', async () => {
    const csvWithVpas = `
ICICI Bank Limited - Statement of Account
Account Number: 998877665544
Txn Date,Description,Debit,Credit,Balance
2026-09-01,UPI/112233/Payment/vendor@okhdfcbank,1200.00,,48800.00
2026-09-02,UPI/445566/Refund/merchant@okaxis,,350.00,49150.00
2026-09-03,UPI/778899/Settlement/client@oksbi,,2000.00,51150.00
`;
    const parsed = await BankStatementParserFactory.parseStatement(
      csvWithVpas,
      'acc-icici-2',
      'CSV',
      undefined,
      'Statement_Sep2026.csv'
    );

    expect(parsed.detectedBankName).toBe('ICICI Bank');
    expect(parsed.transactions.length).toBe(3);
  });

  it('3. Handles diverse Indian netbanking date formats (timestamps, 2-digit years, text months)', async () => {
    const multiDateCsv = `
Transaction Date,Narration,Withdrawal,Deposit,Balance
13/09/2026 14:32:00,ATM Cash Withdrawal,2000.00,,98000.00
2/9/26,Consulting Fee Receipt,,15000.00,113000.00
10-Sep-2026,Software Subscription AWS,3500.00,,109500.00
2026-09-12,Interest Credit,,450.00,109950.00
`;
    const parsed = await BankStatementParserFactory.parseStatement(
      multiDateCsv,
      'acc-multi-1',
      'CSV',
      undefined,
      'statement.csv'
    );

    expect(parsed.transactions.length).toBe(4);
    expect(parsed.transactions[0].transactionDate).toBe('2026-09-13');
    expect(parsed.transactions[1].transactionDate).toBe('2026-09-02');
    expect(parsed.transactions[2].transactionDate).toBe('2026-09-10');
    expect(parsed.transactions[3].transactionDate).toBe('2026-09-12');
  });

  it('4. Successfully previews and confirms import of OpTransactionHistory13-09-2026.xls into database', async () => {
    const iciciContent = `
ICICI Bank Account Statement
Account Number: 554433221100
Opening Balance: 50000.00
Closing Balance: 75000.00
S No.,Value Date,Transaction Date,Cheque Number,Transaction Remarks,Withdrawal Amount (INR ),Deposit Amount (INR ),Balance (INR )
1,13/09/2026,13/09/2026,-,NEFT-CR-TECH-SERVICES,,30000.00,80000.00
2,13/09/2026,13/09/2026,-,UPI/OFFICE-SNACKS,5000.00,,75000.00
`;

    // 1. Preview statement import
    const preview = await BankReconciliationService.previewStatementImport(ORG_ID, {
      fileContent: iciciContent,
      filename: 'OpTransactionHistory13-09-2026.xls',
    });

    expect(preview.detectedBankName).toBe('ICICI Bank');
    expect(preview.detectedAccountNumber).toBe('554433221100');
    expect(preview.totalRows).toBe(2);
    expect(preview.newRowsCount).toBe(2);
    expect(preview.previewRows.length).toBe(2);

    // 2. Confirm statement import
    const confirmed = await BankReconciliationService.confirmStatementImport(
      ORG_ID,
      {
        fileContent: iciciContent,
        filename: 'OpTransactionHistory13-09-2026.xls',
        mode: 'CREATE_NEW',
        newBankData: {
          bankName: preview.detectedBankName || 'ICICI Bank',
          accountName: 'ICICI Current Account',
          accountNumber: preview.detectedAccountNumber || '554433221100',
          currency: 'INR',
        },
      },
      'usr-tester'
    );

    expect(confirmed.newTransactionsCount).toBe(2);
    expect(confirmed.exactDuplicatesCount).toBe(0);
    expect(confirmed.ledgerAccountId).toBeDefined();

    const importEvidence = await db.query(
      `SELECT source_format, parser_version FROM bank_statement_imports
        WHERE organization_id = $1 AND bank_account_id = $2
        ORDER BY imported_at DESC LIMIT 1`,
      [ORG_ID, confirmed.bankAccountId]
    );
    expect(importEvidence.rows[0]).toEqual(expect.objectContaining({
      source_format: 'XLS',
      parser_version: '3.0',
    }));

    // 3. Verify workspace fetch returns the transactions
    const workspace = await BankReconciliationService.getWorkspace(ORG_ID, confirmed.bankAccountId, {
      tab: 'ALL',
    });

    expect(workspace.totalTransactions).toBe(2);
    expect(workspace.transactions.length).toBe(2);
    expect(workspace.transactions[0].narration).toBe('NEFT-CR-TECH-SERVICES');
    expect(workspace.transactions[0].moneyIn).toBe(30000);
    expect(workspace.transactions[1].narration).toBe('UPI/OFFICE-SNACKS');
    expect(workspace.transactions[1].moneyOut).toBe(5000);
  });

  it('5. Successfully imports statement into existing bank account with mode USE_EXISTING', async () => {
    // Get existing bank accounts in this org
    const existing = await BankReconciliationService.getBankAccounts(ORG_ID);
    expect(existing.length).toBeGreaterThan(0);
    const bankAcc = existing[0];

    const newStatement = `
Date,Particulars,Cheque No,Debit,Credit,Balance
14/09/2026,CLIENT-INVOICE-SETTLEMENT,-,,45000.00,120000.00
15/09/2026,SERVER-INFRA-HOSTING,-,8500.00,,111500.00
`;

    const confirmed = await BankReconciliationService.confirmStatementImport(
      ORG_ID,
      {
        fileContent: newStatement,
        filename: 'statement_sep15.csv',
        mode: 'USE_EXISTING',
        bankAccountId: bankAcc.id,
      },
      'usr-tester'
    );

    expect(confirmed.success).toBe(true);
    expect(confirmed.bankAccountId).toBe(bankAcc.id);
    expect(confirmed.ledgerAccountId).toBe(bankAcc.ledgerAccountId);
    expect(confirmed.newTransactionsCount).toBe(2);

    const ws = await BankReconciliationService.getWorkspace(ORG_ID, bankAcc.id, { tab: 'ALL' });
    expect(ws.totalTransactions).toBe(4);
  });
});
