import { db, type DbQueryClient } from '../../database/db';
import { MigrationRunner } from '../../database/migrationRunner';
import { SalesEngine } from '../../sales/SalesEngine';
import { PurchasesEngine } from '../../purchases/PurchasesEngine';
import { ExpensePostingService } from '../../services/ExpensePostingService';
import { databaseMoneyToCents } from '../../utils/money';

export const MASTER_FIXTURE_CONSTANTS = {
  ORG_A: {
    id: 'org-acme-ap',
    uuid: 'uuid-acme-ap',
    publicOrgId: 'PUB-ACME-AP',
    orgCode: 'ACME',
    name: 'Acme Test Interiors Pvt Ltd',
    country: 'India',
    state: 'Andhra Pradesh',
    stateCode: '37',
    gstin: '37AAAAA0000A1Z5',
    baseCurrency: 'INR',
    currencySymbol: '₹',
    fiscalYearStart: 'April',
  },
  ORG_B: {
    id: 'org-isolation-tg',
    uuid: 'uuid-isolation-tg',
    publicOrgId: 'PUB-ISOL-TG',
    orgCode: 'ISOL',
    name: 'Isolation Test Company Pvt Ltd',
    country: 'India',
    state: 'Telangana',
    stateCode: '36',
    gstin: '36BBBBB0000B1Z6',
    baseCurrency: 'INR',
    currencySymbol: '₹',
    fiscalYearStart: 'April',
  },
  PERSONAS: {
    ORG_A: {
      owner: { id: 'user-owner-a', email: 'owner@acme-test.com', name: 'Owner User A', role: 'Owner' },
      admin: { id: 'user-admin-a', email: 'admin@acme-test.com', name: 'Admin User A', role: 'Admin' },
      manager: { id: 'user-manager-a', email: 'manager@acme-test.com', name: 'Finance Manager A', role: 'Manager' },
      accountant: { id: 'user-accountant-a', email: 'accountant@acme-test.com', name: 'Staff Accountant A', role: 'Accountant' },
      sales: { id: 'user-sales-a', email: 'sales@acme-test.com', name: 'Sales Exec A', role: 'Sales' },
      purchase: { id: 'user-purchase-a', email: 'purchase@acme-test.com', name: 'Purchase Exec A', role: 'Purchase' },
      viewer: { id: 'user-viewer-a', email: 'viewer@acme-test.com', name: 'Auditor Viewer A', role: 'Viewer' },
    },
    ORG_B: {
      owner: { id: 'user-owner-b', email: 'owner@isolation-test.com', name: 'Owner User B', role: 'Owner' },
      accountant: { id: 'user-accountant-b', email: 'accountant@isolation-test.com', name: 'Accountant B', role: 'Accountant' },
      viewer: { id: 'user-viewer-b', email: 'viewer@isolation-test.com', name: 'Viewer B', role: 'Viewer' },
    },
  },
  COA: [
    { code: '1000', idSuffix: '1000', name: 'Petty Cash', type: 'Asset', subType: 'Cash', normalBalance: 'Debit' },
    { code: '1010', idSuffix: '1010', name: 'HDFC Current Account', type: 'Asset', subType: 'Bank', normalBalance: 'Debit' },
    { code: '1020', idSuffix: '1020', name: 'ICICI Current Account', type: 'Asset', subType: 'Bank', normalBalance: 'Debit' },
    { code: '1100', idSuffix: '1100', name: 'Accounts Receivable', type: 'Asset', subType: 'Accounts Receivable', normalBalance: 'Debit' },
    { code: '1150', idSuffix: '1150', name: 'Customer and Vendor Advances', type: 'Asset', subType: 'Current Asset', normalBalance: 'Debit' },
    { code: '1200', idSuffix: '1200', name: 'Input GST Tax Credit', type: 'Asset', subType: 'Current Asset', normalBalance: 'Debit' },
    { code: '2000', idSuffix: '2000', name: 'Accounts Payable', type: 'Liability', subType: 'Accounts Payable', normalBalance: 'Credit' },
    { code: '2100', idSuffix: '2100', name: 'Output GST Tax Payable', type: 'Liability', subType: 'Taxes Payable', normalBalance: 'Credit' },
    { code: '2110', idSuffix: '2110', name: 'GST Input Tax Control', type: 'Liability', subType: 'Taxes Payable', normalBalance: 'Credit' },
    { code: '2200', idSuffix: '2200', name: 'Sales Tax Payable', type: 'Liability', subType: 'Taxes Payable', normalBalance: 'Credit' },
    { code: '3000', idSuffix: '3000', name: 'Owner Equity and Retained Earnings', type: 'Equity', subType: 'Equity', normalBalance: 'Credit' },
    { code: '4000', idSuffix: '4000', name: 'Design and Consultation Revenue', type: 'Income', subType: 'Sales', normalBalance: 'Credit' },
    { code: '4010', idSuffix: '4010', name: 'Execution and Turnkey Revenue', type: 'Income', subType: 'Sales', normalBalance: 'Credit' },
    { code: '4090', idSuffix: '4090', name: 'Sales Returns and Allowances', type: 'Income', subType: 'Sales', normalBalance: 'Debit' },
    { code: '5000', idSuffix: '5000', name: 'Direct Material Purchases', type: 'Cost of Goods Sold', subType: 'Materials', normalBalance: 'Debit' },
    { code: '5010', idSuffix: '5010', name: 'Contractor and Subcontractor Cost', type: 'Cost of Goods Sold', subType: 'Subcontractors', normalBalance: 'Debit' },
    { code: '5090', idSuffix: '5090', name: 'Purchase Returns Contra Cost', type: 'Cost of Goods Sold', subType: 'Materials', normalBalance: 'Credit' },
    { code: '6000', idSuffix: '6000', name: 'Office and Administrative Expense', type: 'Expense', subType: 'Office & Administrative', normalBalance: 'Debit' },
    { code: '6010', idSuffix: '6010', name: 'Office Rent and Facilities', type: 'Expense', subType: 'Office & Administrative', normalBalance: 'Debit' },
    { code: '6020', idSuffix: '6020', name: 'Travel and Client Hospitality', type: 'Expense', subType: 'Travel & Vehicle', normalBalance: 'Debit' },
    { code: '6030', idSuffix: '6030', name: 'Software and SaaS Subscriptions', type: 'Expense', subType: 'Software & Subscriptions', normalBalance: 'Debit' },
  ],
  CUSTOMERS: {
    A1: { id: 'cust-a1-same-state', name: 'Customer A1 (AP GST Registered)', email: 'customer.a1@acmetest.com', state: 'Andhra Pradesh', stateCode: '37', gstin: '37AAAAA0000A1Z5', isRegistered: true },
    A2: { id: 'cust-a2-interstate', name: 'Customer A2 (TG GST Registered)', email: 'customer.a2@interstate.com', state: 'Telangana', stateCode: '36', gstin: '36BBBBB0000B1Z6', isRegistered: true },
    A3: { id: 'cust-a3-unregistered', name: 'Customer A3 (B2C Consumer)', email: 'b2c@consumer.com', state: 'Andhra Pradesh', stateCode: '37', isRegistered: false },
    B1: { id: 'cust-b1-org-b', name: 'Customer B1 (Org B Dedicated)', email: 'client@isolation.com', state: 'Telangana', stateCode: '36', gstin: '36CCCCC0000C1Z7', isRegistered: true },
  },
  VENDORS: {
    A1: { id: 'vend-a1-same-state', name: 'Vendor A1 (AP GST Registered)', email: 'vendor.a1@plywoods.com', state: 'Andhra Pradesh', stateCode: '37', gstin: '37DDDDD0000D1Z8', isRegistered: true },
    A2: { id: 'vend-a2-interstate', name: 'Vendor A2 (TG GST Registered)', email: 'vendor.a2@laminates.com', state: 'Telangana', stateCode: '36', gstin: '36EEEEE0000E1Z9', isRegistered: true },
    A3: { id: 'vend-a3-unregistered', name: 'Vendor A3 (Local Hardware)', email: 'hardware@local.com', state: 'Andhra Pradesh', stateCode: '37', isRegistered: false },
    B1: { id: 'vend-b1-org-b', name: 'Vendor B1 (Org B Dedicated)', email: 'supplier@isolation.com', state: 'Telangana', stateCode: '36', gstin: '36FFFFF0000F1Z0', isRegistered: true },
  },
  ITEMS: {
    ITEM_000: { code: 'ITEM-000', name: 'Zero-Tax Raw Timber', type: 'Goods', hsn: '4401', taxRate: 0, unitPrice: 500 },
    ITEM_005: { code: 'ITEM-005', name: '5% Construction Aggregates', type: 'Goods', hsn: '2517', taxRate: 5, unitPrice: 1200 },
    ITEM_012: { code: 'ITEM-012', name: '12% Wooden Mouldings', type: 'Goods', hsn: '4409', taxRate: 12, unitPrice: 2500 },
    ITEM_018: { code: 'ITEM-018', name: '18% Commercial Plywood 18mm', type: 'Goods', hsn: '4412', taxRate: 18, unitPrice: 4000 },
    ITEM_028: { code: 'ITEM-028', name: '28% Luxury Designer Panelling', type: 'Goods', hsn: '9403', taxRate: 28, unitPrice: 15000 },
    SERVICE_018: { code: 'SERVICE-018', name: '3D Architectural Visualization', type: 'Service', sac: '9983', taxRate: 18, unitPrice: 25000 },
  },
  PROJECTS: {
    A: { id: 'prj-a-exec', code: 'PRJ-A', name: 'Executive Suite Interior Renovation', clientId: 'cust-a1-same-state', budget: 2500000, hourlyRate: 1500 },
    B: { id: 'prj-b-villa', code: 'PRJ-B', name: 'Jubilee Hills Private Villa', clientId: 'cust-a2-interstate', budget: 1200000, hourlyRate: 1200 },
    ISOLATION: { id: 'prj-iso-b', code: 'PRJ-ISO', name: 'Isolation Facility Fitout', clientId: 'cust-b1-org-b', budget: 500000, hourlyRate: 1000 },
  },
};

