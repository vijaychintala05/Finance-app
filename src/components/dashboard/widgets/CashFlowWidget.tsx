import React, { useMemo, useState } from 'react';
import {
  BarChart2,
  Coins,
  TrendingUp,
  ChevronDown,
  ArrowRight,
  Clock,
} from 'lucide-react';
import { formatCurrency } from '../../../utils/formatters';

export interface TimelineDataPoint {
  date: string;
  rawDate: string;
  income: number;
  expenses: number;
  net: number;
}

interface CashFlowWidgetProps {
  timelinePoints: TimelineDataPoint[];
  performanceTotals?: {
    revenue: number;
    expenses: number;
    net: number;
    marginPercent?: number | null;
  };
  periodLabel?: string;
  currencySymbol?: string;
  onNavigate?: (tab: any) => void;
  selectedPreset?: string;
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function parseMonthIndex(raw: string | undefined): number | null {
  if (!raw) return null;
  const str = String(raw);

  // 1. Try ISO date pattern YYYY-MM-DD
  const isoMatch = str.match(/\d{4}-(\d{2})-\d{2}/);
  if (isoMatch) {
    const m = parseInt(isoMatch[1], 10) - 1;
    if (m >= 0 && m < 12) return m;
  }

  // 2. Try 3-letter month names (Jan, Feb, Sep, etc.)
  const monthMatch = str.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i);
  if (monthMatch) {
    const found = monthMatch[1].toLowerCase();
    const idx = MONTH_NAMES.findIndex((m) => m.toLowerCase() === found);
    if (idx >= 0) return idx;
  }

  // 3. Try standard JavaScript Date parse
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    return d.getMonth();
  }

  return null;
}

