import crypto from 'crypto';
import { db, type DbQueryClient } from '../database/db';
import { newId } from '../utils/ids';

export interface FinancialOutboxEventInput {
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: unknown;
}

export interface FinancialCommandInput<TResult> {
  organizationId: string;
  actorUserId?: string;
  commandType: string;
  payload: unknown;
  idempotencyKey?: string;
  schemaVersion?: number;
  resultVersion?: number;
  transactionClient?: DbQueryClient;
  execute: (client: DbQueryClient) => Promise<TResult>;
  events: (result: TResult) => FinancialOutboxEventInput[];
}

export interface FinancialCommandResult<TResult> {
  commandId: string;
  result: TResult;
}

function redactPayload(value: unknown, key = ''): unknown {
  const normalizedKey = key.toLowerCase();
  if (/(password|secret|token|authorization|cookie|image|content|binary|base64)/.test(normalizedKey)) {
    return '[REDACTED]';
  }
  if (Array.isArray(value)) return value.map((item) => redactPayload(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([entryKey, entryValue]) => [entryKey, redactPayload(entryValue, entryKey)])
    );
  }
  return value;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

/**
 * Compatibility command adapter. During the staged migration this service can
 * use the idempotency middleware's ambient transaction, so one request still
 * commits its receipt, source document, journal, audit data, and outbox rows
 * together.
 */
export class FinancialCommandService {
  public static async execute<TResult>(input: FinancialCommandInput<TResult>): Promise<FinancialCommandResult<TResult>> {
    const run = async (client: DbQueryClient): Promise<FinancialCommandResult<TResult>> => {
      const commandId = newId('cmd');
      const payload = redactPayload(input.payload);
      const payloadHash = crypto.createHash('sha256').update(canonicalJson(payload)).digest('hex');
      const schemaVersion = input.schemaVersion ?? 1;
      const resultVersion = input.resultVersion ?? 1;

      await client.query(
        `INSERT INTO financial_commands
          (id, organization_id, actor_user_id, command_type, schema_version, idempotency_key, payload, payload_hash, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'PROCESSING')`,
        [
          commandId,
          input.organizationId,
          input.actorUserId || null,
          input.commandType,
          schemaVersion,
          input.idempotencyKey || null,
          JSON.stringify(payload),
          payloadHash,
        ]
      );

      const result = await input.execute(client);
      const events = input.events(result);

      await client.query(
        `UPDATE financial_commands
            SET status = 'COMPLETED', result = $1, result_version = $2, completed_at = CURRENT_TIMESTAMP
          WHERE id = $3 AND organization_id = $4`,
        [JSON.stringify(result), resultVersion, commandId, input.organizationId]
      );

      for (const event of events) {
        await client.query(
          `INSERT INTO financial_outbox_events
            (id, organization_id, command_id, event_type, aggregate_type, aggregate_id, payload)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            newId('outbox'),
            input.organizationId,
            commandId,
            event.eventType,
            event.aggregateType,
            event.aggregateId,
            JSON.stringify(event.payload),
          ]
        );
      }

      return { commandId, result };
    };

    if (input.transactionClient) return run(input.transactionClient);
    return db.transaction(run, { organizationId: input.organizationId });
  }
}