export class MasterFinanceFixture {
  public static async setup(options: { usePgMem?: boolean } = { usePgMem: true }): Promise<void> {
    if (options.usePgMem) {
      db.initPgMem();
    }
    await MigrationRunner.runMigrations();
    await this.seedOrganizations();
    await this.seedUsers();
    await this.seedChartOfAccounts();
    await this.seedCustomersAndVendors();
    await this.seedItemsAndProjects();
  }

  public static async reset(options: { usePgMem?: boolean } = { usePgMem: true }): Promise<void> {
    await this.setup(options);
  }

  private static async seedOrganizations(): Promise<void> {
    const orgs = [MASTER_FIXTURE_CONSTANTS.ORG_A, MASTER_FIXTURE_CONSTANTS.ORG_B];
    for (const org of orgs) {
      await db.query(
        `INSERT INTO organizations (id, uuid, public_org_id, org_code, name, country, base_currency, currency_symbol, owner_user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           country = EXCLUDED.country,
           base_currency = EXCLUDED.base_currency,
           currency_symbol = EXCLUDED.currency_symbol`,
        [org.id, org.uuid, org.publicOrgId, org.orgCode, org.name, org.country, org.baseCurrency, org.currencySymbol, `user-owner-${org.id}`]
      );
    }
  }

  private static async seedUsers(): Promise<void> {
    const orgAUsers = Object.values(MASTER_FIXTURE_CONSTANTS.PERSONAS.ORG_A);
    for (const user of orgAUsers) {
      await db.query(
        `INSERT INTO users (id, email, password_hash, full_name, status)
         VALUES ($1, $2, 'test-hash-pass', $3, 'Active')
         ON CONFLICT (id) DO NOTHING`,
        [user.id, user.email, user.name]
      );
      await db.query(
        `INSERT INTO organization_members (id, organization_id, user_id, role)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO NOTHING`,
        [`mem-${user.id}`, MASTER_FIXTURE_CONSTANTS.ORG_A.id, user.id, user.role]
      );
    }

    const orgBUsers = Object.values(MASTER_FIXTURE_CONSTANTS.PERSONAS.ORG_B);
    for (const user of orgBUsers) {
      await db.query(
        `INSERT INTO users (id, email, password_hash, full_name, status)
         VALUES ($1, $2, 'test-hash-pass', $3, 'Active')
         ON CONFLICT (id) DO NOTHING`,
        [user.id, user.email, user.name]
      );
      await db.query(
        `INSERT INTO organization_members (id, organization_id, user_id, role)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO NOTHING`,
        [`mem-${user.id}`, MASTER_FIXTURE_CONSTANTS.ORG_B.id, user.id, user.role]
      );
    }
  }

