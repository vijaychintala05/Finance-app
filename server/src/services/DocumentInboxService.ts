import { db } from '../database/db';
import { newId } from '../utils/ids';

export interface DocumentInboxItem {
  id: string;
  organizationId: string;
  filename: string;
  fileUrl: string | null;
  mimeType: string | null;
  fileSize: number | null;
  status: 'UPLOADED' | 'PROCESSING' | 'PROCESSED' | 'LINKED' | 'REJECTED';
  ocrData: any;
  linkedDocumentType: string | null;
  linkedDocumentId: string | null;
  uploadedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ListInboxFilters {
  status?: string;
  search?: string;
  linkedType?: string;
  limit?: number;
  offset?: number;
}

export class DocumentInboxService {
  public static async uploadDocument(
    orgId: string,
    params: {
      filename: string;
      fileUrl?: string;
      mimeType?: string;
      fileSize?: number;
      uploadedBy?: string;
      ocrData?: any;
    }
  ): Promise<DocumentInboxItem> {
    if (!orgId) throw new Error('Organization ID is required');
    if (!params.filename) throw new Error('Filename is required');

    const id = newId('doc');
    const now = new Date().toISOString();
    const status = params.ocrData ? 'PROCESSED' : 'UPLOADED';

    const res = await db.query(
      `INSERT INTO document_inbox (
        id, organization_id, filename, file_url, mime_type, file_size,
        status, ocr_data, linked_document_type, linked_document_id,
        uploaded_by, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *`,
      [
        id,
        orgId,
        params.filename,
        params.fileUrl || null,
        params.mimeType || 'application/pdf',
        params.fileSize || 0,
        status,
        params.ocrData ? JSON.stringify(params.ocrData) : null,
        null,
        null,
        params.uploadedBy || null,
        now,
        now,
      ]
    );

    return this.mapRow(res.rows[0]);
  }

  public static async listDocuments(
    orgId: string,
    filters: ListInboxFilters = {}
  ): Promise<{ items: DocumentInboxItem[]; total: number }> {
    const conditions = ['organization_id = $1'];
    const values: any[] = [orgId];
    let idx = 2;

    if (filters.status && filters.status !== 'ALL') {
      conditions.push(`status = $${idx++}`);
      values.push(filters.status.toUpperCase());
    }

    if (filters.linkedType) {
      conditions.push(`linked_document_type = $${idx++}`);
      values.push(filters.linkedType.toUpperCase());
    }

    if (filters.search && filters.search.trim()) {
      conditions.push(`(filename ILIKE $${idx} OR ocr_data::text ILIKE $${idx})`);
      values.push(`%${filters.search.trim()}%`);
      idx++;
    }

    const whereClause = conditions.join(' AND ');

    const countRes = await db.query(
      `SELECT COUNT(*) as count FROM document_inbox WHERE ${whereClause}`,
      values
    );
    const total = parseInt(countRes.rows[0]?.count || '0', 10);

    const limit = filters.limit ? Math.min(Math.max(Number(filters.limit), 1), 100) : 50;
    const offset = filters.offset ? Math.max(Number(filters.offset), 0) : 0;

    const listRes = await db.query(
      `SELECT * FROM document_inbox
       WHERE ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...values, limit, offset]
    );

    return {
      items: listRes.rows.map((r: any) => this.mapRow(r)),
      total,
    };
  }

  public static async getDocument(orgId: string, id: string): Promise<DocumentInboxItem> {
    const res = await db.query(
      `SELECT * FROM document_inbox WHERE organization_id = $1 AND id = $2`,
      [orgId, id]
    );
    if (res.rows.length === 0) {
      throw new Error('Document not found in inbox');
    }
    return this.mapRow(res.rows[0]);
  }

  public static async updateOcrData(
    orgId: string,
    id: string,
    ocrData: any
  ): Promise<DocumentInboxItem> {
    const now = new Date().toISOString();
    const res = await db.query(
      `UPDATE document_inbox
       SET ocr_data = $1,
           status = 'PROCESSED',
           updated_at = $2
       WHERE organization_id = $3 AND id = $4
       RETURNING *`,
      [JSON.stringify(ocrData), now, orgId, id]
    );
    if (res.rows.length === 0) {
      throw new Error('Document not found in inbox');
    }
    return this.mapRow(res.rows[0]);
  }

  public static async linkDocument(
    orgId: string,
    id: string,
    linkedType: 'BILL' | 'EXPENSE' | 'INVOICE',
    linkedId: string
  ): Promise<DocumentInboxItem> {
    const now = new Date().toISOString();
    const res = await db.query(
      `UPDATE document_inbox
       SET linked_document_type = $1,
           linked_document_id = $2,
           status = 'LINKED',
           updated_at = $3
       WHERE organization_id = $4 AND id = $5
       RETURNING *`,
      [linkedType, linkedId, now, orgId, id]
    );
    if (res.rows.length === 0) {
      throw new Error('Document not found in inbox');
    }
    return this.mapRow(res.rows[0]);
  }

  public static async deleteDocument(orgId: string, id: string): Promise<{ success: boolean }> {
    const res = await db.query(
      `DELETE FROM document_inbox WHERE organization_id = $1 AND id = $2 RETURNING id`,
      [orgId, id]
    );
    if (res.rows.length === 0) {
      throw new Error('Document not found in inbox');
    }
    return { success: true };
  }

  private static mapRow(row: any): DocumentInboxItem {
    let parsedOcr = row.ocr_data;
    if (typeof parsedOcr === 'string') {
      try {
        parsedOcr = JSON.parse(parsedOcr);
      } catch {
        parsedOcr = null;
      }
    }

    return {
      id: row.id,
      organizationId: row.organization_id,
      filename: row.filename,
      fileUrl: row.file_url,
      mimeType: row.mime_type,
      fileSize: row.file_size !== null ? Number(row.file_size) : null,
      status: row.status,
      ocrData: parsedOcr,
      linkedDocumentType: row.linked_document_type,
      linkedDocumentId: row.linked_document_id,
      uploadedBy: row.uploaded_by,
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
      updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
    };
  }
}
