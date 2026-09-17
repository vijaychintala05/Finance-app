export class RoutePermissionRegistry {
  private static routeRules: Array<{ method: string; pattern: RegExp; permissions: string[] }> = [];

  public static register(method: string, pathPattern: string, permissions: string[]): void {
    // Normalize pathPattern to support both with and without /api/v1 prefix
    const base = pathPattern.startsWith('/') ? pathPattern : `/${pathPattern}`;
    const cleanPattern = base.replace(/:[a-zA-Z0-9_]+/g, '[^/]+').replace(/\//g, '\\/');
    const regexPattern = `^(${cleanPattern}|/api/v1${cleanPattern}|/api/v1/finance${cleanPattern}|/api/v1/banking${cleanPattern})(\\?.*)?$`;
    
    RoutePermissionRegistry.routeRules.push({
      method: method.toUpperCase(),
      pattern: new RegExp(regexPattern, 'i'),
      permissions,
    });
  }

  public static getRequiredPermissions(method: string, path: string): string[] | null {
    const cleanPath = (path || '').split('?')[0];
    const normMethod = (method || '').toUpperCase();
    for (const rule of RoutePermissionRegistry.routeRules) {
      if (rule.method === normMethod && rule.pattern.test(cleanPath)) {
        return rule.permissions;
      }
    }
    return null;
  }
}

// Register authoritative route mutation permissions
RoutePermissionRegistry.register('POST', '/budgets', ['budgets.manage', 'settings.manage_budgets']);
RoutePermissionRegistry.register('POST', '/finance/budgets', ['budgets.manage', 'settings.manage_budgets']);
RoutePermissionRegistry.register('POST', '/invoices', ['invoices.create']);
RoutePermissionRegistry.register('POST', '/finance/invoices', ['invoices.create']);
RoutePermissionRegistry.register('POST', '/payments', ['payments.create', 'invoices.create']);
RoutePermissionRegistry.register('POST', '/finance/payments', ['payments.create', 'invoices.create']);
RoutePermissionRegistry.register('POST', '/payments-received', ['customer_payments.create', 'invoices.receive_payment']);
RoutePermissionRegistry.register('POST', '/bills', ['vendors.create', 'purchases.create']);
RoutePermissionRegistry.register('POST', '/finance/bills', ['vendors.create', 'purchases.create']);
RoutePermissionRegistry.register('POST', '/payments-made', ['purchases.create', 'vendors.create']);
RoutePermissionRegistry.register('POST', '/finance/payments-made', ['purchases.create', 'vendors.create']);
RoutePermissionRegistry.register('POST', '/expenses', ['expenses.create']);
RoutePermissionRegistry.register('POST', '/finance/expenses', ['expenses.create']);
RoutePermissionRegistry.register('POST', '/banking/reconciliation/categorize', ['banking.reconcile']);
RoutePermissionRegistry.register('POST', '/migration/opening-balances', ['migration.import', 'opening_balances.manage']);
RoutePermissionRegistry.register('POST', '/finance/migration/opening-balances', ['migration.import', 'opening_balances.manage']);