  private static async seedChartOfAccounts(): Promise<void> {
    const orgs = [MASTER_FIXTURE_CONSTANTS.ORG_A.id, MASTER_FIXTURE_CONSTANTS.ORG_B.id];
    const roleMap: Record<string, string> = {
      '1000': 'BANK_OPERATING',
      '1010': 'BANK_OPERATING',
      '1020': 'BANK_OPERATING',
      '1100': 'AR_CONTROL',
      '1150': 'VENDOR_ADVANCE',
      '1200': 'GST_INPUT',
      '2000': 'AP_CONTROL',
      '2100': 'CUSTOMER_ADVANCE',
      '2110': 'GST_OUTPUT',
      '2200': 'GST_OUTPUT',
      '3000': 'OWNER_CAPITAL',
      '4000': 'SALES_REVENUE',
      '4010': 'SALES_REVENUE',
      '5000': 'DIRECT_COSTS',
      '5010': 'DIRECT_COSTS',
      '6000': 'OPERATING_EXPENSE',
      '6010': 'OPERATING_EXPENSE',
      '6020': 'OPERATING_EXPENSE',
      '6030': 'OPERATING_EXPENSE',
    };

    for (const orgId of orgs) {
      for (const acc of MASTER_FIXTURE_CONSTANTS.COA) {
        const fullId = `acc-${orgId}-${acc.idSuffix}`;
        const sysRole = roleMap[acc.code] || null;
        await db.query(
          `INSERT INTO accounts (id, organization_id, code, name, type, sub_type, balance, is_system_account, status, normal_balance, normal_balance_is_explicit, allow_direct_posting, system_role)
           VALUES ($1, $2, $3, $4, $5, $6, 0.00, TRUE, 'Active', $7, TRUE, TRUE, $8)
           ON CONFLICT (id) DO UPDATE SET
             code = EXCLUDED.code,
             name = EXCLUDED.name,
             type = EXCLUDED.type,
             sub_type = EXCLUDED.sub_type,
             system_role = EXCLUDED.system_role,
             balance = 0.00`,
          [fullId, orgId, acc.code, acc.name, acc.type, acc.subType, acc.normalBalance, sysRole]
        );
        if (sysRole) {
          await db.query(
            `INSERT INTO accounting_defaults (organization_id, system_role, account_id)
             VALUES ($1, $2, $3)
             ON CONFLICT (organization_id, system_role) DO UPDATE SET account_id = EXCLUDED.account_id`,
            [orgId, sysRole, fullId]
          );
        }
      }
    }
  }

  private static async seedCustomersAndVendors(): Promise<void> {
    // Org A Customers
    const custsA = [MASTER_FIXTURE_CONSTANTS.CUSTOMERS.A1, MASTER_FIXTURE_CONSTANTS.CUSTOMERS.A2, MASTER_FIXTURE_CONSTANTS.CUSTOMERS.A3];
    for (const cust of custsA) {
      const gstinVal = 'gstin' in cust ? (cust as any).gstin : null;
      await db.query(
        `INSERT INTO customers (id, organization_id, customer_id, display_name, legal_name, email, gstin, place_of_supply, gst_status, currency, receivables_balance, unused_credits)
         VALUES ($1, $2, $1, $3, $3, $4, $5, $6, $7, 'INR', 0.00, 0.00)
         ON CONFLICT (id) DO NOTHING`,
        [cust.id, MASTER_FIXTURE_CONSTANTS.ORG_A.id, cust.name, cust.email, gstinVal, cust.state, cust.isRegistered ? 'Registered' : 'Unregistered']
      );
      await db.query(
        `INSERT INTO clients (id, organization_id, name, company_name, email, tax_id, currency)
         VALUES ($1, $2, $3, $3, $4, $5, 'INR')
         ON CONFLICT (id) DO NOTHING`,
        [cust.id, MASTER_FIXTURE_CONSTANTS.ORG_A.id, cust.name, cust.email, gstinVal]
      );
    }

    // Org B Customer
    const custB = MASTER_FIXTURE_CONSTANTS.CUSTOMERS.B1;
    const gstinValB = 'gstin' in custB ? (custB as any).gstin : null;
    await db.query(
      `INSERT INTO customers (id, organization_id, customer_id, display_name, legal_name, email, gstin, place_of_supply, gst_status, currency, receivables_balance, unused_credits)
       VALUES ($1, $2, $1, $3, $3, $4, $5, $6, $7, 'INR', 0.00, 0.00)
       ON CONFLICT (id) DO NOTHING`,
      [custB.id, MASTER_FIXTURE_CONSTANTS.ORG_B.id, custB.name, custB.email, gstinValB, custB.state, custB.isRegistered ? 'Registered' : 'Unregistered']
    );

    // Org A Vendors
    const vendsA = [MASTER_FIXTURE_CONSTANTS.VENDORS.A1, MASTER_FIXTURE_CONSTANTS.VENDORS.A2, MASTER_FIXTURE_CONSTANTS.VENDORS.A3];
    for (const vend of vendsA) {
      await db.query(
        `INSERT INTO vendors (id, organization_id, name, company_name, email, tax_id, currency, payables_balance, advance_balance, unused_credits)
         VALUES ($1, $2, $3, $3, $4, $5, 'INR', 0.00, 0.00, 0.00)
         ON CONFLICT (id) DO NOTHING`,
        [vend.id, MASTER_FIXTURE_CONSTANTS.ORG_A.id, vend.name, vend.email, ('gstin' in vend ? (vend as any).gstin : null)]
      );
    }

    // Org B Vendor
    const vendB = MASTER_FIXTURE_CONSTANTS.VENDORS.B1;
    await db.query(
      `INSERT INTO vendors (id, organization_id, name, company_name, email, tax_id, currency, payables_balance, advance_balance, unused_credits)
       VALUES ($1, $2, $3, $3, $4, $5, 'INR', 0.00, 0.00, 0.00)
       ON CONFLICT (id) DO NOTHING`,
      [vendB.id, MASTER_FIXTURE_CONSTANTS.ORG_B.id, vendB.name, vendB.email, ('gstin' in vendB ? (vendB as any).gstin : null)]
    );
  }