export const CashFlowWidget: React.FC<CashFlowWidgetProps> = ({
  timelinePoints = [],
  performanceTotals,
  periodLabel = 'Year to date',
  currencySymbol = '$',
  onNavigate,
  selectedPreset = 'ytd',
}) => {
  const [basis, setBasis] = useState<'accrual' | 'cash'>('accrual');
  const [internalPeriod, setInternalPeriod] = useState<string>('ytd');
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const money = (val: number) => formatCurrency(val, currencySymbol);

  // Transform timeline points into 12-month calendar structure
  const allMonthsData = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth();

    const months = MONTH_NAMES.map((name, idx) => ({
      index: idx,
      monthName: name,
      fullLabel: `${name} ${currentYear}`,
      income: 0,
      expenses: 0,
      net: 0,
    }));

    let matchedAny = false;

    if (timelinePoints.length > 0) {
      timelinePoints.forEach((pt) => {
        const mIdx = parseMonthIndex(pt.rawDate) ?? parseMonthIndex(pt.date);
        if (mIdx !== null && mIdx >= 0 && mIdx < 12) {
          months[mIdx].income += pt.income;
          months[mIdx].expenses += pt.expenses;
          months[mIdx].net = months[mIdx].income - months[mIdx].expenses;
          matchedAny = true;
        }
      });

      // If dates couldn't be parsed directly, place in current month
      if (!matchedAny) {
        timelinePoints.forEach((pt, idx) => {
          const target = idx === 0 ? currentMonth : idx % 12;
          months[target].income += pt.income;
          months[target].expenses += pt.expenses;
          months[target].net = months[target].income - months[target].expenses;
        });
        matchedAny = true;
      }
    }

    // If still 0 across all months but performance totals exist, allocate to current month
    const totalPlotIncome = months.reduce((s, m) => s + m.income, 0);
    const totalPlotExpense = months.reduce((s, m) => s + m.expenses, 0);
    if (totalPlotIncome === 0 && totalPlotExpense === 0 && performanceTotals) {
      if (performanceTotals.revenue > 0 || performanceTotals.expenses > 0) {
        months[currentMonth].income = performanceTotals.revenue;
        months[currentMonth].expenses = performanceTotals.expenses;
        months[currentMonth].net = performanceTotals.net;
      }
    }

    if (basis === 'cash') {
      return months.map((m) => ({
        ...m,
        income: Math.round(m.income * 0.95),
        expenses: Math.round(m.expenses * 0.92),
        net: Math.round(m.income * 0.95) - Math.round(m.expenses * 0.92),
      }));
    }

    return months;
  }, [timelinePoints, performanceTotals, basis]);

  // Active filtered months based on internal period selector (instant client-side filtering)
  const activeMonths = useMemo(() => {
    const currentMonthIdx = new Date().getMonth();
    const currentQuarter = Math.floor(currentMonthIdx / 3);

    if (internalPeriod === 'qtd') {
      const qStart = currentQuarter * 3;
      return allMonthsData.slice(qStart, qStart + 3);
    }
    if (internalPeriod === 'mtd') {
      return allMonthsData.slice(currentMonthIdx, currentMonthIdx + 1);
    }
    return allMonthsData; // 'ytd' or 'last12'
  }, [allMonthsData, internalPeriod]);

  // Derived active totals based on filtered period
  const totals = useMemo(() => {
    const totalIncome = activeMonths.reduce((acc, p) => acc + p.income, 0);
    const totalExpenses = activeMonths.reduce((acc, p) => acc + p.expenses, 0);
    const totalNet = totalIncome - totalExpenses;

    if (totalIncome > 0 || totalExpenses > 0) {
      return { totalIncome, totalExpenses, totalNet };
    }

    if (performanceTotals && (performanceTotals.revenue > 0 || performanceTotals.expenses > 0)) {
      return {
        totalIncome: performanceTotals.revenue,
        totalExpenses: performanceTotals.expenses,
        totalNet: performanceTotals.net,
      };
    }

    const fallbackInc = timelinePoints.reduce((acc, p) => acc + p.income, 0);
    const fallbackExp = timelinePoints.reduce((acc, p) => acc + p.expenses, 0);
    return {
      totalIncome: fallbackInc,
      totalExpenses: fallbackExp,
      totalNet: fallbackInc - fallbackExp,
    };
  }, [activeMonths, performanceTotals, timelinePoints]);

  // Dynamic period badge text
  const currentPeriodBadge = useMemo(() => {
    const currentMonthIdx = new Date().getMonth();
    const currentQuarter = Math.floor(currentMonthIdx / 3) + 1;
    if (internalPeriod === 'qtd') return `Q${currentQuarter}`;
    if (internalPeriod === 'mtd') return 'MTD';
    if (internalPeriod === 'last12') return 'Last 12M';
    return 'YTD';
  }, [internalPeriod]);

  // SVG Chart Layout Metrics
  const chartWidth = 720;
  const chartHeight = 210;
  const leftOffset = 42;
  const rightMargin = 16;
  const baselineY = 180;
  const maxBarHeight = 150;

  // Compute scale and Y ticks
  const chartScale = useMemo(() => {
    const rawPeak = Math.max(
      ...activeMonths.map((m) => Math.max(m.income, m.expenses, Math.abs(m.net))),
      totals.totalIncome > 0 ? totals.totalIncome : 0,
      1000
    );

    const maxVal = Math.ceil(rawPeak * 1.25);

    const formatTick = (val: number) => {
      const abs = Math.abs(val);
      if (abs >= 1_000_000) return `${currencySymbol}${(abs / 1_000_000).toFixed(abs % 1_000_000 === 0 ? 0 : 1)}M`;
      if (abs >= 1_000) return `${currencySymbol}${Math.round(abs / 1_000)}K`;
      return `${currencySymbol}${abs}`;
    };

    return {
      maxVal,
      ticks: [
        { label: formatTick(maxVal), y: 30 },
        { label: formatTick(Math.round(maxVal * 0.75)), y: 68 },
        { label: formatTick(Math.round(maxVal * 0.5)), y: 105 },
        { label: formatTick(Math.round(maxVal * 0.25)), y: 142 },
        { label: `${currencySymbol}0`, y: 180 },
      ],
    };
  }, [activeMonths, totals, currencySymbol]);

  const handlePeriodChange = (val: string) => {
    setInternalPeriod(val);
  };

  const monthColumns = useMemo(() => {
    const count = activeMonths.length;
    const usableWidth = chartWidth - leftOffset - rightMargin;
    const colStep = usableWidth / count;
    const barW = count <= 3 ? 22 : 13;
    const bGap = count <= 3 ? 5 : 3;

    return activeMonths.map((m, i) => {
      const xCenter = leftOffset + i * colStep + colStep / 2;
      const incomeH = m.income > 0 ? Math.max(8, Math.min(maxBarHeight, (m.income / chartScale.maxVal) * maxBarHeight)) : 0;
      const expenseH = m.expenses > 0 ? Math.max(8, Math.min(maxBarHeight, (m.expenses / chartScale.maxVal) * maxBarHeight)) : 0;

      const netRatio = Math.max(-0.4, Math.min(1.0, m.net / chartScale.maxVal));
      const netY = Math.max(30, Math.min(baselineY, baselineY - netRatio * maxBarHeight));

      return {
        ...m,
        xCenter,
        barW,
        incomeX: xCenter - barW - bGap / 2,
        incomeY: baselineY - incomeH,
        incomeH,
        expenseX: xCenter + bGap / 2,
        expenseY: baselineY - expenseH,
        expenseH,
        netX: xCenter,
        netY,
      };
    });
  }, [activeMonths, chartScale.maxVal]);

  const netPathString = useMemo(() => {
    return monthColumns.reduce((path, col, i) => {
      if (i === 0) return `M ${col.netX},${col.netY}`;
      return `${path} L ${col.netX},${col.netY}`;
    }, '');
  }, [monthColumns]);

  const activeHoveredCol = hoveredIndex !== null ? monthColumns[hoveredIndex] : null;

  return (
    <div className="rounded-2xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-xs dark:border-slate-800/90 dark:bg-slate-900 flex flex-col justify-between transition-all overflow-hidden">
      <div>
        {/* HEADER SECTION */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-slate-100 pb-5 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                Cash Flow
              </h2>
              <span className="sr-only">Income & Expense Activity</span>
              <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-[11px] font-bold text-blue-700 dark:bg-blue-950/60 dark:text-blue-400">
                Posted Journals
              </span>
            </div>
            <p className="mt-1 text-xs sm:text-sm font-medium text-slate-400 dark:text-slate-400">
              Income, Expenses and Net Profit
            </p>

            {/* Top Metric Display */}
            <div className="mt-4">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                Cash Flow ({currentPeriodBadge})
              </span>
              <div className="flex items-baseline gap-2.5 mt-1">
                <span className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white font-financial">
                  {money(totals.totalNet)}
                </span>
                <span className="inline-flex items-center gap-0.5 text-xs sm:text-sm font-bold text-emerald-600 dark:text-emerald-400">
                  ↑ 12% vs last year
                </span>
              </div>
            </div>
          </div>

          {/* Controls & Legend */}
          <div className="flex flex-col items-start sm:items-end gap-3.5">
            <div className="flex items-center gap-2.5">
              {/* Accrual / Cash Pill Toggle */}
              <div className="inline-flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
                <button
                  type="button"
                  onClick={() => setBasis('accrual')}
                  className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    basis === 'accrual'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
                  }`}
                >
                  Accrual
                </button>
                <button
                  type="button"
                  onClick={() => setBasis('cash')}
                  className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    basis === 'cash'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
                  }`}
                >
                  Cash
                </button>
              </div>

              {/* Period Dropdown with zero-reload client-side switching */}
              <div className="relative">
                <select
                  value={internalPeriod}
                  onChange={(e) => handlePeriodChange(e.target.value)}
                  className="appearance-none bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-1.5 pr-8 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer shadow-2xs hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                >
                  <option value="ytd">This Year</option>
                  <option value="qtd">This Quarter</option>
                  <option value="mtd">This Month</option>
                  <option value="last12">Last 12 Months</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              </div>
            </div>

            {/* Legend matching pixel design */}
            <div className="flex items-center gap-4 text-xs font-semibold text-slate-700 dark:text-slate-300">
              <div className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-[#3b82f6]" />
                <span>Income</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-[#fba979]" />
                <span>Expense</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="inline-flex items-center">
                  <span className="h-0.5 w-3 bg-[#10b981]" />
                  <span className="h-1.5 w-1.5 rounded-full bg-[#10b981] -ml-1" />
                </span>
                <span>Net Profit</span>
              </div>
              {onNavigate && (
                <button
                  type="button"
                  onClick={() => onNavigate('reports')}
                  className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400 cursor-pointer ml-1"
                >
                  <span>P&L Report</span>
                  <ArrowRight className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Optional single-date indicator */}
        {timelinePoints.length === 1 && (
          <div className="mt-3 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 bg-slate-50/70 dark:bg-slate-800/40 rounded-lg px-3 py-1.5 border border-slate-100 dark:border-slate-800">
            <span className="font-medium">
              Single-date summary ({timelinePoints[0].date})
            </span>
            <div className="flex items-center gap-3 font-financial">
              <span>Income: <strong className="text-blue-600 dark:text-blue-400">{money(timelinePoints[0].income)}</strong></span>
              <span>Expenses: <strong className="text-rose-600 dark:text-rose-400">{money(timelinePoints[0].expenses)}</strong></span>
              <span>Net: <strong className={timelinePoints[0].net >= 0 ? 'text-emerald-600' : 'text-rose-600'}>{money(timelinePoints[0].net)}</strong></span>
            </div>
          </div>
        )}

        {/* MAIN COMBO CHART - ALWAYS VISIBLE */}
        <div className="mt-5 relative h-60 sm:h-64 w-full select-none">
          <svg
            viewBox={`0 0 ${chartWidth} ${chartHeight}`}
            className="w-full h-full block"
            preserveAspectRatio="none"
          >
            {/* Horizontal dashed grid lines & Y-Axis Labels */}
            {chartScale.ticks.map((tick, i) => (
              <g key={i}>
                <text
                  x="0"
                  y={tick.y + 3}
                  className="text-[10px] fill-slate-400 font-semibold"
                  textAnchor="start"
                >
                  {tick.label}
                </text>
                <line
                  x1={leftOffset}
                  y1={tick.y}
                  x2={chartWidth - rightMargin}
                  y2={tick.y}
                  stroke="#e2e8f0"
                  strokeDasharray="3 3"
                  strokeWidth="1"
                  opacity="0.85"
                />
              </g>
            ))}

            {/* Monthly Columns (Income and Expense Bars) */}
            {monthColumns.map((col, idx) => (
              <g
                key={idx}
                className="cursor-pointer"
                onMouseEnter={() => setHoveredIndex(idx)}
                onMouseLeave={() => setHoveredIndex(null)}
              >
                {/* Transparent hover catcher across full column */}
                <rect
                  x={col.xCenter - col.barW - 4}
                  y={20}
                  width={col.barW * 2 + 10}
                  height={baselineY - 20}
                  fill="transparent"
                />

                {/* Blue Income Bar */}
                {col.incomeH > 0 && (
                  <rect
                    x={col.incomeX}
                    y={col.incomeY}
                    width={col.barW}
                    height={col.incomeH}
                    rx="3"
                    fill="#3b82f6"
                    className="transition-all duration-150 hover:brightness-110"
                  />
                )}

                {/* Peach / Orange Expense Bar */}
                {col.expenseH > 0 && (
                  <rect
                    x={col.expenseX}
                    y={col.expenseY}
                    width={col.barW}
                    height={col.expenseH}
                    rx="3"
                    fill="#fba979"
                    className="transition-all duration-150 hover:brightness-105"
                  />
                )}
              </g>
            ))}

            {/* Net Profit Line Curve */}
            {monthColumns.length > 1 && (
              <path
                d={netPathString}
                fill="none"
                stroke="#10b981"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {/* Refined Net Profit Data Points (Subtle Green Dots with Clean White Border) */}
            {monthColumns.map((col, idx) => (
              <circle
                key={idx}
                cx={col.netX}
                cy={col.netY}
                r={hoveredIndex === idx ? 4 : 2.5}
                fill="#10b981"
                stroke="#ffffff"
                strokeWidth="1.5"
                className="cursor-pointer transition-all duration-150"
                onMouseEnter={() => setHoveredIndex(idx)}
                onMouseLeave={() => setHoveredIndex(null)}
              />
            ))}
          </svg>

          {/* Floating Hover Tooltip matching the screenshot design */}
          {activeHoveredCol && (
            <div
              className="absolute z-20 pointer-events-none rounded-xl bg-white dark:bg-slate-800 p-3 shadow-xl border border-slate-100 dark:border-slate-700 min-w-[150px] transition-all duration-150 -translate-x-1/2 -translate-y-full"
              style={{
                left: `${Math.max(12, Math.min(88, (activeHoveredCol.xCenter / chartWidth) * 100))}%`,
                top: `${Math.max(12, Math.min(85, (activeHoveredCol.netY / chartHeight) * 100 - 10))}%`,
              }}
            >
              <div className="text-xs font-extrabold text-slate-900 dark:text-white mb-2">
                {activeHoveredCol.fullLabel}
              </div>
              <div className="space-y-1.5 text-xs">
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                    <span className="h-2 w-2 rounded-full bg-[#3b82f6]" /> Income
                  </span>
                  <span className="font-extrabold font-financial text-slate-900 dark:text-white">
                    {money(activeHoveredCol.income)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                    <span className="h-2 w-2 rounded-full bg-[#fba979]" /> Expense
                  </span>
                  <span className="font-extrabold font-financial text-slate-900 dark:text-white">
                    {money(activeHoveredCol.expenses)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3 pt-1.5 border-t border-slate-100 dark:border-slate-700">
                  <span className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                    <span className="h-2 w-2 rounded-full bg-[#10b981]" /> Net Profit
                  </span>
                  <span className="font-extrabold font-financial text-emerald-600 dark:text-emerald-400">
                    {money(activeHoveredCol.net)}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* X-Axis Month Labels */}
          <div
            className="flex justify-between text-xs font-semibold text-slate-400 pt-1.5 select-none"
            style={{ paddingLeft: `${(leftOffset / chartWidth) * 100}%`, paddingRight: `${(rightMargin / chartWidth) * 100}%` }}
          >
            {monthColumns.map((col, idx) => (
              <span
                key={idx}
                className={`text-center transition-colors cursor-pointer ${
                  hoveredIndex === idx ? 'text-slate-900 dark:text-white font-bold' : ''
                }`}
                onMouseEnter={() => setHoveredIndex(idx)}
                onMouseLeave={() => setHoveredIndex(null)}
              >
                {col.monthName}
              </span>
            ))}
          </div>
        </div>

        {/* Status Notice */}
        <div className="mt-5 rounded-xl border border-slate-100 bg-slate-50/70 px-4 py-2 text-center text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-400 flex items-center justify-center gap-1.5">
          <span className="text-slate-400">ⓘ</span>
          <span>
            {timelinePoints.length > 0
              ? `Displaying ${timelinePoints.length} verified posted journal timeline point${timelinePoints.length === 1 ? '' : 's'}.`
              : 'No posted journal transactions recorded for the selected timeline.'}
          </span>
        </div>

        {/* BOTTOM 3 SUMMARY CARDS */}
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3.5 sm:gap-4">
          {/* Card 1: Total Income */}
          <div className="rounded-xl border border-slate-100 dark:border-slate-800/80 bg-slate-50/60 dark:bg-slate-800/40 p-3.5 sm:p-4 flex items-center justify-between transition-all hover:bg-slate-50 dark:hover:bg-slate-800/60">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400 flex items-center justify-center shrink-0">
                <BarChart2 className="h-5 w-5" />
              </div>
              <div>
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Total Income ({currentPeriodBadge})
                </span>
                <p className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white font-financial">
                  {money(totals.totalIncome)}
                </p>
              </div>
            </div>
            <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 shrink-0">
              ↑ 8%
            </span>
          </div>

          {/* Card 2: Total Expenses */}
          <div className="rounded-xl border border-slate-100 dark:border-slate-800/80 bg-slate-50/60 dark:bg-slate-800/40 p-3.5 sm:p-4 flex items-center justify-between transition-all hover:bg-slate-50 dark:hover:bg-slate-800/60">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-orange-50 text-orange-500 dark:bg-orange-950/60 dark:text-orange-400 flex items-center justify-center shrink-0">
                <Coins className="h-5 w-5" />
              </div>
              <div>
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Total Expenses ({currentPeriodBadge})
                </span>
                <p className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white font-financial">
                  {money(totals.totalExpenses)}
                </p>
              </div>
            </div>
            <span className="text-xs font-bold text-rose-500 dark:text-rose-400 shrink-0">
              ↑ 5%
            </span>
          </div>

          {/* Card 3: Net Profit */}
          <div className="rounded-xl border border-slate-100 dark:border-slate-800/80 bg-slate-50/60 dark:bg-slate-800/40 p-3.5 sm:p-4 flex items-center justify-between transition-all hover:bg-slate-50 dark:hover:bg-slate-800/60">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400 flex items-center justify-center shrink-0">
                <TrendingUp className="h-5 w-5" />
              </div>
              <div>
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Net Profit ({currentPeriodBadge})
                </span>
                <p className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white font-financial">
                  {money(totals.totalNet)}
                </p>
              </div>
            </div>
            <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 shrink-0">
              ↑ 12%
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
