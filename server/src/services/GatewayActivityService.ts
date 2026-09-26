import { db } from '../database/db';

export interface GatewayActivityOptions {
  limit?: number;
  cursor?: string;
  gateway?: string;
  status?: string;
}

export function decodeGatewayActivityCursor(cursor?: string): { createdAt: string; id: string } | undefined {
  if (!cursor) return undefined;
  if (cursor.length > 256) return undefined;
  try {
    const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (typeof decoded?.createdAt !== 'string' || Number.isNaN(Date.parse(decoded.createdAt)) ||
        typeof decoded?.id !== 'string' || !decoded.id || decoded.id.length > 64) return undefined;
    return { createdAt: decoded.createdAt, id: decoded.id };
  } catch {
    return undefined;
  }
}

export function encodeGatewayActivityCursor(createdAt: Date | string, id: string): string {
  const exactTimestamp = createdAt instanceof Date ? createdAt.toISOString() : createdAt;
  return Buffer.from(JSON.stringify({ createdAt: exactTimestamp, id })).toString('base64url');
}

function evidenceStatus(status: string, eventType: string, journalId: string | null, journalStatus: string | null, reversalJournalId: string | null, reversalJournalStatus: string | null): string {
  const normalizedStatus = String(status || '').toUpperCase();
  if (normalizedStatus !== 'PROCESSED' && normalizedStatus !== 'REVERSED') return normalizedStatus || 'UNKNOWN';
  if (normalizedStatus === 'REVERSED') {
    return journalId && journalStatus?.trim().toUpperCase() === 'POSTED' && reversalJournalId && reversalJournalStatus?.trim().toUpperCase() === 'POSTED'
      ? 'REVERSED' : 'REVERSAL_EVIDENCE_MISSING';
  }
  if (/cancel|expir/i.test(eventType)) return 'INTENT_CLOSED_NO_JOURNAL';
  if (!journalId || !journalStatus || journalStatus.trim().toUpperCase() !== 'POSTED') {
    return 'POSTING_EVIDENCE_MISSING';
  }
  return 'POSTED_TO_LEDGER';
}

function validCurrency(value: unknown): string | null {
  const currency = String(value || '').toUpperCase();
  return /^[A-Z]{3}$/.test(currency) ? currency : null;
}