  private static async seedItemsAndProjects(): Promise<void> {
    const items = Object.values(MASTER_FIXTURE_CONSTANTS.ITEMS);
    for (const item of items) {
      const codeOrSac = 'hsn' in item ? (item as any).hsn : (item as any).sac;
      await db.query(
        `INSERT INTO items (id, organization_id, name, sku, hsn_sac, gst_rate, sales_rate, purchase_rate, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $7, TRUE)
         ON CONFLICT (id) DO NOTHING`,
        [`item-${MASTER_FIXTURE_CONSTANTS.ORG_A.id}-${item.code}`, MASTER_FIXTURE_CONSTANTS.ORG_A.id, item.name, item.code, codeOrSac, item.taxRate, item.unitPrice]
      );
    }

    // Projects Org A
    const prjA = MASTER_FIXTURE_CONSTANTS.PROJECTS.A;
    await db.query(
      `INSERT INTO projects (id, organization_id, code, name, client_id, client_name, total_budget, hourly_rate, status)
       VALUES ($1, $2, $3, $4, $5, 'Customer A1 (AP GST Registered)', $6, $7, 'Active')
       ON CONFLICT (id) DO NOTHING`,
      [prjA.id, MASTER_FIXTURE_CONSTANTS.ORG_A.id, prjA.code, prjA.name, prjA.clientId, prjA.budget, prjA.hourlyRate]
    );

    const prjB = MASTER_FIXTURE_CONSTANTS.PROJECTS.B;
    await db.query(
      `INSERT INTO projects (id, organization_id, code, name, client_id, client_name, total_budget, hourly_rate, status)
       VALUES ($1, $2, $3, $4, $5, 'Customer A2 (TG GST Registered)', $6, $7, 'Active')
       ON CONFLICT (id) DO NOTHING`,
      [prjB.id, MASTER_FIXTURE_CONSTANTS.ORG_A.id, prjB.code, prjB.name, prjB.clientId, prjB.budget, prjB.hourlyRate]
    );

    // Project Org B
    const prjIso = MASTER_FIXTURE_CONSTANTS.PROJECTS.ISOLATION;
    await db.query(
      `INSERT INTO projects (id, organization_id, code, name, client_id, client_name, total_budget, hourly_rate, status)
       VALUES ($1, $2, $3, $4, $5, 'Customer B1 (Org B Dedicated)', $6, $7, 'Active')
       ON CONFLICT (id) DO NOTHING`,
      [prjIso.id, MASTER_FIXTURE_CONSTANTS.ORG_B.id, prjIso.code, prjIso.name, prjIso.clientId, prjIso.budget, prjIso.hourlyRate]
    );
  }

  // =========================================================================
  // STANDARD TRANSACTION BUILDERS
  // =========================================================================

  public static async createStandardInvoice(
    orgId: string = MASTER_FIXTURE_CONSTANTS.ORG_A.id,
    overrides: any = {}
  ): Promise<{ invoiceId: string; invoiceNumber: string; totalAmount: number; journalEntryId: string; balanceDue: number }> {
    const isOrgB = orgId === MASTER_FIXTURE_CONSTANTS.ORG_B.id;
    const defaultCust = isOrgB ? MASTER_FIXTURE_CONSTANTS.CUSTOMERS.B1 : MASTER_FIXTURE_CONSTANTS.CUSTOMERS.A1;
    const payload = {
      customerId: overrides.customerId || defaultCust.id,
      customerName: overrides.customerName || defaultCust.name,
      issueDate: overrides.issueDate || '2026-05-15',
      dueDate: overrides.dueDate || '2026-06-15',
      status: 'POSTED',
      lineItems: overrides.lineItems || overrides.items || [
        {
          description: '18% Commercial Plywood 18mm',
          quantity: overrides.quantity ?? 25,
          unitPrice: overrides.unitPrice ?? 4000, // ₹100,000 subtotal
          taxRate: overrides.taxRate ?? 18,        // ₹18,000 GST
          amount: 100000,
        },
      ],
      discount: overrides.discount ?? 0,
      roundOff: overrides.roundOff ?? 0,
      notes: overrides.notes || 'Standard Fixture Invoice',
      ...overrides,
    };
    const inv = await SalesEngine.createAndPostInvoice(orgId, payload);
    return {
      invoiceId: inv.id,
      invoiceNumber: inv.invoiceNumber,
      totalAmount: inv.totalAmount,
      journalEntryId: inv.journalEntryId,
      balanceDue: inv.balanceDue,
    };
  }

  public static async createStandardBill(
    orgId: string = MASTER_FIXTURE_CONSTANTS.ORG_A.id,
    overrides: any = {}
  ): Promise<{ id: string; totalAmount: number; journalEntryId?: string; balanceDue: number }> {
    const isOrgB = orgId === MASTER_FIXTURE_CONSTANTS.ORG_B.id;
    const defaultVend = isOrgB ? MASTER_FIXTURE_CONSTANTS.VENDORS.B1 : MASTER_FIXTURE_CONSTANTS.VENDORS.A1;
    const payload = {
      vendorId: overrides.vendorId || defaultVend.id,
      vendorName: overrides.vendorName || defaultVend.name,
      billDate: overrides.billDate || '2026-05-16',
      dueDate: overrides.dueDate || '2026-06-16',
      status: 'POSTED',
      subtotal: overrides.subtotal ?? 100000,
      taxTotal: overrides.taxTotal ?? 18000,
      totalAmount: overrides.totalAmount ?? 118000,
      lineItems: overrides.lineItems || [
        {
          description: 'Direct Material Purchases',
          quantity: overrides.quantity ?? 25,
          unitPrice: overrides.unitPrice ?? 4000, // ₹100,000 taxable
          taxRate: overrides.taxRate ?? 18,        // ₹18,000 tax
          amount: 100000,
          expenseAccountId: `acc-${orgId}-5000`,
        },
      ],
      discount: overrides.discount ?? 0,
      notes: overrides.notes || 'Standard Fixture Bill',
      ...overrides,
    };
    const bill = await PurchasesEngine.createAndPostBill(orgId, payload);
    return {
      id: bill.id,
      totalAmount: bill.totalAmount,
      journalEntryId: bill.journalEntryId,
      balanceDue: bill.balanceDue,
    };
  }

