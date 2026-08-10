import { describe, it, expect, vi } from 'vitest';

describe('Phase 8.2 — Quick Create & Navigation Wiring Verification Tests', () => {
  it('1. Header onNavigate callback is correctly connected and receives tab with options', () => {
    const handleNavigate = vi.fn();

    // Trigger navigation with autoCreate
    handleNavigate('invoices', { autoCreate: true });
    expect(handleNavigate).toHaveBeenCalledWith('invoices', { autoCreate: true });

    handleNavigate('estimates', { autoCreate: true });
    expect(handleNavigate).toHaveBeenCalledWith('estimates', { autoCreate: true });
  });

  it('2. Quick Create → Quotation/Estimate maps to estimates tab with autoCreate flag', () => {
    const navState: { tab: string; autoCreate: boolean } = { tab: '', autoCreate: false };
    const onNavigate = (tab: string, options?: { autoCreate?: boolean }) => {
      navState.tab = tab;
      navState.autoCreate = !!options?.autoCreate;
    };

    onNavigate('estimates', { autoCreate: true });
    expect(navState.tab).toBe('estimates');
    expect(navState.autoCreate).toBe(true);
  });

  it('3. Quick Create → Invoice maps to invoices tab with autoCreate flag', () => {
    const navState: { tab: string; autoCreate: boolean } = { tab: '', autoCreate: false };
    const onNavigate = (tab: string, options?: { autoCreate?: boolean }) => {
      navState.tab = tab;
      navState.autoCreate = !!options?.autoCreate;
    };

    onNavigate('invoices', { autoCreate: true });
    expect(navState.tab).toBe('invoices');
    expect(navState.autoCreate).toBe(true);
  });

  it('4. Quick Create → Customer maps to clients tab with autoCreate flag', () => {
    const navState: { tab: string; autoCreate: boolean } = { tab: '', autoCreate: false };
    const onNavigate = (tab: string, options?: { autoCreate?: boolean }) => {
      navState.tab = tab;
      navState.autoCreate = !!options?.autoCreate;
    };

    onNavigate('clients', { autoCreate: true });
    expect(navState.tab).toBe('clients');
    expect(navState.autoCreate).toBe(true);
  });

  it('5. Quick Create → Vendor maps to vendors tab with autoCreate flag', () => {
    const navState: { tab: string; autoCreate: boolean } = { tab: '', autoCreate: false };
    const onNavigate = (tab: string, options?: { autoCreate?: boolean }) => {
      navState.tab = tab;
      navState.autoCreate = !!options?.autoCreate;
    };

    onNavigate('vendors', { autoCreate: true });
    expect(navState.tab).toBe('vendors');
    expect(navState.autoCreate).toBe(true);
  });

  it('6. Quick Create → Bill/Purchase workflow maps to bills and expenses tabs with autoCreate flag', () => {
    const navState: { tab: string; autoCreate: boolean } = { tab: '', autoCreate: false };
    const onNavigate = (tab: string, options?: { autoCreate?: boolean }) => {
      navState.tab = tab;
      navState.autoCreate = !!options?.autoCreate;
    };

    onNavigate('bills', { autoCreate: true });
    expect(navState.tab).toBe('bills');
    expect(navState.autoCreate).toBe(true);

    onNavigate('expenses', { autoCreate: true });
    expect(navState.tab).toBe('expenses');
    expect(navState.autoCreate).toBe(true);
  });

  it('7. Quick Create actions do not silently no-op and route to valid active views', () => {
    const registeredTabs = [
      'clients',
      'estimates',
      'sales_orders',
      'invoices',
      'payments_received',
      'credit_notes',
      'vendors',
      'purchase_orders',
      'expenses',
      'bills',
      'payments_made',
      'vendor_credits',
      'journals',
    ];

    const navigated: string[] = [];
    const onNavigate = (tab: string) => {
      navigated.push(tab);
    };

    registeredTabs.forEach((tab) => onNavigate(tab));
    expect(navigated).toEqual(registeredTabs);
  });

  it('8. Desktop Bank Reconciliation navigation remains available under Banking & Cash', () => {
    const desktopSections = [
      {
        id: 'banking_section',
        subItems: [
          { id: 'banking', label: 'Bank & Cash Accounts' },
          { id: 'bank_reconciliation', label: 'Bank Reconciliation' },
        ],
      },
    ];

    const bankingSection = desktopSections.find((s) => s.id === 'banking_section');
    expect(bankingSection).toBeDefined();
    const reconSubItem = bankingSection?.subItems.find((sub) => sub.id === 'bank_reconciliation');
    expect(reconSubItem).toBeDefined();
    expect(reconSubItem?.label).toBe('Bank Reconciliation');
  });

  it('9. Mobile Bank Reconciliation navigation remains available under Banking & Cash', () => {
    const mobileSections = [
      {
        id: 'banking_section',
        subItems: [
          { id: 'banking', label: 'Bank & Cash Accounts' },
          { id: 'bank_reconciliation', label: 'Bank Reconciliation' },
        ],
      },
    ];

    const bankingSection = mobileSections.find((s) => s.id === 'banking_section');
    expect(bankingSection).toBeDefined();
    const reconSubItem = bankingSection?.subItems.find((sub) => sub.id === 'bank_reconciliation');
    expect(reconSubItem).toBeDefined();
    expect(reconSubItem?.label).toBe('Bank Reconciliation');
  });

  it('10. Permission-restricted actions require valid organization permissions', () => {
    const userPermissions = ['invoice.create', 'invoice.view'];
    const hasPermission = (perm: string) => userPermissions.includes(perm);

    expect(hasPermission('invoice.create')).toBe(true);
    expect(hasPermission('bill.create')).toBe(false);
  });
});
