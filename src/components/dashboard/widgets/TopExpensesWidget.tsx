import React, { useState, useMemo } from 'react';
import { PieChart, Plus, ArrowRight } from 'lucide-react';
import { formatCurrency } from '../../../utils/formatters';

export interface RawExpenseCategory {
  name: string;
  amount: number;
}

interface TopExpensesWidgetProps {
  expenses?: RawExpenseCategory[];
  currencySymbol?: string;
  title?: string;
  periodLabel?: string;
  onNavigate?: (tab: string) => void;
  onRecordExpense?: () => void;
  // Optional period selector
  selectedPeriod?: 'fiscal' | 'year' | 'quarter' | 'month';
  onPeriodChange?: (period: 'fiscal' | 'year' | 'quarter' | 'month') => void;
  isMobile?: boolean;
}

export interface ProcessedExpenseCategory {
  name: string;
  amount: number;
  percent: number;
  color: string;
  isOthers?: boolean;
}

const PALETTE = [
  '#3b82f6', // Blue
  '#ef4444', // Red / Rose
  '#8b5cf6', // Violet
  '#f59e0b', // Amber
  '#10b981', // Emerald
  '#06b6d4', // Cyan
];

const OTHERS_COLOR = '#94a3b8'; // Slate 400

// Helper to convert polar coordinates to Cartesian
function polarToCartesian(centerX: number, centerY: number, radius: number, angleInDegrees: number) {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;
  return {
    x: centerX + radius * Math.cos(angleInRadians),
    y: centerY + radius * Math.sin(angleInRadians),
  };
}

// Generate SVG arc path for a donut slice
function describeDonutSlice(
  x: number,
  y: number,
  innerRadius: number,
  outerRadius: number,
  startAngle: number,
  endAngle: number
): string {
  // Guard against full 360 degree arc singularity
  const diff = endAngle - startAngle;
  const sweep = Math.min(diff, 359.999);
  const adjustedEnd = startAngle + sweep;

  const startOuter = polarToCartesian(x, y, outerRadius, startAngle);
  const endOuter = polarToCartesian(x, y, outerRadius, adjustedEnd);
  const startInner = polarToCartesian(x, y, innerRadius, adjustedEnd);
  const endInner = polarToCartesian(x, y, innerRadius, startAngle);

  const largeArcFlag = sweep > 180 ? '1' : '0';

  return [
    `M ${startOuter.x} ${startOuter.y}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 1 ${endOuter.x} ${endOuter.y}`,
    `L ${startInner.x} ${startInner.y}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${endInner.x} ${endInner.y}`,
    'Z',
  ].join(' ');
}

