export type UserRole = 'Owner' | 'Admin' | 'Accountant' | 'Sales' | 'Purchase' | 'Viewer' | 'Super Admin';

export type PermissionCode =
  | 'invoices.view'
  | 'invoices.create'
  | 'invoices.edit'
  | 'invoices.delete'
  | 'invoices.approve'
  | 'purchases.view'
  | 'purchases.create'
  | 'purchases.edit'
  | 'purchases.delete'
  | 'purchases.approve'
  | 'purchases.pay'
  | 'banking.view'
  | 'banking.import'
  | 'banking.match'
  | 'banking.reconcile'
  | 'banking.unreconcile'
  | 'reports.view'
  | 'reports.export'
  | 'settings.manage_users'
  | 'settings.manage_taxes'
  | 'settings.close_period'
  | 'settings.backup'
  | 'settings.approvals';

export class RbacService {
  private static rolePermissions: Record<UserRole, PermissionCode[]> = {
    'Owner': [
      'invoices.view', 'invoices.create', 'invoices.edit', 'invoices.delete', 'invoices.approve',
      'purchases.view', 'purchases.create', 'purchases.edit', 'purchases.delete', 'purchases.approve', 'purchases.pay',
      'banking.view', 'banking.import', 'banking.match', 'banking.reconcile', 'banking.unreconcile',
      'reports.view', 'reports.export',
      'settings.manage_users', 'settings.manage_taxes', 'settings.close_period', 'settings.backup', 'settings.approvals'
    ],
    'Super Admin': [
      'invoices.view', 'invoices.create', 'invoices.edit', 'invoices.delete', 'invoices.approve',
      'purchases.view', 'purchases.create', 'purchases.edit', 'purchases.delete', 'purchases.approve', 'purchases.pay',
      'banking.view', 'banking.import', 'banking.match', 'banking.reconcile', 'banking.unreconcile',
      'reports.view', 'reports.export',
      'settings.manage_users', 'settings.manage_taxes', 'settings.close_period', 'settings.backup', 'settings.approvals'
    ],
    'Admin': [
      'invoices.view', 'invoices.create', 'invoices.edit', 'invoices.delete', 'invoices.approve',
      'purchases.view', 'purchases.create', 'purchases.edit', 'purchases.delete', 'purchases.approve', 'purchases.pay',
      'banking.view', 'banking.import', 'banking.match', 'banking.reconcile', 'banking.unreconcile',
      'reports.view', 'reports.export',
      'settings.manage_users', 'settings.manage_taxes', 'settings.close_period', 'settings.backup', 'settings.approvals'
    ],
    'Accountant': [
      'invoices.view', 'invoices.create', 'invoices.edit', 'invoices.delete', 'invoices.approve',
      'purchases.view', 'purchases.create', 'purchases.edit', 'purchases.delete', 'purchases.approve', 'purchases.pay',
      'banking.view', 'banking.import', 'banking.match', 'banking.reconcile', 'banking.unreconcile',
      'reports.view', 'reports.export',
      'settings.manage_taxes', 'settings.close_period'
    ],
    'Sales': [
      'invoices.view', 'invoices.create', 'invoices.edit', 'invoices.approve',
      'reports.view'
    ],
    'Purchase': [
      'purchases.view', 'purchases.create', 'purchases.edit', 'purchases.approve', 'purchases.pay',
      'reports.view'
    ],
    'Viewer': [
      'invoices.view',
      'purchases.view',
      'banking.view',
      'reports.view'
    ]
  };

  public static getPermissionsForRole(role: string): PermissionCode[] {
    const canonicalRole = (role || 'Viewer') as UserRole;
    return this.rolePermissions[canonicalRole] || this.rolePermissions['Viewer'];
  }

  public static hasPermission(role: string, permission: PermissionCode): boolean {
    const permissions = this.getPermissionsForRole(role);
    return permissions.includes(permission);
  }

  public static getAllRoles(): { role: UserRole; permissions: PermissionCode[] }[] {
    const roles: UserRole[] = ['Owner', 'Admin', 'Accountant', 'Sales', 'Purchase', 'Viewer'];
    return roles.map((r) => ({
      role: r,
      permissions: this.getPermissionsForRole(r),
    }));
  }
}
