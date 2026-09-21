import { DbQueryClient } from './db';
import { newId } from '../utils/ids';

export const ALL_42_TEMPLATE_MODELS = [
  // 1. Quotes (3 models)
  { category: 'quotes', modelId: 'proposal', name: 'Formal Proposal', layoutFamily: 'standard', presetTitle: 'COMMERCIAL PROPOSAL' },
  { category: 'quotes', modelId: 'commercial', name: 'Commercial Estimate', layoutFamily: 'ledger', presetTitle: 'COMMERCIAL ESTIMATE' },
  { category: 'quotes', modelId: 'compact', name: 'Compact Quote', layoutFamily: 'compact', presetTitle: 'PRICE QUOTATION' },

  // 2. Sales Orders (3 models)
  { category: 'sales-orders', modelId: 'confirmation', name: 'Order Confirmation', layoutFamily: 'standard', presetTitle: 'SALES ORDER CONFIRMATION' },
  { category: 'sales-orders', modelId: 'commercial', name: 'Commercial Order Ledger', layoutFamily: 'ledger', presetTitle: 'COMMERCIAL ORDER VOUCHER' },
  { category: 'sales-orders', modelId: 'fulfillment', name: 'Fulfillment Schedule', layoutFamily: 'compact', presetTitle: 'DISPATCH BOOKING SLIP' },

  // 3. Delivery Challans (3 models)
  { category: 'delivery-challans', modelId: 'dispatch', name: 'Dispatch Challan', layoutFamily: 'standard', presetTitle: 'DELIVERY CHALLAN' },
  { category: 'delivery-challans', modelId: 'packing-list', name: 'Packing List Manifest', layoutFamily: 'ledger', presetTitle: 'PACKING LIST & TRANSIT MANIFEST' },
  { category: 'delivery-challans', modelId: 'jobwork', name: 'Job Work Returnable Challan', layoutFamily: 'compact', presetTitle: 'JOB WORK RETURNABLE CHALLAN' },

  // 4. Invoices (3 models)
  { category: 'invoices', modelId: 'tax-invoice', name: 'GST Tax Invoice', layoutFamily: 'standard', presetTitle: 'TAX INVOICE' },
  { category: 'invoices', modelId: 'pos', name: 'Service / POS Invoice', layoutFamily: 'compact', presetTitle: 'RETAIL / POS SLIP' },
  { category: 'invoices', modelId: 'export', name: 'Export Commercial Invoice', layoutFamily: 'ledger', presetTitle: 'COMMERCIAL EXPORT INVOICE' },

  // 5. Credit Notes (3 models)
  { category: 'credit-notes', modelId: 'statutory', name: 'Statutory Credit Note', layoutFamily: 'standard', presetTitle: 'CREDIT NOTE' },
  { category: 'credit-notes', modelId: 'goods-return', name: 'Goods Return Memo', layoutFamily: 'ledger', presetTitle: 'SALES RETURN MEMO' },
  { category: 'credit-notes', modelId: 'adjustment', name: 'Rate Adjustment Memo', layoutFamily: 'compact', presetTitle: 'CREDIT ADJUSTMENT MEMORANDUM' },

  // 6. Purchase Orders (3 models)
  { category: 'purchase-orders', modelId: 'standard-po', name: 'Standard Purchase Order', layoutFamily: 'standard', presetTitle: 'PURCHASE ORDER' },
  { category: 'purchase-orders', modelId: 'requisition', name: 'Material Requisition Slip', layoutFamily: 'compact', presetTitle: 'MATERIAL REQUISITION SLIP' },
  { category: 'purchase-orders', modelId: 'contract-po', name: 'Contract Purchase Order', layoutFamily: 'ledger', presetTitle: 'PROCUREMENT CONTRACT ORDER' },

  // 7. Payment Receipts (3 models)
  { category: 'payment-receipts', modelId: 'receipt-voucher', name: 'Official Receipt Voucher', layoutFamily: 'standard', presetTitle: 'PAYMENT RECEIPT VOUCHER' },
  { category: 'payment-receipts', modelId: 'allocation-advice', name: 'Invoice Allocation Advice', layoutFamily: 'ledger', presetTitle: 'REMITTANCE ALLOCATION ADVICE' },
  { category: 'payment-receipts', modelId: 'cash-receipt', name: 'Cash Receipt Slip', layoutFamily: 'compact', presetTitle: 'CASH RECEIPT SLIP' },

  // 8. Customer Statements (3 models)
  { category: 'customer-statements', modelId: 'running-ledger', name: 'Running Transaction Ledger', layoutFamily: 'ledger', presetTitle: 'STATEMENT OF ACCOUNT' },
  { category: 'customer-statements', modelId: 'aging-statement', name: 'Receivables Aging Statement', layoutFamily: 'standard', presetTitle: 'RECEIVABLES AGING ANALYSIS' },
  { category: 'customer-statements', modelId: 'open-summary', name: 'Open Invoices Summary', layoutFamily: 'compact', presetTitle: 'OUTSTANDING INVOICE SUMMARY' },

  // 9. Bills (3 models)
  { category: 'bills', modelId: 'bill-itc', name: 'Vendor Bill with ITC', layoutFamily: 'standard', presetTitle: 'VENDOR BILL VOUCHER' },
  { category: 'bills', modelId: 'accrual-voucher', name: 'AP Accrual Voucher', layoutFamily: 'ledger', presetTitle: 'ACCOUNTS PAYABLE ACCRUAL VOUCHER' },
  { category: 'bills', modelId: 'matching', name: 'Three-Way Match Voucher', layoutFamily: 'compact', presetTitle: 'PURCHASE MATCHING VOUCHER' },

  // 10. Expenses (3 models)
  { category: 'expenses', modelId: 'reimbursement', name: 'Expense Reimbursement Voucher', layoutFamily: 'standard', presetTitle: 'EXPENSE REIMBURSEMENT VOUCHER' },
  { category: 'expenses', modelId: 'petty-cash', name: 'Petty Cash Voucher', layoutFamily: 'compact', presetTitle: 'PETTY CASH DISBURSEMENT SLIP' },
  { category: 'expenses', modelId: 'project-billable', name: 'Project-Billable Expense Voucher', layoutFamily: 'ledger', presetTitle: 'PROJECT EXPENSE VOUCHER' },

  // 11. Vendor Credits (3 models)
  { category: 'vendor-credits', modelId: 'debit-note', name: 'Statutory Debit Note', layoutFamily: 'standard', presetTitle: 'DEBIT NOTE' },
  { category: 'vendor-credits', modelId: 'purchase-return', name: 'Purchase Return Note', layoutFamily: 'ledger', presetTitle: 'PURCHASE RETURN MEMO' },
  { category: 'vendor-credits', modelId: 'adjustment-memo', name: 'AP Adjustment Memo', layoutFamily: 'compact', presetTitle: 'VENDOR ADJUSTMENT MEMO' },

  // 12. Vendor Payments (3 models)
  { category: 'vendor-payments', modelId: 'remittance-advice', name: 'Remittance Advice', layoutFamily: 'standard', presetTitle: 'PAYMENT REMITTANCE ADVICE' },
  { category: 'vendor-payments', modelId: 'cheque-disbursement', name: 'Cheque Disbursement Voucher', layoutFamily: 'compact', presetTitle: 'CHEQUE DISBURSEMENT VOUCHER' },
  { category: 'vendor-payments', modelId: 'allocation-advice', name: 'Bill Allocation Advice', layoutFamily: 'ledger', presetTitle: 'PAYMENT ALLOCATION ADVICE' },

  // 13. Vendor Statements (3 models)
  { category: 'vendor-statements', modelId: 'vendor-ledger', name: 'Vendor Account Ledger', layoutFamily: 'ledger', presetTitle: 'VENDOR STATEMENT OF ACCOUNT' },
  { category: 'vendor-statements', modelId: 'payables-aging', name: 'Payables Aging Schedule', layoutFamily: 'standard', presetTitle: 'PAYABLES AGING REPORT' },
  { category: 'vendor-statements', modelId: 'reconciliation', name: 'Account Reconciliation Statement', layoutFamily: 'compact', presetTitle: 'SUPPLIER RECONCILIATION STATEMENT' },

  // 14. Journals (3 models)
  { category: 'journals', modelId: 'general-voucher', name: 'General Journal Voucher', layoutFamily: 'standard', presetTitle: 'JOURNAL VOUCHER' },
  { category: 'journals', modelId: 'audit-voucher', name: 'Audit Certified Approval Voucher', layoutFamily: 'ledger', presetTitle: 'AUDIT CERTIFIED JOURNAL VOUCHER' },
  { category: 'journals', modelId: 'adjustment-journal', name: 'Adjusting Journal Entry', layoutFamily: 'compact', presetTitle: 'ADJUSTING JOURNAL VOUCHER' },
] as const;

export async function applyDocumentTemplateSchema(client: DbQueryClient): Promise<void> {
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
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )
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
      const isDefault = legacyDefault ? legacyDefault === def.modelId : ALL_42_TEMPLATE_MODELS.find(m => m.category === def.category)?.modelId === def.modelId;

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
