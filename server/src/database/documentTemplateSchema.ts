import { db, DbQueryClient } from './db';
// Document-template registry bootstrap is also used during tenant provisioning.
import { newId } from '../utils/ids';

export const ALL_44_TEMPLATE_MODELS = [
  // 1. Quotes (4 models)
  { category: 'quotes', modelId: 'proposal', name: 'Standard Quote', layoutFamily: 'standard', presetTitle: 'FORMAL ESTIMATE' },
  { category: 'quotes', modelId: 'commercial', name: 'Ledger Quote', layoutFamily: 'ledger', presetTitle: 'COMMERCIAL QUOTATION' },
  { category: 'quotes', modelId: 'milestone-proposal', name: 'Proposal / Bid', layoutFamily: 'standard', presetTitle: 'PROPOSAL / BID' },
  { category: 'quotes', modelId: 'compact', name: 'Compact Quote', layoutFamily: 'compact', presetTitle: 'QUOTATION' },

  // 2. Sales Orders (3 models)
  { category: 'sales-orders', modelId: 'confirmation', name: 'Standard Sales Order', layoutFamily: 'standard', presetTitle: 'SALES ORDER' },
  { category: 'sales-orders', modelId: 'commercial', name: 'Ledger Sales Order', layoutFamily: 'ledger', presetTitle: 'ORDER CONFIRMATION' },
  { category: 'sales-orders', modelId: 'fulfillment', name: 'Compact Sales Order', layoutFamily: 'compact', presetTitle: 'SALES ORDER' },

  // 3. Delivery Challans (3 models)
  { category: 'delivery-challans', modelId: 'dispatch', name: 'Standard Delivery Challan', layoutFamily: 'standard', presetTitle: 'DELIVERY CHALLAN' },
  { category: 'delivery-challans', modelId: 'packing-list', name: 'Dispatch Note', layoutFamily: 'standard', presetTitle: 'DISPATCH NOTE' },
  { category: 'delivery-challans', modelId: 'jobwork', name: 'Compact Challan Layout', layoutFamily: 'compact', presetTitle: 'DELIVERY CHALLAN' },

  // 4. Invoices (4 models)
  { category: 'invoices', modelId: 'tax-invoice', name: 'Standard Tax Invoice', layoutFamily: 'standard', presetTitle: 'TAX INVOICE' },
  { category: 'invoices', modelId: 'ledger-invoice', name: 'Ledger Invoice', layoutFamily: 'ledger', presetTitle: 'TAX INVOICE' },
  { category: 'invoices', modelId: 'export', name: 'Alternate Ledger Invoice', layoutFamily: 'ledger', presetTitle: 'INVOICE' },
  { category: 'invoices', modelId: 'pos', name: 'Compact Invoice', layoutFamily: 'compact', presetTitle: 'RETAIL INVOICE' },

  // 5. Credit Notes (3 models)
  { category: 'credit-notes', modelId: 'statutory', name: 'Standard Credit Note', layoutFamily: 'standard', presetTitle: 'CREDIT NOTE' },
  { category: 'credit-notes', modelId: 'goods-return', name: 'Credit Application Ledger', layoutFamily: 'ledger', presetTitle: 'CREDIT NOTE' },
  { category: 'credit-notes', modelId: 'adjustment', name: 'Compact Credit Note', layoutFamily: 'compact', presetTitle: 'CREDIT ADJUSTMENT MEMO' },

  // 6. Purchase Orders (3 models)
  { category: 'purchase-orders', modelId: 'standard-po', name: 'Standard Purchase Order', layoutFamily: 'standard', presetTitle: 'PURCHASE ORDER' },
  { category: 'purchase-orders', modelId: 'contract-po', name: 'Ledger Purchase Order', layoutFamily: 'ledger', presetTitle: 'PURCHASE ORDER' },
  { category: 'purchase-orders', modelId: 'requisition', name: 'Compact Purchase Order', layoutFamily: 'compact', presetTitle: 'PURCHASE ORDER' },

  // 7. Payment Receipts (3 models)
  { category: 'payment-receipts', modelId: 'receipt-voucher', name: 'Standard Receipt Voucher', layoutFamily: 'standard', presetTitle: 'PAYMENT RECEIPT' },
  { category: 'payment-receipts', modelId: 'cash-receipt', name: 'Compact Receipt Layout', layoutFamily: 'compact', presetTitle: 'PAYMENT RECEIPT' },
  { category: 'payment-receipts', modelId: 'allocation-advice', name: 'Ledger Receipt Layout', layoutFamily: 'ledger', presetTitle: 'PAYMENT RECEIPT' },

  // 8. Customer Statements (3 models)
  { category: 'customer-statements', modelId: 'running-ledger', name: 'Detailed Transaction Ledger', layoutFamily: 'ledger', presetTitle: 'STATEMENT OF ACCOUNT' },
  { category: 'customer-statements', modelId: 'aging-statement', name: 'Receivables Activity Summary', layoutFamily: 'standard', presetTitle: 'RECEIVABLES ACTIVITY SUMMARY' },
  { category: 'customer-statements', modelId: 'open-summary', name: 'Account Summary', layoutFamily: 'compact', presetTitle: 'CUSTOMER ACCOUNT SUMMARY' },
  // 9. Bills (3 models)
  { category: 'bills', modelId: 'bill-itc', name: 'Standard Vendor Bill', layoutFamily: 'standard', presetTitle: 'VENDOR BILL VOUCHER' },
  { category: 'bills', modelId: 'accrual-voucher', name: 'Ledger Vendor Bill', layoutFamily: 'ledger', presetTitle: 'VENDOR BILL' },
  { category: 'bills', modelId: 'matching', name: 'Compact Vendor Bill', layoutFamily: 'compact', presetTitle: 'VENDOR BILL' },

  // 10. Expenses (3 models)
  { category: 'expenses', modelId: 'reimbursement', name: 'Standard Expense Voucher', layoutFamily: 'standard', presetTitle: 'EXPENSE VOUCHER' },
  { category: 'expenses', modelId: 'petty-cash', name: 'Compact Expense Voucher', layoutFamily: 'compact', presetTitle: 'EXPENSE VOUCHER' },
  { category: 'expenses', modelId: 'project-billable', name: 'Project Recovery Voucher', layoutFamily: 'ledger', presetTitle: 'PROJECT EXPENSE RECOVERY VOUCHER' },

  // 11. Vendor Credits (3 models)
  { category: 'vendor-credits', modelId: 'debit-note', name: 'Standard Vendor Credit', layoutFamily: 'standard', presetTitle: 'VENDOR CREDIT' },
  { category: 'vendor-credits', modelId: 'purchase-return', name: 'Ledger Vendor Credit', layoutFamily: 'ledger', presetTitle: 'VENDOR CREDIT' },
  { category: 'vendor-credits', modelId: 'adjustment-memo', name: 'Compact Vendor Credit', layoutFamily: 'compact', presetTitle: 'VENDOR CREDIT' },

  // 12. Vendor Payments (3 models)
  { category: 'vendor-payments', modelId: 'remittance-advice', name: 'Standard Vendor Payment Advice', layoutFamily: 'standard', presetTitle: 'PAYMENT ADVICE' },
  { category: 'vendor-payments', modelId: 'cheque-disbursement', name: 'Compact Vendor Payment', layoutFamily: 'compact', presetTitle: 'VENDOR PAYMENT' },
  { category: 'vendor-payments', modelId: 'allocation-advice', name: 'Ledger Vendor Payment Advice', layoutFamily: 'ledger', presetTitle: 'VENDOR SETTLEMENT CONFIRMATION' },

  // 13. Vendor Statements (3 models)
  { category: 'vendor-statements', modelId: 'vendor-ledger', name: 'Vendor Transaction Ledger', layoutFamily: 'ledger', presetTitle: 'VENDOR TRANSACTION LEDGER' },
  { category: 'vendor-statements', modelId: 'payables-aging', name: 'Payables Activity Summary', layoutFamily: 'standard', presetTitle: 'PAYABLES ACTIVITY SUMMARY' },
  { category: 'vendor-statements', modelId: 'reconciliation', name: 'Vendor Balance Overview', layoutFamily: 'compact', presetTitle: 'VENDOR BALANCE OVERVIEW' },
  // 14. Journals (3 models)
  { category: 'journals', modelId: 'general-voucher', name: 'Standard Journal Voucher', layoutFamily: 'standard', presetTitle: 'JOURNAL VOUCHER' },
  { category: 'journals', modelId: 'audit-voucher', name: 'Ledger Journal Voucher', layoutFamily: 'ledger', presetTitle: 'ADJUSTING JOURNAL VOUCHER' },
  { category: 'journals', modelId: 'adjustment-journal', name: 'Compact Journal Voucher', layoutFamily: 'compact', presetTitle: 'LEDGER POSTING VOUCHER' },
] as const;

