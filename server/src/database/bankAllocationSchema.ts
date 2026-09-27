import { db, type DbQueryClient } from './db';

/** Additive schema for the guarded journal-line allocation prototype. */
export async function applyBankAllocationSchema(client: DbQueryClient): Promise<void> {
  if (!db.isMemoryMode()) {
    await client.query(`DO $$ BEGIN
      IF EXISTS (
        SELECT 1 FROM journal_lines jl JOIN journal_entries je ON je.id = jl.journal_entry_id
         WHERE jl.organization_id IS NOT NULL AND jl.organization_id <> je.organization_id
      ) THEN RAISE EXCEPTION 'BANK_ALLOCATION_CROSS_TENANT_JOURNAL_LINE'; END IF;
    END $$`);
  }
  const statements = [
    `ALTER TABLE bank_reconciliation_matches ADD COLUMN IF NOT EXISTS bank_account_id VARCHAR(64)`,
    `ALTER TABLE bank_reconciliation_matches ADD COLUMN IF NOT EXISTS ledger_account_id VARCHAR(64)`,
    `ALTER TABLE bank_reconciliation_matches ADD COLUMN IF NOT EXISTS journal_entry_id VARCHAR(64)`,
    `ALTER TABLE bank_reconciliation_matches ADD COLUMN IF NOT EXISTS journal_line_id VARCHAR(64)`,
    `ALTER TABLE bank_reconciliation_matches ADD COLUMN IF NOT EXISTS identity_state VARCHAR(32) NOT NULL DEFAULT 'LEGACY_UNRESOLVED'`,
    `ALTER TABLE bank_reconciliation_matches ADD COLUMN IF NOT EXISTS identity_reason TEXT`,
    `ALTER TABLE bank_reconciliation_matches ADD COLUMN IF NOT EXISTS creation_origin VARCHAR(32) NOT NULL DEFAULT 'LEGACY'`,
    `ALTER TABLE bank_reconciliation_matches ADD COLUMN IF NOT EXISTS allocation_state VARCHAR(16) NOT NULL DEFAULT 'LEGACY'`,
    `ALTER TABLE bank_reconciliation_matches ADD COLUMN IF NOT EXISTS unmatched_by VARCHAR(64)`,
    `ALTER TABLE bank_reconciliation_matches ADD COLUMN IF NOT EXISTS unmatched_at TIMESTAMP WITH TIME ZONE`,
    `ALTER TABLE bank_reconciliation_matches ADD COLUMN IF NOT EXISTS unmatch_reason TEXT`,
    `UPDATE bank_reconciliation_matches
        SET identity_state = 'LEGACY_UNRESOLVED',
            identity_reason = COALESCE(identity_reason, 'Pre-canonical match has no verified journal-line identity'),
            creation_origin = COALESCE(creation_origin, 'LEGACY'),
            allocation_state = COALESCE(allocation_state, 'LEGACY')
      WHERE journal_line_id IS NULL`,
    `UPDATE journal_lines jl SET organization_id = je.organization_id
       FROM journal_entries je WHERE jl.organization_id IS NULL AND je.id = jl.journal_entry_id`,
    // journal_lines.organization_id was nullable in older schemas. Derive only
    // from its globally unique parent journal; never guess across tenants.
    // Composite FK targets need an explicit (org,id) unique key even when id
    // already has a global primary key.
    `CREATE UNIQUE INDEX IF NOT EXISTS uk_bank_alloc_statement_org_id ON bank_statement_transactions (organization_id, id)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS uk_bank_alloc_statement_profile ON bank_statement_transactions (organization_id, id, bank_account_id)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS uk_bank_alloc_bank_account_org_id ON bank_accounts (organization_id, id)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS uk_bank_alloc_bank_account_ledger ON bank_accounts (organization_id, id, ledger_account_id)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS uk_bank_alloc_ledger_account_org_id ON accounts (organization_id, id)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS uk_bank_alloc_journal_entry_org_id ON journal_entries (organization_id, id)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS uk_bank_alloc_journal_line_org_id ON journal_lines (organization_id, id)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS uk_bank_alloc_journal_line_entry ON journal_lines (organization_id, journal_entry_id, id)`,
    // Keep startup compatible with legacy duplicate profiles, but make them
    // visible to operators. Never pick a winner or rewrite account mappings.
    `CREATE UNIQUE INDEX IF NOT EXISTS uk_bank_stmt_active_journal_line_allocation
       ON bank_reconciliation_matches (organization_id, statement_transaction_id, journal_line_id)
       WHERE allocation_state = 'ACTIVE' AND identity_state = 'VERIFIED'`,
    `CREATE INDEX IF NOT EXISTS idx_bank_active_allocation_statement
       ON bank_reconciliation_matches (organization_id, statement_transaction_id)
       WHERE allocation_state = 'ACTIVE'`,
    `CREATE INDEX IF NOT EXISTS idx_bank_active_allocation_journal_line
       ON bank_reconciliation_matches (organization_id, journal_line_id)
       WHERE allocation_state = 'ACTIVE'`,
    `CREATE INDEX IF NOT EXISTS idx_bank_legacy_allocation_account
       ON bank_reconciliation_matches (organization_id, bank_account_id, allocation_state, identity_state)`,
  ];
  for (const sql of statements) {
    if (sql.startsWith('UPDATE journal_lines jl SET organization_id') && db.isMemoryMode()) continue;
    await client.query(sql);
  }
  // Replace the legacy predicate once, only when it still treats retained
  // UNMATCHED history as active. Avoid rebuilding this index at every startup.
  if (!db.isMemoryMode()) {
    const index = await client.query(
      `SELECT indexdef FROM pg_indexes WHERE schemaname = current_schema() AND indexname = 'uk_bank_reconciliation_active_match'`,
    );
    const indexDefinition = String(index.rows[0]?.indexdef || '').toUpperCase();
    if (!indexDefinition || !indexDefinition.includes("'UNMATCHED'")) {
      const duplicates = await client.query(
        `SELECT organization_id, statement_transaction_id, accounting_transaction_type, accounting_transaction_id
           FROM bank_reconciliation_matches
          WHERE COALESCE(status, '') NOT IN ('REJECTED', 'REVERSED', 'UNMATCHED')
          GROUP BY organization_id, statement_transaction_id, accounting_transaction_type, accounting_transaction_id
         HAVING COUNT(*) > 1 LIMIT 1`,
      );
      if (duplicates.rows.length) throw new Error('BANK_RECONCILIATION_INDEX_PREFLIGHT_FAILED');
      if (indexDefinition) await client.query(`DROP INDEX uk_bank_reconciliation_active_match`);
      await client.query(`CREATE UNIQUE INDEX uk_bank_reconciliation_active_match
        ON bank_reconciliation_matches (organization_id, statement_transaction_id, accounting_transaction_type, accounting_transaction_id)
        WHERE COALESCE(status, '') NOT IN ('REJECTED', 'REVERSED', 'UNMATCHED')`);
    }
  }
  if (!db.isMemoryMode()) {
    await client.query(`DO $$ BEGIN
      IF EXISTS (
        SELECT 1 FROM bank_accounts WHERE ledger_account_id IS NOT NULL
        GROUP BY organization_id, ledger_account_id HAVING COUNT(*) > 1
      ) THEN RAISE WARNING 'BANK_ALLOCATION_DUPLICATE_BANK_PROFILE: resolve shared ledger profiles before reconciliation activation'; END IF;
    END $$`);
    await client.query(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_bank_reconciliation_allocation_state') THEN
        ALTER TABLE bank_reconciliation_matches ADD CONSTRAINT ck_bank_reconciliation_allocation_state
          CHECK (allocation_state IN ('LEGACY', 'ACTIVE', 'UNMATCHED', 'REVERSED'));
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_bank_reconciliation_identity_state') THEN
        ALTER TABLE bank_reconciliation_matches ADD CONSTRAINT ck_bank_reconciliation_identity_state
          CHECK (identity_state IN ('LEGACY_UNRESOLVED', 'AMBIGUOUS', 'VERIFIED'));
      END IF;
      ALTER TABLE bank_reconciliation_matches DROP CONSTRAINT IF EXISTS ck_bank_reconciliation_canonical_active;
      ALTER TABLE bank_reconciliation_matches ADD CONSTRAINT ck_bank_reconciliation_canonical_active
        CHECK (allocation_state <> 'ACTIVE' OR
          (creation_origin IN ('CANONICAL_ALLOCATION', 'STATEMENT_CREATION') AND identity_state = 'VERIFIED' AND
           bank_account_id IS NOT NULL AND ledger_account_id IS NOT NULL AND
           journal_entry_id IS NOT NULL AND journal_line_id IS NOT NULL AND matched_amount > 0));
      IF EXISTS (
        SELECT 1 FROM bank_reconciliation_matches m
        LEFT JOIN bank_statement_transactions st ON st.id = m.statement_transaction_id AND st.organization_id = m.organization_id
        LEFT JOIN bank_accounts ba ON ba.id = m.bank_account_id AND ba.organization_id = m.organization_id
          AND ba.ledger_account_id = m.ledger_account_id
        LEFT JOIN accounts a ON a.id = m.ledger_account_id AND a.organization_id = m.organization_id
        LEFT JOIN journal_entries je ON je.id = m.journal_entry_id AND je.organization_id = m.organization_id
        LEFT JOIN journal_lines jl ON jl.id = m.journal_line_id AND jl.organization_id = m.organization_id
          AND jl.journal_entry_id = m.journal_entry_id AND jl.account_id = m.ledger_account_id
        WHERE m.allocation_state = 'ACTIVE' AND m.identity_state = 'VERIFIED'
          AND (st.id IS NULL OR ba.id IS NULL OR a.id IS NULL OR je.id IS NULL OR jl.id IS NULL OR jl.organization_id IS NULL)
      ) THEN RAISE EXCEPTION 'BANK_ALLOCATION_CANONICAL_TENANT_REFERENCE_PREFLIGHT_FAILED'; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_bank_alloc_statement_org') THEN
        ALTER TABLE bank_reconciliation_matches ADD CONSTRAINT fk_bank_alloc_statement_org
          FOREIGN KEY (organization_id, statement_transaction_id)
          REFERENCES bank_statement_transactions (organization_id, id) ON DELETE RESTRICT NOT VALID;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_bank_alloc_statement_profile') THEN
        ALTER TABLE bank_reconciliation_matches ADD CONSTRAINT fk_bank_alloc_statement_profile
          FOREIGN KEY (organization_id, statement_transaction_id, bank_account_id)
          REFERENCES bank_statement_transactions (organization_id, id, bank_account_id) ON DELETE RESTRICT NOT VALID;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_bank_alloc_bank_account_org') THEN
        ALTER TABLE bank_reconciliation_matches ADD CONSTRAINT fk_bank_alloc_bank_account_org
          FOREIGN KEY (organization_id, bank_account_id)
          REFERENCES bank_accounts (organization_id, id) ON DELETE RESTRICT NOT VALID;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_bank_alloc_bank_account_ledger') THEN
        ALTER TABLE bank_reconciliation_matches ADD CONSTRAINT fk_bank_alloc_bank_account_ledger
          FOREIGN KEY (organization_id, bank_account_id, ledger_account_id)
          REFERENCES bank_accounts (organization_id, id, ledger_account_id) ON DELETE RESTRICT NOT VALID;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_bank_alloc_ledger_account_org') THEN
        ALTER TABLE bank_reconciliation_matches ADD CONSTRAINT fk_bank_alloc_ledger_account_org
          FOREIGN KEY (organization_id, ledger_account_id)
          REFERENCES accounts (organization_id, id) ON DELETE RESTRICT NOT VALID;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_bank_alloc_journal_entry_org') THEN
        ALTER TABLE bank_reconciliation_matches ADD CONSTRAINT fk_bank_alloc_journal_entry_org
          FOREIGN KEY (organization_id, journal_entry_id)
          REFERENCES journal_entries (organization_id, id) ON DELETE RESTRICT NOT VALID;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_bank_alloc_journal_line_org') THEN
        ALTER TABLE bank_reconciliation_matches ADD CONSTRAINT fk_bank_alloc_journal_line_org
          FOREIGN KEY (organization_id, journal_line_id)
          REFERENCES journal_lines (organization_id, id) ON DELETE RESTRICT NOT VALID;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_bank_alloc_journal_entry_line') THEN
        ALTER TABLE bank_reconciliation_matches ADD CONSTRAINT fk_bank_alloc_journal_entry_line
          FOREIGN KEY (organization_id, journal_entry_id, journal_line_id)
          REFERENCES journal_lines (organization_id, journal_entry_id, id) ON DELETE RESTRICT NOT VALID;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_bank_reconciliation_unmatch_audit') THEN
        ALTER TABLE bank_reconciliation_matches ADD CONSTRAINT ck_bank_reconciliation_unmatch_audit
          CHECK (allocation_state <> 'UNMATCHED' OR (unmatched_by IS NOT NULL AND unmatched_at IS NOT NULL AND unmatch_reason IS NOT NULL));
      END IF;
    END $$`);
  }
}
