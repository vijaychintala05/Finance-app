import React, { useEffect, useState } from 'react';
import {
  Building2,
  Calculator,
  ChevronDown,
  ChevronRight,
  FolderKanban,
  Hash,
  Landmark,
  LayoutDashboard,
  PieChart,
  Plus,
  Settings,
  ShoppingBag,
  TrendingUp,
} from 'lucide-react';
import { NavigationTab } from '../../types';
import { useBooks } from '../../context/BooksContext';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onOpenQuickCreate?: () => void;
  onOpenOrgSwitcher?: () => void;
  onOpenOrgWizard?: () => void;
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

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  onOpenQuickCreate,
  onOpenOrgSwitcher,
  onOpenOrgWizard,
}) => {
  const { settings, currentOrg, organizations } = useBooks();

  const navSections: NavSection[] = [
    {
      id: 'dashboard_section',
      label: 'Dashboard',
      icon: <LayoutDashboard className="w-4 h-4" />,
      defaultTab: 'dashboard',
      subItems: [
        { id: 'dashboard', label: 'Dashboard' },
      ],
    },
    {
      id: 'projects_section',
      label: 'Projects',
      icon: <FolderKanban className="w-4 h-4" />,
      defaultTab: 'projects',
      subItems: [
        { id: 'projects', label: 'All Projects' },
      ],
    },
    {
      id: 'banking_section',
      label: 'Banking & Cash',
      icon: <Landmark className="w-4 h-4" />,
      defaultTab: 'banking',
      subItems: [
        { id: 'banking', label: 'Bank & Cash Accounts' },
      ],
    },
    {
      id: 'sales_section',
      label: 'Sales',
      icon: <TrendingUp className="w-4 h-4" />,
      defaultTab: 'invoices',
      subItems: [
        { id: 'clients', label: 'Customers' },
        { id: 'invoices', label: 'Invoices' },
        { id: 'payments_received', label: 'Payments Received' },
      ],
    },
    {
      id: 'purchases_section',
      label: 'Purchases',
      icon: <ShoppingBag className="w-4 h-4" />,
      defaultTab: 'expenses',
      subItems: [
        { id: 'vendors', label: 'Vendors' },
        { id: 'expenses', label: 'Expenses' },
        { id: 'bills', label: 'Bills' },
      ],
    },
    {
      id: 'accounting_section',
      label: 'Accounting',
      icon: <Calculator className="w-4 h-4" />,
      defaultTab: 'journals',
      subItems: [
        { id: 'journals', label: 'Manual Journals' },
        { id: 'coa', label: 'Chart of Accounts' },
        { id: 'transaction_locking', label: 'Period Locks' },
      ],
    },
    {
      id: 'reports_section',
      label: 'Reports',
      icon: <PieChart className="w-4 h-4" />,
      defaultTab: 'reports',
      subItems: [
        { id: 'reports', label: 'Financial Reports' },
      ],
    },
    {
      id: 'settings_section',
      label: 'Settings',
      icon: <Settings className="w-4 h-4" />,
      defaultTab: 'settings_overview',
      subItems: [
        { id: 'settings_overview', label: 'Overview' },
        { id: 'settings', label: 'Workspace Settings' },
      ],
    },
  ];

  // Track expanded sections
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    sales_section: true, // Default expand sales
  });

  // Auto expand section that contains the active tab
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

  const toggleSection = (sectionId: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [sectionId]: !prev[sectionId],
    }));
  };

  return (
    <aside className="hidden lg:flex flex-col w-64 bg-[#1d50bd] text-white h-full shrink-0 select-none z-30 shadow-md">
      {/* Brand Header / "Books +" Pill Button */}
      <div className="p-3">
        <div className="bg-[#1442a0] hover:bg-[#11388b] text-white p-2.5 rounded-xl flex items-center justify-between cursor-pointer transition-colors shadow-xs">
          <div className="flex items-center space-x-2.5 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-white text-[#1d50bd] flex items-center justify-center font-black text-sm shrink-0 shadow-2xs">
              L
            </div>
            <div className="min-w-0">
              <h1 className="font-bold text-white text-xs leading-snug truncate">
                Books
              </h1>
              <p className="text-[10px] text-blue-200 truncate">LedgerFlow</p>
            </div>
          </div>
          {onOpenQuickCreate && (
            <button
              onClick={onOpenQuickCreate}
              className="w-6 h-6 rounded-md bg-white/20 hover:bg-white/30 text-white flex items-center justify-center font-bold text-sm transition-colors cursor-pointer"
              title="Quick Entry"
            >
              +
            </button>
          )}
        </div>
      </div>

      {/* Navigation List */}
      <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto custom-scrollbar">
        {navSections.map((section) => {
          const isSingleSub = section.subItems.length === 1;
          const isSectionActive = section.subItems.some((sub) => sub.id === activeTab);
          const isExpanded = !!expandedSections[section.id];

          const handleSectionClick = () => {
            if (isSingleSub) {
              setActiveTab(section.defaultTab);
            } else {
              if (isSectionActive) {
                setExpandedSections((prev) => ({
                  ...prev,
                  [section.id]: !prev[section.id],
                }));
              } else {
                setActiveTab(section.defaultTab);
                setExpandedSections((prev) => ({
                  ...prev,
                  [section.id]: true,
                }));
              }
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
              {/* Parent Section Header */}
              <button
                onClick={handleSectionClick}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                  isSectionActive
                    ? 'bg-[#1542a0] text-white font-bold shadow-2xs'
                    : 'text-blue-100 hover:text-white hover:bg-white/10'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <span className={isSectionActive ? 'text-white' : 'text-blue-200'}>
                    {section.icon}
                  </span>
                  <span>{section.label}</span>
                </div>

                {!isSingleSub && (
                  <div className="flex items-center space-x-1" onClick={handleToggleChevron}>
                    <span className="text-[10px] bg-white/15 text-blue-100 px-1.5 py-0.2 rounded font-mono">
                      {section.subItems.length}
                    </span>
                    {isExpanded ? (
                      <ChevronDown className="w-3.5 h-3.5 text-blue-200" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 text-blue-300" />
                    )}
                  </div>
                )}
              </button>

              {/* Sub-navigation items (only shown if multi-category and expanded) */}
              {!isSingleSub && isExpanded && (
                <div className="pl-6 pr-1 py-1 space-y-0.5 border-l border-white/20 ml-4">
                  {section.subItems.map((sub) => {
                    const isSubActive = activeTab === sub.id;
                    return (
                      <button
                        key={sub.id}
                        onClick={() => setActiveTab(sub.id)}
                        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-[11px] font-medium transition-all cursor-pointer ${
                          isSubActive
                            ? 'bg-white text-[#1d50bd] font-bold shadow-2xs'
                            : 'text-blue-100 hover:text-white hover:bg-white/10'
                        }`}
                      >
                        <span>{sub.label}</span>
                        {sub.badge && (
                          <span className="text-[9px] bg-emerald-400/30 text-white px-1.5 py-0.2 rounded font-semibold">
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

      {/* Footer info */}
      <div className="p-3 border-t border-white/15 text-[11px] text-blue-200 flex justify-between items-center">
        <span>FirmBooks v2.4</span>
        <span className="font-mono text-white font-semibold">{settings.currencyCode}</span>
      </div>
    </aside>
  );
};