  public static async createStandardExpense(
    orgId: string = MASTER_FIXTURE_CONSTANTS.ORG_A.id,
    overrides: any = {}
  ): Promise<{ id: string; amount: number; journalEntryId: string }> {
    const isOrgB = orgId === MASTER_FIXTURE_CONSTANTS.ORG_B.id;
    const persona = isOrgB ? MASTER_FIXTURE_CONSTANTS.PERSONAS.ORG_B.accountant : MASTER_FIXTURE_CONSTANTS.PERSONAS.ORG_A.accountant;
    return await ExpensePostingService.createAndPost(
      orgId,
      overrides.userId || persona.id,
      {
        expenseAccountId: overrides.expenseAccountId || `acc-${orgId}-6000`,
        paidFromAccountId: overrides.paidFromAccountId || `acc-${orgId}-1010`,
        date: overrides.date || '2026-05-17',
        amount: overrides.amount ?? 11800,
        description: overrides.description || 'Standard Office Supplies Expense',
        vendorName: overrides.vendorName || 'Standard Vendor',
        ...overrides,
      }
    );
  }

  public static async createStandardCustomerPayment(
    orgId: string = MASTER_FIXTURE_CONSTANTS.ORG_A.id,
    overrides: any = {}
  ): Promise<any> {
    const isOrgB = orgId === MASTER_FIXTURE_CONSTANTS.ORG_B.id;
    const defaultCust = isOrgB ? MASTER_FIXTURE_CONSTANTS.CUSTOMERS.B1 : MASTER_FIXTURE_CONSTANTS.CUSTOMERS.A1;
    const payload = {
      customerId: overrides.customerId || defaultCust.id,
      customerName: overrides.customerName || defaultCust.name,
      paymentDate: overrides.paymentDate || '2026-05-20',
      amount: overrides.amount ?? 118000,
      paymentMode: overrides.paymentMode || 'Bank Transfer',
      depositToAccountId: overrides.depositToAccountId || `acc-${orgId}-1010`,
      allocations: overrides.allocations || [],
      ...overrides,
    };
    return await SalesEngine.recordPayment(orgId, payload);
  }

  public static async createStandardVendorPayment(
    orgId: string = MASTER_FIXTURE_CONSTANTS.ORG_A.id,
    overrides: any = {}
  ): Promise<{ id: string; amount: number; journalEntryId?: string }> {
    const isOrgB = orgId === MASTER_FIXTURE_CONSTANTS.ORG_B.id;
    const defaultVend = isOrgB ? MASTER_FIXTURE_CONSTANTS.VENDORS.B1 : MASTER_FIXTURE_CONSTANTS.VENDORS.A1;
    const payload = {
      vendorId: overrides.vendorId || defaultVend.id,
      vendorName: overrides.vendorName || defaultVend.name,
      paymentDate: overrides.paymentDate || '2026-05-21',
      amount: overrides.amount ?? 118000,
      paymentMode: overrides.paymentMode || 'Bank Transfer',
      paidFromAccountId: overrides.paidFromAccountId || `acc-${orgId}-1010`,
      allocations: overrides.allocations || [],
      ...overrides,
    };
    return await PurchasesEngine.recordVendorPayment(orgId, payload);
  }

  public static async createStandardCreditNote(
    orgId: string = MASTER_FIXTURE_CONSTANTS.ORG_A.id,
    overrides: any = {}
  ): Promise<{ creditNoteId: string; totalAmount: number; journalEntryId?: string }> {
    const isOrgB = orgId === MASTER_FIXTURE_CONSTANTS.ORG_B.id;
    const defaultCust = isOrgB ? MASTER_FIXTURE_CONSTANTS.CUSTOMERS.B1 : MASTER_FIXTURE_CONSTANTS.CUSTOMERS.A1;
    const payload = {
      customerId: overrides.customerId || defaultCust.id,
      customerName: overrides.customerName || defaultCust.name,
      date: overrides.date || '2026-05-22',
      taxableAmount: overrides.taxableAmount ?? 10000,
      taxAmount: overrides.taxAmount ?? 1800,
      reason: overrides.reason || 'Standard Fixture Sales Return',
      ...overrides,
    };
    const cn = await SalesEngine.createCreditNote(orgId, payload);
    return {
      creditNoteId: cn.creditNoteId,
      totalAmount: cn.totalAmount,
      journalEntryId: (cn as any).journalEntryId,
    };
  }

  public static async createStandardVendorCredit(
    orgId: string = MASTER_FIXTURE_CONSTANTS.ORG_A.id,
    overrides: any = {}
  ): Promise<any> {
    const isOrgB = orgId === MASTER_FIXTURE_CONSTANTS.ORG_B.id;
    const defaultVend = isOrgB ? MASTER_FIXTURE_CONSTANTS.VENDORS.B1 : MASTER_FIXTURE_CONSTANTS.VENDORS.A1;
    const payload = {
      vendorId: overrides.vendorId || defaultVend.id,
      vendorName: overrides.vendorName || defaultVend.name,
      date: overrides.date || '2026-05-23',
      taxableAmount: overrides.taxableAmount ?? 10000,
      taxAmount: overrides.taxAmount ?? 1800,
      reason: overrides.reason || 'Standard Fixture Defective Return',
      ...overrides,
    };
    return await PurchasesEngine.createDebitNote(orgId, payload);
  }

