export type UserRole = 'Owner' | 'Admin' | 'Accountant' | 'Sales' | 'Purchase' | 'Viewer';

export const PERMISSIONS = [
  'invoices.view', 'invoices.create', 'invoices.edit', 'invoices.delete', 'invoices.approve', 'invoices.receive_payment',
  'purchases.view', 'purchases.create', 'purchases.edit', 'purchases.delete', 'purchases.approve', 'purchases.pay',
  'expenses.view', 'expenses.create',
  'accounting.view', 'accounting.post',
  'banking.view', 'banking.import', 'banking.match', 'banking.reconcile', 'banking.unreconcile', 'banking.rules.manage',
  'reports.view', 'reports.export',
  'audit.view',
  'settings.manage_users', 'settings.manage_taxes', 'settings.close_period', 'settings.backup', 'settings.approvals',
  'settings.manage_accounts', 'settings.manage_budgets', 'settings.manage_numbering',
  'migration.import',
] as const;

export type PermissionCode = (typeof PERMISSIONS)[number];

const ALL_PERMISSIONS: PermissionCode[] = [...PERMISSIONS];

export class RbacService {
  private static readonly rolePermissions: Record<UserRole, PermissionCode[]> = {
    Owner: ALL_PERMISSIONS,
    Admin: ALL_PERMISSIONS.filter((permission) => permission !== 'settings.backup' && permission !== 'migration.import'),
    Accountant: [
      'invoices.view', 'invoices.create', 'invoices.edit', 'invoices.approve', 'invoices.receive_payment',
      'purchases.view', 'purchases.create', 'purchases.edit', 'purchases.approve', 'purchases.pay',
      'expenses.view', 'expenses.create', 'accounting.view', 'accounting.post',
      'banking.view', 'banking.import', 'banking.match', 'banking.reconcile', 'banking.unreconcile', 'banking.rules.manage',
      'reports.view', 'reports.export', 'audit.view', 'settings.manage_taxes', 'settings.close_period',
      'settings.manage_accounts', 'settings.manage_budgets', 'settings.manage_numbering',
    ],
    Sales: [
      'invoices.view', 'invoices.create', 'invoices.edit', 'invoices.approve', 'invoices.receive_payment', 'reports.view',
    ],
    Purchase: [
      'purchases.view', 'purchases.create', 'purchases.edit', 'purchases.approve', 'purchases.pay',
      'expenses.view', 'expenses.create', 'reports.view',
    ],
    Viewer: ['invoices.view', 'purchases.view', 'expenses.view', 'accounting.view', 'banking.view', 'reports.view'],
  };

  public static isKnownPermission(permission: string): permission is PermissionCode {
    return (PERMISSIONS as readonly string[]).includes(permission);
  }

  public static getPermissionsForRole(role: string): PermissionCode[] {
    if (role === 'Super Admin') return [...ALL_PERMISSIONS]; // legacy seeded role
    return [...(this.rolePermissions[role as UserRole] || this.rolePermissions.Viewer)];
  }

  public static hasPermission(role: string, permission: PermissionCode): boolean {
    return this.getPermissionsForRole(role).includes(permission);
  }

  public static getAllRoles(): { role: UserRole; permissions: PermissionCode[] }[] {
    const roles: UserRole[] = ['Owner', 'Admin', 'Accountant', 'Sales', 'Purchase', 'Viewer'];
    return roles.map((role) => ({ role, permissions: this.getPermissionsForRole(role) }));
  }
}
