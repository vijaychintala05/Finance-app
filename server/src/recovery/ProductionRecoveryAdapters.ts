import crypto from 'node:crypto';
import type { DbQueryClient } from '../database/db';
import { newId } from '../utils/ids';
import { RecoveryError } from './errors';
import { POINT1_RECOVERY_SCHEMA } from './schema';
import type {
  OwnerAuthorizer,
  RecoveryJob,
  RecoveryKeyring,
  RecoveryPayload,
  RecoveryPromoter,
  RecoveryReconciler,
  RecoveryStager,
} from './types';

export function recoveryKeyringFromEnvironment(): RecoveryKeyring {
  const activeKeyId = process.env.RECOVERY_ACTIVE_KEY_ID || (process.env.NODE_ENV === 'production' ? '' : 'development-v1');
  const encryption = process.env.RECOVERY_ENCRYPTION_KEY_BASE64;
  const hmac = process.env.RECOVERY_HMAC_KEY_BASE64;
  if (!activeKeyId || (process.env.NODE_ENV === 'production' && (!encryption || !hmac))) {
    throw new RecoveryError('RECOVERY_CONFIGURATION_INVALID', 'Recovery encryption keys are not configured', 503);
  }
  const developmentSeed = (label: string) => crypto.createHash('sha256').update(`firmbooks-local-${label}`).digest();
  const encryptionKey = encryption ? Buffer.from(encryption, 'base64') : developmentSeed('encryption');
  const hmacKey = hmac ? Buffer.from(hmac, 'base64') : developmentSeed('hmac');
  if (encryptionKey.length !== 32 || hmacKey.length !== 32 || encryptionKey.equals(hmacKey)) {
    throw new RecoveryError('RECOVERY_CONFIGURATION_INVALID', 'Recovery keys must be different 32-byte Base64 values', 503);
  }
  return { activeKeyId, encryptionKeys: { [activeKeyId]: encryptionKey }, hmacKeys: { [activeKeyId]: hmacKey } };
}

export function isRecoveryConfigured(): boolean {
  if (process.env.NODE_ENV !== 'production') return true;
  try { recoveryKeyringFromEnvironment(); return true; } catch { return false; }
}