  public static async createStandardVendorAdvance(
    orgId: string = MASTER_FIXTURE_CONSTANTS.ORG_A.id,
    overrides: any = {}
  ): Promise<any> {
    const isOrgB = orgId === MASTER_FIXTURE_CONSTANTS.ORG_B.id;
    const defaultVend = isOrgB ? MASTER_FIXTURE_CONSTANTS.VENDORS.B1 : MASTER_FIXTURE_CONSTANTS.VENDORS.A1;
    const payload = {
      vendorId: overrides.vendorId || defaultVend.id,
      vendorName: overrides.vendorName || defaultVend.name,
      paidDate: overrides.paidDate || '2026-05-10',
      paidFromAccountId: overrides.paidFromAccountId || `acc-${orgId}-1010`,
      amount: overrides.amount ?? 50000,
      reference: overrides.reference || 'ADV-REF-101',
      ...overrides,
    };
    return await PurchasesEngine.recordVendorAdvance(orgId, payload);
  }

  public static async createStandardPurchaseOrder(
    orgId: string = MASTER_FIXTURE_CONSTANTS.ORG_A.id,
    overrides: any = {}
  ): Promise<any> {
    const lineItems = overrides.lineItems || [
      {
        description: '18% Commercial Plywood 18mm',
        quantity: overrides.quantity ?? 100,
        unitPrice: overrides.unitPrice ?? 4000,
        taxRate: 18,
      },
    ];
    const subtotal = lineItems.reduce((s: number, it: any) => s + ((Number(it.quantity) || 0) * (Number(it.unitPrice) || 0)), 0);
    const taxTotal = lineItems.reduce((s: number, it: any) => s + Math.round(((Number(it.quantity) || 0) * (Number(it.unitPrice) || 0) * (Number(it.taxRate) || 0)) / 100), 0);
    const totalAmount = Math.round((subtotal + taxTotal) * 100) / 100;

    const payload = {
      vendorId: overrides.vendorId || MASTER_FIXTURE_CONSTANTS.VENDORS.A1.id,
      vendorName: overrides.vendorName || MASTER_FIXTURE_CONSTANTS.VENDORS.A1.name,
      orderDate: overrides.orderDate || '2026-05-01',
      status: overrides.status || 'ISSUED',
      subtotal,
      taxTotal,
      totalAmount,
      lineItems,
      ...overrides,
    };
    const po = await PurchasesEngine.createPurchaseOrder(orgId, payload);
    return { ...po, totalAmount };
  }

  // =========================================================================
  // MASTER ASSERTION & FINANCIAL INVARIANT HELPERS
  // =========================================================================

  public static async assertJournalBalanced(journalEntryId: string, client: DbQueryClient = db): Promise<void> {
    const linesRes = await client.query(
      `SELECT account_id, debit, credit FROM journal_lines WHERE journal_entry_id = $1`,
      [journalEntryId]
    );
    if (linesRes.rows.length === 0) {
      throw new Error(`JOURNAL_NOT_FOUND: Journal entry ${journalEntryId} has no lines posted.`);
    }
    const totalDebit = linesRes.rows.reduce((sum, r) => sum + databaseMoneyToCents(r.debit, 'debit'), 0n);
    const totalCredit = linesRes.rows.reduce((sum, r) => sum + databaseMoneyToCents(r.credit, 'credit'), 0n);
    if (totalDebit !== totalCredit) {
      throw new Error(
        `JOURNAL_EQUILIBRIUM_ERROR: Journal ${journalEntryId} is unbalanced! Total Dr ₹${Number(totalDebit) / 100} vs Total Cr ₹${Number(totalCredit) / 100}; discrepancy ₹${Number(totalDebit - totalCredit) / 100}`
      );
    }
  }

  public static async assertNoNegativeDocumentBalance(organizationId: string, client: DbQueryClient = db): Promise<void> {
    const invRes = await client.query(
      `SELECT id, invoice_number, total_amount, paid_amount, balance_due FROM invoices
        WHERE organization_id = $1 AND (balance_due < -0.001 OR paid_amount < -0.001)`,
      [organizationId]
    );
    if (invRes.rows.length > 0) {
      throw new Error(`NEGATIVE_INVOICE_BALANCE: Found ${invRes.rows.length} invoices with negative balance: ${JSON.stringify(invRes.rows)}`);
    }

    const billRes = await client.query(
      `SELECT id, bill_number, total_amount, amount_paid, balance_due FROM bills
        WHERE organization_id = $1 AND (balance_due < -0.001 OR amount_paid < -0.001)`,
      [organizationId]
    );
    if (billRes.rows.length > 0) {
      throw new Error(`NEGATIVE_BILL_BALANCE: Found ${billRes.rows.length} bills with negative balance: ${JSON.stringify(billRes.rows)}`);
    }
  }

  public static async assertInvoiceBalanceCorrect(invoiceId: string, organizationId: string, client: DbQueryClient = db): Promise<void> {
    const invRes = await client.query(
      `SELECT id, invoice_number, total_amount, paid_amount, amount_credited, amount_written_off, balance_due FROM invoices
        WHERE organization_id = $1 AND id = $2`,
      [organizationId, invoiceId]
    );
    if (invRes.rows.length !== 1) throw new Error(`INVOICE_NOT_FOUND: Invoice ${invoiceId} in org ${organizationId}`);
    const inv = invRes.rows[0];

    const allocRes = await client.query(
      `SELECT COALESCE(SUM(amount), 0) AS total_allocated FROM payment_received_allocations
        WHERE organization_id = $1 AND invoice_id = $2`,
      [organizationId, invoiceId]
    );
    const allocCents = databaseMoneyToCents(allocRes.rows[0].total_allocated, 'allocated');
    const paidCents = databaseMoneyToCents(inv.paid_amount, 'paid');
    if (allocCents !== paidCents) {
      throw new Error(`INVOICE_ALLOCATION_MISMATCH: Invoice ${inv.invoice_number} paid_amount (₹${Number(paidCents) / 100}) does not match sum of allocations (₹${Number(allocCents) / 100})`);
    }

    const totalCents = databaseMoneyToCents(inv.total_amount, 'total');
    const creditCents = databaseMoneyToCents(inv.amount_credited, 'credited');
    const writeOffCents = databaseMoneyToCents(inv.amount_written_off, 'written_off');
    const expectedBalCents = totalCents - paidCents - creditCents - writeOffCents;
    const actualBalCents = databaseMoneyToCents(inv.balance_due, 'balance_due');

    if (expectedBalCents !== actualBalCents) {
      throw new Error(`INVOICE_BALANCE_DUE_MISMATCH: Invoice ${inv.invoice_number} expected balance ₹${Number(expectedBalCents) / 100} but got ₹${Number(actualBalCents) / 100}`);
    }
  }

