import { db, DbQueryClient } from './db';

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
      schema_version INT DEFAULT 1,
      idempotency_key VARCHAR(128),
      payload JSONB,
      payload_hash VARCHAR(128),
      status VARCHAR(20) DEFAULT 'PROCESSING',
      result JSONB,
      result_version INT,
      error_code VARCHAR(100),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      completed_at TIMESTAMP WITH TIME ZONE
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS uk_financial_command_idempotency
      ON financial_commands (organization_id, idempotency_key, command_type)`,
    `CREATE INDEX IF NOT EXISTS idx_financial_commands_org_created
      ON financial_commands (organization_id, created_at DESC)`,
    `CREATE TABLE IF NOT EXISTS financial_evidence_links (
      id VARCHAR(64) PRIMARY KEY,
      organization_id VARCHAR(64) NOT NULL,
      command_id VARCHAR(64) NOT NULL,
      source_type VARCHAR(100) NOT NULL,
      source_id VARCHAR(64) NOT NULL,
      relation_type VARCHAR(100) NOT NULL,
      target_type VARCHAR(100) NOT NULL,
      target_id VARCHAR(64) NOT NULL,
      metadata JSONB,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT uk_financial_evidence_relation UNIQUE
        (organization_id, command_id, source_type, source_id, relation_type, target_type, target_id)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_financial_evidence_source
      ON financial_evidence_links (organization_id, source_type, source_id, created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_financial_evidence_target
      ON financial_evidence_links (organization_id, target_type, target_id, created_at DESC)`,
    `CREATE TABLE IF NOT EXISTS financial_outbox_events (
      id VARCHAR(64) PRIMARY KEY,
      organization_id VARCHAR(64) NOT NULL,
      command_id VARCHAR(64) NOT NULL,
      event_type VARCHAR(120) NOT NULL,
      aggregate_type VARCHAR(100) NOT NULL,
      aggregate_id VARCHAR(64) NOT NULL,
      payload JSONB,
      status VARCHAR(20) DEFAULT 'PENDING',
      attempt_count INT DEFAULT 0,
      available_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      claimed_at TIMESTAMP WITH TIME ZONE,
      completed_at TIMESTAMP WITH TIME ZONE,
      last_error TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT uk_outbox_command_event UNIQUE (command_id, event_type, aggregate_id)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_financial_outbox_ready
      ON financial_outbox_events (status, available_at, created_at)`,
    `CREATE TABLE IF NOT EXISTS financial_projection_checkpoints (
      organization_id VARCHAR(64) NOT NULL,
      projection_name VARCHAR(100) NOT NULL,
      last_event_id VARCHAR(64),
      last_projected_at TIMESTAMP WITH TIME ZONE,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (organization_id, projection_name)
    )`,
  ];

  for (const sql of statements) {
    try {
      await client.query(sql);
    } catch (err) {
      if (!db.isMemoryMode() || process.env.NODE_ENV === 'production') {
        throw err;
      }
      console.warn('[Migration Warning (Memory Mode)]', err instanceof Error ? err.message : err);
    }
  }
}

