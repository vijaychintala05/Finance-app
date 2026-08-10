import { db } from '../database/db';

export interface ItemModel {
  id: string;
  organizationId: string;
  name: string;
  sku?: string;
  description?: string;
  hsnSac?: string;
  unit: string;
  salesRate: number;
  purchaseRate: number;
  gstRate: number;
  salesAccountId?: string;
  purchaseAccountId?: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export class ItemMasterService {
  public static async createItem(orgId: string, data: Partial<ItemModel>): Promise<ItemModel> {
    const id = data.id || `item-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const now = new Date().toISOString();

    await db.query(
      `INSERT INTO items (id, organization_id, name, sku, description, hsn_sac, unit, sales_rate, purchase_rate, gst_rate, sales_account_id, purchase_account_id, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      [
        id,
        orgId,
        data.name || 'Unnamed Item',
        data.sku || '',
        data.description || '',
        data.hsnSac || '',
        data.unit || 'Pcs',
        data.salesRate || 0,
        data.purchaseRate || 0,
        data.gstRate || 0,
        data.salesAccountId || 'acc-sales-rev',
        data.purchaseAccountId || 'acc-cogs',
        data.isActive !== undefined ? data.isActive : true,
        now,
        now,
      ]
    );

    return {
      id,
      organizationId: orgId,
      name: data.name || 'Unnamed Item',
      sku: data.sku,
      description: data.description,
      hsnSac: data.hsnSac,
      unit: data.unit || 'Pcs',
      salesRate: data.salesRate || 0,
      purchaseRate: data.purchaseRate || 0,
      gstRate: data.gstRate || 0,
      salesAccountId: data.salesAccountId || 'acc-sales-rev',
      purchaseAccountId: data.purchaseAccountId || 'acc-cogs',
      isActive: data.isActive !== undefined ? data.isActive : true,
      createdAt: now,
      updatedAt: now,
    };
  }

  public static async updateItem(orgId: string, id: string, data: Partial<ItemModel>): Promise<ItemModel> {
    const now = new Date().toISOString();

    await db.query(
      `UPDATE items
       SET name = COALESCE($1, name),
           sku = COALESCE($2, sku),
           description = COALESCE($3, description),
           hsn_sac = COALESCE($4, hsn_sac),
           unit = COALESCE($5, unit),
           sales_rate = COALESCE($6, sales_rate),
           purchase_rate = COALESCE($7, purchase_rate),
           gst_rate = COALESCE($8, gst_rate),
           sales_account_id = COALESCE($9, sales_account_id),
           purchase_account_id = COALESCE($10, purchase_account_id),
           is_active = COALESCE($11, is_active),
           updated_at = $12
       WHERE organization_id = $13 AND id = $14`,
      [
        data.name,
        data.sku,
        data.description,
        data.hsnSac,
        data.unit,
        data.salesRate,
        data.purchaseRate,
        data.gstRate,
        data.salesAccountId,
        data.purchaseAccountId,
        data.isActive,
        now,
        orgId,
        id,
      ]
    );

    return this.getItem(orgId, id);
  }

  public static async getItem(orgId: string, id: string): Promise<ItemModel> {
    const res = await db.query(`SELECT * FROM items WHERE organization_id = $1 AND id = $2`, [orgId, id]);
    if (res.rows.length === 0) throw new Error(`Item ${id} not found`);
    const r = res.rows[0];
    return {
      id: r.id,
      organizationId: r.organization_id,
      name: r.name,
      sku: r.sku,
      description: r.description,
      hsnSac: r.hsn_sac,
      unit: r.unit,
      salesRate: Number(r.sales_rate || 0),
      purchaseRate: Number(r.purchase_rate || 0),
      gstRate: Number(r.gst_rate || 0),
      salesAccountId: r.sales_account_id,
      purchaseAccountId: r.purchase_account_id,
      isActive: r.is_active,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }

  public static async listItems(orgId: string, queryStr?: string): Promise<ItemModel[]> {
    let sql = `SELECT * FROM items WHERE organization_id = $1`;
    const params: any[] = [orgId];

    if (queryStr && queryStr.trim().length > 0) {
      sql += ` AND (LOWER(name) LIKE $2 OR LOWER(sku) LIKE $2 OR LOWER(hsn_sac) LIKE $2)`;
      params.push(`%${queryStr.toLowerCase().trim()}%`);
    }

    sql += ` ORDER BY name ASC`;
    const res = await db.query(sql, params);

    return res.rows.map((r) => ({
      id: r.id,
      organizationId: r.organization_id,
      name: r.name,
      sku: r.sku,
      description: r.description,
      hsnSac: r.hsn_sac,
      unit: r.unit,
      salesRate: Number(r.sales_rate || 0),
      purchaseRate: Number(r.purchase_rate || 0),
      gstRate: Number(r.gst_rate || 0),
      salesAccountId: r.sales_account_id,
      purchaseAccountId: r.purchase_account_id,
      isActive: r.is_active,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  }

  public static async deleteItem(orgId: string, id: string): Promise<void> {
    await db.query(`DELETE FROM items WHERE organization_id = $1 AND id = $2`, [orgId, id]);
  }
}
