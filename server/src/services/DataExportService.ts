import { db } from '../database/db';
import { AuditTrailService } from '../security/AuditTrailService';

export interface DataExportBundle {
  exportDate: string;
  organizationId: string;
  chartOfAccounts: any[];
  customers: any[];
  vendors: any[];
  invoices: any[];
  bills: any[];
  paymentsReceived: any[];
  paymentsMade: any[];
  journalEntries: any[];
  bankAccounts: any[];
  taxSettings: any[];
  auditLogs: any[];
}

export class DataExportService {
  public static async exportOrganizationBundle(organizationId: string, requestedBy: string): Promise<DataExportBundle> {
    const now = new Date().toISOString();

    const [
      accountsRes,
      customersRes,
      vendorsRes,
      invoicesRes,
      billsRes,
      paymentsRecRes,
      paymentsMadeRes,
      journalsRes,
      bankAccountsRes,
    ] = await Promise.all([
      db.query('SELECT * FROM accounts WHERE organization_id = $1', [organizationId]),
      db.query('SELECT * FROM customers WHERE organization_id = $1', [organizationId]),
      db.query('SELECT * FROM vendors WHERE organization_id = $1', [organizationId]),
      db.query('SELECT * FROM invoices WHERE organization_id = $1', [organizationId]),
      db.query('SELECT * FROM bills WHERE organization_id = $1', [organizationId]),
      db.query('SELECT * FROM payments_received WHERE organization_id = $1', [organizationId]),
      db.query('SELECT * FROM payments_made WHERE organization_id = $1', [organizationId]),
      db.query('SELECT * FROM journal_entries WHERE organization_id = $1', [organizationId]),
      db.query('SELECT * FROM bank_accounts WHERE organization_id = $1', [organizationId]),
    ]);

    const auditLogs = await AuditTrailService.getAuditLogs(organizationId, { limit: 200 });

    const bundle: DataExportBundle = {
      exportDate: now,
      organizationId,
      chartOfAccounts: accountsRes.rows,
      customers: customersRes.rows,
      vendors: vendorsRes.rows,
      invoices: invoicesRes.rows,
      bills: billsRes.rows,
      paymentsReceived: paymentsRecRes.rows,
      paymentsMade: paymentsMadeRes.rows,
      journalEntries: journalsRes.rows,
      bankAccounts: bankAccountsRes.rows,
      taxSettings: [
        { gstin: '27AAAAA0000A1Z5', defaultTaxRate: 18, state: 'Maharashtra' }
      ],
      auditLogs,
    };

    await AuditTrailService.logAction({
      organizationId,
      userId: requestedBy,
      action: 'ORGANIZATION_DATA_EXPORTED',
      entityType: 'ORGANIZATION',
      entityId: organizationId,
      afterState: { exportDate: now },
    });

    return bundle;
  }
}
