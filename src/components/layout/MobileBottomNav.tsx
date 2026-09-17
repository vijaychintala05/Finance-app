import React from 'react';
import {
  FileText,
  Home,
  MoreHorizontal,
  Receipt,
  Users,
} from 'lucide-react';

interface MobileBottomNavProps {
  activeTab: string;
  onNavigate: (tab: string) => void;
  onOpenMore: () => void;
}

interface NavDestination {
  id: string;
  label: string;
  icon: React.ElementType;
}

const primaryDestinations: NavDestination[] = [
  { id: 'dashboard', label: 'Home', icon: Home },
  { id: 'clients', label: 'Customers', icon: Users },
  { id: 'invoices', label: 'Invoices', icon: FileText },
  { id: 'expenses', label: 'Expenses', icon: Receipt },
];

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({ activeTab, onNavigate, onOpenMore }) => (
  <nav
    aria-label="Primary mobile navigation"
    className="fixed bottom-3 inset-x-3 sm:inset-x-8 z-40 max-w-md mx-auto rounded-full bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border border-slate-200/90 dark:border-slate-800 shadow-[0_8px_32px_rgba(15,23,42,0.12)] px-2 py-1.5 flex items-center justify-around lg:hidden"
  >
    {primaryDestinations.map(({ id, label, icon: Icon }) => {
      const active = activeTab === id;
      return (
        <button
          key={id}
          type="button"
          onClick={() => onNavigate(id)}
          className={`flex min-w-0 flex-1 flex-col items-center justify-center py-1 px-1.5 rounded-full transition-all cursor-pointer ${
            active
              ? 'text-blue-600 dark:text-blue-400'
              : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
          }`}
          aria-current={active ? 'page' : undefined}
        >
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-full transition-all ${
              active
                ? 'bg-blue-50 text-blue-600 dark:bg-blue-950/70 dark:text-blue-400 scale-105'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <Icon className="h-4.5 w-4.5" strokeWidth={active ? 2.4 : 1.9} />
          </div>
          <span className={`text-[10px] mt-0.5 tracking-tight truncate ${active ? 'font-bold text-blue-600 dark:text-blue-400' : 'font-medium'}`}>
            {label}
          </span>
        </button>
      );
    })}

    {/* More Button */}
    <button
      type="button"
      onClick={onOpenMore}
      className={`flex min-w-0 flex-1 flex-col items-center justify-center py-1 px-1.5 rounded-full hover:text-slate-900 dark:hover:text-white transition-all cursor-pointer ${primaryDestinations.some(({ id }) => id === activeTab) ? 'text-slate-500 dark:text-slate-400' : 'text-blue-600 dark:text-blue-400'}`}
      aria-label="Open more menu"
      aria-current={primaryDestinations.some(({ id }) => id === activeTab) ? undefined : 'page'}
    >
      <div className="flex h-8 w-8 items-center justify-center rounded-full">
        <MoreHorizontal className="h-4.5 w-4.5" strokeWidth={1.9} />
      </div>
      <span className="text-[10px] mt-0.5 font-medium tracking-tight truncate">
        More
      </span>
    </button>
  </nav>
);
