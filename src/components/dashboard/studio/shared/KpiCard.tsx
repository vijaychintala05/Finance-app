import React from 'react';
import { ChevronRight } from 'lucide-react';

interface KpiCardProps {
  title: string;
  count: number;
  badgeText: string;
  badgeStyle: string; // e.g., 'text-rose-700 bg-rose-50 border-rose-200'
  iconBg: string; // e.g., 'bg-rose-50 text-rose-700 border-rose-200'
  hoverBorder: string; // e.g., 'hover:border-rose-300'
  actionText?: string;
  icon: React.ReactNode;
  onClick: () => void;
}

export const KpiCard: React.FC<KpiCardProps> = ({
  title,
  count,
  badgeText,
  badgeStyle,
  iconBg,
  hoverBorder,
  actionText = 'View list',
  icon,
  onClick
}) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/80 ${hoverBorder} shadow-2xs hover:shadow-md transition-all cursor-pointer group relative overflow-hidden`}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-slate-500">{title}</span>
        <div className={`w-8 h-8 rounded-xl ${iconBg} flex items-center justify-center group-hover:scale-110 transition-transform border`}>
          {icon}
        </div>
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-2xl sm:text-3xl font-black text-slate-900">{count}</span>
        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${badgeStyle}`}>
          {badgeText}
        </span>
      </div>
      <div className="mt-2 text-[10px] text-slate-400 font-medium flex items-center gap-1">
        <span>{actionText}</span>
        <ChevronRight className="w-3 h-3 text-slate-400 group-hover:translate-x-1 transition-transform" />
      </div>
    </button>
  );
};
