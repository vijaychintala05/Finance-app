import { db } from '../database/db';
import { newId } from '../utils/ids';

export interface SavedView {
  id: string;
  organizationId: string;
  userId: string;
  entityType: string;
  name: string;
  filters: any;
  isDefault: boolean;
  sortConfig: any;
  createdAt: string;
}

export class SavedViewsService {
  public static async listViews(
    orgId: string,
    userId: string,
    entityType: string
  ): Promise<SavedView[]> {
    const res = await db.query(
      `SELECT * FROM saved_views
       WHERE organization_id = $1 AND (user_id = $2 OR is_default = TRUE) AND entity_type = $3
       ORDER BY is_default DESC, name ASC`,
      [orgId, userId, entityType]
    );

    return res.rows.map(this.mapRow);
  }

  public static async createView(
    orgId: string,
    userId: string,
    params: {
      entityType: string;
      name: string;
      filters: any;
      isDefault?: boolean;
      sortConfig?: any;
    }
  ): Promise<SavedView> {
    if (!params.name || !params.name.trim()) {
      throw new Error('View name is required');
    }
    if (!params.entityType) {
      throw new Error('Entity type is required');
    }

    const id = newId('view');
    const isDefault = Boolean(params.isDefault);

    if (isDefault) {
      // Clear previous default for this user + entity type
      await db.query(
        `UPDATE saved_views SET is_default = FALSE
         WHERE organization_id = $1 AND user_id = $2 AND entity_type = $3`,
        [orgId, userId, params.entityType]
      );
    }

    const res = await db.query(
      `INSERT INTO saved_views (id, organization_id, user_id, entity_type, name, filters, is_default, sort_config, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
       RETURNING *`,
      [
        id,
        orgId,
        userId,
        params.entityType,
        params.name.trim(),
        JSON.stringify(params.filters || {}),
        isDefault,
        JSON.stringify(params.sortConfig || {}),
      ]
    );

    return this.mapRow(res.rows[0]);
  }

  public static async deleteView(orgId: string, userId: string, viewId: string): Promise<boolean> {
    const res = await db.query(
      `DELETE FROM saved_views
       WHERE organization_id = $1 AND user_id = $2 AND id = $3
       RETURNING id`,
      [orgId, userId, viewId]
    );
    if (res.rows.length === 0) {
      throw new Error('Saved view not found or unauthorized');
    }
    return true;
  }

  private static mapRow(row: any): SavedView {
    let filters = row.filters;
    if (typeof filters === 'string') {
      try { filters = JSON.parse(filters); } catch { filters = {}; }
    }
    let sortConfig = row.sort_config;
    if (typeof sortConfig === 'string') {
      try { sortConfig = JSON.parse(sortConfig); } catch { sortConfig = {}; }
    }

    return {
      id: row.id,
      organizationId: row.organization_id,
      userId: row.user_id,
      entityType: row.entity_type,
      name: row.name,
      filters,
      isDefault: Boolean(row.is_default),
      sortConfig,
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    };
  }
}
