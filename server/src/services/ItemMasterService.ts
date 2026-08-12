import { db } from '../database/db';
import { newId } from '../utils/ids';
import type { QueryClient } from '../accounting/postingEngine';

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

/**
 * Item Reference Source Registry
 * Defines all production persistence tables and columns that store Item Master references.
 *
 * Note on non-item-bearing entities:
 * - Credit Notes and Vendor Credits in FirmBooks are currently amount/adjustment-level financial documents
 *   and do not persist Item Master item_id references.
 */
export interface ItemReferenceSource {
  table: string;
  column: string;
  format: 'RELATIONAL_ID' | 'JSONB_ARRAY';
}

export const ITEM_REFERENCE_REGISTRY: ItemReferenceSource[] = [
  { table: 'invoice_items', column: 'item_id', format: 'RELATIONAL_ID' },
  { table: 'estimates', column: 'line_items', format: 'JSONB_ARRAY' },
  { table: 'estimates', column: 'items', format: 'JSONB_ARRAY' },
  { table: 'invoices', column: 'line_items', format: 'JSONB_ARRAY' },
  { table: 'sales_orders', column: 'line_items', format: 'JSONB_ARRAY' },
  { table: 'purchase_orders', column: 'line_items', format: 'JSONB_ARRAY' },
  { table: 'bills', column: 'line_items', format: 'JSONB_ARRAY' },
  { table: 'delivery_challans', column: 'line_items', format: 'JSONB_ARRAY' },
  { table: 'goods_service_receipts', column: 'line_items', format: 'JSONB_ARRAY' },
  { table: 'recurring_invoice_profiles', column: 'line_items', format: 'JSONB_ARRAY' },
];

export class ItemMasterService {
  private static validateItemData(data: Partial<ItemModel>, isUpdate: boolean = false) {
    if (!isUpdate || data.name !== undefined) {
      if (!data.name || typeof data.name !== 'string' || !data.name.trim()) {
        throw new Error('Item name is required');
      }
      if (data.name.trim().length > 255) throw new Error('Item name cannot exceed 255 characters');
    }

    if (data.unit !== undefined) {
      if (typeof data.unit !== 'string' || !data.unit.trim()) {
        throw new Error('Unit cannot be empty');
      }
      if (data.unit.trim().length > 50) throw new Error('Unit cannot exceed 50 characters');
    }

    if (data.salesRate !== undefined && !this.isSafeMoney(data.salesRate)) {
      throw new Error('Sales rate must be a safe non-negative amount with no more than two decimals');
    }

    if (data.purchaseRate !== undefined && !this.isSafeMoney(data.purchaseRate)) {
      throw new Error('Purchase rate must be a safe non-negative amount with no more than two decimals');
    }

    if (data.gstRate !== undefined) {
      const rate = Number(data.gstRate);
      if (isNaN(rate) || rate < 0 || rate > 100) {
        throw new Error('GST rate must be between 0 and 100');
      }
      if (Math.abs(rate * 100 - Math.round(rate * 100)) > 1e-7) throw new Error('GST rate cannot contain more than two decimals');
    }
    if (data.sku && data.sku.trim().length > 100) throw new Error('SKU cannot exceed 100 characters');
    if (data.description && data.description.length > 10000) throw new Error('Item description cannot exceed 10000 characters');
    if (data.hsnSac && data.hsnSac.length > 50) throw new Error('HSN/SAC cannot exceed 50 characters');
  }

  private static isSafeMoney(value: unknown): boolean {
    const amount = Number(value);
    return Number.isFinite(amount) && amount >= 0 && Number.isSafeInteger(Math.round(amount * 100)) && Math.abs(amount * 100 - Math.round(amount * 100)) <= 1e-7;
  }

  private static async resolveAccount(
    client: QueryClient,
    orgId: string,
    accountId: string | undefined,
    defaultCode: string,
    allowedTypes: string[],
    label: string
  ): Promise<string> {
    let account = accountId
      ? await client.query(`SELECT id, type FROM accounts WHERE organization_id = $1 AND id = $2 AND status = 'Active'`, [orgId, accountId])
      : await client.query(`SELECT id, type FROM accounts WHERE organization_id = $1 AND code = $2 AND status = 'Active'`, [orgId, defaultCode]);
    if (account.rows.length === 0 && accountId && /^acc-[A-Za-z0-9._-]{1,32}$/.test(accountId)) {
      const legacyCode = accountId.slice(4);
      account = await client.query(
        `SELECT id, type FROM accounts WHERE organization_id = $1 AND code = $2 AND status = 'Active'`,
        [orgId, legacyCode]
      );
    }
    if (account.rows.length !== 1 || !allowedTypes.includes(account.rows[0].type)) {
      throw new Error(`${label} account must be an active ${allowedTypes.join(' or ')} account in this organization`);
    }
    return account.rows[0].id;
  }

