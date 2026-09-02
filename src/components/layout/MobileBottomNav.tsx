import React from 'react';
import { Calculator, LayoutDashboard, MoreHorizontal, ShoppingCart, TrendingUp } from 'lucide-react';

interface MobileBottomNavProps {
  activeTab: string;
  onNavigate: (tab: string) => void;
  onOpenMore: () => void;
}

const primaryDestinations = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'invoices', label: 'Sales', icon: TrendingUp },
  { id: 'expenses', label: 'Purchases', icon: ShoppingCart },
  { id: 'journals', label: 'Accounting', icon: Calculator },
] as const;

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({ activeTab, onNavigate, onOpenMore }) => (
  <nav
    aria-label="Primary mobile navigation"
    className="fixed inset-x-0 bottom-0 z-40 flex h-16 items-stretch border-t border-slate-200 bg-white/95 px-1 pb-[env(safe-area-inset-bottom)] shadow-[0_-6px_24px_rgba(15,23,42,0.06)] backdrop-blur dark:border-slate-800 dark:bg-slate-950/95 lg:hidden"
  >
    {primaryDestinations.map(({ id, label, icon: Icon }) => {
      const active = activeTab === id;
      return (
        <button
          key={id}
          type="button"
          onClick={() => onNavigate(id)}
          className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-1 text-[10px] font-bold transition-colors ${
            active
              ? 'text-blue-600 dark:text-blue-400'
              : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
          }`}
          aria-current={active ? 'page' : undefined}
        >
          <Icon className="h-5 w-5" strokeWidth={active ? 2.5 : 2} />
          <span className="truncate">{label}</span>
        </button>
      );
    })}
    <button
      type="button"
      onClick={onOpenMore}
      className="flex min-w-0 flex-1 flex-col items-center justify-center gap-1 text-[10px] font-bold text-slate-500 transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
    >
      <MoreHorizontal className="h-5 w-5" />
      <span>More</span>
    </button>
  </nav>
);
