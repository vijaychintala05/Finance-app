import { db } from '../database/db';
import { ReconciliationVerifier } from '../banking/ReconciliationVerifier';
import { centsToSafeNumber, databaseMoneyToCents } from '../utils/money';

const absoluteCents = (value: bigint): bigint => value < 0n ? -value : value;
const formatCents = (value: bigint): string => {
  const sign = value < 0n ? '-' : '';
  const absolute = absoluteCents(value);
  return `${sign}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`;
};

const centsDetail = (value: bigint, field: string): number => centsToSafeNumber(value, field);

export interface IntegrityCheckResult {
  name: string;
  isBalanced: boolean;
  expectedAmount: string;
  actualAmount: string;
  difference: string;
  checkedAt: string;
  details?: Record<string, unknown>;
}

export interface OrganizationIntegrityResult {
  organizationId: string;
  isHealthy: boolean;
  checkedAt: string;
  checks: {
    journal: IntegrityCheckResult;
    trialBalance: IntegrityCheckResult;
    accountsReceivable: IntegrityCheckResult;
    accountsPayable: IntegrityCheckResult;
    banking: IntegrityCheckResult;
    gst: IntegrityCheckResult;
  };
}

export class AccountingIntegrityService {
  /**
   * Verify individual & organization-wide journal entries balance (Total Debits = Total Credits)
   */
  public static async verifyJournalIntegrity(organizationId: string): Promise<IntegrityCheckResult> {
    const now = new Date().toISOString();

    const res = await db.query<any>(
      `SELECT 
         COALESCE(SUM(jl.debit), 0) as total_debit,
         COALESCE(SUM(jl.credit), 0) as total_credit
       FROM journal_lines jl
       JOIN journal_entries je ON jl.journal_entry_id = je.id
       WHERE je.organization_id = $1 AND UPPER(je.status) = 'POSTED'`,
      [organizationId]
    );

    const totalDebitCents = databaseMoneyToCents(res.rows[0]?.total_debit, 'Journal integrity total debit');
    const totalCreditCents = databaseMoneyToCents(res.rows[0]?.total_credit, 'Journal integrity total credit');
    const differenceCents = absoluteCents(totalDebitCents - totalCreditCents);

    // Check individual unbalanced entries
    const unbalRes = await db.query<any>(
      `SELECT je.id, SUM(jl.debit) as deb, SUM(jl.credit) as cred
       FROM journal_entries je
       JOIN journal_lines jl ON je.id = jl.journal_entry_id
       WHERE je.organization_id = $1 AND UPPER(je.status) = 'POSTED'
       GROUP BY je.id`,
      [organizationId]
    );

    const unbalancedEntries = unbalRes.rows.filter((row) =>
      databaseMoneyToCents(row.deb, `Journal ${row.id} debit`) !==
      databaseMoneyToCents(row.cred, `Journal ${row.id} credit`)
    );

    const isBalanced = differenceCents === 0n && unbalancedEntries.length === 0;

    return {
      name: 'Journal Integrity',
      isBalanced,
      expectedAmount: formatCents(totalDebitCents),
      actualAmount: formatCents(totalCreditCents),
      difference: formatCents(differenceCents),
      checkedAt: now,
      details: {
        totalDebit: centsDetail(totalDebitCents, 'Journal integrity total debit'),
        totalCredit: centsDetail(totalCreditCents, 'Journal integrity total credit'),
        unbalancedEntryCount: unbalancedEntries.length,
      },
    };
  }

  /**
   * Verify Trial Balance Integrity directly from posted journal lines
   */
  public static async verifyTrialBalanceIntegrity(organizationId: string): Promise<IntegrityCheckResult> {
    const now = new Date().toISOString();

    const res = await db.query<any>(
      `SELECT 
         COALESCE(SUM(jl.debit), 0) as total_debit,
         COALESCE(SUM(jl.credit), 0) as total_credit
       FROM journal_lines jl
       JOIN journal_entries je ON jl.journal_entry_id = je.id
       WHERE je.organization_id = $1 AND UPPER(je.status) = 'POSTED'`,
      [organizationId]
    );

    const totalDebitCents = databaseMoneyToCents(res.rows[0]?.total_debit, 'Trial balance integrity total debit');
    const totalCreditCents = databaseMoneyToCents(res.rows[0]?.total_credit, 'Trial balance integrity total credit');
    const differenceCents = absoluteCents(totalDebitCents - totalCreditCents);

    return {
      name: 'Trial Balance Integrity',
      isBalanced: differenceCents === 0n,
      expectedAmount: formatCents(totalDebitCents),
      actualAmount: formatCents(totalCreditCents),
      difference: formatCents(differenceCents),
      checkedAt: now,
      details: {
        totalDebit: centsDetail(totalDebitCents, 'Trial balance integrity total debit'),
        totalCredit: centsDetail(totalCreditCents, 'Trial balance integrity total credit'),
      },
    };
  }

