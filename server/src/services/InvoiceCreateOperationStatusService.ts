import { db } from '../database/db';
import { RbacService } from '../auth/RbacService';

const KEY_PATTERN = /^[A-Za-z0-9._:-]{16,128}$/;
const HASH_PATTERN = /^[a-f0-9]{64}$/i;

export type InvoiceCreateOperationStatus =
  | { state: 'UNKNOWN' | 'PROCESSING' }
  | { state: 'REJECTED'; responseStatus: number; code: string; error: string }
  | { state: 'CONFLICT'; error: string }
  | { state: 'COMPLETED'; invoiceId: string; commandId: string; invoiceNumber: string; invoiceStatus: string; journalEntryId?: string };

function parsePermissions(value: unknown): string[] | null {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    if (!Array.isArray(parsed) || parsed.length !== 1 || parsed[0] !== 'invoices.create') return null;
    return parsed as string[];
  } catch {
    return null;
  }
}

function parseObject(value: unknown): Record<string, any> | null {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, any> : null;
  } catch {
    return null;
  }
}

export async function getInvoiceCreateOperationStatus(input: {
  organizationId: string;
  userId: string;
  role: string;
  idempotencyKey: string;
  requestHash: string;
}): Promise<InvoiceCreateOperationStatus> {
  const unknown: InvoiceCreateOperationStatus = { state: 'UNKNOWN' };
  if (!KEY_PATTERN.test(input.idempotencyKey) || !HASH_PATTERN.test(input.requestHash)) return unknown;

  const stored = await db.query(
    `SELECT state, response_status, response_body, request_hash, user_id, required_permissions, method, path, expires_at
       FROM api_idempotency_keys
      WHERE organization_id = $1 AND idempotency_key = $2 LIMIT 1`,
    [input.organizationId, input.idempotencyKey],
  );
  const record = stored.rows[0];
  if (!record || record.user_id !== input.userId || record.method !== 'POST' || record.path !== '/invoices') return unknown;
  const expiry = new Date(record.expires_at).getTime();
  if (!Number.isFinite(expiry) || expiry <= Date.now() || record.request_hash !== input.requestHash) return unknown;
  const permissions = parsePermissions(record.required_permissions);
  if (!permissions?.length || !await RbacService.hasPermissionAsync(input.organizationId, input.role, 'invoices.create', true)) return unknown;

  const response = parseObject(record.response_body);
  if (record.state === 'PROCESSING') return { state: 'PROCESSING' };
  if (record.state !== 'COMPLETED') return unknown;

  const commandResult = await db.query(
    `SELECT id, actor_user_id, command_type, status, result
       FROM financial_commands
      WHERE organization_id = $1 AND idempotency_key = $2 AND command_type = 'invoice.post'
      LIMIT 1`,
    [input.organizationId, input.idempotencyKey],
  );
  const command = commandResult.rows[0];
  const responseStatus = Number(record.response_status);
  if (!command && responseStatus >= 400 && responseStatus < 500 && response) {
    return {
      state: 'REJECTED',
      responseStatus,
      code: typeof response.code === 'string' ? response.code : 'INVOICE_CREATE_REJECTED',
      error: typeof response.error === 'string' ? response.error : 'The invoice was rejected and was not created.',
    };
  }
  if (!command) return responseStatus === 201 ? { state: 'CONFLICT', error: 'Invoice creation evidence could not be reconciled.' } : unknown;
  if (responseStatus !== 201 || command.actor_user_id !== input.userId || command.status !== 'COMPLETED') return { state: 'CONFLICT', error: 'Invoice creation evidence could not be reconciled.' };

  const commandBody = parseObject(command.result);
  if (!commandBody || !response || response.commandId !== command.id) return { state: 'CONFLICT', error: 'Invoice creation evidence could not be reconciled.' };
  const invoiceId = typeof commandBody.id === 'string' ? commandBody.id : null;
  if (!invoiceId || response.id !== invoiceId) return { state: 'CONFLICT', error: 'Invoice creation evidence could not be reconciled.' };
  const invoiceResult = await db.query(
    `SELECT id, invoice_number, status
       FROM invoices
      WHERE organization_id = $1 AND id = $2 LIMIT 1`,
    [input.organizationId, invoiceId],
  );
  const invoice = invoiceResult.rows[0];
  if (!invoice) return { state: 'CONFLICT', error: 'Invoice creation evidence could not be reconciled.' };
  const createdStatus = String(commandBody.status || '').toUpperCase();
  const invoiceStatus = String(invoice.status).trim().toUpperCase().replace(/\s+/g, '_');
  if (!['POSTED', 'SUBMITTED'].includes(createdStatus) || commandBody.invoiceNumber !== invoice.invoice_number || response.invoiceNumber !== commandBody.invoiceNumber || String(response.status).toUpperCase() !== createdStatus) return { state: 'CONFLICT', error: 'Invoice creation evidence could not be reconciled.' };
  if (!['POSTED', 'SENT', 'VIEWED', 'PARTIALLY_PAID', 'UNPAID', 'PAID', 'OVERDUE', 'VOID', 'VOIDED', 'WRITTEN_OFF', 'SUBMITTED'].includes(invoiceStatus)) return { state: 'CONFLICT', error: 'Invoice creation evidence could not be reconciled.' };
  if (createdStatus === 'POSTED') {
    const originalJournalId = typeof commandBody.journalEntryId === 'string' ? commandBody.journalEntryId : null;
    if (!originalJournalId || response.journalEntryId !== originalJournalId) return { state: 'CONFLICT', error: 'Invoice creation evidence could not be reconciled.' };
    const journalResult = await db.query(
      `SELECT id, status FROM journal_entries WHERE organization_id = $1 AND id = $2 LIMIT 1`,
      [input.organizationId, originalJournalId],
    );
    if (!journalResult.rows[0] || journalResult.rows[0].id !== originalJournalId || String(journalResult.rows[0].status).toUpperCase() !== 'POSTED') return { state: 'CONFLICT', error: 'Invoice creation evidence could not be reconciled.' };
    const evidenceLink = await db.query(
      `SELECT id FROM financial_evidence_links
        WHERE organization_id = $1 AND command_id = $2 AND source_type = 'Invoice' AND source_id = $3
          AND relation_type = 'POSTED_TO' AND target_type = 'JournalEntry' AND target_id = $4
        LIMIT 1`,
      [input.organizationId, command.id, invoiceId, originalJournalId],
    );
    if (!evidenceLink.rows.length) return { state: 'CONFLICT', error: 'Invoice creation evidence could not be reconciled.' };
  } else if (response.journalEntryId || commandBody.journalEntryId) {
    return { state: 'CONFLICT', error: 'Invoice creation evidence could not be reconciled.' };
  }

  return {
    state: 'COMPLETED',
    invoiceId: invoice.id,
    commandId: command.id,
    invoiceNumber: invoice.invoice_number,
    invoiceStatus,
    ...(createdStatus === 'POSTED' ? { journalEntryId: commandBody.journalEntryId as string } : {}),
  };
}