export class SqlRecoveryStager implements RecoveryStager {
  public async stage({ job, payload, client }: { job: RecoveryJob; payload: RecoveryPayload; client: DbQueryClient }): Promise<void> {
    for (const table of POINT1_RECOVERY_SCHEMA) {
      for (const row of payload.tables[table.name]) {
        const rowKey = String(row.id || row.organization_id || row.key || newId('row'));
        await client.query(
          `INSERT INTO recovery_staging_rows
            (id, restore_job_id, organization_id, table_name, row_key, row_data)
           VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
          [newId('rcv-row'), job.id, job.stagingOrganizationId, table.name, rowKey, JSON.stringify(row)]
        );
      }
    }
  }
}

export class RecoveryRowCountReconciler implements RecoveryReconciler {
  public readonly name = 'row-count-and-schema';

  public async reconcile({ job, payload, client }: { job: RecoveryJob; payload: RecoveryPayload; client: DbQueryClient }) {
    const result = await client.query(
      `SELECT table_name, COUNT(*) AS row_count FROM recovery_staging_rows
        WHERE restore_job_id = $1 GROUP BY table_name`,
      [job.id]
    );
    const actual = new Map(result.rows.map((row) => [row.table_name, Number(row.row_count)]));
    const mismatches = POINT1_RECOVERY_SCHEMA
      .map((table) => ({ table: table.name, expected: payload.tables[table.name].length, actual: actual.get(table.name) || 0 }))
      .filter((entry) => entry.expected !== entry.actual);
    return { name: this.name, passed: mismatches.length === 0, details: { mismatches } };
  }
}

export class RecoveryAccountingReconciler implements RecoveryReconciler {
  public readonly name = 'accounting-and-relations';

  public async reconcile({ payload }: { job: RecoveryJob; payload: RecoveryPayload; client: DbQueryClient }) {
    const accountIds = new Set(payload.tables.accounts.map((row) => String(row.id)));
    const journalIds = new Set(payload.tables.journal_entries.map((row) => String(row.id)));
    const totals = new Map<string, { debit: number; credit: number }>();
    const failures: string[] = [];
    for (const line of payload.tables.journal_lines) {
      const journalId = String(line.journal_entry_id);
      if (!journalIds.has(journalId)) failures.push(`Journal line ${line.id} has no journal entry`);
      if (!accountIds.has(String(line.account_id))) failures.push(`Journal line ${line.id} has no account`);
      const total = totals.get(journalId) || { debit: 0, credit: 0 };
      total.debit += Number(line.debit || 0);
      total.credit += Number(line.credit || 0);
      totals.set(journalId, total);
    }
    for (const [journalId, total] of totals) {
      if (Math.abs(total.debit - total.credit) > 0.009) failures.push(`Journal ${journalId} is unbalanced`);
    }
    const invoiceIds = new Set(payload.tables.invoices.map((row) => String(row.id)));
    for (const row of payload.tables.invoice_items) {
      if (!invoiceIds.has(String(row.invoice_id))) failures.push(`Invoice item ${row.id} has no invoice`);
    }
    const billIds = new Set(payload.tables.bills.map((row) => String(row.id)));
    for (const row of payload.tables.payment_made_allocations) {
      if (!billIds.has(String(row.bill_id))) failures.push(`Vendor allocation ${row.id} has no bill`);
    }
    return { name: this.name, passed: failures.length === 0, details: { failures: failures.slice(0, 100) } };
  }
}

export class SqlOwnerAuthorizer implements OwnerAuthorizer {
  public async assertOwner(organizationId: string, userId: string, client: DbQueryClient): Promise<void> {
    const result = await client.query(
      `SELECT 1 FROM organization_members
        WHERE organization_id = $1 AND user_id = $2 AND role IN ('Owner', 'Super Admin')
          AND COALESCE(status, 'Active') = 'Active' FOR UPDATE`,
      [organizationId, userId]
    );
    if (result.rows.length !== 1) throw new RecoveryError('RECOVERY_OWNER_REQUIRED', 'Only an active organization owner can promote a recovery', 403);
  }
}

export class SqlRecoveryPromoter implements RecoveryPromoter {
  public async promote({ job, payload, actorUserId, client }: { job: RecoveryJob; payload: RecoveryPayload; actorUserId: string; client: DbQueryClient }): Promise<void> {
    const existingArtifact = await client.query(
      `SELECT id FROM recovery_artifacts WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
      [job.artifactId, job.targetOrganizationId]
    );
    if (existingArtifact.rows.length !== 1) throw new RecoveryError('RECOVERY_ARTIFACT_NOT_FOUND', 'Recovery artifact changed before promotion', 409);

    for (const table of [...POINT1_RECOVERY_SCHEMA].reverse()) {
      await client.query(table.deleteSql, [job.targetOrganizationId]);
    }
    for (const table of POINT1_RECOVERY_SCHEMA) {
      for (const stagedRow of payload.tables[table.name]) {
        const row = table.tenantColumn
          ? { ...stagedRow, [table.tenantColumn]: job.targetOrganizationId }
          : stagedRow;
        const placeholders = table.columns.map((_, index) => `$${index + 1}`).join(', ');
        await client.query(
          `INSERT INTO ${table.name} (${table.columns.join(', ')}) VALUES (${placeholders})`,
          table.columns.map((column) => row[column])
        );
      }
    }
    await client.query(
      `INSERT INTO audit_logs (id, organization_id, user_id, action, entity_type, entity_id, before_state, after_state)
       VALUES ($1, $2, $3, 'RECOVERY_PROMOTED', 'RecoveryJob', $4, $5::jsonb, $6::jsonb)`,
      [newId('aud'), job.targetOrganizationId, actorUserId, job.id,
        JSON.stringify({ artifactId: job.artifactId }), JSON.stringify({ tableCount: POINT1_RECOVERY_SCHEMA.length })]
    );
  }
}
