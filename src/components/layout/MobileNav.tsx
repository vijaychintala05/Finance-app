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
  PieChart,
  Settings,
  ShoppingBag,
  TrendingUp,
  X,
} from 'lucide-react';
import { NavigationTab } from '../../types';
import { useBooks } from '../../context/BooksContext';

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
  const { settings } = useBooks();

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
      ],
    },
    {
      id: 'sales_section',
      label: 'Sales',
      icon: <TrendingUp className="w-5 h-5" />,
      defaultTab: 'invoices',
      subItems: [
        { id: 'clients', label: 'Customers' },
        { id: 'invoices', label: 'Invoices' },
        { id: 'payments_received', label: 'Payments Received' },
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
        { id: 'bills', label: 'Bills' },
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
        { id: 'coa', label: 'Chart of Accounts' },
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
      <div className="relative flex-1 max-w-xs w-full bg-slate-900 text-slate-100 flex flex-col z-10 shadow-xl">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded bg-blue-600 flex items-center justify-center font-bold text-white text-sm">
              <Briefcase className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-semibold text-sm truncate max-w-[150px]">{settings.firmName}</h2>
              <p className="text-[10px] text-blue-400">Accounting & Projects</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 cursor-pointer"
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
              className="w-full bg-blue-600 text-white py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center space-x-2 shadow-sm cursor-pointer"
            >
              <span>+</span>
              <span>New Transaction</span>
            </button>
          </div>
        )}

        <nav className="flex-1 px-2 py-2 space-y-1 overflow-y-auto">
          {navSections.map((section) => {
            const isSingleSub = section.subItems.length === 1;
            const isSectionActive = section.subItems.some((sub) => sub.id === activeTab);
            const isExpanded = !!expandedSections[section.id];

            const handleSectionClick = () => {
              if (isSingleSub) {
                setActiveTab(section.defaultTab);
                onClose();
              } else {
                setActiveTab(section.defaultTab);
                setExpandedSections((prev) => ({
                  ...prev,
                  [section.id]: true,
                }));
              }
            };

            const handleToggleChevron = (e: React.MouseEvent) => {
              e.stopPropagation();
              setExpandedSections((prev) => ({
                ...prev,
                [section.id]: !prev[section.id],
              }));
            };

            return (
              <div key={section.id} className="space-y-0.5">
                <button
                  onClick={handleSectionClick}
                  className={`w-full flex items-center justify-between px-3 py-3 rounded-lg text-xs font-semibold text-left transition-colors cursor-pointer border ${
                    isSectionActive
                      ? 'bg-slate-800/90 text-blue-400 font-bold border-slate-700/60'
                      : 'text-slate-300 hover:bg-slate-800 border-transparent'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <span className={isSectionActive ? 'text-blue-400' : 'text-slate-400'}>
                      {section.icon}
                    </span>
                    <span>{section.label}</span>
                  </div>

                  {!isSingleSub && (
                    <div className="flex items-center space-x-1" onClick={handleToggleChevron}>
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-slate-400" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-slate-500" />
                      )}
                    </div>
                  )}
                </button>

                {!isSingleSub && isExpanded && (
                  <div className="pl-7 pr-1 py-1 space-y-1 border-l border-slate-800/80 ml-4">
                    {section.subItems.map((sub) => {
                      const isSubActive = activeTab === sub.id;
                      return (
                        <button
                          key={sub.id}
                          onClick={() => {
                            setActiveTab(sub.id);
                            onClose();
                          }}
                          className={`w-full flex items-center justify-between px-2.5 py-2 rounded-md text-xs font-medium text-left transition-colors cursor-pointer ${
                            isSubActive
                              ? 'bg-blue-600/20 text-blue-400 font-bold border border-blue-500/30'
                              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                          }`}
                        >
                          <span>{sub.label}</span>
                          {sub.badge && (
                            <span className="text-[9px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.2 rounded border border-emerald-500/30">
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
      </div>
    </div>
  );
};
