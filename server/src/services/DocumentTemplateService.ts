import crypto from 'crypto';
import { type DbQueryClient, db } from '../database/db';
import { AuditTrailService } from '../security/AuditTrailService';
import { newId } from '../utils/ids';
import { ALL_44_TEMPLATE_MODELS, DEFAULT_TEMPLATE_MODEL_BY_CATEGORY, seedAndMigrateOrganizationTemplates } from '../database/documentTemplateSchema';

export interface DocumentTemplateRecord {
  id: string;
  organizationId: string;
  category: string;
  modelId: string;
  name: string;
  paperSize: string;
  orientation: string;
  layoutFamily: string;
  isActive: boolean;
  isSystem: boolean;
  currentVersionId?: string;
  configuration: Record<string, any>;
}

/**
 * Versioned template storage is deliberately kept behind this service.  The
 * legacy organization_profiles JSON remains a read fallback while existing
 * tenants are migrated, but new renders resolve through these records.
 */
export class DocumentTemplateService {
  private static registryAvailable = new WeakMap<object, boolean>();

  public static async hasRegistry(client: DbQueryClient): Promise<boolean> {
    if (db.isMemoryMode()) return false;
    const cached = this.registryAvailable.get(client as object);
    if (cached !== undefined) return cached;
    try {
      const result = await client.query("SELECT to_regclass('public.document_templates') AS name");
      const available = Boolean(result.rows[0]?.name);
      this.registryAvailable.set(client as object, available);
      return available;
    } catch {
      this.registryAvailable.set(client as object, false);
      return false;
    }
  }

  public static async list(client: DbQueryClient, organizationId: string, category: string): Promise<DocumentTemplateRecord[]> {
    if (await this.hasRegistry(client)) {
      const result = await client.query(
        `SELECT t.id, t.organization_id, t.category, t.model_id, t.name,
                t.paper_size, t.orientation, t.layout_family, t.is_active,
                t.is_system, t.current_version_id, v.configuration
           FROM document_templates t
           LEFT JOIN document_template_versions v ON v.id = t.current_version_id
          WHERE t.organization_id = $1 AND t.category = $2 AND t.is_active = TRUE
          ORDER BY t.is_system DESC, t.name ASC`,
        [organizationId, category]
      );
      if (result.rows.length) {
        return result.rows.map((row: any) => this.toRecord(row));
      }
    }

    // Built-in fallback when registry table is empty or unmigrated
    const profileRes = await client.query(
      `SELECT document_templates FROM organization_profiles WHERE organization_id = $1`,
      [organizationId]
    );
    let docTemplates: Record<string, any> = {};
    if (profileRes.rows[0]?.document_templates) {
      const dt = profileRes.rows[0].document_templates;
      docTemplates = typeof dt === 'string' ? JSON.parse(dt) : dt;
    }
    const catConfig = docTemplates[category] || {};

    const models = ALL_44_TEMPLATE_MODELS.filter((m) => m.category === category);
    return models.map((def) => ({
      id: `${category}-${def.modelId}`,
      organizationId,
      category,
      modelId: def.modelId,
      name: def.name,
      paperSize: 'A4',
      orientation: 'portrait',
      layoutFamily: def.layoutFamily,
      isActive: true,
      isSystem: true,
      configuration: {
        templateTitle: catConfig.templateTitle || def.presetTitle,
        ...catConfig,
      },
    }));
  }

