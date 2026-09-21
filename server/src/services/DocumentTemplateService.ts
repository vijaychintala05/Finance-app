import crypto from 'crypto';
import { type DbQueryClient, db } from '../database/db';
import { newId } from '../utils/ids';

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

  private static async hasRegistry(client: DbQueryClient): Promise<boolean> {
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
    if (!(await this.hasRegistry(client))) return [];
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
    return result.rows.map((row: any) => this.toRecord(row));
  }

  public static async resolve(
    client: DbQueryClient,
    organizationId: string,
    category: string,
    requestedTemplateId?: string,
  ): Promise<DocumentTemplateRecord | null> {
    if (!(await this.hasRegistry(client))) return null;
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
            LIMIT 1`,
          [organizationId, category]
        );
    return result.rows[0] ? this.toRecord(result.rows[0]) : null;
  }

  public static async setOrganizationDefault(client: DbQueryClient, organizationId: string, category: string, templateId: string): Promise<DocumentTemplateRecord> {
    if (!(await this.hasRegistry(client))) throw new Error('Versioned document templates are unavailable');
    return db.transaction(async (tx) => {
      const template = await tx.query(
        `SELECT id, organization_id, category, model_id, name, paper_size, orientation,
                layout_family, is_active, is_system, current_version_id
           FROM document_templates
          WHERE organization_id = $1 AND category = $2 AND (id = $3 OR model_id = $3)
            AND is_active = TRUE FOR UPDATE`,
        [organizationId, category, templateId]
      );
      if (!template.rows[0]) throw new Error('Document template not found');
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
      const resolved = await this.resolve(tx, organizationId, category, template.rows[0].id);
      if (!resolved) throw new Error('Document template default could not be resolved');
      return resolved;
    });
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
