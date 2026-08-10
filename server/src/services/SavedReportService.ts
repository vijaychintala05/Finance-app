import { db } from '../database/db';

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
    const id = `sr-${Date.now()}`;
    await db.query(
      `INSERT INTO saved_reports (id, organization_id, user_id, name, report_type, visibility, is_favorite, config)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        id,
        orgId,
        userId,
        input.name,
        input.reportType,
        input.visibility || 'ORGANIZATION',
        input.isFavorite || false,
        JSON.stringify(input.config),
      ]
    );

    return { id, name: input.name, reportType: input.reportType };
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

  public static async toggleFavorite(orgId: string, reportId: string): Promise<boolean> {
    const res = await db.query(
      `UPDATE saved_reports SET is_favorite = NOT is_favorite WHERE organization_id = $1 AND id = $2 RETURNING is_favorite`,
      [orgId, reportId]
    );
    return res.rows[0]?.is_favorite || false;
  }
}
