import React, { useEffect, useState } from 'react';
import {
  Briefcase,
  Building2,
  Calculator,
  ChevronDown,
  ChevronRight,
  FolderKanban,
  Landmark,
  LayoutDashboard,
  LogOut,
  PieChart,
  Settings,
  ShoppingBag,
  TrendingUp,
  X,
} from 'lucide-react';
import { NavigationTab } from '../../types';
import { useBooks } from '../../context/BooksContext';
import { useOptionalAuth } from '../../context/AuthContext';

interface MobileNavProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onOpenQuickCreate?: () => void;
  enabledCapabilities?: ReadonlySet<string>;
}

interface SubNavItem {
  id: NavigationTab;
  label: string;
  badge?: string;
}

interface NavSection {
  id: string;
  label: string;
  icon: React.ReactNode;
  defaultTab: NavigationTab;
  subItems: SubNavItem[];
}

export const MobileNav: React.FC<MobileNavProps> = ({
  isOpen,
  onClose,
  activeTab,
  setActiveTab,
  onOpenQuickCreate,
  enabledCapabilities = new Set(),
}) => {
  const auth = useOptionalAuth();
  const { settings, currentUser } = useBooks();

  const displayName = auth?.user?.fullName || currentUser?.fullName || 'Account';
  const userEmail = auth?.user?.email || currentUser?.email || '';
  const userInitial = displayName.charAt(0).toUpperCase() || 'U';

  const handleLogout = async () => {
    if (auth?.logout) {
      await auth.logout();
    } else {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('active_organization_id');
      localStorage.removeItem('firmbooks_authenticated');
      window.location.reload();
    }
  };

  const navSections: NavSection[] = [
    {
      id: 'dashboard_section',
      label: 'Dashboard',
      icon: <LayoutDashboard className="w-5 h-5" />,
      defaultTab: 'dashboard',
      subItems: [{ id: 'dashboard', label: 'Dashboard' }],
    },
    {
      id: 'projects_section',
      label: 'Projects',
      icon: <FolderKanban className="w-5 h-5" />,
      defaultTab: 'projects',
      subItems: [{ id: 'projects', label: 'All Projects' }],
    },
    {
      id: 'banking_section',
      label: 'Banking & Cash',
      icon: <Landmark className="w-5 h-5" />,
      defaultTab: 'banking',
      subItems: [
        { id: 'banking', label: 'Bank & Cash Accounts' },
        { id: 'bank_reconciliation', label: 'Bank Reconciliation' },
      ],
    },
    {
      id: 'sales_section',
      label: 'Sales',
      icon: <TrendingUp className="w-5 h-5" />,
      defaultTab: 'invoices',
      subItems: [
        { id: 'clients', label: 'Customers' },
        { id: 'estimates', label: 'Estimates' },
        { id: 'sales_orders', label: 'Sales Orders' },
        { id: 'invoices', label: 'Invoices' },
        { id: 'delivery_challans', label: 'Delivery Challans' },
        { id: 'payments_received', label: 'Payments Received' },
        { id: 'salespersons', label: 'Salespersons' },
        { id: 'customer_portal' as NavigationTab, label: 'Customer Portal', badge: 'Portal' },
        ...(enabledCapabilities.has('receivables-corrections')
          ? [{ id: 'credit_notes' as NavigationTab, label: 'Credit Notes' }]
          : []),
        ...(enabledCapabilities.has('recurring-transactions')
          ? [{ id: 'recurring_invoices' as NavigationTab, label: 'Recurring Invoices' }]
          : []),
      ],
    },
    {
      id: 'purchases_section',
      label: 'Purchases',
      icon: <ShoppingBag className="w-5 h-5" />,
      defaultTab: 'expenses',
      subItems: [
        { id: 'vendors', label: 'Vendors' },
        { id: 'expenses', label: 'Expenses' },
        { id: 'purchase_orders', label: 'Purchase Orders' },
        { id: 'bills', label: 'Bills' },
        { id: 'document_inbox' as NavigationTab, label: 'Document Inbox & OCR', badge: 'OCR' },
        ...(enabledCapabilities.has('payables-settlement')
          ? [
              { id: 'payments_made' as NavigationTab, label: 'Payments Made' },
              { id: 'vendor_credits' as NavigationTab, label: 'Vendor Credits' },
            ]
          : []),
        ...(enabledCapabilities.has('recurring-transactions')
          ? [
              { id: 'recurring_bills' as NavigationTab, label: 'Recurring Bills' },
              { id: 'recurring_expenses' as NavigationTab, label: 'Recurring Expenses' },
            ]
          : []),
      ],
    },
    {
      id: 'accounting_section',
      label: 'Accounting',
      icon: <Calculator className="w-5 h-5" />,
      defaultTab: 'journals',
      subItems: [
        { id: 'journals', label: 'Manual Journals' },
        { id: 'bulk_updates', label: 'Bulk Journal Entry' },
        { id: 'coa', label: 'Chart of Accounts' },
        { id: 'data_migration' as NavigationTab, label: 'Data Migration & Balances' },
        { id: 'transaction_locking', label: 'Period Locks' },
        { id: 'gst_compliance', label: 'GST Compliance' },
        ...(enabledCapabilities.has('fixed-assets') ? [{ id: 'fixed_assets' as NavigationTab, label: 'Fixed Assets' }] : []),
        ...(enabledCapabilities.has('period-close') ? [{ id: 'period_close' as NavigationTab, label: 'Period Close' }] : []),
      ],
    },
    {
      id: 'reports_section',
      label: 'Reports',
      icon: <PieChart className="w-5 h-5" />,
      defaultTab: 'reports',
      subItems: [
        { id: 'reports', label: 'Financial Reports' },
      ],
    },
    {
      id: 'settings_section',
      label: 'Settings',
      icon: <Settings className="w-5 h-5" />,
      defaultTab: 'settings',
      subItems: [
        { id: 'settings', label: 'Settings' },
        { id: 'security_center' as NavigationTab, label: 'Security Center' },
        { id: 'identity_center' as NavigationTab, label: 'Identity Center' },
        ...(enabledCapabilities.has('team-access') ? [{ id: 'team_access' as NavigationTab, label: 'Team Access' }] : []),
        ...(enabledCapabilities.has('recovery-center') ? [{ id: 'recovery_center' as NavigationTab, label: 'Recovery Center' }] : []),
      ],
    },
  ];

  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    sales_section: true,
  });

  useEffect(() => {
    const parentSection = navSections.find((sec) =>
      sec.subItems.some((sub) => sub.id === activeTab)
    );
    if (parentSection) {
      setExpandedSections((prev) => ({
        ...prev,
        [parentSection.id]: true,
      }));
    }
  }, [activeTab]);

  if (!isOpen) return null;

  const toggleSection = (sectionId: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [sectionId]: !prev[sectionId],
    }));
  };

  return (
    <div className="fixed inset-0 z-50 lg:hidden flex">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="relative flex-1 max-w-sm w-[min(88vw,360px)] bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100 flex flex-col z-10 shadow-xl">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center font-bold text-white text-sm">
              <Briefcase className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-semibold text-sm truncate max-w-[150px]">{settings.firmName}</h2>
              <p className="text-[10px] text-slate-500 dark:text-slate-400">Workspace</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="grid h-11 w-11 place-items-center text-slate-500 hover:text-slate-900 rounded-xl hover:bg-slate-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800 cursor-pointer"
            aria-label="Close mobile navigation"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {onOpenQuickCreate && (
          <div className="p-3">
            <button
              onClick={() => {
                onClose();
                onOpenQuickCreate();
              }}
              className="w-full bg-blue-600 text-white min-h-11 px-3 rounded-xl text-sm font-semibold flex items-center justify-center space-x-2 shadow-sm cursor-pointer"
            >
              <span>+</span>
              <span>New Transaction</span>
            </button>
          </div>
        )}

        <nav aria-label="All modules" className="flex-1 px-2 py-2 space-y-1 overflow-y-auto overscroll-contain">
          {navSections.map((section) => {
            const isSingleSub = section.subItems.length === 1;
            const isSectionActive = section.subItems.some((sub) => sub.id === activeTab);
            const isExpanded = !!expandedSections[section.id];

            const handleSectionClick = () => {
              if (isSingleSub) {
                setActiveTab(section.defaultTab);
                onClose();
              } else {
                setExpandedSections((prev) => ({
                  ...prev,
                  [section.id]: !prev[section.id],
                }));
              }
            };

            return (
              <div key={section.id} className="space-y-0.5">
                <button
                  onClick={handleSectionClick}
                  aria-expanded={isSingleSub ? undefined : isExpanded}
                  className={`w-full min-h-11 flex items-center justify-between px-3 py-3 rounded-xl text-sm font-semibold text-left transition-colors cursor-pointer border ${
                    isSectionActive
                      ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 font-bold border-blue-100 dark:border-blue-900/60'
                      : 'text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-900 border-transparent'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <span className={isSectionActive ? 'text-blue-600 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400'}>
                      {section.icon}
                    </span>
                    <span>{section.label}</span>
                  </div>

                  {!isSingleSub && (
                    <span className="flex items-center space-x-1">
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-slate-400" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-slate-500" />
                      )}
                    </span>
                  )}
                </button>

                {!isSingleSub && isExpanded && (
                  <div className="pl-7 pr-1 py-1 space-y-1 border-l border-slate-200 dark:border-slate-800 ml-4">
                    {section.subItems.map((sub) => {
                      const isSubActive = activeTab === sub.id;
                      return (
                        <button
                          key={sub.id}
                          onClick={() => {
                            setActiveTab(sub.id);
                            onClose();
                          }}
                          aria-current={isSubActive ? 'page' : undefined}
                          className={`w-full min-h-10 flex items-center justify-between px-2.5 py-2 rounded-lg text-xs font-medium text-left transition-colors cursor-pointer ${
                            isSubActive
                              ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 font-bold border border-blue-100 dark:border-blue-900/60'
                              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-900'
                          }`}
                        >
                          <span>{sub.label}</span>
                          {sub.badge && (
                            <span className="text-[9px] bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 px-1.5 py-0.5 rounded border border-emerald-200 dark:border-emerald-800">
                              {sub.badge}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Mobile User Profile & Log Out Footer */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/60 space-y-3 shrink-0 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center font-bold text-sm shrink-0 shadow-xs">
              {userInitial}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{displayName}</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{userEmail || 'Active Session'}</p>
            </div>
          </div>
          <button
            onClick={async () => {
              onClose();
              await handleLogout();
            }}
            className="w-full min-h-11 flex items-center justify-center space-x-2 px-3 rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 dark:bg-rose-950/40 dark:hover:bg-rose-950/60 dark:border-rose-900 dark:text-rose-300 text-xs font-bold transition-all cursor-pointer active:scale-98"
            title="Log Out"
            aria-label="Log Out"
          >
            <LogOut className="w-4 h-4" />
            <span>Log Out</span>
          </button>
        </div>
      </div>
    </div>
  );
};