  /**
   * Verify AR Subledger against AR Control GL Account
   */
  public static async verifyARIntegrity(organizationId: string): Promise<IntegrityCheckResult> {
    const now = new Date().toISOString();

    // 1. Invoices balance due
    const invRes = await db.query<any>(
      `SELECT COALESCE(SUM(balance_due), 0) as open_invoices_balance
       FROM invoices
       WHERE organization_id = $1 AND UPPER(status) NOT IN ('VOID', 'VOIDED', 'DRAFT')`,
      [organizationId]
    );
    const openInvoicesCents = databaseMoneyToCents(invRes.rows[0]?.open_invoices_balance, 'AR open invoices');

    // 2. Open credit notes
    const cnRes = await db.query<any>(
      `SELECT COALESCE(SUM(remaining_credit), 0) as open_credits
       FROM credit_notes
       WHERE organization_id = $1 AND UPPER(status) NOT IN ('VOID', 'VOIDED', 'DRAFT')`,
      [organizationId]
    );
    const openCreditsCents = databaseMoneyToCents(cnRes.rows[0]?.open_credits, 'AR open credit notes');

    // 3. Open customer advances
    const advRes = await db.query<any>(
      `SELECT COALESCE(SUM(unapplied_amount), 0) as open_advances
       FROM customer_advances
       WHERE organization_id = $1 AND UPPER(status) NOT IN ('VOID', 'VOIDED')`,
      [organizationId]
    );
    const openAdvancesCents = databaseMoneyToCents(advRes.rows[0]?.open_advances, 'Customer advances liability');

    // Unapplied customer advances are a separate 2100 liability. They do not reduce
    // the 1100 receivable control until the certified application posting is made.
    const subledgerCents = openInvoicesCents - openCreditsCents;

    // 4. AR Control Account GL balance
    const glRes = await db.query<any>(
      `SELECT COALESCE(SUM(jl.debit - jl.credit), 0) as ar_gl_balance
       FROM journal_lines jl
       JOIN journal_entries je ON jl.journal_entry_id = je.id
       JOIN accounts a ON a.id = jl.account_id AND a.organization_id = je.organization_id
       WHERE je.organization_id = $1
         AND a.code = '1100'
         AND UPPER(je.status) = 'POSTED'`,
      [organizationId]
    );
    const glCents = databaseMoneyToCents(glRes.rows[0]?.ar_gl_balance, 'AR control balance');
    const differenceCents = absoluteCents(subledgerCents - glCents);

    return {
      name: 'Accounts Receivable Control',
      isBalanced: differenceCents === 0n,
      expectedAmount: formatCents(subledgerCents),
      actualAmount: formatCents(glCents),
      difference: formatCents(differenceCents),
      checkedAt: now,
      details: {
        openInvoicesBal: centsDetail(openInvoicesCents, 'AR open invoices'),
        openCredits: centsDetail(openCreditsCents, 'AR open credit notes'),
        openAdvances: centsDetail(openAdvancesCents, 'Customer advances liability'),
        customerSubledgerTotal: centsDetail(subledgerCents, 'AR subledger total'),
        arControlGLBalance: centsDetail(glCents, 'AR control balance'),
        advancesControlAccount: '2100',
      },
    };
  }

