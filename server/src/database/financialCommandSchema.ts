import { DbQueryClient } from './db';

/**
 * Durable command receipts and the transactional outbox are additive. They do
 * not replace existing source documents or the general ledger as the record
 * of financial truth.
 */
export async function applyFinancialCommandSchema(client: DbQueryClient): Promise<void> {
  const statements = [
    `CREATE TABLE IF NOT EXISTS financial_commands (
      id VARCHAR(64) PRIMARY KEY,
      organization_id VARCHAR(64) NOT NULL,
      actor_user_id VARCHAR(64),
      command_type VARCHAR(100) NOT NULL,
      schema_version INT NOT NULL DEFAULT 1,
      idempotency_key VARCHAR(128),
      payload JSONB NOT NULL,
      payload_hash VARCHAR(128) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'PROCESSING',
      result JSONB,
      result_version INT,
      error_code VARCHAR(100),
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      completed_at TIMESTAMP WITH TIME ZONE
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS uk_financial_command_idempotency
      ON financial_commands (organization_id, idempotency_key, command_type)`,
    `CREATE INDEX IF NOT EXISTS idx_financial_commands_org_created
      ON financial_commands (organization_id, created_at DESC)`,
    `CREATE TABLE IF NOT EXISTS financial_outbox_events (
      id VARCHAR(64) PRIMARY KEY,
      organization_id VARCHAR(64) NOT NULL,
      command_id VARCHAR(64) NOT NULL,
      event_type VARCHAR(120) NOT NULL,
      aggregate_type VARCHAR(100) NOT NULL,
      aggregate_id VARCHAR(64) NOT NULL,
      payload JSONB NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
      attempt_count INT NOT NULL DEFAULT 0,
      available_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      claimed_at TIMESTAMP WITH TIME ZONE,
      completed_at TIMESTAMP WITH TIME ZONE,
      last_error TEXT,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT uk_outbox_command_event UNIQUE (command_id, event_type, aggregate_id)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_financial_outbox_ready
      ON financial_outbox_events (status, available_at, created_at)`,
    `CREATE TABLE IF NOT EXISTS financial_projection_checkpoints (
      organization_id VARCHAR(64) NOT NULL,
      projection_name VARCHAR(100) NOT NULL,
      last_event_id VARCHAR(64),
      last_projected_at TIMESTAMP WITH TIME ZONE,
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (organization_id, projection_name)
    )`,
  ];

  for (const sql of statements) {
    await client.query(sql);
  }
}
