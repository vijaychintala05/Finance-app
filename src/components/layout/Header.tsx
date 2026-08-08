import React from 'react';
import {
  Bell,
  Briefcase,
  Building2,
  ChevronDown,
  Download,
  Hash,
  Menu,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  Sun,
  Moon,
  Laptop,
} from 'lucide-react';
import { NavigationTab } from '../../types';
import { useBooks } from '../../context/BooksContext';

interface HeaderProps {
  currentTab?: NavigationTab;
  onOpenMobileMenu?: () => void;
  onOpenMobileNav?: () => void;
  onOpenQuickCreate?: () => void;
  onOpenOrgSwitcher?: () => void;
  onOpenOrgWizard?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentTab = 'dashboard',
  onOpenMobileMenu,
  onOpenMobileNav,
  onOpenQuickCreate,
  onOpenOrgSwitcher,
  onOpenOrgWizard,
}) => {
  const { settings, updateSettings, currentOrg, exportOrganizationJSON, exportDataJSON, loadSampleData, clearAllData } = useBooks();
  const handleMobileToggle = onOpenMobileMenu || onOpenMobileNav || (() => {});

  const currentTheme = settings.userPreferences?.theme || 'Light';

  const toggleTheme = () => {
    let nextTheme: 'Light' | 'Dark' | 'System' = 'Dark';
    if (currentTheme === 'Dark') nextTheme = 'Light';
    else if (currentTheme === 'Light') nextTheme = 'Dark';
    
    updateSettings({
      userPreferences: {
        ...(settings.userPreferences || {
          language: 'English',
          dateFormat: 'DD/MM/YYYY',
          timezone: 'UTC',
          currencyFormat: '$1,234,567.89',
        }),
        theme: nextTheme,
      },
    });
  };

  const getTitle = () => {
    switch (currentTab) {
      case 'dashboard':
        return 'Financial Dashboard';
      case 'banking':
        return 'Banking & Cash Accounts';
      case 'projects':
        return 'Project-Level Bookkeeping';
      case 'clients':
        return 'Client Directory';
      case 'invoices':
        return 'Invoices & Billing';
      case 'estimates':
        return 'Estimates & Quotes';
      case 'expenses':
        return 'Expenses & Vendor Bills';
      case 'accounting':
        return 'Accounting & Ledger Governance';
      case 'coa':
        return 'Chart of Accounts (COA)';
      case 'journals':
        return 'Manual Journals';
      case 'bulk_updates':
        return 'Bulk Accounting Operations';
      case 'transaction_locking':
        return 'Transaction & Period Locking';
      case 'reports':
        return 'Financial Reports & P&L';
      case 'settings':
        return 'Firm Settings & Data Management';
      default:
        return 'LedgerFlow';
    }
  };

  const activeLogoUrl = settings.orgProfileDetails?.logoUrl || settings.branding?.logoUrl || currentOrg.logoUrl;

  return (
    <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 py-3 sticky top-0 z-20 flex items-center justify-between shadow-2xs">
      {/* Left: Mobile Toggle & Brand / Title */}
      <div className="flex items-center space-x-3 sm:space-x-4">
        <button
          onClick={handleMobileToggle}
          className="lg:hidden p-2 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors cursor-pointer"
          aria-label="Open Mobile Menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="flex items-center space-x-3">
          {activeLogoUrl ? (
            <img
              src={activeLogoUrl}
              alt={currentOrg.name}
              className="w-9 h-9 rounded-xl object-contain bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-0.5 shadow-2xs shrink-0"
            />
          ) : (
            <div className="w-9 h-9 bg-blue-600 text-white rounded-xl flex items-center justify-center font-extrabold text-sm shadow-2xs shrink-0">
              {currentOrg.name ? currentOrg.name.charAt(0).toUpperCase() : 'O'}
            </div>
          )}
          <div>
            <h1 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white leading-tight truncate max-w-[180px] sm:max-w-[260px]">
              {currentOrg.name}
            </h1>
          </div>
        </div>
      </div>

      {/* Center: Prominent Organization Switcher Dropdown Trigger */}
      {onOpenOrgSwitcher && (
        <div className="flex items-center justify-center">
          <button
            onClick={onOpenOrgSwitcher}
            className="group flex items-center space-x-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 px-3.5 py-1.5 rounded-xl text-xs font-semibold shadow-2xs transition-all cursor-pointer border border-slate-200 dark:border-slate-700 active:scale-[0.98]"
            title="Switch Organization Workspace"
          >
            {activeLogoUrl ? (
              <img
                src={activeLogoUrl}
                alt=""
                className="w-4 h-4 rounded-md object-contain bg-white dark:bg-slate-800 shrink-0 p-0.5"
              />
            ) : (
              <Building2 className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
            )}
            <span className="max-w-[150px] sm:max-w-[220px] truncate tracking-tight font-bold">
              {currentOrg.name}
            </span>
            <span className="hidden xs:inline-block font-mono text-[10px] text-amber-700 bg-amber-50 border border-amber-200 dark:text-amber-300 dark:bg-amber-950/80 dark:border-amber-800/80 px-1.5 py-0.5 rounded">
              {currentOrg.publicOrgId || `#${currentOrg.orgCode}`}
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-500 group-hover:text-slate-800 dark:text-slate-400 dark:group-hover:text-white transition-transform duration-150" />
          </button>
        </div>
      )}

      {/* Right: Quick Actions Pill & Data Tools */}
      <div className="flex items-center space-x-2">
        {/* Theme Toggle Button */}
        <button
          onClick={toggleTheme}
          title={`Current Theme: ${currentTheme}. Click to switch theme.`}
          aria-label="Toggle Light / Dark Mode"
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 cursor-pointer transition-colors shadow-2xs"
        >
          {currentTheme === 'Dark' ? (
            <>
              <Moon className="w-4 h-4 text-amber-400" />
              <span className="hidden sm:inline">Dark</span>
            </>
          ) : (
            <>
              <Sun className="w-4 h-4 text-amber-500" />
              <span className="hidden sm:inline">Light</span>
            </>
          )}
        </button>

        {/* Clear Data */}
        <button
          onClick={() => {
            if (
              window.confirm(
                'Clear all workspace records to start completely fresh with 0 entries?'
              )
            ) {
              clearAllData();
            }
          }}
          title="Clear All Data (Start Fresh)"
          aria-label="Clear All Data"
          className="p-2 text-slate-500 hover:text-rose-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full border border-slate-200 dark:border-slate-700 cursor-pointer transition-colors"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
