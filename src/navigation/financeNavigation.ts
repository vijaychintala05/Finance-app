import type { NavigationTab } from '../types';
import {
  getRequiredFinanceCapability,
  type FinanceCapabilityKey,
} from '../capabilities/financeCapabilityRegistry';

export type FinanceNavigationIcon =
  | 'dashboard'
  | 'projects'
  | 'banking'
  | 'sales'
  | 'purchases'
  | 'accounting'
  | 'reports'
  | 'settings';

export interface FinanceNavigationItem {
  id: NavigationTab;
  label: string;
  badge?: string;
}

export interface FinanceNavigationSection {
  id: string;
  label: string;
  icon: FinanceNavigationIcon;
  defaultTab: NavigationTab;
  subItems: readonly FinanceNavigationItem[];
}

export interface FinanceCapabilityAvailability {
  key: FinanceCapabilityKey;
  state: 'enabled' | 'disabled' | 'unavailable';
  reason?: string;
  prerequisite?: string;
}

export interface ResolvedFinanceNavigationItem extends FinanceNavigationItem {
  requiredCapability?: FinanceCapabilityKey;
  disabled: boolean;
  disabledReason?: string;
}

export interface ResolvedFinanceNavigationSection extends Omit<FinanceNavigationSection, 'subItems'> {
  subItems: readonly ResolvedFinanceNavigationItem[];
}

/** Shared by desktop, mobile and future command/search surfaces. */
export const FINANCE_NAVIGATION_SECTIONS = Object.freeze([
  {
    id: 'dashboard_section', label: 'Dashboard', icon: 'dashboard', defaultTab: 'dashboard',
    subItems: [{ id: 'dashboard', label: 'Dashboard' }],
  },
  {
    id: 'projects_section', label: 'Projects', icon: 'projects', defaultTab: 'projects',
    subItems: [{ id: 'projects', label: 'All Projects' }],
  },
  {
    id: 'banking_section', label: 'Banking & Cash', icon: 'banking', defaultTab: 'banking',
    subItems: [
      { id: 'banking', label: 'Bank & Cash Accounts' },
      { id: 'bank_reconciliation', label: 'Bank Reconciliation' },
    ],
  },
  {
    id: 'sales_section', label: 'Sales', icon: 'sales', defaultTab: 'invoices',
    subItems: [
      { id: 'clients', label: 'Customers' },
      { id: 'estimates', label: 'Estimates' },
      { id: 'sales_orders', label: 'Sales Orders' },
      { id: 'invoices', label: 'Invoices' },
      { id: 'delivery_challans', label: 'Delivery Challans' },
      { id: 'payments_received', label: 'Payments Received' },
      { id: 'salespersons', label: 'Salespersons' },
      { id: 'customer_portal', label: 'Customer Portal', badge: 'Portal' },
      { id: 'credit_notes', label: 'Credit Notes' },
      { id: 'recurring_invoices', label: 'Recurring Invoices' },
    ],
  },
  {
    id: 'purchases_section', label: 'Purchases', icon: 'purchases', defaultTab: 'expenses',
    subItems: [
      { id: 'vendors', label: 'Vendors' },
      { id: 'expenses', label: 'Expenses' },
      { id: 'purchase_orders', label: 'Purchase Orders' },
      { id: 'bills', label: 'Bills' },
      { id: 'document_inbox', label: 'Document Inbox & OCR', badge: 'OCR' },
      { id: 'payments_made', label: 'Payments Made' },
      { id: 'vendor_credits', label: 'Vendor Credits' },
      { id: 'recurring_bills', label: 'Recurring Bills' },
      { id: 'recurring_expenses', label: 'Recurring Expenses' },
    ],
  },
  {
    id: 'accounting_section', label: 'Accounting', icon: 'accounting', defaultTab: 'journals',
    subItems: [
      { id: 'journals', label: 'Manual Journals' },
      { id: 'bulk_updates', label: 'Bulk Journal Entry' },
      { id: 'coa', label: 'Chart of Accounts' },
      { id: 'data_migration', label: 'Data Migration & Balances' },
      { id: 'transaction_locking', label: 'Period Locks' },
      { id: 'gst_compliance', label: 'GST Compliance' },
      { id: 'fixed_assets', label: 'Fixed Assets' },
      { id: 'period_close', label: 'Period Close' },
    ],
  },
  {
    id: 'reports_section', label: 'Reports', icon: 'reports', defaultTab: 'reports',
    subItems: [{ id: 'reports', label: 'Financial Reports' }],
  },
  {
    id: 'settings_section', label: 'Settings', icon: 'settings', defaultTab: 'settings',
    subItems: [
      { id: 'settings', label: 'Settings' },
      { id: 'security_center', label: 'Security Center' },
      { id: 'identity_center', label: 'Identity Center' },
      { id: 'team_access', label: 'Team Access' },
      { id: 'recovery_center', label: 'Recovery Center' },
    ],
  },
] as const satisfies readonly FinanceNavigationSection[]);

export function resolveFinanceNavigation(
  capabilities: readonly FinanceCapabilityAvailability[]
): readonly ResolvedFinanceNavigationSection[] {
  const byKey = new Map(capabilities.map((capability) => [capability.key, capability]));
  return FINANCE_NAVIGATION_SECTIONS.map((section) => ({
    ...section,
    subItems: section.subItems.map((item) => {
      const requiredCapability = getRequiredFinanceCapability(item.id);
      const capability = requiredCapability ? byKey.get(requiredCapability) : undefined;
      const disabled = Boolean(requiredCapability && capability?.state !== 'enabled');
      return {
        ...item,
        requiredCapability,
        disabled,
        disabledReason: disabled
          ? capability?.reason || 'Checking whether this workflow is available for this organization.'
          : undefined,
      };
    }),
  }));
}
