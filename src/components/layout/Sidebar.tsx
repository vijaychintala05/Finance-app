import React, { useEffect, useState } from 'react';
import {
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
} from 'lucide-react';
import { useBooks } from '../../context/BooksContext';
import { useOptionalAuth } from '../../context/AuthContext';
import type { FinanceCapability } from '../../capabilities/useFinanceCapabilities';
import { resolveFinanceNavigation, type FinanceNavigationIcon } from '../../navigation/financeNavigation';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onOpenQuickCreate?: () => void;
  onOpenOrgSwitcher?: () => void;
  onOpenOrgWizard?: () => void;
  capabilities?: readonly FinanceCapability[];
}

const NAV_ICONS: Record<FinanceNavigationIcon, React.ReactNode> = {
  dashboard: <LayoutDashboard className="w-4 h-4" />,
  projects: <FolderKanban className="w-4 h-4" />,
  banking: <Landmark className="w-4 h-4" />,
  sales: <TrendingUp className="w-4 h-4" />,
  purchases: <ShoppingBag className="w-4 h-4" />,
  accounting: <Calculator className="w-4 h-4" />,
  reports: <PieChart className="w-4 h-4" />,
  settings: <Settings className="w-4 h-4" />,
};

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  onOpenQuickCreate,
  onOpenOrgSwitcher,
  onOpenOrgWizard,
  capabilities = [],
}) => {
  const auth = useOptionalAuth();
  const { settings, currentOrg, organizations, currentUser } = useBooks();

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

  const navSections = resolveFinanceNavigation(capabilities);

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
        <div
          onClick={onOpenOrgSwitcher}
          className="bg-[#1442a0] hover:bg-[#11388b] text-white p-2.5 rounded-xl flex items-center justify-between cursor-pointer transition-colors shadow-xs"
          title="Switch Organization Workspace"
        >
          <div className="flex items-center space-x-2.5 min-w-0">
            {currentOrg.logoUrl ? (
              <img
                src={currentOrg.logoUrl}
                alt={currentOrg.name}
                className="w-7 h-7 rounded-lg object-contain bg-white p-0.5 shrink-0"
              />
            ) : (
              <div className="w-7 h-7 rounded-lg bg-white text-[#1d50bd] flex items-center justify-center font-black text-xs shrink-0 shadow-2xs">
                {currentOrg.name ? currentOrg.name.charAt(0).toUpperCase() : 'F'}
              </div>
            )}
            <div className="min-w-0">
              <h1 className="font-bold text-white text-xs leading-snug truncate">
                {currentOrg.name || 'FirmBooks'}
              </h1>
              <p className="text-[10px] text-blue-200 truncate">
                {currentOrg.publicOrgId || 'FirmBooks Authority'}
              </p>
            </div>
          </div>
          {onOpenQuickCreate && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onOpenQuickCreate();
              }}
              className="w-6 h-6 rounded-md bg-white/20 hover:bg-white/30 text-white flex items-center justify-center font-bold text-sm transition-colors cursor-pointer"
              title="Quick Entry"
              aria-label="Quick create financial record"
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
                    {NAV_ICONS[section.icon]}
                  </span>
                  <span>{section.label}</span>
                </div>

                {!isSingleSub && (
                  <div className="flex items-center space-x-1" onClick={handleToggleChevron}>
                    <span aria-hidden="true" className="text-[10px] bg-white/15 text-blue-100 px-1.5 py-0.2 rounded font-mono">
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
                        onClick={() => !sub.disabled && setActiveTab(sub.id)}
                        disabled={sub.disabled}
                        title={sub.disabled ? sub.disabledReason : sub.label}
                        aria-label={sub.label}
                        aria-describedby={sub.disabled ? `${sub.id}-availability` : undefined}
                        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-[11px] font-medium transition-all cursor-pointer ${
                          sub.disabled
                            ? 'text-blue-200/60 cursor-not-allowed'
                            : isSubActive
                            ? 'bg-white text-[#1d50bd] font-bold shadow-2xs'
                            : 'text-blue-100 hover:text-white hover:bg-white/10'
                        }`}
                      >
                        <span>{sub.label}</span>
                        {sub.disabled && <span id={`${sub.id}-availability`} className="sr-only">{sub.disabledReason}</span>}
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

      {/* User Session & Quick Log Out Bar */}
      <div className="p-3 border-t border-white/15 bg-black/10 flex items-center justify-between">
        <div className="flex items-center space-x-2.5 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-white/20 text-white flex items-center justify-center font-bold text-xs shrink-0">
            {userInitial}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-white truncate leading-tight">
              {displayName}
            </p>
            <p className="text-[10px] text-blue-200 truncate leading-tight">
              {userEmail || 'Active'}
            </p>
          </div>
        </div>

        <button
          onClick={handleLogout}
          className="p-1.5 rounded-lg hover:bg-white/20 text-blue-200 hover:text-white transition-colors cursor-pointer shrink-0"
          title="Log Out"
          aria-label="Log Out"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>

      {/* Footer info */}
      <div className="px-3 py-2 border-t border-white/10 text-[10px] text-blue-200/80 flex justify-between items-center">
        <span>FirmBooks v1.0</span>
        <span className="font-mono text-white font-semibold">{settings.currencyCode}</span>
      </div>
    </aside>
  );
};
