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
// Item catalog mutation permissions mirror phase8.routes.ts for idempotent replays.
RoutePermissionRegistry.register('POST', '/items', ['invoices.create', 'purchases.create']);
RoutePermissionRegistry.register('PUT', '/items/:id', ['invoices.edit', 'purchases.edit']);
RoutePermissionRegistry.register('DELETE', '/items/:id', ['items.archive', 'roles.manage', 'settings.manage_users']);
RoutePermissionRegistry.register('DELETE', '/security/roles/:id', ['roles.manage', 'settings.manage_users']);
RoutePermissionRegistry.register('POST', '/budgets', ['budgets.manage', 'settings.manage_budgets']);
RoutePermissionRegistry.register('POST', '/finance/budgets', ['budgets.manage', 'settings.manage_budgets']);
RoutePermissionRegistry.register('POST', '/invoices', ['invoices.create']);
RoutePermissionRegistry.register('POST', '/finance/invoices', ['invoices.create']);
RoutePermissionRegistry.register('PATCH', '/finance/customers/:id', ['customers.edit']);
RoutePermissionRegistry.register('POST', '/finance/customers/:id/archive', ['customers.archive']);
RoutePermissionRegistry.register('POST', '/finance/salespersons', ['salespersons.create']);
RoutePermissionRegistry.register('PATCH', '/finance/salespersons/:id', ['salespersons.edit']);
RoutePermissionRegistry.register('POST', '/finance/salespersons/:id/archive', ['salespersons.archive']);
RoutePermissionRegistry.register('POST', '/finance/salespersons/:id/restore', ['salespersons.archive']);
RoutePermissionRegistry.register('PATCH', '/finance/projects/:id', ['projects.edit']);
RoutePermissionRegistry.register('POST', '/finance/projects/:id/archive', ['projects.archive']);
RoutePermissionRegistry.register('PUT', '/finance/sales-orders/:id', ['sales_orders.edit', 'invoices.edit']);
RoutePermissionRegistry.register('POST', '/finance/sales-orders/:id/convert-inv', ['invoices.create', 'sales_orders.create']);
RoutePermissionRegistry.register('POST', '/finance/sales-orders/:id/fulfill', ['delivery_challans.create', 'sales_orders.create', 'invoices.create']);
RoutePermissionRegistry.register('POST', '/finance/delivery-challans', ['delivery_challans.create', 'invoices.create']);
RoutePermissionRegistry.register('POST', '/finance/sales-orders/:id/cancel', ['sales_orders.delete', 'sales_orders.edit', 'invoices.edit']);
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

RoutePermissionRegistry.register('POST', '/finance/time-entries', ['projects.time_entries', 'invoices.create']);
RoutePermissionRegistry.register('POST', '/security/void-invoice', ['invoices.void', 'invoices.delete']);

RoutePermissionRegistry.register('POST', '/finance/documents/:category/:id/pdf/issue', ['invoices.send', 'estimates.send', 'sales_orders.create', 'delivery_challans.create', 'credit_notes.create', 'customer_payments.create', 'bills.create', 'expenses.create', 'vendor_credits.create', 'vendor_payments.create', 'purchase_orders.create', 'journals.post']);
RoutePermissionRegistry.register('POST', '/finance/invoices/:id/send-email', ['invoices.send']);
RoutePermissionRegistry.register('POST', '/finance/invoices/:id/reminder', ['invoices.send']);
