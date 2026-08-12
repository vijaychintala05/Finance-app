import crypto from 'crypto';
import { db } from './db';
import { AuditTrailService } from '../security/AuditTrailService';
import { newId } from '../utils/ids';

export interface BackupMetadata {
  id: string;
  organizationId: string;
  createdBy: string;
  createdAt: string;
  schemaVersion: string;
  recordCount: number;
  checksum: string;
}

export interface BackupPayload {
  metadata: BackupMetadata;
  data: Record<string, any[]>;
}

export class BackupRestoreService {
  private static TENANT_TABLES = [
    'accounts',
    'bank_accounts',
    'bank_statement_imports',
    'bank_statement_transactions',
    'bank_reconciliation_matches',
    'bank_reconciliation_rules',
    'bank_reconciliation_sessions',
    'clients',
    'vendors',
    'customers',
    'salespersons',
    'projects',
    'time_entries',
    'estimates',
    'estimate_revisions',
    'sales_orders',
    'invoices',
    'invoice_items',
    'payments_received',
    'payment_received_allocations',
    'customer_advances',
    'customer_refunds',
    'ar_write_offs',
    'credit_notes',
    'credit_note_applications',
    'purchase_orders',
    'goods_service_receipts',
    'bills',
    'payments_made',
    'payment_made_allocations',
    'vendor_advances',
    'vendor_credits',
    'debit_note_applications',
    'ap_write_offs',
    'expenses',
    'journal_entries',
    'journal_lines',
    'period_locks',
    'period_close_checklists',
    'items',
    'quotation_revisions',
    'quotation_templates',
    'document_sequences',
    'audit_logs',
    'approval_rules',
    'approval_requests',
  ];

