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
  private static validateItemData(data: Partial<ItemModel>, isUpdate: boolean = false) {
    if (!isUpdate || data.name !== undefined) {
      if (!data.name || typeof data.name !== 'string' || !data.name.trim()) {
        throw new Error('Item name is required');
      }
    }

    if (data.unit !== undefined) {
      if (typeof data.unit !== 'string' || !data.unit.trim()) {
        throw new Error('Unit cannot be empty');
      }
    }

    if (data.salesRate !== undefined && (isNaN(Number(data.salesRate)) || Number(data.salesRate) < 0)) {
      throw new Error('Sales rate must be a non-negative number');
    }

    if (data.purchaseRate !== undefined && (isNaN(Number(data.purchaseRate)) || Number(data.purchaseRate) < 0)) {
      throw new Error('Purchase rate must be a non-negative number');
    }

    if (data.gstRate !== undefined && (isNaN(Number(data.gstRate)) || Number(data.gstRate) < 0)) {
      throw new Error('GST rate must be a non-negative number');
    }
  }

  private static async validateSkuUniqueness(orgId: string, sku: string | undefined, currentItemId?: string) {
    if (!sku || !sku.trim()) return;
    const trimmedSku = sku.trim().toLowerCase();

    let sql = `SELECT id FROM items WHERE organization_id = $1 AND LOWER(sku) = $2`;
    const params: any[] = [orgId, trimmedSku];

    if (currentItemId) {
      sql += ` AND id != $3`;
      params.push(currentItemId);
    }

    const res = await db.query(sql, params);
    if (res.rows.length > 0) {
      throw new Error(`SKU "${sku}" already exists in this organization`);
    }
  }

  public static async createItem(orgId: string, data: Partial<ItemModel>): Promise<ItemModel> {
    this.validateItemData(data, false);
    await this.validateSkuUniqueness(orgId, data.sku);

    const id = data.id || `item-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const now = new Date().toISOString();
    const unit = (data.unit && data.unit.trim()) ? data.unit.trim() : 'Pcs';

    await db.query(
      `INSERT INTO items (id, organization_id, name, sku, description, hsn_sac, unit, sales_rate, purchase_rate, gst_rate, sales_account_id, purchase_account_id, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      [
        id,
        orgId,
        data.name!.trim(),
        data.sku ? data.sku.trim() : '',
        data.description || '',
        data.hsnSac || '',
        unit,
        Number(data.salesRate || 0),
        Number(data.purchaseRate || 0),
        Number(data.gstRate || 0),
        data.salesAccountId || 'acc-sales-rev',
        data.purchaseAccountId || 'acc-cogs',
        data.isActive !== undefined ? Boolean(data.isActive) : true,
        now,
        now,
      ]
    );

    return this.getItem(orgId, id);
  }

  public static async updateItem(orgId: string, id: string, data: Partial<ItemModel>): Promise<ItemModel> {
    await this.getItem(orgId, id); // verify item exists in org
    this.validateItemData(data, true);
    if (data.sku !== undefined) {
      await this.validateSkuUniqueness(orgId, data.sku, id);
    }

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
        data.name ? data.name.trim() : null,
        data.sku !== undefined ? data.sku.trim() : null,
        data.description !== undefined ? data.description : null,
        data.hsnSac !== undefined ? data.hsnSac : null,
        data.unit ? data.unit.trim() : null,
        data.salesRate !== undefined ? Number(data.salesRate) : null,
        data.purchaseRate !== undefined ? Number(data.purchaseRate) : null,
        data.gstRate !== undefined ? Number(data.gstRate) : null,
        data.salesAccountId !== undefined ? data.salesAccountId : null,
        data.purchaseAccountId !== undefined ? data.purchaseAccountId : null,
        data.isActive !== undefined ? Boolean(data.isActive) : null,
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

  public static async listItems(orgId: string, queryStr?: string, includeInactive: boolean = false): Promise<ItemModel[]> {
    let sql = `SELECT * FROM items WHERE organization_id = $1`;
    const params: any[] = [orgId];

    if (!includeInactive) {
      sql += ` AND is_active = TRUE`;
    }

    if (queryStr && queryStr.trim().length > 0) {
      const idx = params.length + 1;
      sql += ` AND (LOWER(name) LIKE $${idx} OR LOWER(sku) LIKE $${idx} OR LOWER(hsn_sac) LIKE $${idx})`;
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

  public static async deleteItem(orgId: string, id: string): Promise<{ success: boolean; archived: boolean; message: string }> {
    await this.getItem(orgId, id); // Verify item exists in org

    // Safe reference check across estimates and other document tables
    let isReferenced = false;
    try {
      const checkEstimates = await db.query(
        `SELECT 1 FROM estimates WHERE organization_id = $1 AND (CAST(items AS TEXT) LIKE $2 OR CAST(line_items AS TEXT) LIKE $2) LIMIT 1`,
        [orgId, `%${id}%`]
      );
      if (checkEstimates.rows.length > 0) isReferenced = true;
    } catch {
      // Ignore if table/column does not exist
    }

    if (!isReferenced) {
      try {
        const checkInvoices = await db.query(
          `SELECT 1 FROM invoice_items WHERE organization_id = $1 AND (description LIKE $2 OR id = $3) LIMIT 1`,
          [orgId, `%${id}%`, id]
        );
        if (checkInvoices.rows.length > 0) isReferenced = true;
      } catch {
        // Ignore
      }
    }

    if (isReferenced) {
      // Deactivate/archive to protect historical commercial documents
      await db.query(`UPDATE items SET is_active = FALSE, updated_at = $1 WHERE organization_id = $2 AND id = $3`, [new Date().toISOString(), orgId, id]);
      return {
        success: true,
        archived: true,
        message: `Item ${id} is referenced in historical documents and has been archived instead of permanently deleted.`,
      };
    } else {
      await db.query(`DELETE FROM items WHERE organization_id = $1 AND id = $2`, [orgId, id]);
      return {
        success: true,
        archived: false,
        message: `Item ${id} deleted successfully.`,
      };
    }
  }
}
