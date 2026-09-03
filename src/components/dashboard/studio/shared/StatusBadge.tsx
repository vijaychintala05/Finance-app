import React from 'react';

interface StatusBadgeProps {
  label: string;
  variant?: 'rose' | 'amber' | 'emerald' | 'sky' | 'indigo' | 'purple' | 'slate';
  size?: 'sm' | 'md';
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  label,
  variant = 'slate',
  size = 'sm'
}) => {
  const variantStyles = {
    rose: 'bg-rose-50 text-rose-700 border-rose-200',
    amber: 'bg-amber-50 text-amber-800 border-amber-200',
    emerald: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    sky: 'bg-sky-50 text-sky-800 border-sky-200',
    indigo: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    purple: 'bg-purple-50 text-purple-700 border-purple-200',
    slate: 'bg-slate-100 text-slate-700 border-slate-200'
  };

  const sizeStyles = {
    sm: 'text-[10px] px-2 py-0.5',
    md: 'text-xs px-2.5 py-1'
  };

  return (
    <span className={`rounded-full font-extrabold border uppercase tracking-wide inline-flex items-center gap-1 ${variantStyles[variant]} ${sizeStyles[size]}`}>
      {label}
    </span>
  );
};