  public static async createBackup(organizationId: string, createdBy: string): Promise<BackupPayload> {
    const backupData: Record<string, any[]> = {};
    let totalRecords = 0;

    for (const table of this.TENANT_TABLES) {
      try {
        let query = `SELECT * FROM ${table} WHERE organization_id = $1`;
        if (table === 'journal_lines') {
          query = `SELECT jl.* FROM journal_lines jl JOIN journal_entries je ON jl.journal_entry_id = je.id WHERE je.organization_id = $1`;
        } else if (table === 'invoice_items') {
          query = `SELECT ii.* FROM invoice_items ii JOIN invoices i ON ii.invoice_id = i.id WHERE i.organization_id = $1`;
        }

        const res = await db.query(query, [organizationId]);
        backupData[table] = res.rows || [];
        totalRecords += res.rows.length;
      } catch (err) {
        // Table may not exist yet or no records
        backupData[table] = [];
      }
    }

    const backupId = newId('bkp');
    const now = new Date().toISOString();
    const serializedData = JSON.stringify(backupData);
    const checksum = crypto.createHash('sha256').update(serializedData).digest('hex');

    const metadata: BackupMetadata = {
      id: backupId,
      organizationId,
      createdBy,
      createdAt: now,
      schemaVersion: '1.0.0',
      recordCount: totalRecords,
      checksum,
    };

    // Store in backups table
    await db.query(
      `INSERT INTO backups (id, organization_id, created_by, created_at, schema_version, record_count, checksum, data)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [backupId, organizationId, createdBy, now, '1.0.0', totalRecords, checksum, serializedData]
    );

    await AuditTrailService.logAction({
      organizationId,
      userId: createdBy,
      action: 'ORGANIZATION_BACKUP_CREATED',
      entityType: 'BACKUP',
      entityId: backupId,
      afterState: { recordCount: totalRecords, checksum },
    });

    return { metadata, data: backupData };
  }

  public static async exportTenantData(organizationId: string, createdBy: string = 'System'): Promise<{ tables: Record<string, any[]>; metadata: BackupMetadata }> {
    const backup = await this.createBackup(organizationId, createdBy);
    return { tables: backup.data, metadata: backup.metadata };
  }

  public static verifyBackup(payload: BackupPayload): { isValid: boolean; recordCount: number; error?: string } {
    if (!payload || !payload.metadata || !payload.data) {
      return { isValid: false, recordCount: 0, error: 'Invalid backup format' };
    }

    const serializedData = JSON.stringify(payload.data);
    const computedChecksum = crypto.createHash('sha256').update(serializedData).digest('hex');

    if (computedChecksum !== payload.metadata.checksum) {
      return {
        isValid: false,
        recordCount: 0,
        error: `Checksum mismatch. Expected: ${payload.metadata.checksum}, Computed: ${computedChecksum}`,
      };
    }

    let count = 0;
    Object.values(payload.data).forEach((rows) => {
      if (Array.isArray(rows)) count += rows.length;
    });

    return { isValid: true, recordCount: count };
  }

  public static async restoreBackup(
    organizationId: string,
    payload: BackupPayload,
    restoredBy: string
  ): Promise<{ success: boolean; restoredRecords: number }> {
    const verification = this.verifyBackup(payload);
    if (!verification.isValid) {
      throw new Error(`Backup verification failed: ${verification.error}`);
    }

    if (payload.metadata.organizationId !== organizationId) {
      throw new Error(`Tenant mismatch: Backup is for org [${payload.metadata.organizationId}], cannot restore into [${organizationId}]`);
    }

    await db.transaction(async (tx) => {
      // 1. Clear existing organization records in safe order
      for (const table of [...this.TENANT_TABLES].reverse()) {
        try {
          if (table === 'journal_lines') {
            await tx.query(
              `DELETE FROM journal_lines WHERE journal_entry_id IN (SELECT id FROM journal_entries WHERE organization_id = $1)`,
              [organizationId]
            );
          } else if (table === 'invoice_items') {
            await tx.query(
              `DELETE FROM invoice_items WHERE invoice_id IN (SELECT id FROM invoices WHERE organization_id = $1)`,
              [organizationId]
            );
          } else {
            await tx.query(`DELETE FROM ${table} WHERE organization_id = $1`, [organizationId]);
          }
        } catch (e) {
          // Ignore missing tables during cleanup
        }
      }

      // 2. Re-insert backup records
      for (const table of this.TENANT_TABLES) {
        const rows = payload.data[table] || [];
        for (const row of rows) {
          const keys = Object.keys(row);
          if (keys.length === 0) continue;
          const cols = keys.map((k) => (k === 'organizationId' ? 'organization_id' : k.replace(/([A-Z])/g, '_$1').toLowerCase())).join(', ');
          const placeholders = keys.map((_, idx) => `$${idx + 1}`).join(', ');
          const vals = keys.map((k) => row[k]);

          try {
            await tx.query(`INSERT INTO ${table} (${cols}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`, vals);
          } catch (insertErr) {
            // Ignore row conflict during restoration
          }
        }
      }
    });

    await AuditTrailService.logAction({
      organizationId,
      userId: restoredBy,
      action: 'ORGANIZATION_BACKUP_RESTORED',
      entityType: 'BACKUP',
      entityId: payload.metadata.id,
      afterState: { restoredRecords: verification.recordCount },
    });

    return { success: true, restoredRecords: verification.recordCount };
  }

  public static async listBackups(organizationId: string): Promise<BackupMetadata[]> {
    const res = await db.query(
      `SELECT id, organization_id, created_by, created_at, schema_version, record_count, checksum
       FROM backups WHERE organization_id = $1 ORDER BY created_at DESC`,
      [organizationId]
    );

    return res.rows.map((r) => ({
      id: r.id,
      organizationId: r.organization_id || r.organizationId,
      createdBy: r.created_by || r.createdBy,
      createdAt: r.created_at || r.createdAt,
      schemaVersion: r.schema_version || r.schemaVersion,
      recordCount: Number(r.record_count || r.recordCount || 0),
      checksum: r.checksum,
    }));
  }
}