  public static async resolve(
    client: DbQueryClient,
    organizationId: string,
    category: string,
    requestedTemplateId?: string,
  ): Promise<DocumentTemplateRecord | null> {
    if (await this.hasRegistry(client)) {
      const result = requestedTemplateId
        ? await client.query(
            `SELECT t.id, t.organization_id, t.category, t.model_id, t.name,
                    t.paper_size, t.orientation, t.layout_family, t.is_active,
                    t.is_system, t.current_version_id, v.configuration
               FROM document_templates t
               LEFT JOIN document_template_versions v ON v.id = t.current_version_id
              WHERE t.organization_id = $1 AND t.category = $2
                AND t.is_active = TRUE AND (t.id = $3 OR t.model_id = $3)
              LIMIT 1`,
            [organizationId, category, requestedTemplateId]
          )
        : await client.query(
            `SELECT t.id, t.organization_id, t.category, t.model_id, t.name,
                    t.paper_size, t.orientation, t.layout_family, t.is_active,
                    t.is_system, t.current_version_id, v.configuration
               FROM document_templates t
               JOIN document_template_assignments a
                 ON a.template_id = t.id
                AND a.organization_id = t.organization_id
                AND a.category = t.category
                AND a.entity_type = 'ORGANIZATION'
                AND a.entity_id IS NULL
              LEFT JOIN document_template_versions v ON v.id = t.current_version_id
              WHERE t.organization_id = $1 AND t.category = $2 AND t.is_active = TRUE
              ORDER BY a.updated_at DESC NULLS LAST, a.created_at DESC NULLS LAST, a.id DESC
              LIMIT 1`,
            [organizationId, category]
          );
      if (result.rows[0]) return this.toRecord(result.rows[0]);
      if (requestedTemplateId) return null;
    }

    // Built-in fallback
    const profileRes = await client.query(
      `SELECT document_templates FROM organization_profiles WHERE organization_id = $1`,
      [organizationId]
    );
    let docTemplates: Record<string, any> = {};
    if (profileRes.rows[0]?.document_templates) {
      const dt = profileRes.rows[0].document_templates;
      docTemplates = typeof dt === 'string' ? JSON.parse(dt) : dt;
    }
    const catConfig = docTemplates[category] || {};
    const targetModelId = requestedTemplateId || catConfig.defaultTemplate || ALL_44_TEMPLATE_MODELS.find((m) => m.category === category)?.modelId || 'standard';

    const matchedDef = ALL_44_TEMPLATE_MODELS.find((m) => m.category === category && (m.modelId === targetModelId || `${category}-${m.modelId}` === targetModelId));
    if (requestedTemplateId && !matchedDef) return null;
    const def = matchedDef
      || ALL_44_TEMPLATE_MODELS.find((m) => m.category === category)
      || { category, modelId: targetModelId, name: 'Default Template', layoutFamily: 'standard', presetTitle: 'DOCUMENT' };

    return {
      id: `${category}-${def.modelId}`,
      organizationId,
      category,
      modelId: def.modelId,
      name: def.name,
      paperSize: 'A4',
      orientation: 'portrait',
      layoutFamily: def.layoutFamily,
      isActive: true,
      isSystem: true,
      configuration: {
        templateTitle: catConfig.templateTitle || def.presetTitle,
        ...catConfig,
      },
    };
  }

