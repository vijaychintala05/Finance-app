import { describe, it, beforeAll, expect } from 'vitest';

// Enable pg-mem before importing db or services
process.env.USE_PG_MEM = 'true';

import { db } from '../database/db';
import { BankReconciliationService } from '../banking/BankReconciliationService';
import { BankRulesEngine } from '../banking/BankRulesEngine';
import { BankStatementParserFactory } from '../banking/parsers/BankStatementParserFactory';
import { IndiaReferenceExtractor } from '../banking/parsers/IndiaReferenceExtractor';
import { MigrationRunner } from '../database/migrationRunner';

const ORG_A = 'org-test-3a-a';
const ORG_B = 'org-test-3a-b';
const HDFC_ACC_ID = 'acc-hdfc-3a';

describe('Phase 3A: Bank Statement Parsers, Reference Extraction & Rules Engine Verification', () => {
  beforeAll(async () => {
    db.initPgMem();
    await MigrationRunner.runMigrations();

    // Create test organizations
    await db.query(
      `INSERT INTO organizations (id, uuid, public_org_id, org_code, name, country, base_currency, currency_symbol, owner_user_id) VALUES ($1, $2, $3, $4, $5, 'Test Jurisdiction', 'INR', 'INR', $6) ON CONFLICT DO NOTHING`,
      [ORG_A, 'uuid-3a-a', 'PUB-3A-A', 'ORG3AA', 'Phase 3A Org A', 'usr-3a-1']
    );
    await db.query(
      `INSERT INTO organizations (id, uuid, public_org_id, org_code, name, country, base_currency, currency_symbol, owner_user_id) VALUES ($1, $2, $3, $4, $5, 'Test Jurisdiction', 'INR', 'INR', $6) ON CONFLICT DO NOTHING`,
      [ORG_B, 'uuid-3a-b', 'PUB-3A-B', 'ORG3AB', 'Phase 3A Org B', 'usr-3a-2']
    );

    // Create ledger account and bank account
    await db.query(
      `INSERT INTO accounts (id, organization_id, code, name, type, sub_type, balance, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT DO NOTHING`,
      ['ledger-bank-3a', ORG_A, '1010', 'HDFC Bank Account', 'Asset', 'Bank', 0, 'Active']
    );

    await BankReconciliationService.createBankAccount(ORG_A, {
      id: HDFC_ACC_ID,
      accountName: 'HDFC Current Account',
      accountNumber: '50200012345678',
      bankName: 'HDFC Bank',
      currency: 'INR',
      ledgerAccountId: 'ledger-bank-3a',
      openingBalanceDate: '2026-08-01',
    });
  });

  it('1. Bank Statement Multi-Format Parser Engine (CSV, OFX, MT940, CAMT.053)', () => {
    // CSV Test
    const csvContent = `Transaction Date,Description,Ref No,Withdrawal,Deposit,Balance
2026-08-01,UPI/324156789012/P2A/SENSE STUDIOS,UPI324156789012,,25000.00,125000.00
2026-08-02,NEFT-N123456789012-SUPPLIER PAY,N123456789012,10000.00,,115000.00`;
    const csvParsed = BankStatementParserFactory.parseStatement(csvContent, HDFC_ACC_ID, 'CSV');
    expect(csvParsed.transactions.length).toBe(2);
    expect(csvParsed.transactions[0].amount).toBe(25000);
    expect(csvParsed.transactions[0].direction).toBe('CREDIT');

    // OFX Test
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
<DTPOSTED>20260801000000
<TRNAMT>15000.00
<FITID>OFX123456
<NAME>ACME CORP PAYMENT
</STMTTRN>
</BANKTRANLIST>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>`;
    const ofxParsed = BankStatementParserFactory.parseStatement(ofxContent, HDFC_ACC_ID, 'OFX');
    expect(ofxParsed.transactions.length).toBe(1);
    expect(ofxParsed.transactions[0].amount).toBe(15000);

    // MT940 Test
    const mt940Content = `:20:MT940STATEMENT
:25:50200012345678
:28C:00001/001
:60F:C260801INR100000,00
:61:2608010801CR50000,00NTRFNONREF//REF987654
SERVICES PAYMENT
:62F:C260801INR150000,00`;
    const mt940Parsed = BankStatementParserFactory.parseStatement(mt940Content, HDFC_ACC_ID, 'MT940');
    expect(mt940Parsed.transactions.length).toBe(1);

    // CAMT.053 Test
    const camtContent = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02">
  <BkToCstmrStmt>
    <Stmt>
      <Ntry>
        <Amt Ccy="INR">35000.00</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <BookgDt><Dt>2026-08-01</Dt></BookgDt>
        <NtryDtls><TxDtls><Rmts><Ustrd>CAMT PAYMENT FROM CLIENT</Ustrd></Rmts></TxDtls></NtryDtls>
      </Ntry>
    </Stmt>
  </BkToCstmrStmt>
</Document>`;
    const camtParsed = BankStatementParserFactory.parseStatement(camtContent, HDFC_ACC_ID, 'CAMT053');
    expect(camtParsed.transactions.length).toBe(1);
  });

  it('2. Indian Banking Reference Extractor (UTR, UPI, RRN, IMPS, Cheque)', () => {
    const refs1 = IndiaReferenceExtractor.extract('NEFT-N123456789012-VENDOR PAY');
    expect(refs1.utr).toBe('N123456789012');

    const refs2 = IndiaReferenceExtractor.extract('UPI/324156789012/P2A/SENSE STUDIOS');
    expect(refs2.upiReference).toBe('324156789012');
    expect(refs2.counterpartyName).toBe('SENSE STUDIOS');

    const refs3 = IndiaReferenceExtractor.extract('IMPS/P2A/324156789012/SUPPLIER');
    expect(refs3.rrn).toBe('324156789012');

    const refs4 = IndiaReferenceExtractor.extract('CLG/CHQ/000123 RENT');
    expect(refs4.chequeNumber).toBe('000123');
  });

  it('3. Bank Automated Rules Engine (Rule Creation, Matching & Execution)', async () => {
    const rule = await BankReconciliationService.createRule(ORG_A, {
      ruleName: 'Auto-categorize Software Subscriptions',
      narrationPattern: 'GITHUB',
      suggestedAccountId: 'ledger-bank-3a',
      direction: 'BOTH',
      priority: 1,
      isEnabled: true,
    });

    expect(rule.id).toBeDefined();

    const matchedRule = BankRulesEngine.evaluateRules(
      {
        id: 'tx-test-1',
        organizationId: ORG_A,
        bankAccountId: HDFC_ACC_ID,
        statementImportId: 'import-1',
        narration: 'GITHUB INC RECURRING SUBSCRIPTION',
        amount: 2000,
        direction: 'DEBIT',
        transactionDate: '2026-08-01',
        currency: 'INR',
        reconciliationStatus: 'UNMATCHED',
        fingerprint: 'fp1',
        createdAt: new Date().toISOString(),
      },
      [rule]
    );

    expect(matchedRule).not.toBeNull();
    expect(matchedRule?.ruleId).toBe(rule.id);
  });

  it('4. Statement Import & Duplicate File/Transaction Protection', async () => {
    const csvData = `Transaction Date,Description,Ref No,Withdrawal,Deposit,Balance
2026-08-01,SALARY CREDIT SAL-3A-01,SAL3A01,,50000.00,150000.00`;

    const res1 = await BankReconciliationService.importStatement(ORG_A, HDFC_ACC_ID, 'jan_statement.csv', csvData);
    expect(res1.newTransactionsCount).toBe(1);

    // Re-importing exact same file should be handled as duplicate with 0 new transactions
    const res2 = await BankReconciliationService.importStatement(ORG_A, HDFC_ACC_ID, 'jan_statement.csv', csvData);
    expect(res2.newTransactionsCount).toBe(0);
    expect(res2.duplicateCount).toBe(1);
  });

  it('5. Multi-Tenant Organization Isolation for Statement Management', async () => {
    const csvOrgA = `Transaction Date,Description,Ref No,Withdrawal,Deposit,Balance
2026-08-01,ORG A ONLY TX,REF-ORG-A,,1000.00,1000.00`;

    const csvOrgB = `Transaction Date,Description,Ref No,Withdrawal,Deposit,Balance
2026-08-01,ORG B ONLY TX,REF-ORG-B,,2000.00,2000.00`;

    await BankReconciliationService.importStatement(ORG_A, HDFC_ACC_ID, 'orgA.csv', csvOrgA);
    await expect(
      BankReconciliationService.importStatement(ORG_B, HDFC_ACC_ID, 'orgB.csv', csvOrgB)
    ).rejects.toThrow(/bank account currency/i);

    const txsA = await BankReconciliationService.getTransactions(ORG_A, { search: 'ORG A' });
    const txsB = await BankReconciliationService.getTransactions(ORG_B, { search: 'ORG A' });

    expect(txsA.length).toBe(1);
    expect(txsB.length).toBe(0);
  });
});
