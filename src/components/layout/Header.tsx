import React, { useState, useRef, useEffect } from 'react';
import {
  ChevronDown,
  Menu,
  Plus,
  Sun,
  Moon,
  User,
  ShoppingBag,
  CreditCard,
  Calculator,
  FileSpreadsheet,
  Download,
} from 'lucide-react';
import { NavigationTab } from '../../types';
import { useBooks } from '../../context/BooksContext';

import { GlobalSearchBar } from '../common/GlobalSearchBar';

interface HeaderProps {
  currentTab?: NavigationTab;
  onNavigate?: (tab: string, options?: { autoCreate?: boolean }) => void;
  onOpenMobileMenu?: () => void;
  onOpenMobileNav?: () => void;
  onOpenQuickCreate?: () => void;
  onOpenOrgSwitcher?: () => void;
  onOpenOrgWizard?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentTab = 'dashboard',
  onNavigate,
  onOpenMobileMenu,
  onOpenMobileNav,
  onOpenOrgSwitcher,
}) => {
  const { settings, updateSettings, currentOrg } = useBooks();
  const handleMobileToggle = onOpenMobileMenu || onOpenMobileNav || (() => {});
  const [isNewMenuOpen, setIsNewMenuOpen] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const newMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handleInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleInstallPrompt);
  }, []);

  const installApp = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    setInstallPrompt(null);
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (newMenuRef.current && !newMenuRef.current.contains(e.target as Node)) {
        setIsNewMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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

  const activeLogoUrl = settings.orgProfileDetails?.logoUrl || settings.branding?.logoUrl || currentOrg.logoUrl;

  const handleQuickNew = (tab: string, autoCreate = true) => {
    setIsNewMenuOpen(false);
    if (onNavigate) {
      onNavigate(tab, { autoCreate });
    }
  };

  return (
    <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 py-2.5 sticky top-0 z-30 flex items-center justify-between shadow-2xs">
      {/* Left: Mobile Menu & Organization Brand */}
      <div className="flex items-center space-x-3 sm:space-x-4">
        <button
          onClick={handleMobileToggle}
          className="lg:hidden p-2 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
          aria-label="Open Mobile Menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Organization Switcher Trigger (Single Clean Instance) */}
        {onOpenOrgSwitcher ? (
          <button
            onClick={onOpenOrgSwitcher}
            className="group flex items-center space-x-2.5 hover:bg-slate-100 dark:hover:bg-slate-800 p-1.5 pr-3 rounded-2xl transition-all cursor-pointer border border-transparent hover:border-slate-200 dark:hover:border-slate-700 active:scale-[0.98]"
            title="Switch Organization Workspace"
          >
            {activeLogoUrl ? (
              <img
                src={activeLogoUrl}
                alt={currentOrg.name}
                className="w-8 h-8 rounded-xl object-contain bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-0.5 shadow-2xs shrink-0"
              />
            ) : (
              <div className="w-8 h-8 bg-blue-600 text-white rounded-xl flex items-center justify-center font-extrabold text-xs shadow-2xs shrink-0">
                {currentOrg.name ? currentOrg.name.charAt(0).toUpperCase() : 'O'}
              </div>
            )}
            <div className="text-left min-w-0">
              <div className="flex items-center space-x-1">
                <h1 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white leading-tight truncate max-w-[120px] sm:max-w-[220px]">
                  {currentOrg.name}
                </h1>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-200 transition-transform shrink-0" />
              </div>
              <span className="text-[10px] text-slate-400 font-medium block truncate max-w-[120px] sm:max-w-[220px]">
                {currentOrg.publicOrgId || `#${currentOrg.orgCode}`}
              </span>
            </div>
          </button>
        ) : (
          <div className="flex items-center space-x-2.5">
            {activeLogoUrl ? (
              <img
                src={activeLogoUrl}
                alt={currentOrg.name}
                className="w-8 h-8 rounded-xl object-contain bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-0.5 shadow-2xs shrink-0"
              />
            ) : (
              <div className="w-8 h-8 bg-blue-600 text-white rounded-xl flex items-center justify-center font-extrabold text-xs shadow-2xs shrink-0">
                {currentOrg.name ? currentOrg.name.charAt(0).toUpperCase() : 'O'}
              </div>
            )}
            <h1 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white leading-tight truncate max-w-[160px] sm:max-w-[220px]">
              {currentOrg.name}
            </h1>
          </div>
        )}
      </div>

      {/* Center: Global Search Bar (Desktop) */}
      <div className="hidden md:flex items-center flex-1 max-w-md mx-6">
        <GlobalSearchBar onNavigate={(tab, opts) => onNavigate && onNavigate(tab, opts)} />
      </div>

      {/* Right: Mobile Search, Global + New Dropdown & Theme / Utilities */}
      <div className="flex items-center space-x-2.5">
        {installPrompt && (
          <button
            type="button"
            onClick={() => void installApp()}
            className="hidden items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-100 sm:flex"
            title="Install FirmBooks as an app"
          >
            <Download className="h-4 w-4" />
            <span>Install</span>
          </button>
        )}
        {/* Mobile Search Trigger */}
        <div className="md:hidden">
          <GlobalSearchBar onNavigate={(tab, opts) => onNavigate && onNavigate(tab, opts)} isMobileTrigger={true} />
        </div>

        {/* Global + New Dropdown Button */}
        <div className="relative" ref={newMenuRef}>
          <button
            onClick={() => setIsNewMenuOpen(!isNewMenuOpen)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center space-x-1.5 shadow-2xs cursor-pointer transition-all active:scale-95"
            title="Create New Financial Record"
          >
            <Plus className="w-4 h-4" />
            <span>+ New</span>
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isNewMenuOpen ? 'rotate-180' : ''}`} />
          </button>

          {isNewMenuOpen && (
            <div className="absolute right-0 mt-2 w-60 bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 p-1.5 z-50 animate-fade-in text-xs space-y-0.5">
              <div className="px-3 py-1.5 font-bold text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                Sales & Revenue
              </div>
              <button
                onClick={() => handleQuickNew('clients', true)}
                className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/80 flex items-center space-x-2.5 text-slate-700 dark:text-slate-200 cursor-pointer transition-colors active:scale-98"
              >
                <div className="p-1 rounded-lg bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400">
                  <User className="w-3.5 h-3.5" />
                </div>
                <span className="font-medium">New Customer</span>
              </button>
              <button
                onClick={() => handleQuickNew('invoices', true)}
                className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/80 flex items-center space-x-2.5 text-slate-700 dark:text-slate-200 cursor-pointer transition-colors active:scale-98"
              >
                <div className="p-1 rounded-lg bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400">
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                </div>
                <span className="font-medium">New Invoice</span>
              </button>
              <button
                onClick={() => handleQuickNew('payments_received', true)}
                className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/80 flex items-center space-x-2.5 text-slate-700 dark:text-slate-200 cursor-pointer transition-colors active:scale-98"
              >
                <div className="p-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400">
                  <CreditCard className="w-3.5 h-3.5" />
                </div>
                <span className="font-medium">Payment Received</span>
              </button>

              <div className="px-3 py-1.5 pt-2 font-bold text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider border-t border-slate-100 dark:border-slate-800">
                Purchases & AP
              </div>
              <button
                onClick={() => handleQuickNew('vendors', true)}
                className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/80 flex items-center space-x-2.5 text-slate-700 dark:text-slate-200 cursor-pointer transition-colors active:scale-98"
              >
                <div className="p-1 rounded-lg bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400">
                  <User className="w-3.5 h-3.5" />
                </div>
                <span className="font-medium">New Vendor</span>
              </button>
              <button
                onClick={() => handleQuickNew('expenses', true)}
                className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/80 flex items-center space-x-2.5 text-slate-700 dark:text-slate-200 cursor-pointer transition-colors active:scale-98"
              >
                <div className="p-1 rounded-lg bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400">
                  <ShoppingBag className="w-3.5 h-3.5" />
                </div>
                <span className="font-medium">New Expense</span>
              </button>
              <button
                onClick={() => handleQuickNew('bills', true)}
                className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/80 flex items-center space-x-2.5 text-slate-700 dark:text-slate-200 cursor-pointer transition-colors active:scale-98"
              >
                <div className="p-1 rounded-lg bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400">
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                </div>
                <span className="font-medium">New Vendor Bill</span>
              </button>

              <div className="px-3 py-1.5 pt-2 font-bold text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider border-t border-slate-100 dark:border-slate-800">
                General Ledger
              </div>
              <button
                onClick={() => handleQuickNew('journals', true)}
                className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/80 flex items-center space-x-2.5 text-slate-700 dark:text-slate-200 cursor-pointer transition-colors active:scale-98"
              >
                <div className="p-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400">
                  <Calculator className="w-3.5 h-3.5" />
                </div>
                <span className="font-medium">Manual Journal Entry</span>
              </button>
            </div>
          )}
        </div>

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

      </div>
    </header>
  );
};