  public static async setOrganizationDefault(client: DbQueryClient, organizationId: string, category: string, templateId: string, userId: string): Promise<DocumentTemplateRecord> {
    const cleanTemplateId = templateId.replace(new RegExp(`^${category}-`), '');
    const modelDef = ALL_44_TEMPLATE_MODELS.find((m) => m.category === category && (m.modelId === cleanTemplateId || m.modelId === templateId));

    if (await this.hasRegistry(client)) {
      return db.transaction(async (tx) => {
        await tx.query('SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))', [organizationId, 'document-template-profile']);
        const template = await tx.query(
          `SELECT id, organization_id, category, model_id, name, paper_size, orientation,
                  layout_family, is_active, is_system, current_version_id
             FROM document_templates
            WHERE organization_id = $1 AND category = $2 AND (id = $3 OR model_id = $3 OR model_id = $4)
              AND is_active = TRUE FOR UPDATE`,
          [organizationId, category, templateId, cleanTemplateId]
        );
        if (!template.rows[0]) throw new Error(`Document template not found: ${templateId}`);
        await tx.query(
          `DELETE FROM document_template_assignments
            WHERE organization_id = $1 AND category = $2 AND entity_type = 'ORGANIZATION' AND entity_id IS NULL`,
          [organizationId, category]
        );
        await tx.query(
          `INSERT INTO document_template_assignments (id, organization_id, category, template_id, entity_type, entity_id)
           VALUES ($1, $2, $3, $4, 'ORGANIZATION', NULL)`,
          [newId('asgn'), organizationId, category, template.rows[0].id]
        );

        // Keep profile JSON synchronized
        await this.syncProfileDefault(tx, organizationId, category, template.rows[0].model_id);
        await AuditTrailService.appendBatchInTransaction(tx, organizationId, [{ userId, action: 'DOCUMENT_TEMPLATE_DEFAULT_SET', entityType: 'DocumentTemplate', entityId: template.rows[0].id, afterState: { category, modelId: template.rows[0].model_id } }], { strict: true });

        const resolved = await this.resolve(tx, organizationId, category, template.rows[0].id);
        if (!resolved) throw new Error('Document template default could not be resolved');
        return resolved;
      });
    }

    // In-memory or unmigrated mode: update organization_profiles
    if (!modelDef) throw new Error(`Document template not found: ${templateId}`);
    return db.transaction(async (tx) => {
      await this.syncProfileDefault(tx, organizationId, category, modelDef.modelId);
      const resolved = await this.resolve(tx, organizationId, category, modelDef.modelId);
      if (!resolved) throw new Error('Document template default could not be resolved');
      await AuditTrailService.appendBatchInTransaction(tx, organizationId, [{ userId, action: 'DOCUMENT_TEMPLATE_DEFAULT_SET', entityType: 'DocumentTemplate', entityId: resolved.id, afterState: { category, modelId: resolved.modelId } }], { strict: true });
      return resolved;
    });
  }