export const TopExpensesWidget: React.FC<TopExpensesWidgetProps> = ({
  expenses = [],
  currencySymbol = '₹',
  title = 'Top Expense Categories',
  periodLabel,
  onNavigate,
  onRecordExpense,
  selectedPeriod,
  onPeriodChange,
  isMobile = false,
}) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  // Process raw expenses into top 5-6 + Others column
  const { categories, total, slices } = useMemo(() => {
    // 1. Filter valid positive expenses and sort descending by amount
    const valid = (expenses || [])
      .filter((e) => typeof e.amount === 'number' && e.amount > 0)
      .sort((a, b) => b.amount - a.amount);

    const totalSum = valid.reduce((acc, e) => acc + e.amount, 0);

    if (totalSum === 0 || valid.length === 0) {
      return { categories: [], total: 0, slices: [] };
    }

    const processed: ProcessedExpenseCategory[] = [];

    // Grouping: If more than 6 categories, take top 5 and aggregate remainder into "Others"
    if (valid.length > 6) {
      for (let i = 0; i < 5; i++) {
        const item = valid[i];
        processed.push({
          name: item.name,
          amount: item.amount,
          percent: Math.round((item.amount / totalSum) * 100),
          color: PALETTE[i % PALETTE.length],
        });
      }
      const othersAmount = valid.slice(5).reduce((sum, item) => sum + item.amount, 0);
      if (othersAmount > 0) {
        processed.push({
          name: 'Others',
          amount: othersAmount,
          percent: Math.round((othersAmount / totalSum) * 100),
          color: OTHERS_COLOR,
          isOthers: true,
        });
      }
    } else {
      // 6 or fewer categories: display all directly with distinct colors
      valid.forEach((item, i) => {
        processed.push({
          name: item.name,
          amount: item.amount,
          percent: Math.round((item.amount / totalSum) * 100),
          color: PALETTE[i % PALETTE.length],
        });
      });
    }

    // Build SVG donut slice geometry
    let currentAngle = 0;
    const computedSlices = processed.map((cat, idx) => {
      const sliceAngle = (cat.amount / totalSum) * 360;
      const startAngle = currentAngle;
      const endAngle = currentAngle + sliceAngle;
      currentAngle = endAngle;

      return {
        ...cat,
        idx,
        startAngle,
        endAngle,
        sliceAngle,
      };
    });

    return { categories: processed, total: totalSum, slices: computedSlices };
  }, [expenses]);

  const activeCategory = hoveredIndex !== null ? categories[hoveredIndex] : null;

  return (
    <div className="rounded-2xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-xs dark:border-slate-800/90 dark:bg-slate-900 flex flex-col justify-between transition-all">
      <div>
        {/* HEADER SECTION */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-50 text-rose-600 dark:bg-rose-950 dark:text-rose-400">
              <PieChart className="h-4 w-4" />
            </div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">{title}</h2>
          </div>

          <div className="flex items-center gap-3">
            {onPeriodChange && selectedPeriod && (
              <select
                value={selectedPeriod}
                onChange={(e) => onPeriodChange(e.target.value as any)}
                className="appearance-none rounded-lg border border-slate-200 bg-slate-50 py-1 pl-2.5 pr-6 text-xs font-semibold text-slate-700 outline-none hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 cursor-pointer"
              >
                <option value="fiscal">This Fiscal Year</option>
                <option value="year">This Calendar Year</option>
                <option value="quarter">This Quarter</option>
                <option value="month">This Month</option>
              </select>
            )}

            {onNavigate && (
              <button
                type="button"
                onClick={() => onNavigate('expenses')}
                className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 cursor-pointer transition-colors"
              >
                <span>All Expenses</span>
                <ArrowRight className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>

        {/* CONTENT SECTION */}
        {categories.length === 0 ? (
          <div className="py-10 text-center px-4">
            <p className="font-semibold text-xs text-slate-600 dark:text-slate-400">
              {isMobile ? "No expense transactions in this range" : "No operational expenses"}
            </p>
            <p className="text-[11px] text-slate-400 mt-1 max-w-xs mx-auto leading-relaxed">
              Recorded for {periodLabel || 'this period'}. There's no data available as no transactions were recorded in the selected date range.
            </p>
            {onRecordExpense && (
              <button
                type="button"
                onClick={onRecordExpense}
                className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-full border border-slate-200 bg-white text-xs font-bold text-slate-800 shadow-xs hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 cursor-pointer transition-all active:scale-95"
              >
                <Plus className="w-3.5 h-3.5 text-slate-700 dark:text-slate-200" />
                <span>New Expense</span>
              </button>
            )}
          </div>
        ) : (
          <div className="mt-4 flex flex-col sm:flex-row items-center sm:items-start gap-5">
            {/* 1. DONUT PIE CHART (SVG) */}
            <div className="relative shrink-0 flex items-center justify-center select-none">
              <svg viewBox="0 0 200 200" className="w-40 h-40 sm:w-44 sm:h-44 overflow-visible">
                {slices.length === 1 ? (
                  // Single category: full circular ring
                  <circle
                    cx="100"
                    cy="100"
                    r="65"
                    fill="none"
                    stroke={slices[0].color}
                    strokeWidth="24"
                    className="cursor-pointer transition-all"
                    onMouseEnter={() => setHoveredIndex(0)}
                    onMouseLeave={() => setHoveredIndex(null)}
                  />
                ) : (
                  // Multiple categories: render arc slices
                  slices.map((slice) => {
                    const isHovered = hoveredIndex === slice.idx;
                    const path = describeDonutSlice(100, 100, 52, isHovered ? 82 : 78, slice.startAngle, slice.endAngle);
                    return (
                      <path
                        key={slice.idx}
                        d={path}
                        fill={slice.color}
                        className="cursor-pointer transition-all duration-200"
                        opacity={hoveredIndex === null || isHovered ? 1 : 0.65}
                        onMouseEnter={() => setHoveredIndex(slice.idx)}
                        onMouseLeave={() => setHoveredIndex(null)}
                      />
                    );
                  })
                )}
              </svg>

              {/* CENTER DISPLAY INSIDE DONUT */}
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none px-3">
                {activeCategory ? (
                  <>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider truncate max-w-[85px]">
                      {activeCategory.name}
                    </span>
                    <span className="text-xs sm:text-sm font-black text-slate-900 dark:text-white font-financial truncate max-w-[95px]">
                      {formatCurrency(activeCategory.amount, currencySymbol)}
                    </span>
                    <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
                      {activeCategory.percent}%
                    </span>
                  </>
                ) : (
                  <>
                    <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Total
                    </span>
                    <span className="text-xs sm:text-sm font-black text-slate-900 dark:text-white font-financial truncate max-w-[95px]">
                      {formatCurrency(total, currencySymbol)}
                    </span>
                    <span className="text-[9px] text-slate-400">
                      Expenses
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* 2. CATEGORIES COLUMN WITH OTHERS AFTERWARDS */}
            <div className="w-full min-w-0 space-y-2.5 flex-1">
              {categories.map((cat, idx) => {
                const isHovered = hoveredIndex === idx;
                return (
                  <div
                    key={idx}
                    className={`group space-y-1 p-1.5 -mx-1.5 rounded-lg transition-all cursor-pointer ${
                      isHovered ? 'bg-slate-50 dark:bg-slate-800/60' : ''
                    }`}
                    onMouseEnter={() => setHoveredIndex(idx)}
                    onMouseLeave={() => setHoveredIndex(null)}
                  >
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2 truncate pr-2">
                        <span
                          className={`h-2.5 w-2.5 rounded-full shrink-0 transition-transform ${
                            isHovered ? 'scale-125' : ''
                          }`}
                          style={{ backgroundColor: cat.color }}
                        />
                        <span
                          className={`truncate font-semibold ${
                            cat.isOthers
                              ? 'text-slate-500 dark:text-slate-400 italic'
                              : 'text-slate-800 dark:text-slate-200'
                          } ${isHovered ? 'text-slate-900 dark:text-white' : ''}`}
                        >
                          {cat.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-financial font-bold text-slate-900 dark:text-white">
                          {formatCurrency(cat.amount, currencySymbol)}
                        </span>
                        <span className="text-[11px] font-bold text-slate-400">
                          ({cat.percent}%)
                        </span>
                      </div>
                    </div>
                    {/* Micro Progress Bar */}
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div
                        style={{
                          width: `${cat.percent}%`,
                          backgroundColor: cat.color,
                        }}
                        className="h-full rounded-full transition-all duration-300"
                      />
                    </div>
                  </div>
                );
              })}

              {/* Total Operating Costs Row */}
              <div className="mt-3 border-t border-slate-100 pt-2.5 flex items-center justify-between font-bold text-xs text-slate-900 dark:border-slate-800 dark:text-white">
                <span>Total Operating Costs</span>
                <span className="font-financial">{formatCurrency(total, currencySymbol)}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      <p className="mt-4 text-[11px] text-slate-400 border-t border-slate-100 pt-2 dark:border-slate-800">
        Operating expenses logged in general ledger for this period.
      </p>
    </div>
  );
};
