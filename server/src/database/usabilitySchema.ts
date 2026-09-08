import { DbQueryClient } from './db';

export async function applyUsabilitySchema(client: DbQueryClient): Promise<void> {
  const additiveStatements = [
    `CREATE INDEX IF NOT EXISTS idx_document_inbox_org ON document_inbox (organization_id, status)`,
    `CREATE INDEX IF NOT EXISTS idx_cust_portal_token ON customer_portal_tokens (organization_id, token)`,
    `CREATE INDEX IF NOT EXISTS idx_saved_views_org_user ON saved_views (organization_id, user_id, entity_type)`,
    `ALTER TABLE customer_portal_tokens ADD COLUMN IF NOT EXISTS token_hash VARCHAR(128)`,
    `ALTER TABLE saved_views ADD COLUMN IF NOT EXISTS sort_config JSONB DEFAULT '{}'`
  ];

  for (const sql of additiveStatements) {
    try {
      await client.query(sql);
    } catch (error) {
      if (process.env.NODE_ENV === 'production') throw error;
    }
  }
}