  /**
   * Verify AP Subledger against AP Control GL Account
   */
  public static async verifyAPIntegrity(organizationId: string): Promise<IntegrityCheckResult> {
    const now = new Date().toISOString();

    // 1. Unpaid bills balance due
    const billRes = await db.query<any>(
      `SELECT COALESCE(SUM(balance_due), 0) as open_bills_balance
       FROM bills
       WHERE organization_id = $1 AND UPPER(status) NOT IN ('VOID', 'VOIDED', 'DRAFT')`,
      [organizationId]
    );
    const openBillsCents = databaseMoneyToCents(billRes.rows[0]?.open_bills_balance, 'AP open bills');

    // 2. Open vendor credits / debit notes
    const vcRes = await db.query<any>(
      `SELECT COALESCE(SUM(remaining_credit), 0) as open_credits
       FROM vendor_credits
       WHERE organization_id = $1 AND UPPER(status) NOT IN ('VOID', 'VOIDED', 'DRAFT')`,
      [organizationId]
    );
    const openVendorCreditsCents = databaseMoneyToCents(vcRes.rows[0]?.open_credits, 'AP open vendor credits');

    // 3. Open vendor advances
    const advRes = await db.query<any>(
      `SELECT COALESCE(SUM(unapplied_amount), 0) as open_advances
       FROM vendor_advances
       WHERE organization_id = $1 AND UPPER(status) NOT IN ('VOID', 'VOIDED')`,
      [organizationId]
    );
    const openVendorAdvancesCents = databaseMoneyToCents(advRes.rows[0]?.open_advances, 'Vendor advances asset');

    // Unapplied vendor advances are a separate asset. They do not reduce the 2000
    // payable control until an application posting is made.
    const subledgerCents = openBillsCents - openVendorCreditsCents;

    // 4. AP Control Account GL balance (Credit balance)
    const glRes = await db.query<any>(
      `SELECT COALESCE(SUM(jl.credit - jl.debit), 0) as ap_gl_balance
       FROM journal_lines jl
       JOIN journal_entries je ON jl.journal_entry_id = je.id
       JOIN accounts a ON a.id = jl.account_id AND a.organization_id = je.organization_id
       WHERE je.organization_id = $1
         AND a.code = '2000'
         AND UPPER(je.status) = 'POSTED'`,
      [organizationId]
    );
    const glCents = databaseMoneyToCents(glRes.rows[0]?.ap_gl_balance, 'AP control balance');
    const differenceCents = absoluteCents(subledgerCents - glCents);

    return {
      name: 'Accounts Payable Control',
      isBalanced: differenceCents === 0n,
      expectedAmount: formatCents(subledgerCents),
      actualAmount: formatCents(glCents),
      difference: formatCents(differenceCents),
      checkedAt: now,
      details: {
        openBillsBal: centsDetail(openBillsCents, 'AP open bills'),
        openVendorCredits: centsDetail(openVendorCreditsCents, 'AP open vendor credits'),
        openVendorAdvances: centsDetail(openVendorAdvancesCents, 'Vendor advances asset'),
        vendorSubledgerTotal: centsDetail(subledgerCents, 'AP subledger total'),
        apControlGLBalance: centsDetail(glCents, 'AP control balance'),
      },
    };
  }

  /**
   * Verify Banking Integrity
   */
  public static async verifyBankIntegrity(organizationId: string): Promise<IntegrityCheckResult> {
    const now = new Date().toISOString();
    const verif = await ReconciliationVerifier.verifyAll(organizationId);

    const isBalanced = verif.isValid;

    return {
      name: 'Banking Integrity',
      isBalanced,
      expectedAmount: '0.00',
      actualAmount: String(verif.summary.anomalyCount),
      difference: '0.00',
      checkedAt: now,
      details: {
        totalTransactions: verif.summary.totalTransactions,
        totalMatches: verif.summary.totalMatches,
        totalSessions: verif.summary.totalSessions,
        anomalies: verif.anomalies,
      },
    };
  }

