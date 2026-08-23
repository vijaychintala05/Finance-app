import React from 'react';

interface TableSkeletonProps {
  rows?: number;
  columns?: number;
  className?: string;
}

export const TableSkeleton: React.FC<TableSkeletonProps> = ({
  rows = 5,
  columns = 5,
  className = '',
}) => {
  return (
    <div className={`w-full overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs animate-pulse ${className}`}>
      {/* Header Bar */}
      <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/80 dark:bg-slate-800/40 p-4">
        <div className="h-4 w-36 rounded-md bg-slate-200 dark:bg-slate-700/60" />
        <div className="h-4 w-20 rounded-md bg-slate-200 dark:bg-slate-700/60" />
      </div>

      {/* Table Rows */}
      <div className="divide-y divide-slate-100 dark:divide-slate-800/60 p-2">
        {Array.from({ length: rows }).map((_, rIndex) => (
          <div key={rIndex} className="flex items-center justify-between gap-4 py-3.5 px-3">
            {Array.from({ length: columns }).map((_, cIndex) => {
              const widths = ['w-24', 'w-32', 'w-48', 'w-20', 'w-16'];
              const width = widths[cIndex % widths.length];
              return (
                <div
                  key={cIndex}
                  className={`h-3.5 rounded bg-slate-200/80 dark:bg-slate-700/40 ${width}`}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
};

export const MetricCardSkeleton: React.FC<{ count?: number }> = ({ count = 4 }) => {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, idx) => (
        <div
          key={idx}
          className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-2xs animate-pulse space-y-3"
        >
          <div className="flex items-center justify-between">
            <div className="h-3 w-20 rounded bg-slate-200 dark:bg-slate-750" />
            <div className="h-4 w-4 rounded-full bg-slate-200 dark:bg-slate-750" />
          </div>
          <div className="h-7 w-32 rounded-lg bg-slate-200 dark:bg-slate-700" />
          <div className="h-2.5 w-40 rounded bg-slate-200 dark:bg-slate-800" />
        </div>
      ))}
    </div>
  );
};