export const DEFAULT_TEMPLATE_MODEL_BY_CATEGORY: Record<string, string> = {
  quotes: 'proposal',
  'sales-orders': 'confirmation',
  'delivery-challans': 'dispatch',
  invoices: 'tax-invoice',
  'credit-notes': 'statutory',
  'purchase-orders': 'standard-po',
  'payment-receipts': 'receipt-voucher',
  'customer-statements': 'running-ledger',
  bills: 'bill-itc',
  expenses: 'reimbursement',
  'vendor-credits': 'debit-note',
  'vendor-payments': 'remittance-advice',
  'vendor-statements': 'vendor-ledger',
  journals: 'general-voucher',
};
export const ALL_42_TEMPLATE_MODELS = ALL_44_TEMPLATE_MODELS;

export async function applyDocumentTemplateSchema(client: DbQueryClient): Promise<void> {
  // Keep the in-memory registry usable in tests without PostgreSQL-only
  // constraints and partial composite indexes.
  if (db.isMemoryMode()) {
    await client.query(`CREATE TABLE IF NOT EXISTS document_templates (
      id VARCHAR(64), organization_id VARCHAR(64), category VARCHAR(32), model_id VARCHAR(32), name VARCHAR(128),
      paper_size VARCHAR(16), orientation VARCHAR(16), layout_family VARCHAR(32), is_active BOOLEAN, is_system BOOLEAN,
      current_version_id VARCHAR(64), created_at TIMESTAMP WITH TIME ZONE, updated_at TIMESTAMP WITH TIME ZONE
    )`);
    await client.query(`CREATE TABLE IF NOT EXISTS document_template_versions (
      id VARCHAR(64), template_id VARCHAR(64), version_number INT, configuration JSONB, created_by VARCHAR(64),
      created_at TIMESTAMP WITH TIME ZONE
    )`);
    await client.query(`CREATE TABLE IF NOT EXISTS document_template_assignments (
      id VARCHAR(64), organization_id VARCHAR(64), category VARCHAR(32), template_id VARCHAR(64),
      entity_type VARCHAR(16), entity_id VARCHAR(64), created_at TIMESTAMP WITH TIME ZONE, updated_at TIMESTAMP WITH TIME ZONE
    )`);
    await client.query(`CREATE TABLE IF NOT EXISTS document_render_snapshots (
      id VARCHAR(64), organization_id VARCHAR(64), category VARCHAR(32), document_id VARCHAR(64),
      template_version_id VARCHAR(64), source_data_hash VARCHAR(64), render_model JSONB, pdf_byte_size INT,
      artifact_state VARCHAR(32), issuance_number INT, idempotency_key VARCHAR(256), idempotency_payload_hash VARCHAR(64),
      source_revision_ref VARCHAR(128), issued_by VARCHAR(64), issued_at TIMESTAMP WITH TIME ZONE, issuance_reason TEXT,
      filename VARCHAR(255), pdf_bytes TEXT, pdf_sha256 VARCHAR(64), created_at TIMESTAMP WITH TIME ZONE
    )`);
    await seedMemoryOrganizationTemplates(client);
    return;
  }
  // 1. Table: document_templates
  await client.query(`
    CREATE TABLE IF NOT EXISTS document_templates (
      id VARCHAR(64) PRIMARY KEY,
      organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      category VARCHAR(32) NOT NULL,
      model_id VARCHAR(32) NOT NULL,
      name VARCHAR(128) NOT NULL,
      paper_size VARCHAR(16) NOT NULL DEFAULT 'A4',
      orientation VARCHAR(16) NOT NULL DEFAULT 'portrait',
      layout_family VARCHAR(32) NOT NULL DEFAULT 'standard',
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      is_system BOOLEAN NOT NULL DEFAULT FALSE,
      current_version_id VARCHAR(64),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT uq_doc_tmpl_org_cat_model UNIQUE (organization_id, category, model_id)
    )
  `);

  // 2. Table: document_template_versions
  await client.query(`
    CREATE TABLE IF NOT EXISTS document_template_versions (
      id VARCHAR(64) PRIMARY KEY,
      template_id VARCHAR(64) NOT NULL REFERENCES document_templates(id) ON DELETE CASCADE,
      version_number INT NOT NULL DEFAULT 1,
      configuration JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_by VARCHAR(64),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT uq_doc_tmpl_ver_num UNIQUE (template_id, version_number)
    )
  `);

  // 3. Table: document_template_assignments
  await client.query(`
    CREATE TABLE IF NOT EXISTS document_template_assignments (
      id VARCHAR(64) PRIMARY KEY,
      organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      category VARCHAR(32) NOT NULL,
      template_id VARCHAR(64) NOT NULL REFERENCES document_templates(id) ON DELETE CASCADE,
      entity_type VARCHAR(16) NOT NULL DEFAULT 'ORGANIZATION',
      entity_id VARCHAR(64),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT uq_doc_tmpl_asgn UNIQUE (organization_id, category, entity_type, entity_id)
    )
  `);

  // 4. Table: document_render_snapshots
  await client.query(`
    CREATE TABLE IF NOT EXISTS document_render_snapshots (
      id VARCHAR(64) PRIMARY KEY,
      organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      category VARCHAR(32) NOT NULL,
      document_id VARCHAR(64) NOT NULL,
      template_version_id VARCHAR(64) REFERENCES document_template_versions(id) ON DELETE SET NULL,
      source_data_hash VARCHAR(64) NOT NULL,
      render_model JSONB NOT NULL,
      pdf_byte_size INT NOT NULL,
      artifact_state VARCHAR(32) DEFAULT 'LEGACY_METADATA_ONLY',
      issuance_number INT,
      idempotency_key VARCHAR(256),
      idempotency_payload_hash VARCHAR(64),
      source_revision_ref VARCHAR(128),
      issued_by VARCHAR(64),
      issued_at TIMESTAMP WITH TIME ZONE,
      issuance_reason TEXT,
      filename VARCHAR(255),
      pdf_bytes BYTEA,
      pdf_sha256 VARCHAR(64),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Extend existing metadata-only snapshots without replacing or inventing PDF bytes.
  await client.query(`ALTER TABLE document_render_snapshots ADD COLUMN IF NOT EXISTS artifact_state VARCHAR(32)`);
  await client.query(`ALTER TABLE document_render_snapshots ADD COLUMN IF NOT EXISTS issuance_number INT`);
  await client.query(`ALTER TABLE document_render_snapshots ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(256)`);
  await client.query(`ALTER TABLE document_render_snapshots ADD COLUMN IF NOT EXISTS idempotency_payload_hash VARCHAR(64)`);
  await client.query(`ALTER TABLE document_render_snapshots ADD COLUMN IF NOT EXISTS source_revision_ref VARCHAR(128)`);
  await client.query(`ALTER TABLE document_render_snapshots ADD COLUMN IF NOT EXISTS issued_by VARCHAR(64)`);
  await client.query(`ALTER TABLE document_render_snapshots ADD COLUMN IF NOT EXISTS issued_at TIMESTAMP WITH TIME ZONE`);
  await client.query(`ALTER TABLE document_render_snapshots ADD COLUMN IF NOT EXISTS issuance_reason TEXT`);
  await client.query(`ALTER TABLE document_render_snapshots ADD COLUMN IF NOT EXISTS filename VARCHAR(255)`);
  await client.query(`ALTER TABLE document_render_snapshots ADD COLUMN IF NOT EXISTS pdf_bytes BYTEA`);
  await client.query(`ALTER TABLE document_render_snapshots ADD COLUMN IF NOT EXISTS pdf_sha256 VARCHAR(64)`);

  await client.query(`
    WITH legacy AS (
      SELECT id,
             ROW_NUMBER() OVER (
               PARTITION BY organization_id, category, document_id
               ORDER BY created_at, id
             ) AS sequence_number
      FROM document_render_snapshots
      WHERE artifact_state IS NULL
    )
    UPDATE document_render_snapshots AS snapshots
       SET artifact_state = 'LEGACY_METADATA_ONLY',
           issuance_number = legacy.sequence_number
      FROM legacy
     WHERE snapshots.id = legacy.id
  `);
  await client.query(`UPDATE document_render_snapshots SET artifact_state = 'LEGACY_METADATA_ONLY' WHERE artifact_state IS NULL`);
  await client.query(`ALTER TABLE document_render_snapshots ALTER COLUMN artifact_state SET DEFAULT 'LEGACY_METADATA_ONLY'`);
  await client.query(`ALTER TABLE document_render_snapshots ALTER COLUMN artifact_state SET NOT NULL`);

  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_doc_render_snapshot_issuance
    ON document_render_snapshots (organization_id, category, document_id, issuance_number)
    WHERE issuance_number IS NOT NULL
  `);
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_doc_render_snapshot_idempotency
    ON document_render_snapshots (organization_id, category, document_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_doc_render_snapshots_lookup
    ON document_render_snapshots (organization_id, category, document_id)
  `);

  // Auto-seed and migrate for every organization
  const orgs = await client.query('SELECT id FROM organizations');
  for (const org of orgs.rows) {
    await seedAndMigrateOrganizationTemplates(client, org.id);
  }
}

async function seedMemoryOrganizationTemplates(client: DbQueryClient): Promise<void> {
  const orgs = await client.query('SELECT id FROM organizations');
  for (const org of orgs.rows) await seedAndMigrateOrganizationTemplates(client, org.id);
}

export async function seedAndMigrateOrganizationTemplates(client: DbQueryClient, organizationId: string): Promise<void> {
  // Read legacy JSON if available
  const profRes = await client.query(
    'SELECT document_templates FROM organization_profiles WHERE organization_id = $1',
    [organizationId]
  );
  const legacyTemplates = profRes.rows[0]?.document_templates || {};

  for (const def of ALL_42_TEMPLATE_MODELS) {
    const existing = await client.query(
      'SELECT id, current_version_id FROM document_templates WHERE organization_id = $1 AND category = $2 AND model_id = $3',
      [organizationId, def.category, def.modelId]
    );

    let templateId: string;
    if (!existing.rows.length) {
      templateId = newId('tmpl');
      const versionId = newId('tmpl_ver');

      // Check if legacy config had settings for this category
      const legacyCat = legacyTemplates[def.category] || {};
      const config = {
        templateTitle: legacyCat.templateTitle || def.presetTitle,
        signatoryTitle: legacyCat.signatoryTitle || 'Authorized Signatory',
        termsAndConditions: legacyCat.termsAndConditions || 'Payment is due within payment terms.',
        footerNote: legacyCat.footerNote || 'Thank you for your business.',
        primaryColor: legacyCat.primaryColor || '#1d4ed8',
        accentColor: legacyCat.accentColor || '#0f172a',
      };

      await client.query(
        `INSERT INTO document_templates (id, organization_id, category, model_id, name, paper_size, orientation, layout_family, is_active, is_system, current_version_id)
         VALUES ($1, $2, $3, $4, $5, 'A4', 'portrait', $6, TRUE, TRUE, $7)`,
        [templateId, organizationId, def.category, def.modelId, def.name, def.layoutFamily, versionId]
      );

      await client.query(
        `INSERT INTO document_template_versions (id, template_id, version_number, configuration)
         VALUES ($1, $2, 1, $3)`,
        [versionId, templateId, JSON.stringify(config)]
      );
    } else {
      templateId = existing.rows[0].id;
    }

    // If this is model 1 for category, assign as organization default if none assigned
    const assigned = await client.query(
      `SELECT id FROM document_template_assignments WHERE organization_id = $1 AND category = $2 AND entity_type = 'ORGANIZATION' AND entity_id IS NULL`,
      [organizationId, def.category]
    );

    if (!assigned.rows.length) {
      // Check if legacy default template specified
      const legacyDefault = legacyTemplates[def.category]?.defaultTemplate;
      const isDefault = legacyDefault ? legacyDefault === def.modelId : DEFAULT_TEMPLATE_MODEL_BY_CATEGORY[def.category] === def.modelId;

      if (isDefault) {
        await client.query(
          `INSERT INTO document_template_assignments (id, organization_id, category, template_id, entity_type, entity_id)
           VALUES ($1, $2, $3, $4, 'ORGANIZATION', NULL)
           ON CONFLICT DO NOTHING`,
          [newId('asgn'), organizationId, def.category, templateId]
        );
      }
    }
  }
}