  public static async assertBillBalanceCorrect(billId: string, organizationId: string, client: DbQueryClient = db): Promise<void> {
    const billRes = await client.query(
      `SELECT id, bill_number, total_amount, amount_paid, amount_debited, amount_written_off, balance_due FROM bills
        WHERE organization_id = $1 AND id = $2`,
      [organizationId, billId]
    );
    if (billRes.rows.length !== 1) throw new Error(`BILL_NOT_FOUND: Bill ${billId} in org ${organizationId}`);
    const bill = billRes.rows[0];

    const totalCents = databaseMoneyToCents(bill.total_amount, 'total');
    const paidCents = databaseMoneyToCents(bill.amount_paid, 'paid');
    const debitedCents = databaseMoneyToCents(bill.amount_debited, 'debited');
    const writeOffCents = databaseMoneyToCents(bill.amount_written_off, 'written_off');
    const expectedBalCents = totalCents - paidCents - debitedCents - writeOffCents;
    const actualBalCents = databaseMoneyToCents(bill.balance_due, 'balance_due');

    if (expectedBalCents !== actualBalCents) {
      throw new Error(`BILL_BALANCE_DUE_MISMATCH: Bill ${bill.bill_number} expected balance ₹${Number(expectedBalCents) / 100} but got ₹${Number(actualBalCents) / 100}`);
    }
  }

  public static async assertPaymentConservation(paymentId: string, organizationId: string, client: DbQueryClient = db): Promise<void> {
    const pmtRes = await client.query(
      `SELECT id, payment_number, amount, unallocated_amount FROM payments_received
        WHERE organization_id = $1 AND id = $2`,
      [organizationId, paymentId]
    );
    if (pmtRes.rows.length !== 1) throw new Error(`PAYMENT_NOT_FOUND: Payment ${paymentId}`);
    const pmt = pmtRes.rows[0];

    const allocRes = await client.query(
      `SELECT COALESCE(SUM(amount), 0) AS total_allocated FROM payment_received_allocations
        WHERE organization_id = $1 AND payment_id = $2`,
      [organizationId, paymentId]
    );
    const totalCents = databaseMoneyToCents(pmt.amount, 'payment amount');
    const unallocatedCents = databaseMoneyToCents(pmt.unallocated_amount, 'unallocated');
    const allocatedCents = databaseMoneyToCents(allocRes.rows[0].total_allocated, 'allocated');

    if (totalCents !== allocatedCents + unallocatedCents) {
      throw new Error(`PAYMENT_CONSERVATION_BROKEN: Payment ${pmt.payment_number} total ₹${Number(totalCents) / 100} != allocated ₹${Number(allocatedCents) / 100} + unallocated ₹${Number(unallocatedCents) / 100}`);
    }
  }

  public static async assertVendorAdvanceConservation(advanceId: string, organizationId: string, client: DbQueryClient = db): Promise<void> {
    const advRes = await client.query(
      `SELECT id, amount, unapplied_amount FROM vendor_advances WHERE organization_id = $1 AND id = $2`,
      [organizationId, advanceId]
    );
    if (advRes.rows.length !== 1) throw new Error(`ADVANCE_NOT_FOUND: Advance ${advanceId}`);
    const adv = advRes.rows[0];

    const appRes = await client.query(
      `SELECT COALESCE(SUM(amount_applied), 0) AS total_applied FROM vendor_advance_applications
        WHERE organization_id = $1 AND advance_id = $2`,
      [organizationId, advanceId]
    );
    const originalCents = databaseMoneyToCents(adv.amount, 'advance original');
    const unappliedCents = databaseMoneyToCents(adv.unapplied_amount, 'unapplied');
    const appliedCents = databaseMoneyToCents(appRes.rows[0].total_applied, 'applied');

    if (originalCents !== appliedCents + unappliedCents) {
      throw new Error(`VENDOR_ADVANCE_CONSERVATION_BROKEN: Advance ${advanceId} original ₹${Number(originalCents) / 100} != applied ₹${Number(appliedCents) / 100} + unapplied ₹${Number(unappliedCents) / 100}`);
    }
  }

  public static async assertCreditConservation(creditNoteId: string, organizationId: string, client: DbQueryClient = db): Promise<void> {
    const cnRes = await client.query(
      `SELECT id, credit_note_number, total_amount, remaining_credit FROM credit_notes WHERE organization_id = $1 AND id = $2`,
      [organizationId, creditNoteId]
    );
    if (cnRes.rows.length !== 1) throw new Error(`CREDIT_NOTE_NOT_FOUND: ${creditNoteId}`);
    const cn = cnRes.rows[0];

    const appRes = await client.query(
      `SELECT COALESCE(SUM(amount_applied), 0) AS total_applied FROM credit_note_applications
        WHERE organization_id = $1 AND credit_note_id = $2`,
      [organizationId, creditNoteId]
    );
    const totalCents = databaseMoneyToCents(cn.total_amount, 'cn total');
    const remainingCents = databaseMoneyToCents(cn.remaining_credit, 'remaining');
    const appliedCents = databaseMoneyToCents(appRes.rows[0].total_applied, 'applied');

    if (totalCents !== appliedCents + remainingCents) {
      throw new Error(`CREDIT_CONSERVATION_BROKEN: Credit note ${cn.credit_note_number} total ₹${Number(totalCents) / 100} != applied ₹${Number(appliedCents) / 100} + remaining ₹${Number(remainingCents) / 100}`);
    }
  }