  public static async updateConfiguration(client: DbQueryClient, organizationId: string, category: string, templateId: string, configuration: Record<string, unknown>, userId: string): Promise<DocumentTemplateRecord> {
    if (!configuration || typeof configuration !== 'object' || Array.isArray(configuration)) throw new Error('Template configuration must be an object');
    const entries = Object.entries(configuration);
    if (entries.length > 64 || JSON.stringify(configuration).length > 16_384) throw new Error('Template configuration exceeds the allowed size');
    const booleanKeys = new Set([
      'showHsnSac', 'showDiscount', 'showTaxBreakdown', 'showBankDetails', 'showUpiQr', 'showPricing', 'showTransportDetails', 'showShippingAddress',
      'showVendorTerms', 'showInvoiceAllocations', 'showPaymentModeBadge', 'showAgingBuckets', 'showRunningBalance', 'showNarration', 'showDebitCreditTotals',
      'showVehicleDetails', 'showEWayBill', 'showReceiverAck', 'showInvoicesSettled', 'showThreeTierSignatures', 'showIncoterms', 'showWatermark',
      'showExpiryDate', 'showClientAcceptance', 'showScopeOfWork', 'showPoNumber', 'showDeliveryDate', 'hideRatesInChallan', 'showPackageDetails',
      'showOriginalInvoiceRef', 'showReturnReason', 'showAmountInWords', 'showVendorGstin', 'showUtrReference', 'showStatementPeriod', 'showOpeningBalance',
      'showVendorInvoiceRef', 'showItcTag', 'showAccountAllocation', 'showExpenseCategory', 'showClaimantName', 'showReimbursementStatus', 'showReceiptsAttached',
      'showOriginalBillRef', 'showDebitReason', 'showBillsSettled', 'showTdsDeduction', 'showPayablesLedger', 'showDoubleEntry', 'showPaidStamp',
    ]);
    const stringKeys = new Set(['templateTitle', 'exportFileNamePattern', 'signatoryTitle', 'termsAndConditions', 'footerNote', 'watermarkText', 'primaryColor', 'accentColor', 'fontFamily', 'paperSize', 'orientation', 'headerLayout']);
    const supportedKeys = new Set([...booleanKeys, ...stringKeys]);
    for (const [key, value] of entries) {
      if (!supportedKeys.has(key)) throw new Error(`Unsupported template configuration key: ${key}`);
      if (booleanKeys.has(key) && typeof value !== 'boolean') throw new Error(`Template configuration value must be boolean: ${key}`);
      if (stringKeys.has(key) && typeof value !== 'string') throw new Error(`Template configuration value must be text: ${key}`);
      if (typeof value === 'string' && value.length > 4_000) throw new Error(`Template configuration value is too long: ${key}`);
      if ((key === 'primaryColor' || key === 'accentColor') && !/^#[0-9a-fA-F]{6}$/.test(String(value))) throw new Error(`Template color is invalid: ${key}`);
      if (key === 'fontFamily' && !['Helvetica', 'Courier', 'Times-Roman'].includes(String(value))) throw new Error('Template font is unsupported');
      if (key === 'paperSize' && !['A3', 'A4', 'A5', 'Letter', 'Legal'].includes(String(value))) throw new Error('Template paper size is unsupported');
      if (key === 'orientation' && !['portrait', 'landscape'].includes(String(value))) throw new Error('Template orientation is unsupported');
      if (key === 'headerLayout' && !['split', 'centered'].includes(String(value))) throw new Error('Template header layout is unsupported');
    }
    if (!(await this.hasRegistry(client))) throw new Error('Versioned document templates are not available');
    return db.transaction(async (tx) => {
      const result = await tx.query(
        `SELECT t.id, t.organization_id, t.category, t.model_id, t.name, t.paper_size, t.orientation, t.layout_family, t.is_active, t.is_system, t.current_version_id, v.configuration
           FROM document_templates t LEFT JOIN document_template_versions v ON v.id = t.current_version_id
          WHERE t.organization_id = $1 AND t.category = $2 AND t.is_active = TRUE AND (t.id = $3 OR t.model_id = $3) FOR UPDATE OF t`,
        [organizationId, category, templateId],
      );
      if (!result.rows[0]) throw new Error(`Document template not found: ${templateId}`);
      const current = this.toRecord(result.rows[0]);
      const nextConfiguration = { ...current.configuration, ...configuration };
      const version = await tx.query('SELECT COALESCE(MAX(version_number), 0) + 1 AS next_version FROM document_template_versions WHERE template_id = $1', [current.id]);
      const versionId = newId('tmpl_ver');
      const versionNumber = Number(version.rows[0].next_version);
      await tx.query('INSERT INTO document_template_versions (id, template_id, version_number, configuration, created_by) VALUES ($1, $2, $3, $4, $5)', [versionId, current.id, versionNumber, JSON.stringify(nextConfiguration), userId]);
      await tx.query('UPDATE document_templates SET current_version_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND organization_id = $3', [versionId, current.id, organizationId]);
      await AuditTrailService.appendBatchInTransaction(tx, organizationId, [{ userId, action: 'DOCUMENT_TEMPLATE_CONFIGURATION_UPDATED', entityType: 'DocumentTemplate', entityId: current.id, afterState: { category, modelId: current.modelId, versionId, versionNumber } }], { strict: true });
      const updated = await tx.query('SELECT t.id, t.organization_id, t.category, t.model_id, t.name, t.paper_size, t.orientation, t.layout_family, t.is_active, t.is_system, t.current_version_id, v.configuration FROM document_templates t JOIN document_template_versions v ON v.id = t.current_version_id WHERE t.id = $1 AND t.organization_id = $2', [current.id, organizationId]);
      return this.toRecord(updated.rows[0]);
    });
  }
  public static async restoreBuiltInDefault(client: DbQueryClient, organizationId: string, category: string, userId: string): Promise<DocumentTemplateRecord> {
    const defaultModel = ALL_44_TEMPLATE_MODELS.find((m) => m.category === category && m.modelId === DEFAULT_TEMPLATE_MODEL_BY_CATEGORY[category]);
    if (!defaultModel) throw new Error(`Unsupported category: ${category}`);
    if (await this.hasRegistry(client)) return this.restoreVersionedDefault(organizationId, category, defaultModel, userId);

    // Reset profile JSON for this category
    const profileRes = await client.query(
      `SELECT document_templates FROM organization_profiles WHERE organization_id = $1`,
      [organizationId]
    );
    let docTemplates: Record<string, any> = {};
    if (profileRes.rows[0]?.document_templates) {
      const dt = profileRes.rows[0].document_templates;
      docTemplates = typeof dt === 'string' ? JSON.parse(dt) : dt;
    }
    docTemplates[category] = {
      defaultTemplate: defaultModel.modelId,
      templateTitle: defaultModel.presetTitle,
    };
    await client.query(
      `UPDATE organization_profiles SET document_templates = $1, updated_at = CURRENT_TIMESTAMP WHERE organization_id = $2`,
      [JSON.stringify(docTemplates), organizationId]
    );

    const resolved = await this.resolve(client, organizationId, category, defaultModel.modelId);
    if (!resolved) throw new Error('Failed to restore built-in default');
    return resolved;
  }

  private static async restoreVersionedDefault(
    organizationId: string,
    category: string,
    defaultModel: (typeof ALL_44_TEMPLATE_MODELS)[number],
    userId: string,
  ): Promise<DocumentTemplateRecord> {
    return db.transaction(async (tx) => {
      await tx.query('SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))', [organizationId, 'document-template-profile']);
      await seedAndMigrateOrganizationTemplates(tx, organizationId);
      const templateResult = await tx.query(
        `SELECT id, organization_id, category, model_id, name, paper_size, orientation, layout_family, is_active, is_system, current_version_id
           FROM document_templates
          WHERE organization_id = $1 AND category = $2 AND model_id = $3 AND is_active = TRUE
          FOR UPDATE`,
        [organizationId, category, defaultModel.modelId],
      );
      if (!templateResult.rows[0]) throw new Error(`Built-in document template not found: ${defaultModel.modelId}`);
      const template = templateResult.rows[0];
      const configuration = {
        templateTitle: defaultModel.presetTitle,
        signatoryTitle: 'Authorized Signatory',
        termsAndConditions: 'Payment is due within payment terms.',
        footerNote: 'Thank you for your business.',
        primaryColor: '#1d4ed8',
        accentColor: '#0f172a',
      };
      const nextVersion = await tx.query(
        'SELECT COALESCE(MAX(version_number), 0) + 1 AS next_version FROM document_template_versions WHERE template_id = $1',
        [template.id],
      );
      const versionNumber = Number(nextVersion.rows[0].next_version);
      const versionId = newId('tmpl_ver');
      await tx.query(
        'INSERT INTO document_template_versions (id, template_id, version_number, configuration, created_by) VALUES ($1, $2, $3, $4, $5)',
        [versionId, template.id, versionNumber, JSON.stringify(configuration), userId],
      );
      await tx.query('UPDATE document_templates SET current_version_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND organization_id = $3', [versionId, template.id, organizationId]);
      await tx.query("DELETE FROM document_template_assignments WHERE organization_id = $1 AND category = $2 AND entity_type = 'ORGANIZATION' AND entity_id IS NULL", [organizationId, category]);
      await tx.query("INSERT INTO document_template_assignments (id, organization_id, category, template_id, entity_type, entity_id) VALUES ($1, $2, $3, $4, 'ORGANIZATION', NULL)", [newId('asgn'), organizationId, category, template.id]);
      const profileResult = await tx.query('SELECT document_templates FROM organization_profiles WHERE organization_id = $1 FOR UPDATE', [organizationId]);
      let documentTemplates: Record<string, any> = {};
      const storedTemplates = profileResult.rows[0]?.document_templates;
      if (storedTemplates) {
        try { documentTemplates = typeof storedTemplates === 'string' ? JSON.parse(storedTemplates) : storedTemplates; } catch { documentTemplates = {}; }
      }
      documentTemplates[category] = { ...configuration, defaultTemplate: defaultModel.modelId, templateTitle: configuration.templateTitle || defaultModel.presetTitle };
      await tx.query('UPDATE organization_profiles SET document_templates = $1, updated_at = CURRENT_TIMESTAMP WHERE organization_id = $2', [JSON.stringify(documentTemplates), organizationId]);
      await AuditTrailService.appendBatchInTransaction(tx, organizationId, [{ userId, action: 'DOCUMENT_TEMPLATE_DEFAULT_RESTORED', entityType: 'DocumentTemplate', entityId: template.id, afterState: { category, modelId: defaultModel.modelId, versionId, versionNumber } }], { strict: true });
      const resolved = await tx.query(
        `SELECT t.id, t.organization_id, t.category, t.model_id, t.name, t.paper_size, t.orientation, t.layout_family,
                t.is_active, t.is_system, t.current_version_id, v.configuration
           FROM document_templates t JOIN document_template_versions v ON v.id = t.current_version_id
          WHERE t.organization_id = $1 AND t.id = $2`,
        [organizationId, template.id],
      );
      return this.toRecord(resolved.rows[0]);
    });
  }

  private static async syncProfileDefault(client: DbQueryClient, organizationId: string, category: string, modelId: string): Promise<void> {
    const profileRes = await client.query(
      `SELECT document_templates FROM organization_profiles WHERE organization_id = $1`,
      [organizationId]
    );
    let docTemplates: Record<string, any> = {};
    if (profileRes.rows[0]?.document_templates) {
      const dt = profileRes.rows[0].document_templates;
      docTemplates = typeof dt === 'string' ? JSON.parse(dt) : dt;
    }
    docTemplates[category] = {
      ...(docTemplates[category] || {}),
      defaultTemplate: modelId,
    };
    await client.query(
      `UPDATE organization_profiles SET document_templates = $1, updated_at = CURRENT_TIMESTAMP WHERE organization_id = $2`,
      [JSON.stringify(docTemplates), organizationId]
    );
  }

  public static async persistSnapshot(
    client: DbQueryClient,
    organizationId: string,
    category: string,
    documentId: string,
    template: DocumentTemplateRecord | null,
    renderModel: Record<string, any>,
    pdfByteSize: number,
  ): Promise<void> {
    if (!template || !(await this.hasRegistry(client))) return;
    const sourceDataHash = crypto.createHash('sha256').update(JSON.stringify(renderModel)).digest('hex');
    const existing = await client.query(
      `SELECT id FROM document_render_snapshots
        WHERE organization_id = $1 AND category = $2 AND document_id = $3
          AND template_version_id IS NOT DISTINCT FROM $4 AND source_data_hash = $5
        LIMIT 1`,
      [organizationId, category, documentId, template.currentVersionId || null, sourceDataHash]
    );
    if (existing.rows.length) return;
    await client.query(
      `INSERT INTO document_render_snapshots
        (id, organization_id, category, document_id, template_version_id, source_data_hash, render_model, pdf_byte_size)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [newId('snapshot'), organizationId, category, documentId, template.currentVersionId || null, sourceDataHash, JSON.stringify(renderModel), pdfByteSize]
    );
  }

  private static toRecord(row: any): DocumentTemplateRecord {
    let configuration = row.configuration;
    if (typeof configuration === 'string') {
      try { configuration = JSON.parse(configuration); } catch { configuration = {}; }
    }
    return {
      id: row.id,
      organizationId: row.organization_id,
      category: row.category,
      modelId: row.model_id,
      name: row.name,
      paperSize: row.paper_size,
      orientation: row.orientation,
      layoutFamily: row.layout_family,
      isActive: Boolean(row.is_active),
      isSystem: Boolean(row.is_system),
      currentVersionId: row.current_version_id || undefined,
      configuration: configuration && typeof configuration === 'object' ? configuration : {},
    };
  }
}
