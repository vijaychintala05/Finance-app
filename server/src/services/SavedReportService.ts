import { db } from '../database/db';
import { newId } from '../utils/ids';

export interface SavedReportInput {
  name: string;
  reportType: string;
  visibility?: 'PRIVATE' | 'ORGANIZATION';
  isFavorite?: boolean;
  config: any;
}

export class SavedReportService {
  public static async saveReport(
    orgId: string,
    userId: string,
    input: SavedReportInput
  ): Promise<any> {
    if (!input || typeof input.name !== 'string' || !input.name.trim() || input.name.trim().length > 160) throw new Error('Saved report name is required and cannot exceed 160 characters');
    if (typeof input.reportType !== 'string' || !/^[A-Za-z][A-Za-z0-9_-]{1,79}$/.test(input.reportType)) throw new Error('Saved report type is invalid');
    if (input.visibility && !['PRIVATE', 'ORGANIZATION'].includes(input.visibility)) throw new Error('Saved report visibility is invalid');
    if (!input.config || typeof input.config !== 'object' || Array.isArray(input.config)) throw new Error('Saved report config must be an object');
    const serializedConfig = JSON.stringify(input.config);
    if (Buffer.byteLength(serializedConfig, 'utf8') > 100_000) throw new Error('Saved report config cannot exceed 100 KB');

    const id = newId('sr');
    await db.transaction(async (client) => {
      await client.query(
        `INSERT INTO saved_reports (id, organization_id, user_id, name, report_type, visibility, is_favorite, config)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [id, orgId, userId, input.name.trim(), input.reportType, input.visibility || 'PRIVATE', Boolean(input.isFavorite), serializedConfig]
      );
      await client.query(
        `INSERT INTO audit_logs (id, organization_id, user_id, action, entity_type, entity_id, after_state)
         VALUES ($1, $2, $3, 'SAVED_REPORT_CREATED', 'SavedReport', $4, $5)`,
        [newId('aud'), orgId, userId, id, JSON.stringify({ name: input.name.trim(), reportType: input.reportType, visibility: input.visibility || 'PRIVATE' })]
      );
    });

    return { id, name: input.name.trim(), reportType: input.reportType };
  }

  public static async getSavedReports(orgId: string, userId: string): Promise<any[]> {
    const res = await db.query(
      `SELECT * FROM saved_reports
       WHERE organization_id = $1 AND (visibility = 'ORGANIZATION' OR user_id = $2)
       ORDER BY is_favorite DESC, created_at DESC`,
      [orgId, userId]
    );

    return res.rows.map((r: any) => ({
      ...r,
      config: typeof r.config === 'string' ? JSON.parse(r.config) : r.config,
    }));
  }

  public static async toggleFavorite(orgId: string, userId: string, reportId: string): Promise<boolean> {
    const res = await db.query(
      `UPDATE saved_reports SET is_favorite = NOT is_favorite
        WHERE organization_id = $1 AND id = $2 AND user_id = $3
        RETURNING is_favorite`,
      [orgId, reportId, userId]
    );
    if (res.rows.length !== 1) throw new Error('Saved report not found or is not owned by this user');
    return Boolean(res.rows[0].is_favorite);
  }
}
