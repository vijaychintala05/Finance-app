import crypto from 'crypto';
import { db } from '../database/db';
import { RbacService } from '../auth/RbacService';
import { calculateAuditEntryHash, GENESIS_HASH } from '../security/AuditTrailService';

const VOID_PERMISSIONS = ['invoices.void', 'invoices.delete'] as const;
const KEY_PATTERN = /^[A-Za-z0-9._:-]{16,128}$/;

export type InvoiceVoidOperationStatus =
  | { state: 'UNKNOWN' | 'PROCESSING' }
  | { state: 'REJECTED'; responseStatus: number; code: string; error: string }
  | { state: 'COMPLETED'; invoiceId: string; reversalJournalId: string; requestId?: string }
  | { state: 'CONFLICT'; invoiceId: string; reversalJournalId?: string; requestId?: string; error: string };

function parseJson(value: unknown): any {
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return null; }
}

function hasExactVoidPermissions(value: unknown): boolean {
  const parsed = parseJson(value);
  if (!Array.isArray(parsed) || parsed.length !== VOID_PERMISSIONS.length || parsed.some((item) => typeof item !== 'string')) return false;
  const expected = [...VOID_PERMISSIONS].sort();
  return [...parsed].sort().every((permission, index) => permission === expected[index]);
}

export async function getInvoiceVoidOperationStatus(input: {
  organizationId: string;
  userId: string;
  role: string;
  invoiceId: string;
  idempotencyKey: string;
  reason: string;
}): Promise<InvoiceVoidOperationStatus> {
  const unknown: InvoiceVoidOperationStatus = { state: 'UNKNOWN' };
  if (!input.organizationId || !input.userId || !input.invoiceId || input.reason.trim().length < 3 || !KEY_PATTERN.test(input.idempotencyKey)) return unknown;
  const requestHash = crypto.createHash('sha256').update(JSON.stringify({
    method: 'POST', path: '/api/v1/security/void-invoice', body: { invoiceId: input.invoiceId, reason: input.reason },
  })).digest('hex');

  const operationResult = await db.query(
    `SELECT request_hash, state, response_status, response_body, user_id, required_permissions, method, path, expires_at
       FROM api_idempotency_keys
      WHERE organization_id = $1 AND idempotency_key = $2
      LIMIT 1`,
    [input.organizationId, input.idempotencyKey]
  );
  const operation = operationResult.rows[0];
  if (!operation || operation.user_id !== input.userId || operation.method !== 'POST' || operation.path !== '/void-invoice' || operation.request_hash !== requestHash) return unknown;
  const expiresAt = new Date(operation.expires_at).getTime();
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now() || !hasExactVoidPermissions(operation.required_permissions)) return unknown;
  const grants = await Promise.all(VOID_PERMISSIONS.map((permission) =>
    RbacService.hasPermissionAsync(input.organizationId, input.role, permission, true)
  ));
  if (!grants.some(Boolean)) return unknown;

  if (operation.state === 'PROCESSING') return { state: 'PROCESSING' };
  if (operation.state !== 'COMPLETED') return unknown;

  const responseStatus = Number(operation.response_status);
  const body = parseJson(operation.response_body);
  if (responseStatus >= 400 && responseStatus < 500) {
    if (typeof body?.code !== 'string' || typeof body?.error !== 'string') return unknown;
    return { state: 'REJECTED', responseStatus, code: body.code, error: body.error };
  }
  if (responseStatus !== 200) return unknown;
  const result = body?.result || body;
  const requestId = typeof body?.requestId === 'string' ? body.requestId : undefined;
  if (result?.success !== true || result.invoiceId !== input.invoiceId || typeof result.journalEntryId !== 'string' || !result.journalEntryId.trim()) {
    return { state: 'CONFLICT', invoiceId: input.invoiceId, ...(requestId ? { requestId } : {}), error: 'The saved void receipt does not match this invoice.' };
  }
  const reversalJournalId = result.journalEntryId.trim();

  const evidenceResult = await db.query(
    `SELECT i.id, i.status AS invoice_status, i.journal_entry_id, i.reversal_journal_id,
            original.status AS original_status, original.reversed_by_journal_id,
            reversal.status AS reversal_status, reversal.reversal_of_journal_id
       FROM invoices i
       LEFT JOIN journal_entries original
         ON original.organization_id = i.organization_id AND original.id = i.journal_entry_id
       LEFT JOIN journal_entries reversal
         ON reversal.organization_id = i.organization_id AND reversal.id = i.reversal_journal_id
      WHERE i.organization_id = $1 AND i.id = $2`,
    [input.organizationId, input.invoiceId]
  );
  const invoice = evidenceResult.rows[0];
  if (!invoice) {
    return { state: 'CONFLICT', invoiceId: input.invoiceId, reversalJournalId, ...(requestId ? { requestId } : {}), error: 'The committed receipt has no matching invoice record.' };
  }

  const auditLogId = typeof result?.auditLogId === 'string' ? result.auditLogId.trim() : '';
  const auditResult = auditLogId ? await db.query(
    `SELECT audit.*
       FROM audit_logs audit
      WHERE audit.organization_id = $1 AND audit.user_id = $2 AND audit.action = 'INVOICE_VOIDED'
        AND audit.entity_type = 'Invoice' AND audit.entity_id = $3 AND audit.id = $4`,
    [input.organizationId, input.userId, input.invoiceId, auditLogId]
  ) : { rows: [] };
  const audit = auditResult.rows[0] as any;
  const auditAfterState = audit ? parseJson(audit.after_state ?? audit.afterState) : null;
  const auditPreviousHash = audit?.previous_hash || audit?.previousHash;
  const auditCurrentHash = audit?.current_hash || audit?.currentHash;
  const hasAuditHash = Boolean(audit && auditPreviousHash && /^[a-f0-9]{64}$/.test(auditCurrentHash || '') &&
    auditAfterState?.status === 'VOIDED' && auditAfterState.reason === input.reason.trim() &&
    auditAfterState.reversalJournalId === reversalJournalId &&
    calculateAuditEntryHash(
      auditPreviousHash, audit.id, audit.organization_id || audit.organizationId,
      audit.user_id || audit.userId, audit.action, audit.entity_type || audit.entityType,
      audit.entity_id || audit.entityId, audit.timestamp, audit.before_state ?? audit.beforeState,
      audit.after_state ?? audit.afterState, audit.metadata
    ) === auditCurrentHash);
  const predecessorResult = hasAuditHash && auditPreviousHash !== GENESIS_HASH ? await db.query(
    `SELECT * FROM audit_logs WHERE organization_id = $1 AND current_hash = $2 LIMIT 1`,
    [input.organizationId, auditPreviousHash]
  ) : { rows: [] };
  const predecessor = predecessorResult.rows[0] as any;
  const predecessorPreviousHash = predecessor?.previous_hash || predecessor?.previousHash;
  const predecessorCurrentHash = predecessor?.current_hash || predecessor?.currentHash;
  const predecessorValid = auditPreviousHash === GENESIS_HASH || Boolean(predecessor && predecessorPreviousHash &&
    predecessorCurrentHash === auditPreviousHash &&
    /^[a-f0-9]{64}$/.test(predecessorCurrentHash) &&
    calculateAuditEntryHash(
      predecessorPreviousHash, predecessor.id, predecessor.organization_id || predecessor.organizationId,
      predecessor.user_id || predecessor.userId, predecessor.action, predecessor.entity_type || predecessor.entityType,
      predecessor.entity_id || predecessor.entityId, predecessor.timestamp,
      predecessor.before_state ?? predecessor.beforeState, predecessor.after_state ?? predecessor.afterState, predecessor.metadata
    ) === predecessorCurrentHash &&
    new Date(predecessor.timestamp).getTime() < new Date(audit.timestamp).getTime());
  const hasMatchingAudit = hasAuditHash && predecessorValid;
  const evidenceMatches =
    ['VOID', 'VOIDED'].includes(String(invoice.invoice_status || '').trim().toUpperCase()) &&
    invoice.reversal_journal_id === reversalJournalId &&
    typeof invoice.journal_entry_id === 'string' &&
    String(invoice.original_status || '').trim().toUpperCase() === 'POSTED' &&
    invoice.reversed_by_journal_id === reversalJournalId &&
    String(invoice.reversal_status || '').trim().toUpperCase() === 'POSTED' &&
    invoice.reversal_of_journal_id === invoice.journal_entry_id &&
    hasMatchingAudit;

  if (!evidenceMatches) {
    return { state: 'CONFLICT', invoiceId: input.invoiceId, reversalJournalId, ...(requestId ? { requestId } : {}), error: 'Invoice, reversal journal, and audit evidence do not reconcile with the saved void receipt.' };
  }
  return { state: 'COMPLETED', invoiceId: input.invoiceId, reversalJournalId, ...(requestId ? { requestId } : {}) };
}