  public static async createItem(orgId: string, data: Partial<ItemModel>, actorId: string = 'system'): Promise<ItemModel> {
    this.validateItemData(data, false);

    const id = newId('item');
    const now = new Date().toISOString();
    const unit = (data.unit && data.unit.trim()) ? data.unit.trim() : 'Pcs';

    await db.transaction(async (client) => {
      if (data.sku?.trim()) {
        const duplicate = await client.query(`SELECT id FROM items WHERE organization_id = $1 AND LOWER(sku) = $2`, [orgId, data.sku.trim().toLowerCase()]);
        if (duplicate.rows.length > 0) throw new Error(`SKU "${data.sku}" already exists in this organization`);
      }
      const salesAccountId = await this.resolveAccount(client, orgId, data.salesAccountId, '4000', ['Income'], 'Sales');
      const purchaseAccountId = await this.resolveAccount(client, orgId, data.purchaseAccountId, '6000', ['Expense', 'Asset'], 'Purchase');
      const state = {
        name: data.name!.trim(), sku: data.sku ? data.sku.trim() : '', unit,
        salesRate: Number(data.salesRate || 0), purchaseRate: Number(data.purchaseRate || 0),
        gstRate: Number(data.gstRate || 0), salesAccountId, purchaseAccountId,
        isActive: data.isActive !== undefined ? Boolean(data.isActive) : true,
      };
      await client.query(
        `INSERT INTO items (id, organization_id, name, sku, description, hsn_sac, unit, sales_rate, purchase_rate, gst_rate, sales_account_id, purchase_account_id, is_active, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
        [id, orgId, state.name, state.sku, data.description || '', data.hsnSac || '', state.unit, state.salesRate, state.purchaseRate, state.gstRate, state.salesAccountId, state.purchaseAccountId, state.isActive, now, now]
      );
      await client.query(
        `INSERT INTO audit_logs (id, organization_id, user_id, action, entity_type, entity_id, after_state)
         VALUES ($1, $2, $3, 'ITEM_CREATED', 'Item', $4, $5)`,
        [newId('aud'), orgId, actorId, id, JSON.stringify(state)]
      );
    });

    return this.getItem(orgId, id);
  }

  public static async updateItem(orgId: string, id: string, data: Partial<ItemModel>, actorId: string = 'system'): Promise<ItemModel> {
    this.validateItemData(data, true);

    const now = new Date().toISOString();
    await db.transaction(async (client) => {
      const before = await client.query(`SELECT * FROM items WHERE organization_id = $1 AND id = $2 FOR UPDATE`, [orgId, id]);
      if (before.rows.length !== 1) throw new Error(`Item ${id} not found`);
      if (data.sku?.trim()) {
        const duplicate = await client.query(`SELECT id FROM items WHERE organization_id = $1 AND LOWER(sku) = $2 AND id != $3`, [orgId, data.sku.trim().toLowerCase(), id]);
        if (duplicate.rows.length > 0) throw new Error(`SKU "${data.sku}" already exists in this organization`);
      }
      const salesAccountId = data.salesAccountId !== undefined
        ? await this.resolveAccount(client, orgId, data.salesAccountId, '4000', ['Income'], 'Sales')
        : null;
      const purchaseAccountId = data.purchaseAccountId !== undefined
        ? await this.resolveAccount(client, orgId, data.purchaseAccountId, '6000', ['Expense', 'Asset'], 'Purchase')
        : null;
      await client.query(
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
        salesAccountId,
        purchaseAccountId,
        data.isActive !== undefined ? Boolean(data.isActive) : null,
        now,
        orgId,
        id,
        ]
      );
      await client.query(
        `INSERT INTO audit_logs (id, organization_id, user_id, action, entity_type, entity_id, before_state, after_state)
         VALUES ($1, $2, $3, 'ITEM_UPDATED', 'Item', $4, $5, $6)`,
        [newId('aud'), orgId, actorId, id, JSON.stringify(before.rows[0]), JSON.stringify(data)]
      );
    });

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

  public static async deleteItem(orgId: string, id: string, actorId: string = 'system'): Promise<{ success: boolean; archived: boolean; message: string }> {
    return db.transaction(async (client) => {
      const before = await client.query(`SELECT * FROM items WHERE organization_id = $1 AND id = $2 FOR UPDATE`, [orgId, id]);
      if (before.rows.length !== 1) throw new Error(`Item ${id} not found`);
      // Financial master IDs are never physically deleted. A permanent delete
      // can race with source-document creation and destroys future audit joins.
      await client.query(`UPDATE items SET is_active = FALSE, updated_at = $1 WHERE organization_id = $2 AND id = $3`, [new Date().toISOString(), orgId, id]);
      await client.query(
        `INSERT INTO audit_logs (id, organization_id, user_id, action, entity_type, entity_id, before_state, after_state)
         VALUES ($1, $2, $3, 'ITEM_ARCHIVED', 'Item', $4, $5, $6)`,
        [newId('aud'), orgId, actorId, id, JSON.stringify(before.rows[0]), JSON.stringify({ isActive: false })]
      );
      return {
        success: true,
        archived: true,
        message: `Item ${id} was archived to protect financial history.`,
      };
    });
  }
}
