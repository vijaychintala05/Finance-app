import { db } from '../database/db';
import { ReconciliationVerifier } from '../banking/ReconciliationVerifier';

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

    const totalDebit = Math.round(Number(res.rows[0]?.total_debit || 0) * 100) / 100;
    const totalCredit = Math.round(Number(res.rows[0]?.total_credit || 0) * 100) / 100;
    const diff = Math.abs(Math.round((totalDebit - totalCredit) * 100) / 100);

    // Check individual unbalanced entries
    const unbalRes = await db.query<any>(
      `SELECT je.id, SUM(jl.debit) as deb, SUM(jl.credit) as cred
       FROM journal_entries je
       JOIN journal_lines jl ON je.id = jl.journal_entry_id
       WHERE je.organization_id = $1 AND UPPER(je.status) = 'POSTED'
       GROUP BY je.id`,
      [organizationId]
    );

    const unbalancedEntries = unbalRes.rows.filter(
      (row) => Math.abs(Number(row.deb || 0) - Number(row.cred || 0)) > 0.009
    );

    const isBalanced = diff === 0 && unbalancedEntries.length === 0;

    return {
      name: 'Journal Integrity',
      isBalanced,
      expectedAmount: totalDebit.toFixed(2),
      actualAmount: totalCredit.toFixed(2),
      difference: diff.toFixed(2),
      checkedAt: now,
      details: {
        totalDebit,
        totalCredit,
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

    const totalDebit = Math.round(Number(res.rows[0]?.total_debit || 0) * 100) / 100;
    const totalCredit = Math.round(Number(res.rows[0]?.total_credit || 0) * 100) / 100;
    const diff = Math.abs(Math.round((totalDebit - totalCredit) * 100) / 100);

    return {
      name: 'Trial Balance Integrity',
      isBalanced: diff === 0,
      expectedAmount: totalDebit.toFixed(2),
      actualAmount: totalCredit.toFixed(2),
      difference: diff.toFixed(2),
      checkedAt: now,
      details: { totalDebit, totalCredit },
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
    const openInvoicesBal = Math.round(Number(invRes.rows[0]?.open_invoices_balance || 0) * 100) / 100;

    // 2. Open credit notes
    const cnRes = await db.query<any>(
      `SELECT COALESCE(SUM(remaining_credit), 0) as open_credits
       FROM credit_notes
       WHERE organization_id = $1 AND UPPER(status) NOT IN ('VOID', 'VOIDED', 'DRAFT')`,
      [organizationId]
    );
    const openCredits = Math.round(Number(cnRes.rows[0]?.open_credits || 0) * 100) / 100;

    // 3. Open customer advances
    const advRes = await db.query<any>(
      `SELECT COALESCE(SUM(unapplied_amount), 0) as open_advances
       FROM customer_advances
       WHERE organization_id = $1 AND UPPER(status) NOT IN ('VOID', 'VOIDED')`,
      [organizationId]
    );
    const openAdvances = Math.round(Number(advRes.rows[0]?.open_advances || 0) * 100) / 100;

    const subledgerTotal = Math.round((openInvoicesBal - openCredits - openAdvances) * 100) / 100;

    // 4. AR Control Account GL balance
    const glRes = await db.query<any>(
      `SELECT COALESCE(SUM(jl.debit - jl.credit), 0) as ar_gl_balance
       FROM journal_lines jl
       JOIN journal_entries je ON jl.journal_entry_id = je.id
       WHERE je.organization_id = $1
         AND (jl.account_id IN ('acc-1100', 'acc-ar-control') OR jl.account_code = '1100' OR jl.account_name ILIKE '%Accounts Receivable%')
         AND UPPER(je.status) = 'POSTED'`,
      [organizationId]
    );
    const glBalance = Math.round(Number(glRes.rows[0]?.ar_gl_balance || 0) * 100) / 100;

    const diff = Math.abs(Math.round((subledgerTotal - glBalance) * 100) / 100);

    return {
      name: 'Accounts Receivable Control',
      isBalanced: diff === 0,
      expectedAmount: subledgerTotal.toFixed(2),
      actualAmount: glBalance.toFixed(2),
      difference: diff.toFixed(2),
      checkedAt: now,
      details: {
        openInvoicesBal,
        openCredits,
        openAdvances,
        customerSubledgerTotal: subledgerTotal,
        arControlGLBalance: glBalance,
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
    const openBillsBal = Math.round(Number(billRes.rows[0]?.open_bills_balance || 0) * 100) / 100;

    // 2. Open vendor credits / debit notes
    const vcRes = await db.query<any>(
      `SELECT COALESCE(SUM(remaining_credit), 0) as open_credits
       FROM vendor_credits
       WHERE organization_id = $1 AND UPPER(status) NOT IN ('VOID', 'VOIDED', 'DRAFT')`,
      [organizationId]
    );
    const openVendorCredits = Math.round(Number(vcRes.rows[0]?.open_credits || 0) * 100) / 100;

    // 3. Open vendor advances
    const advRes = await db.query<any>(
      `SELECT COALESCE(SUM(unapplied_amount), 0) as open_advances
       FROM vendor_advances
       WHERE organization_id = $1 AND UPPER(status) NOT IN ('VOID', 'VOIDED')`,
      [organizationId]
    );
    const openVendorAdvances = Math.round(Number(advRes.rows[0]?.open_advances || 0) * 100) / 100;

    const subledgerTotal = Math.round((openBillsBal - openVendorCredits - openVendorAdvances) * 100) / 100;

    // 4. AP Control Account GL balance (Credit balance)
    const glRes = await db.query<any>(
      `SELECT COALESCE(SUM(jl.credit - jl.debit), 0) as ap_gl_balance
       FROM journal_lines jl
       JOIN journal_entries je ON jl.journal_entry_id = je.id
       WHERE je.organization_id = $1
         AND (jl.account_id IN ('acc-2000', 'acc-ap-control') OR jl.account_code = '2000' OR jl.account_name ILIKE '%Accounts Payable%')
         AND UPPER(je.status) = 'POSTED'`,
      [organizationId]
    );
    const glBalance = Math.round(Number(glRes.rows[0]?.ap_gl_balance || 0) * 100) / 100;

    const diff = Math.abs(Math.round((subledgerTotal - glBalance) * 100) / 100);

    return {
      name: 'Accounts Payable Control',
      isBalanced: diff === 0,
      expectedAmount: subledgerTotal.toFixed(2),
      actualAmount: glBalance.toFixed(2),
      difference: diff.toFixed(2),
      checkedAt: now,
      details: {
        openBillsBal,
        openVendorCredits,
        openVendorAdvances,
        vendorSubledgerTotal: subledgerTotal,
        apControlGLBalance: glBalance,
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
    const invOutputGst = Math.round(Number(invRes.rows[0]?.total || 0) * 100) / 100;

    // Bill Input GST
    const billRes = await db.query<any>(
      `SELECT COALESCE(SUM(tax_total), 0) as total
       FROM bills
       WHERE organization_id = $1 AND UPPER(status) NOT IN ('VOID', 'VOIDED', 'DRAFT')`,
      [organizationId]
    );
    const billInputGst = Math.round(Number(billRes.rows[0]?.total || 0) * 100) / 100;

    // GL Output GST balance
    const glOutputRes = await db.query<any>(
      `SELECT COALESCE(SUM(jl.credit - jl.debit), 0) as balance
       FROM journal_lines jl
       JOIN journal_entries je ON jl.journal_entry_id = je.id
       WHERE je.organization_id = $1
         AND (jl.account_code IN ('2100','2101','2102') OR jl.account_id IN ('acc-2100','acc-2101','acc-2102') OR jl.account_name ILIKE '%Output GST%' OR jl.account_name ILIKE '%CGST%' OR jl.account_name ILIKE '%SGST%' OR jl.account_name ILIKE '%IGST%')
         AND UPPER(je.status) = 'POSTED'`,
      [organizationId]
    );
    const glOutput = Math.round(Number(glOutputRes.rows[0]?.balance || 0) * 100) / 100;

    const diff = Math.abs(Math.round((invOutputGst - glOutput) * 100) / 100);

    return {
      name: 'GST Control Account Integrity',
      isBalanced: diff === 0,
      expectedAmount: invOutputGst.toFixed(2),
      actualAmount: glOutput.toFixed(2),
      difference: diff.toFixed(2),
      checkedAt: now,
      details: {
        invoiceOutputGST: invOutputGst,
        billInputGST: billInputGst,
        glOutputGST: glOutput,
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
