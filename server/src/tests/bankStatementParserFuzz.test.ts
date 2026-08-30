import { describe, it, expect } from 'vitest';
import { BankStatementParserFactory } from '../banking/parsers/BankStatementParserFactory';
import { CsvXlsxParser } from '../banking/parsers/CsvXlsxParser';
import { OfxParser } from '../banking/parsers/OfxParser';
import { Mt940Parser } from '../banking/parsers/Mt940Parser';
import { IndiaReferenceExtractor } from '../banking/parsers/IndiaReferenceExtractor';

describe('Bank Statement Parser Robustness, Edge-Case & Fuzz Test Suite', () => {
  const TEST_ACC_ID = 'acc-fuzz-bank-1';

  it('1. Parses CSV with UTF-8 Byte Order Mark (BOM) cleanly', () => {
    const csvWithBom = `\uFEFFDate,Description,Ref No,Withdrawal,Deposit,Balance
2026-08-01,SALARY DEPOSIT,SAL101,,75000.00,175000.00`;

    const parsed = BankStatementParserFactory.parseStatement(csvWithBom, TEST_ACC_ID, 'CSV');
    expect(parsed.transactions.length).toBe(1);
    expect(parsed.transactions[0].amount).toBe(75000);
    expect(parsed.transactions[0].direction).toBe('CREDIT');
    expect(parsed.transactions[0].fingerprint).toBeDefined();
  });

  it('2. Handles various date formats (DD/MM/YYYY, MM/DD/YYYY, DD-MM-YYYY, YYYY-MM-DD)', () => {
    const csvMixedDates = `Date,Description,Withdrawal,Deposit
05/08/2026,OFFICE RENT,25000.00,
2026-08-06,CLIENT PAYMENT,,40000.00
07-08-2026,UTILITY BILL,1500.00,`;

    const parsed = CsvXlsxParser.parse(csvMixedDates);
    expect(parsed.transactions.length).toBe(3);
    expect(parsed.transactions[0].transactionDate).toBe('2026-08-05');
    expect(parsed.transactions[1].transactionDate).toBe('2026-08-06');
    expect(parsed.transactions[2].transactionDate).toBe('2026-08-07');
  });

  it('3. Cleanses currency symbols, spaces, and commas from numeric amount fields', () => {
    const csvFormattedAmounts = `Date,Description,Debit,Credit,Balance
2026-08-01,SUBSCRIPTION,"$ 1,250.50",,"₹ 48,749.50"
2026-08-02,INVOICE RECEIPT,,"₹ 1,50,000.00","₹ 1,98,749.50"`;

    const parsed = CsvXlsxParser.parse(csvFormattedAmounts);
    expect(parsed.transactions.length).toBe(2);
    expect(parsed.transactions[0].amount).toBe(1250.5);
    expect(parsed.transactions[0].direction).toBe('DEBIT');
    expect(parsed.transactions[1].amount).toBe(150000);
    expect(parsed.transactions[1].direction).toBe('CREDIT');
  });

  it('4. Handles single-column signed amounts (+ for credit, - for debit)', () => {
    const csvSignedAmounts = `Date,Narration,Amount,Balance
2026-08-01,Client Wire Transfer,+50000.00,150000.00
2026-08-02,Vendor Software Payout,-12000.00,138000.00`;

    const parsed = CsvXlsxParser.parse(csvSignedAmounts);
    expect(parsed.transactions.length).toBe(2);
    expect(parsed.transactions[0].direction).toBe('CREDIT');
    expect(parsed.transactions[0].amount).toBe(50000);
    expect(parsed.transactions[1].direction).toBe('DEBIT');
    expect(parsed.transactions[1].amount).toBe(12000);
  });

  it('5. Handles quoted descriptions with embedded commas and quotes', () => {
    const csvQuoted = `Date,Description,Ref No,Debit,Credit
2026-08-01,"Payment to Acme, Inc. (Invoice #101, Net 30)",REF-999,5000.00,`;

    const parsed = CsvXlsxParser.parse(csvQuoted);
    expect(parsed.transactions.length).toBe(1);
    expect(parsed.transactions[0].narration).toContain('Acme, Inc.');
    expect(parsed.transactions[0].amount).toBe(5000);
  });

  it('6. Ignores empty rows, whitespace-only rows, and trailing commas gracefully', () => {
    const csvMessy = `
    Date,Description,Withdrawal,Deposit

    2026-08-01,Internet Bill,1999.00,
    
    2026-08-02,Consulting Income,,5000.00,,,
    
    `;

    const parsed = CsvXlsxParser.parse(csvMessy);
    expect(parsed.transactions.length).toBe(2);
    expect(parsed.transactions[0].amount).toBe(1999);
    expect(parsed.transactions[1].amount).toBe(5000);
  });

  it('7. IndiaReferenceExtractor extracts UPI, IMPS, NEFT, RTGS, and Cheque numbers accurately', () => {
    const neft = IndiaReferenceExtractor.extract('NEFT/N987654321012/TECH VENDOR/PAYMENT');
    expect(neft.utr).toBe('N987654321012');

    const rtgs = IndiaReferenceExtractor.extract('RTGS-R123456789012-DIRECTOR REMUNERATION');
    expect(rtgs.utr).toBe('R123456789012');

    const upi = IndiaReferenceExtractor.extract('UPI/429182736451/MERCHANT PAY/SWIGGY');
    expect(upi.upiReference).toBe('429182736451');

    const cheque = IndiaReferenceExtractor.extract('CHQ CLG / 004521 / OFFICE ADVANCE');
    expect(cheque.chequeNumber).toBe('004521');
  });

  it('8. OFX Parser handles negative TRNAMT and unescaped XML entities', () => {
    const ofx = `OFXHEADER:100
<OFX>
<BANKMSGSRSV1><STMTTRNRS><STMTRS>
<BANKTRANLIST>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260810120000
<TRNAMT>-3250.75
<FITID>OFX-DEBIT-999
<NAME>AWS Cloud &amp; Compute Services
</STMTTRN>
</BANKTRANLIST>
</STMTRS></STMTTRNRS></BANKMSGSRSV1>
</OFX>`;

    const parsed = OfxParser.parse(ofx);
    expect(parsed.transactions.length).toBe(1);
    expect(parsed.transactions[0].amount).toBe(3250.75);
    expect(parsed.transactions[0].direction).toBe('DEBIT');
    expect(parsed.transactions[0].narration).toContain('AWS Cloud');
  });

  it('9. Deterministic fingerprint generation prevents transaction collision and duplicate imports', () => {
    const content = `Date,Description,Ref No,Withdrawal,Deposit
2026-08-01,SERVER HOSTING,INV-101,500.00,`;

    const res1 = BankStatementParserFactory.parseStatement(content, 'acc-1', 'CSV');
    const res2 = BankStatementParserFactory.parseStatement(content, 'acc-1', 'CSV');
    const resDifferentAcc = BankStatementParserFactory.parseStatement(content, 'acc-2', 'CSV');

    expect(res1.transactions[0].fingerprint).toBe(res2.transactions[0].fingerprint);
    expect(res1.transactions[0].fingerprint).not.toBe(resDifferentAcc.transactions[0].fingerprint);
  });
});