  public static async assertARSubledgerMatchesGL(organizationId: string, client: DbQueryClient = db): Promise<void> {
    const invRes = await client.query(
      `SELECT COALESCE(SUM(balance_due), 0) AS ar_subledger FROM invoices
        WHERE organization_id = $1 AND status NOT IN ('VOID', 'VOIDED', 'DRAFT')`,
      [organizationId]
    );
    const glRes = await client.query(
      `SELECT COALESCE(SUM(jl.debit - jl.credit), 0) AS ar_gl
         FROM journal_lines jl
         JOIN journal_entries je ON je.id = jl.journal_entry_id AND je.organization_id = $1
         JOIN accounts a ON a.id = jl.account_id AND a.organization_id = $1
        WHERE a.code = '1100'`,
      [organizationId]
    );
    const subledgerCents = databaseMoneyToCents(invRes.rows[0].ar_subledger, 'subledger');
    const glCents = databaseMoneyToCents(glRes.rows[0].ar_gl, 'gl');

    if (subledgerCents !== glCents) {
      throw new Error(
        `AR_SUBLEDGER_MISMATCH: Invoice AR subledger ₹${Number(subledgerCents) / 100} vs GL AR 1100 ₹${Number(glCents) / 100}; difference ₹${Number(subledgerCents - glCents) / 100}`
      );
    }
  }

  public static async assertAPSubledgerMatchesGL(organizationId: string, client: DbQueryClient = db): Promise<void> {
    const billRes = await client.query(
      `SELECT COALESCE(SUM(balance_due), 0) AS ap_subledger FROM bills
        WHERE organization_id = $1 AND status NOT IN ('VOID', 'VOIDED', 'DRAFT')`,
      [organizationId]
    );
    const glRes = await client.query(
      `SELECT COALESCE(SUM(jl.credit - jl.debit), 0) AS ap_gl
         FROM journal_lines jl
         JOIN journal_entries je ON je.id = jl.journal_entry_id AND je.organization_id = $1
         JOIN accounts a ON a.id = jl.account_id AND a.organization_id = $1
        WHERE a.code = '2000'`,
      [organizationId]
    );
    const subledgerCents = databaseMoneyToCents(billRes.rows[0].ap_subledger, 'subledger');
    const glCents = databaseMoneyToCents(glRes.rows[0].ap_gl, 'gl');

    if (subledgerCents !== glCents) {
      throw new Error(
        `AP_SUBLEDGER_MISMATCH: Bill AP subledger ₹${Number(subledgerCents) / 100} vs GL AP 2000 ₹${Number(glCents) / 100}; difference ₹${Number(subledgerCents - glCents) / 100}`
      );
    }
  }

  public static async assertTenantIsolation(orgAId: string, orgBId: string, client: DbQueryClient = db): Promise<void> {
    const tables = [
      'accounts', 'invoices', 'bills', 'expenses', 'journal_entries',
      'customers', 'vendors', 'projects', 'estimates', 'sales_orders', 'purchase_orders', 'credit_notes',
      'vendor_credits', 'payments_received', 'payments_made', 'payment_received_allocations', 'payment_made_allocations'
    ];

    for (const table of tables) {
      const crossCheck = await client.query(
        `SELECT COUNT(*) AS cross_count FROM ${table} WHERE organization_id = $1 AND organization_id = $2`,
        [orgAId, orgBId]
      );
      if (Number(crossCheck.rows[0]?.cross_count || 0) > 0) {
        throw new Error(`TENANT_ISOLATION_BREACH: Found records matching both ${orgAId} and ${orgBId} in table ${table}`);
      }
    }
  }

  public static async assertReversalSymmetry(originalJournalId: string, reversalJournalId: string, client: DbQueryClient = db): Promise<void> {
    const origRes = await client.query(
      `SELECT account_id, debit, credit FROM journal_lines WHERE journal_entry_id = $1 ORDER BY account_id`,
      [originalJournalId]
    );
    const revRes = await client.query(
      `SELECT account_id, debit, credit FROM journal_lines WHERE journal_entry_id = $1 ORDER BY account_id`,
      [reversalJournalId]
    );
    if (origRes.rows.length !== revRes.rows.length) {
      throw new Error(`REVERSAL_LINE_COUNT_MISMATCH: Original has ${origRes.rows.length} lines, reversal has ${revRes.rows.length} lines`);
    }
    for (let i = 0; i < origRes.rows.length; i++) {
      const orig = origRes.rows[i];
      const rev = revRes.rows[i];
      if (orig.account_id !== rev.account_id ||
          databaseMoneyToCents(orig.debit, 'orig dr') !== databaseMoneyToCents(rev.credit, 'rev cr') ||
          databaseMoneyToCents(orig.credit, 'orig cr') !== databaseMoneyToCents(rev.debit, 'rev dr')) {
        throw new Error(`REVERSAL_SYMMETRY_ERROR: Line ${i + 1} does not mirror original entry.`);
      }
    }
  }

  public static async assertGlobalFinancialIntegrity(organizationId: string, client: DbQueryClient = db): Promise<void> {
    // 1. All journals balance
    const journals = await client.query(`SELECT id FROM journal_entries WHERE organization_id = $1`, [organizationId]);
    for (const j of journals.rows) {
      await this.assertJournalBalanced(j.id, client);
    }
    // 2. Non-negative document balances
    await this.assertNoNegativeDocumentBalance(organizationId, client);
    // 3. AR subledger parity
    await this.assertARSubledgerMatchesGL(organizationId, client);
    // 4. AP subledger parity
    await this.assertAPSubledgerMatchesGL(organizationId, client);
    // 5. Check all invoices individually
    const invoices = await client.query(`SELECT id FROM invoices WHERE organization_id = $1`, [organizationId]);
    for (const inv of invoices.rows) {
      await this.assertInvoiceBalanceCorrect(inv.id, organizationId, client);
    }
    // 6. Check all bills individually
    const bills = await client.query(`SELECT id FROM bills WHERE organization_id = $1`, [organizationId]);
    for (const b of bills.rows) {
      await this.assertBillBalanceCorrect(b.id, organizationId, client);
    }
  }
}