  /**
   * Verify GST Control Account Integrity against document tax subledgers
   */
  public static async verifyGSTIntegrity(organizationId: string): Promise<IntegrityCheckResult> {
    const now = new Date().toISOString();

    // Invoice Output GST
    const invRes = await db.query<any>(
      `SELECT COALESCE(SUM(tax_total), 0) as total
       FROM invoices
       WHERE organization_id = $1 AND UPPER(status) NOT IN ('VOID', 'VOIDED', 'DRAFT')`,
      [organizationId]
    );
    const invoiceOutputCents = databaseMoneyToCents(invRes.rows[0]?.total, 'Invoice output tax');

    // Bill Input GST
    const billRes = await db.query<any>(
      `SELECT COALESCE(SUM(tax_total), 0) as total
       FROM bills
       WHERE organization_id = $1 AND UPPER(status) NOT IN ('VOID', 'VOIDED', 'DRAFT')`,
      [organizationId]
    );
    const billInputCents = databaseMoneyToCents(billRes.rows[0]?.total, 'Bill input tax');

    // GL Output GST balance
    const glOutputRes = await db.query<any>(
      `SELECT COALESCE(SUM(jl.credit - jl.debit), 0) as balance
       FROM journal_lines jl
       JOIN journal_entries je ON jl.journal_entry_id = je.id
       JOIN accounts a ON a.id = jl.account_id AND a.organization_id = je.organization_id
       WHERE je.organization_id = $1
         AND a.code = '2200'
         AND UPPER(je.status) = 'POSTED'`,
      [organizationId]
    );
    const glOutputCents = databaseMoneyToCents(glOutputRes.rows[0]?.balance, 'Output tax control balance');

    // GL Input Tax balance
    const glInputRes = await db.query<any>(
      `SELECT COALESCE(SUM(jl.debit - jl.credit), 0) as balance
       FROM journal_lines jl
       JOIN journal_entries je ON jl.journal_entry_id = je.id
       JOIN accounts a ON a.id = jl.account_id AND a.organization_id = je.organization_id
       WHERE je.organization_id = $1
         AND a.code = '1200'
         AND UPPER(je.status) = 'POSTED'`,
      [organizationId]
    );
    const glInputCents = databaseMoneyToCents(glInputRes.rows[0]?.balance, 'Input tax control balance');
    const outputDifferenceCents = absoluteCents(invoiceOutputCents - glOutputCents);
    const inputDifferenceCents = absoluteCents(billInputCents - glInputCents);
    const totalExpectedCents = invoiceOutputCents + billInputCents;
    const totalActualCents = glOutputCents + glInputCents;
    const totalDifferenceCents = outputDifferenceCents + inputDifferenceCents;

    return {
      name: 'GST Control Account Integrity',
      isBalanced: outputDifferenceCents === 0n && inputDifferenceCents === 0n,
      expectedAmount: formatCents(totalExpectedCents),
      actualAmount: formatCents(totalActualCents),
      difference: formatCents(totalDifferenceCents),
      checkedAt: now,
      details: {
        invoiceOutputTax: centsDetail(invoiceOutputCents, 'Invoice output tax'),
        billInputTax: centsDetail(billInputCents, 'Bill input tax'),
        glOutputTax: centsDetail(glOutputCents, 'Output tax control balance'),
        glInputTax: centsDetail(glInputCents, 'Input tax control balance'),
        outputDifference: centsDetail(outputDifferenceCents, 'Output tax difference'),
        inputDifference: centsDetail(inputDifferenceCents, 'Input tax difference'),
        outputControlAccount: '2200',
        inputControlAccount: '1200',
      },
    };
  }

  /**
   * Run full organization integrity validation suite
   */
  public static async verifyOrganizationIntegrity(organizationId: string): Promise<OrganizationIntegrityResult> {
    const now = new Date().toISOString();

    const [journal, trialBalance, accountsReceivable, accountsPayable, banking, gst] = await Promise.all([
      this.verifyJournalIntegrity(organizationId),
      this.verifyTrialBalanceIntegrity(organizationId),
      this.verifyARIntegrity(organizationId),
      this.verifyAPIntegrity(organizationId),
      this.verifyBankIntegrity(organizationId),
      this.verifyGSTIntegrity(organizationId),
    ]);

    const isHealthy =
      journal.isBalanced &&
      trialBalance.isBalanced &&
      accountsReceivable.isBalanced &&
      accountsPayable.isBalanced &&
      banking.isBalanced &&
      gst.isBalanced;

    return {
      organizationId,
      isHealthy,
      checkedAt: now,
      checks: {
        journal,
        trialBalance,
        accountsReceivable,
        accountsPayable,
        banking,
        gst,
      },
    };
  }
}