export class GatewayActivityService {
  public static async list(orgId: string, options: GatewayActivityOptions = {}) {
    const limit = Math.max(1, Math.min(100, Math.trunc(options.limit || 50)));
    const cursor = decodeGatewayActivityCursor(options.cursor);
    if (options.cursor && !cursor) throw new Error('Invalid gateway activity cursor');
    const gateway = options.gateway?.trim().slice(0, 32) || null;
    const status = options.status?.trim().toUpperCase().slice(0, 30) || null;
    const cursorTimestampProjection = db.isMemoryMode() ? 'e.created_at AS cursor_created_at' : 'e.created_at::text AS cursor_created_at';
    const cursorPredicate = cursor ? 'AND (e.created_at < $4::timestamptz OR (e.created_at = $4::timestamptz AND e.id < $5))' : '';
    const limitParameter = cursor ? '$6' : '$4';
    const parameters = cursor
      ? [orgId, gateway, status, cursor.createdAt, cursor.id, limit + 1]
      : [orgId, gateway, status, limit + 1];
    const result = await db.query(
      `SELECT e.id, e.gateway, e.event_type, e.status, e.created_at, ${cursorTimestampProjection}, e.processed_at,
              e.settlement_reference, e.payment_id, e.invoice_id, e.expense_id,
              e.journal_entry_id, e.related_event_id, e.reversal_journal_id,
              e.amount, e.payload,
              p.payment_number,
              i.invoice_number,
              je.entry_number AS journal_number,
              je.status AS journal_status,
              fee_je.id AS fee_journal_id,
              fee_je.entry_number AS fee_journal_number,
              reversal_je.entry_number AS reversal_journal_number,
              reversal_je.status AS reversal_journal_status,
              payout_matches.match_count AS payout_match_count
         FROM payment_gateway_events e
         LEFT JOIN payments_received p
           ON p.organization_id = e.organization_id AND p.id = e.payment_id
         LEFT JOIN invoices i
           ON i.organization_id = e.organization_id AND i.id = e.invoice_id
         LEFT JOIN journal_entries je
           ON je.organization_id = e.organization_id AND je.id = e.journal_entry_id
         LEFT JOIN expenses fee_expense
           ON fee_expense.organization_id = e.organization_id AND fee_expense.id = e.expense_id
         LEFT JOIN journal_entries fee_je
           ON fee_je.organization_id = fee_expense.organization_id AND fee_je.id = fee_expense.journal_entry_id
         LEFT JOIN journal_entries reversal_je
           ON reversal_je.organization_id = e.organization_id AND reversal_je.id = e.reversal_journal_id
         LEFT JOIN (
           SELECT m.organization_id, m.accounting_transaction_id,
                  COUNT(*)::int AS match_count
             FROM bank_reconciliation_matches m
            WHERE m.organization_id = $1
              AND m.accounting_transaction_type = 'journal' AND m.status = 'MATCHED'
            GROUP BY m.organization_id, m.accounting_transaction_id
         ) payout_matches
           ON payout_matches.organization_id = e.organization_id
          AND payout_matches.accounting_transaction_id = e.journal_entry_id
        WHERE e.organization_id = $1
          AND ($2::text IS NULL OR LOWER(e.gateway) = LOWER($2))
          AND ($3::text IS NULL OR UPPER(e.status) = $3)
          ${cursorPredicate}
        ORDER BY e.created_at DESC, e.id DESC
        LIMIT ${limitParameter}`,
      parameters
    );

    const hasMore = result.rows.length > limit;
    const page = result.rows.slice(0, limit);
    const events = page.map((row: any) => {
      const payload = row.payload && typeof row.payload === 'object' ? row.payload : {};
      const data = payload.data?.object || payload.payload?.payment?.entity || payload.payload?.payout?.entity || payload;
      const eventType = String(row.event_type || '');
      const isPayout = /payout|settlement|transfer\.paid/i.test(eventType);
      const journalPosted = row.journal_status && String(row.journal_status).trim().toUpperCase() === 'POSTED';
      const amount = row.amount == null ? null : Number(row.amount);
      const payoutBankMatchCount = isPayout && row.journal_entry_id && journalPosted
        ? Number(row.payout_match_count || 0) : null;
      return {
        eventId: row.id,
        gateway: row.gateway,
        eventType,
        status: row.status,
        evidenceStatus: evidenceStatus(row.status, eventType, row.journal_entry_id, row.journal_status, row.reversal_journal_id, row.reversal_journal_status),
        occurredAt: row.created_at,
        processedAt: row.processed_at,
        settlementReference: row.settlement_reference,
        amount: Number.isFinite(amount) ? amount : null,
        currency: validCurrency(data.currency),
        paymentId: row.payment_id,
        paymentNumber: row.payment_number,
        invoiceId: row.invoice_id,
        invoiceNumber: row.invoice_number,
        expenseId: row.expense_id,
        journalEntryId: row.journal_entry_id,
        journalNumber: row.journal_number,
        feeJournalId: row.fee_journal_id,
        feeJournalNumber: row.fee_journal_number,
        relatedEventId: row.related_event_id,
        reversalJournalId: row.reversal_journal_id,
        reversalJournalNumber: row.reversal_journal_number,
        payoutBankMatchCount,
      };
    });
    const last = page[page.length - 1];
    return {
      events,
      nextCursor: hasMore && last ? encodeGatewayActivityCursor(last.cursor_created_at, last.id) : null,
      hasMore,
    };
  }
}
