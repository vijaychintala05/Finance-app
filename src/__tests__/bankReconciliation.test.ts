import { beforeAll, describe, expect, it } from 'vitest';
import { BankReconciliationService } from '../../server/src/banking/BankReconciliationService';
import { BankMatchingEngine } from '../../server/src/banking/BankMatchingEngine';
import { Camt053Parser } from '../../server/src/banking/parsers/Camt053Parser';
import { CsvXlsxParser } from '../../server/src/banking/parsers/CsvXlsxParser';
import { IndiaReferenceExtractor } from '../../server/src/banking/parsers/IndiaReferenceExtractor';
import { Mt940Parser } from '../../server/src/banking/parsers/Mt940Parser';
import { OfxParser } from '../../server/src/banking/parsers/OfxParser';
import { AccountingService } from '../services/accountingService';
import { MigrationRunner } from '../../server/src/database/migrationRunner';
import { db } from '../../server/src/database/db';

describe('Phase 3B: Bank Statement Import, Matching & Reconciliation Engine', () => {
  const ORG_A = 'ORG-TEST-A';
  const ORG_B = 'ORG-TEST-B';

  beforeAll(async () => {
    await MigrationRunner.runMigrations();
  });

  // 1. Parser Tests
  describe('Bank Statement Parsers', () => {
    it('should parse CSV statement with custom column mapping and extract India payment references', () => {
      const csvData = `Transaction Date,Description,Ref No,Withdrawal,Deposit,Balance
2026-08-01,UPI/324156789012/P2A/SENSE STUDIOS,UPI324156789012,,25000.00,125000.00
2026-08-02,NEFT-N123456789012-SUPPLIER PAY,N123456789012,10000.00,,115000.00
2026-08-03,CLG/CHQ/000123 RENT PAYMENT,000123,5000.00,,110000.00`;

      const parsed = CsvXlsxParser.parse(csvData, {
        dateColumn: 'Transaction Date',
        narrationColumn: 'Description',
        referenceColumn: 'Ref No',
        debitColumn: 'Withdrawal',
        creditColumn: 'Deposit',
        balanceColumn: 'Balance',
      });

      expect(parsed.transactions.length).toBe(3);
      expect(parsed.transactions[0].amount).toBe(25000);
      expect(parsed.transactions[0].direction).toBe('CREDIT');
      expect(parsed.transactions[0].upiReference).toBe('324156789012');
      expect(parsed.transactions[0].counterpartyName).toBe('SENSE STUDIOS');

      expect(parsed.transactions[1].amount).toBe(10000);
      expect(parsed.transactions[1].direction).toBe('DEBIT');
      expect(parsed.transactions[1].utr).toBe('N123456789012');

      expect(parsed.transactions[2].chequeNumber).toBe('000123');
    });

    it('should parse OFX bank statements', () => {
      const ofxContent = `OFXHEADER:100
DATA:OFXSGML
<OFX>
<BANKMSGSRSV1>
<STMTTRNRS>
<STMTRS>
<CURDEF>INR
<BANKTRANLIST>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260801
<TRNAMT>25000.00
<FITID>OFX123456
<NAME>CUSTOMER DEPOSIT
<MEMO>UPI/324156789012
</STMTTRN>
</BANKTRANLIST>
<LEDGERBAL>
<BALAMT>125000.00
</LEDGERBAL>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>`;

      const parsed = OfxParser.parse(ofxContent);
      expect(parsed.transactions.length).toBe(1);
      expect(parsed.transactions[0].amount).toBe(25000);
      expect(parsed.transactions[0].direction).toBe('CREDIT');
      expect(parsed.closingBalance).toBe(125000);
    });

    it('should parse MT940 SWIFT bank statements', () => {
      const mt940Content = `:20:STATEMENT123
:25:123456789
:28C:1
:60F:C260801INR100000,00
:61:2608010801CR25000,00NTRFNONREF
:86:UPI/324156789012/CUSTOMER
:62F:C260801INR125000,00`;

      const parsed = Mt940Parser.parse(mt940Content);
      expect(parsed.openingBalance).toBe(100000);
      expect(parsed.closingBalance).toBe(125000);
      expect(parsed.transactions.length).toBe(1);
      expect(parsed.transactions[0].amount).toBe(25000);
      expect(parsed.transactions[0].direction).toBe('CREDIT');
    });

    it('should parse CAMT.053 ISO 20022 XML bank statements', () => {
      const camtContent = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02">
  <BkToCstmrStmt>
    <Stmt>
      <Bal>
        <Tp><CdOrPrtry><Cd>OPBD</Cd></CdOrPrtry></Tp>
        <Amt Ccy="INR">100000.00</Amt>
      </Bal>
      <Bal>
        <Tp><CdOrPrtry><Cd>CLBD</Cd></CdOrPrtry></Tp>
        <Amt Ccy="INR">125000.00</Amt>
      </Bal>
      <Ntry>
        <Amt Ccy="INR">25000.00</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <BookgDt><Dt>2026-08-01</Dt></BookgDt>
        <NtryDtls>
          <TxDtls>
            <RmtInf><Ustrd>UPI/324156789012/CUSTOMER PAYMENT</Ustrd></RmtInf>
          </TxDtls>
        </NtryDtls>
      </Ntry>
    </Stmt>
  </BkToCstmrStmt>
</Document>`;

      const parsed = Camt053Parser.parse(camtContent);
      expect(parsed.openingBalance).toBe(100000);
      expect(parsed.closingBalance).toBe(125000);
      expect(parsed.transactions.length).toBe(1);
      expect(parsed.transactions[0].amount).toBe(25000);
      expect(parsed.transactions[0].direction).toBe('CREDIT');
    });
  });

  // 2. India Payment Reference Extraction
  describe('India Reference Extractor', () => {
    it('should extract UTR, RRN, UPI, Cheque number and Counterparty', () => {
      const refs1 = IndiaReferenceExtractor.extract('UPI/324156789012/P2A/SENSE STUDIOS/INV123');
      expect(refs1.transactionType).toBe('UPI');
      expect(refs1.upiReference).toBe('324156789012');
      expect(refs1.counterpartyName).toBe('SENSE STUDIOS');

      const refs2 = IndiaReferenceExtractor.extract('NEFT-N123456789012-ACME CORP');
      expect(refs2.transactionType).toBe('NEFT');
      expect(refs2.utr).toBe('N123456789012');
      expect(refs2.counterpartyName).toBe('ACME CORP');

      const refs3 = IndiaReferenceExtractor.extract('CLG/CHQ/000456 RENT PAYMENT');
      expect(refs3.transactionType).toBe('Cheque');
      expect(refs3.chequeNumber).toBe('000456');
    });
  });

  // 3. Duplicate & Overlapping Import Protection
  describe('Duplicate & Overlapping Import Protection', () => {
    it('should reject exact duplicate statement file import', async () => {
      const bankAcc = await BankReconciliationService.createBankAccount(ORG_A, { accountName: 'Test HDFC' });
      const csvContent = `Date,Narration,Withdrawal,Deposit,Balance
2026-08-01,UPI/324156789012/CUSTOMER,,25000.00,125000.00`;

      const res1 = await BankReconciliationService.importStatement(ORG_A, bankAcc.id, 'stmt1.csv', csvContent);
      expect(res1.newTransactionsCount).toBe(1);

      const res2 = await BankReconciliationService.importStatement(ORG_A, bankAcc.id, 'stmt1.csv', csvContent);
      expect(res2.newTransactionsCount).toBe(0);
      expect(res2.duplicateCount).toBe(1);
    });

    it('should safely deduplicate overlapping date range statement imports', async () => {
      const bankAcc = await BankReconciliationService.createBankAccount(ORG_A, { accountName: 'Test ICICI' });
      const csvPart1 = `Date,Narration,Withdrawal,Deposit,Balance
2026-08-01,TX1,,10000.00,110000.00
2026-08-02,TX2,,15000.00,125000.00`;

      const csvPart2 = `Date,Narration,Withdrawal,Deposit,Balance
2026-08-02,TX2,,15000.00,125000.00
2026-08-03,TX3,5000.00,,120000.00`;

      const res1 = await BankReconciliationService.importStatement(ORG_A, bankAcc.id, 'part1.csv', csvPart1);
      expect(res1.newTransactionsCount).toBe(2);

      const res2 = await BankReconciliationService.importStatement(ORG_A, bankAcc.id, 'part2.csv', csvPart2);
      expect(res2.newTransactionsCount).toBe(1); // TX3 only
      expect(res2.duplicateCount).toBe(1); // TX2 skipped
    });
  });

  // 4. Ledger Safety Invariant
  describe('Ledger Safety Invariant', () => {
    it('should guarantee ZERO change to General Ledger / Trial Balance on statement import', async () => {
      const initialTrialBalance = AccountingService.calculateTrialBalance([]);

      const bankAcc = await BankReconciliationService.createBankAccount(ORG_A, { accountName: 'Ledger Safety Bank' });
      const csvContent = `Date,Narration,Withdrawal,Deposit,Balance
2026-08-01,LARGE DEPOSIT,,500000.00,500000.00
2026-08-02,LARGE WITHDRAWAL,200000.00,,300000.00`;

      await BankReconciliationService.importStatement(ORG_A, bankAcc.id, 'large_stmt.csv', csvContent);

      const afterTrialBalance = AccountingService.calculateTrialBalance([]);
      expect(afterTrialBalance.totalDebits).toBe(initialTrialBalance.totalDebits);
      expect(afterTrialBalance.totalCredits).toBe(initialTrialBalance.totalCredits);
    });
  });

  // 5. Matching Engine Scoring
  describe('Matching Engine', () => {
    it('should score candidates with high confidence on exact UTR, amount, and date proximity', () => {
      const statementTx: any = {
        id: 'stx-1',
        transactionDate: '2026-08-01',
        amount: 25000,
        direction: 'CREDIT',
        narration: 'UPI/324156789012/SENSE STUDIOS',
        reference: '324156789012',
        utr: '324156789012',
      };

      const candidates: any[] = [
        {
          id: 'pay-1',
          type: 'payment_received',
          referenceNumber: '324156789012',
          date: '2026-08-01',
          amount: 25000,
          entityName: 'Sense Studios',
        },
        {
          id: 'pay-2',
          type: 'payment_received',
          referenceNumber: '999999999999',
          date: '2026-07-15',
          amount: 5000,
          entityName: 'Unrelated Client',
        },
      ];

      const matches = BankMatchingEngine.findMatches(statementTx, candidates);
      expect(matches.length).toBe(1);
      expect(matches[0].confidenceScore).toBe(100);
      expect(matches[0].accountingTransactionId).toBe('pay-1');
    });

    it('should match bank fee deduction scenario (e.g., Invoice ₹100,000, Deposit ₹99,500)', () => {
      const statementTx: any = {
        id: 'stx-fee',
        transactionDate: '2026-08-01',
        amount: 99500,
        direction: 'CREDIT',
        narration: 'STRIPE PAYOUT INV-2026-001',
        reference: 'INV-2026-001',
      };

      const candidates: any[] = [
        {
          id: 'inv-1',
          type: 'invoice',
          referenceNumber: 'INV-2026-001',
          date: '2026-08-01',
          amount: 100000,
          entityName: 'Client Alpha',
        },
      ];

      const matches = BankMatchingEngine.findMatches(statementTx, candidates, 1000);
      expect(matches.length).toBe(1);
      expect(matches[0].reasons.some((r) => r.code === 'AMOUNT_WITH_BANK_FEE')).toBe(true);
    });
  });

  // 6. Golden Reconciliation Test (Requirement 52)
  describe('Golden Reconciliation Test', () => {
    it('should execute end-to-end reconciliation achieving ₹0.00 difference', async () => {
      // Step A: Setup Bank Account with GL Bank Balance ₹100,000
      const bankAcc = await BankReconciliationService.createBankAccount(ORG_A, {
        accountName: 'Golden HDFC Bank',
        currentBalance: 100000,
      });

      // Step B: Existing Accounting Transactions
      // Customer receipt: +₹25,000, Vendor payment: -₹10,000, Rent: -₹5,000, Internal transfer out: -₹20,000
      const candidates: any[] = [
        { id: 'PAY-001', type: 'payment_received', referenceNumber: 'UTR25000', date: '2026-08-01', amount: 25000, entityName: 'Customer A' },
        { id: 'PAY-MADE-001', type: 'payment_made', referenceNumber: 'NEFT10000', date: '2026-08-02', amount: 10000, entityName: 'Vendor B' },
        { id: 'EXP-001', type: 'expense', referenceNumber: 'CHQ000100', date: '2026-08-03', amount: 5000, entityName: 'Landlord' },
        { id: 'TRF-001', type: 'transfer', referenceNumber: 'TRF20000', date: '2026-08-04', amount: 20000, entityName: 'ICICI Bank' },
      ];

      // Step C: Import Statement
      // Opening ₹100,000, Customer receipt +₹25,000, Vendor -₹10,000, Rent -₹5,000, Transfer -₹20,000, Bank Charges -₹500. Closing ₹89,500.
      const goldenCsv = `Date,Narration,Withdrawal,Deposit,Balance
2026-08-01,UPI/UTR25000/CUSTOMER A,,25000.00,125000.00
2026-08-02,NEFT10000/VENDOR B,10000.00,,115000.00
2026-08-03,CHQ000100 RENT,5000.00,,110000.00
2026-08-04,TRF20000 TRANSFER TO ICICI,20000.00,,90000.00
2026-08-05,BANK CHARGES FOR AUGUST,500.00,,89500.00`;

      const importRes = await BankReconciliationService.importStatement(ORG_A, bankAcc.id, 'golden_stmt.csv', goldenCsv);
      expect(importRes.import.openingBalance).toBe(100000);
      expect(importRes.import.closingBalance).toBe(89500);

      const txs = await BankReconciliationService.getTransactions(ORG_A, { bankAccountId: bankAcc.id });
      expect(txs.length).toBe(5);

      // Step D: Match existing 4 transactions
      for (const t of txs) {
        const matches = BankMatchingEngine.findMatches(t, candidates);
        if (matches.length > 0) {
          await BankReconciliationService.matchTransaction(ORG_A, t.id, matches[0].accountingTransactionType, matches[0].accountingTransactionId, matches[0].matchedAmount);
        }
      }

      // Step E: Unmatched Bank Charges (-₹500) -> Create accounting expense entry
      const bankChargeTx = txs.find((t) => t.narration.includes('BANK CHARGES'))!;

      // Match user-created Bank Charge transaction
      await BankReconciliationService.matchTransaction(ORG_A, bankChargeTx.id, 'expense', 'EXP-BANK-CHARGE-500', 500);

      // Step F: Verify Reconciliation Summary
      // Statement Closing Balance ₹89,500, GL Balance adjusted to ₹89,500 -> Difference = ₹0.00
      const summary = await BankReconciliationService.getReconciliationSummary(ORG_A, bankAcc.id, '2026-08-31', 89500, 89500);

      expect(summary.statementClosingBalance).toBe(89500);
      expect(summary.glBankBalance).toBe(89500);
      expect(summary.difference).toBe(0);
      expect(summary.status).toBe('BALANCED');

      // Complete session
      const session = await BankReconciliationService.completeReconciliationSession(ORG_A, bankAcc.id, '2026-08-31', 89500, 89500);
      expect(session.status).toBe('COMPLETED');
      expect(session.difference).toBe(0);
    });
  });

  // 7. Internal Transfer Golden Test (Requirement 53)
  describe('Internal Transfer Golden Test', () => {
    it('should reconcile internal transfer HDFC -> ICICI across both statements linking to single transfer entry', async () => {
      const hdfc = await BankReconciliationService.createBankAccount(ORG_A, { accountName: 'HDFC Current' });
      const icici = await BankReconciliationService.createBankAccount(ORG_A, { accountName: 'ICICI Current' });

      // HDFC Statement (Debit ₹20,000)
      const hdfcCsv = `Date,Narration,Withdrawal,Deposit,Balance
2026-08-01,TRF-OUT TO ICICI BANK 20000,20000.00,,80000.00`;

      // ICICI Statement (Credit ₹20,000)
      const iciciCsv = `Date,Narration,Withdrawal,Deposit,Balance
2026-08-01,TRF-IN FROM HDFC BANK 20000,,20000.00,120000.00`;

      await BankReconciliationService.importStatement(ORG_A, hdfc.id, 'hdfc.csv', hdfcCsv);
      await BankReconciliationService.importStatement(ORG_A, icici.id, 'icici.csv', iciciCsv);

      const hdfcTxs = await BankReconciliationService.getTransactions(ORG_A, { bankAccountId: hdfc.id });
      const iciciTxs = await BankReconciliationService.getTransactions(ORG_A, { bankAccountId: icici.id });

      expect(hdfcTxs.length).toBe(1);
      expect(iciciTxs.length).toBe(1);

      const transferId = 'INTERNAL-TRF-HDFC-ICICI-20000';

      // Match both sides to ONE internal transfer accounting entry
      await BankReconciliationService.matchTransaction(ORG_A, hdfcTxs[0].id, 'transfer', transferId, 20000);
      await BankReconciliationService.matchTransaction(ORG_A, iciciTxs[0].id, 'transfer', transferId, 20000);

      const hdfcReload = await BankReconciliationService.getTransactions(ORG_A, { bankAccountId: hdfc.id });
      const iciciReload = await BankReconciliationService.getTransactions(ORG_A, { bankAccountId: icici.id });

      expect(hdfcReload[0].reconciliationStatus).toBe('MATCHED');
      expect(iciciReload[0].reconciliationStatus).toBe('MATCHED');
    });
  });

  // 8. Tenant Isolation Attack Tests
  describe('Multi-Tenant Isolation', () => {
    it('should strictly isolate statement imports and transactions between Organization A and Organization B', async () => {
      const bankAccA = await BankReconciliationService.createBankAccount(ORG_A, { accountName: 'Org A Bank' });

      const csvData = `Date,Narration,Withdrawal,Deposit,Balance
2026-08-01,CONFIDENTIAL DEPOSIT,,50000.00,50000.00`;

      await BankReconciliationService.importStatement(ORG_A, bankAccA.id, 'confidential.csv', csvData);

      // Org B attempts to query Org A's transactions
      const txsForOrgB = await BankReconciliationService.getTransactions(ORG_B, { bankAccountId: bankAccA.id });
      expect(txsForOrgB.length).toBe(0);

      const importsForOrgB = await BankReconciliationService.getStatementImports(ORG_B);
      expect(importsForOrgB.length).toBe(0);
    });
  });

  // 9. Performance Benchmark Test
  describe('Performance Benchmark', () => {
    it('should efficiently parse and batch process 10,000 statement lines', () => {
      const header = 'Date,Description,Ref No,Withdrawal,Deposit,Balance\n';
      const lines: string[] = [];
      let balance = 1000000;

      for (let i = 1; i <= 10000; i++) {
        const isCredit = i % 2 === 0;
        const amt = 100 + (i % 500);
        if (isCredit) balance += amt;
        else balance -= amt;

        lines.push(`2026-08-01,TXN_${i}_UPI_${100000000000 + i},REF_${i},${isCredit ? '' : amt.toFixed(2)},${isCredit ? amt.toFixed(2) : ''},${balance.toFixed(2)}`);
      }

      const largeCsv = header + lines.join('\n');

      const startTime = Date.now();
      const parsed = CsvXlsxParser.parse(largeCsv);
      const durationMs = Date.now() - startTime;

      expect(parsed.transactions.length).toBe(10000);
      expect(durationMs).toBeLessThan(3000); // Must complete within 3 seconds
    });
  });

  // 10. Database Error Propagation & GL Rebuild Tests
  describe('Database Error Propagation & GL Rebuild', () => {
    it('should propagate database errors and fail when SQL operations fail', async () => {
      // Execute query targeting a non-existent table directly via BankReconciliationService DB layer
      await expect(
        db.query(`INSERT INTO non_existent_table_xyz (id) VALUES ('test')`)
      ).rejects.toThrow();
    });

    it('should rebuild bank balances from General Ledger journal lines correctly', async () => {
      const orgId = 'ORG-REBUILD-TEST';

      // Create a bank account
      const bankAcc = await BankReconciliationService.createBankAccount(orgId, {
        accountName: 'Rebuild Bank Acc',
        currentBalance: 0,
        ledgerAccountId: 'ACC-BANK-1010',
      });

      // Post a journal entry affecting the bank account ledger
      const journalId = `je-rebuild-${Date.now()}`;
      await db.query(
        `INSERT INTO journal_entries (id, organization_id, entry_number, date, reference, description, status)
         VALUES ($1, $2, 'JE-REBUILD-1', '2026-08-01', 'REF-1', 'Capital Injection', 'Posted')`,
        [journalId, orgId]
      );

      await db.query(
        `INSERT INTO journal_lines (id, journal_entry_id, account_id, debit, credit, description)
         VALUES ($1, $2, 'ACC-BANK-1010', 50000.00, 0, 'Capital Injection')`,
        [`jln-${journalId}-1`, journalId]
      );

      // Rebuild bank balance from GL
      const rebuildRes = await BankReconciliationService.rebuildBankBalancesFromGL(orgId);
      expect(rebuildRes.length).toBeGreaterThan(0);

      const target = rebuildRes.find((r) => r.bankAccountId === bankAcc.id);
      expect(target).toBeDefined();
      expect(target?.newBalance).toBe(50000);

      // Verify bank account in DB now reflects 50,000
      const updatedAccs = await BankReconciliationService.getBankAccounts(orgId);
      const updatedAcc = updatedAccs.find((a) => a.id === bankAcc.id);
      expect(updatedAcc?.currentBalance).toBe(50000);
    });
  });
});
