import React, { useEffect, useMemo, useState } from 'react';
import {
  BarChart2,
  Coins,
  TrendingUp,
  ChevronDown,
  ArrowRight,
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
  cashMovements?: TimelineDataPoint[];
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
  onPresetSelect?: (preset: 'today' | 'mtd' | 'qtd' | 'ytd' | 'last12' | 'custom') => void;
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
  cashMovements = [],
  performanceTotals,
  periodLabel = 'Year to date',
  currencySymbol = '$',
  onNavigate,
  selectedPreset = 'ytd',
  onPresetSelect,
}) => {
  const [basis, setBasis] = useState<'accrual' | 'cash'>(() => {
    if (cashMovements && cashMovements.length > 0) return 'cash';
    if (timelinePoints && timelinePoints.length > 0) return 'accrual';
    return 'cash';
  });
  const [userToggledBasis, setUserToggledBasis] = useState(false);
  const [internalPeriod, setInternalPeriod] = useState<string>(
    selectedPreset && ['ytd', 'qtd', 'mtd', 'last12'].includes(selectedPreset) && selectedPreset !== 'mtd'
      ? selectedPreset
      : 'last12'
  );
  const [userSelectedPeriod, setUserSelectedPeriod] = useState(false);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!userToggledBasis) {
      if (cashMovements && cashMovements.length > 0) {
        setBasis('cash');
      } else if (timelinePoints && timelinePoints.length > 0) {
        setBasis('accrual');
      }
    }
  }, [cashMovements, timelinePoints, userToggledBasis]);

  useEffect(() => {
    if (userSelectedPeriod && selectedPreset && ['ytd', 'qtd', 'mtd', 'last12'].includes(selectedPreset)) {
      setInternalPeriod(selectedPreset);
    }
  }, [selectedPreset, userSelectedPeriod]);

  const money = (val: number) => formatCurrency(val, currencySymbol);

  // Choose authoritative source data points based on basis:
  // - Accrual basis uses posted P&L journal line movements (timelinePoints)
  // - Cash basis uses posted movements on liquid bank and cash GL accounts (cashMovements)
  const activePoints = useMemo(() => {
    if (basis === 'cash') {
      return (cashMovements && cashMovements.length > 0) ? cashMovements : [];
    }
    return timelinePoints;
  }, [basis, cashMovements, timelinePoints]);

  // Active filtered months based on internal period selector with exact YYYY-MM key mapping
  const activeMonths = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonthIdx = now.getMonth();
    const currentQuarter = Math.floor(currentMonthIdx / 3);

    let targetMonths: Array<{
      index: number;
      year: number;
      monthIdx: number;
      monthName: string;
      fullLabel: string;
      ymKey: string;
      income: number;
      expenses: number;
      net: number;
    }> = [];

    if (internalPeriod === 'mtd') {
      const ymKey = `${currentYear}-${String(currentMonthIdx + 1).padStart(2, '0')}`;
      targetMonths = [{
        index: 0,
        year: currentYear,
        monthIdx: currentMonthIdx,
        monthName: MONTH_NAMES[currentMonthIdx],
        fullLabel: `${MONTH_NAMES[currentMonthIdx]} ${currentYear}`,
        ymKey,
        income: 0,
        expenses: 0,
        net: 0,
      }];
    } else if (internalPeriod === 'qtd') {
      const qStart = currentQuarter * 3;
      targetMonths = [0, 1, 2].map((offset, i) => {
        const mIdx = qStart + offset;
        const ymKey = `${currentYear}-${String(mIdx + 1).padStart(2, '0')}`;
        return {
          index: i,
          year: currentYear,
          monthIdx: mIdx,
          monthName: MONTH_NAMES[mIdx],
          fullLabel: `${MONTH_NAMES[mIdx]} ${currentYear}`,
          ymKey,
          income: 0,
          expenses: 0,
          net: 0,
        };
      });
    } else if (internalPeriod === 'ytd') {
      targetMonths = MONTH_NAMES.map((name, idx) => {
        const ymKey = `${currentYear}-${String(idx + 1).padStart(2, '0')}`;
        return {
          index: idx,
          year: currentYear,
          monthIdx: idx,
          monthName: name,
          fullLabel: `${name} ${currentYear}`,
          ymKey,
          income: 0,
          expenses: 0,
          net: 0,
        };
      });
    } else {
      // 'last12' (rolling 12 trailing calendar months)
      for (let i = 11; i >= 0; i--) {
        const d = new Date(currentYear, currentMonthIdx - i, 1);
        const y = d.getFullYear();
        const mIdx = d.getMonth();
        const ymKey = `${y}-${String(mIdx + 1).padStart(2, '0')}`;
        targetMonths.push({
          index: 11 - i,
          year: y,
          monthIdx: mIdx,
          monthName: MONTH_NAMES[mIdx],
          fullLabel: `${MONTH_NAMES[mIdx]} ${y}`,
          ymKey,
          income: 0,
          expenses: 0,
          net: 0,
        });
      }
    }

    // Map activePoints to matching target month
    if (activePoints.length > 0) {
      activePoints.forEach((pt) => {
        const raw = String(pt.rawDate || pt.date || '');
        const isoMatch = raw.match(/^(\d{4})-(\d{2})/);
        let ptYm = '';
        let ptMonth = -1;
        if (isoMatch) {
          ptYm = `${isoMatch[1]}-${isoMatch[2]}`;
          ptMonth = parseInt(isoMatch[2], 10) - 1;
        } else {
          const d = new Date(raw);
          if (!isNaN(d.getTime())) {
            ptYm = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            ptMonth = d.getMonth();
          } else {
            const m = parseMonthIndex(raw);
            if (m !== null) ptMonth = m;
          }
        }

        // Try exact YYYY-MM match first, otherwise monthIdx match
        const found = targetMonths.find((tm) => tm.ymKey === ptYm) || (ptMonth >= 0 ? targetMonths.find((tm) => tm.monthIdx === ptMonth) : undefined);
        if (found) {
          found.income += Number(pt.income || 0);
          found.expenses += Number(pt.expenses || 0);
          found.net = found.income - found.expenses;
        }
      });
    }

    return targetMonths;
  }, [activePoints, internalPeriod]);

  // Derived active totals based on filtered period
  const totals = useMemo(() => {
    const totalIncome = activeMonths.reduce((acc, p) => acc + p.income, 0);
    const totalExpenses = activeMonths.reduce((acc, p) => acc + p.expenses, 0);
    const totalNet = totalIncome - totalExpenses;

    if (totalIncome > 0 || totalExpenses > 0) {
      return { totalIncome, totalExpenses, totalNet };
    }

    if (basis === 'accrual' && performanceTotals && (performanceTotals.revenue > 0 || performanceTotals.expenses > 0)) {
      return {
        totalIncome: performanceTotals.revenue,
        totalExpenses: performanceTotals.expenses,
        totalNet: performanceTotals.net,
      };
    }

    return {
      totalIncome,
      totalExpenses,
      totalNet,
    };
  }, [activeMonths, performanceTotals, basis]);

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

  // Compute scale and Y ticks scaled cleanly to maximum monthly bar height
  const chartScale = useMemo(() => {
    const rawPeak = Math.max(
      ...activeMonths.map((m) => Math.max(m.income, m.expenses, Math.abs(m.net))),
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
  }, [activeMonths, currencySymbol]);

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
              {basis === 'cash' ? 'Cash Inflows, Cash Outflows and Net Cash Movement' : 'Income, Expenses and Net Profit'}
            </p>

            {/* Top Metric Display */}
            <div className="mt-4">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                {basis === 'cash' ? `Net Cash Flow (${currentPeriodBadge})` : `Net Profit (${currentPeriodBadge})`}
              </span>
              <div className="flex items-baseline gap-2.5 mt-1">
                <span className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white font-financial">
                  {money(totals.totalNet)}
                </span>
                <span className={`inline-flex items-center gap-0.5 text-xs sm:text-sm font-bold ${
                  totals.totalNet >= 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-rose-600 dark:text-rose-400'
                }`}>
                  {totals.totalNet >= 0 ? '● Net Surplus' : '● Net Deficit'}
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
                  onClick={() => {
                    setUserToggledBasis(true);
                    setBasis('accrual');
                  }}
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
                  onClick={() => {
                    setUserToggledBasis(true);
                    setBasis('cash');
                  }}
                  className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    basis === 'cash'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
                  }`}
                >
                  Cash
                </button>
              </div>

              {/* Period Dropdown with zero-reload client-side switching and parent coordination */}
              <div className="relative">
                <select
                  value={internalPeriod}
                  onChange={(e) => {
                    const val = e.target.value;
                    setUserSelectedPeriod(true);
                    setInternalPeriod(val);
                    if (onPresetSelect && (val === 'ytd' || val === 'qtd' || val === 'mtd' || val === 'last12')) {
                      onPresetSelect(val as any);
                    }
                  }}
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
                <span>{basis === 'cash' ? 'Cash In' : 'Income'}</span>
                <span className="font-financial font-bold text-slate-900 dark:text-white">
                  {money(totals.totalIncome)}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-[#fba979]" />
                <span>{basis === 'cash' ? 'Cash Out' : 'Expense'}</span>
                <span className="font-financial font-bold text-slate-900 dark:text-white">
                  {money(totals.totalExpenses)}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="inline-flex items-center">
                  <span className="h-0.5 w-3 bg-[#10b981]" />
                  <span className="h-1.5 w-1.5 rounded-full bg-[#10b981] -ml-1" />
                </span>
                <span>{basis === 'cash' ? 'Net Cash' : 'Net Profit'}</span>
                <span className={`font-financial font-bold ${
                  totals.totalNet >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                }`}>
                  {money(totals.totalNet)}
                </span>
              </div>
              {onNavigate && (
                <button
                  type="button"
                  onClick={() => onNavigate('reports')}
                  className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400 cursor-pointer ml-1"
                >
                  <span>{basis === 'cash' ? 'Cash Flow Statement' : 'P&L Report'}</span>
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
                    className="transition-all duration-150 hover:brightness-110"
                  />
                )}

                {/* Vertical subtle indicator line on hover */}
                {hoveredIndex === idx && (
                  <line
                    x1={col.xCenter}
                    y1={25}
                    x2={col.xCenter}
                    y2={baselineY}
                    stroke="#94a3b8"
                    strokeWidth="1"
                    strokeDasharray="2 2"
                    opacity="0.75"
                  />
                )}
              </g>
            ))}

            {/* Connecting Green Net Profit Line */}
            {monthColumns.length > 1 && (
              <path
                d={netPathString}
                fill="none"
                stroke="#10b981"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {/* Green Circular Nodes for Net Profit */}
            {monthColumns.map((col, idx) => (
              <circle
                key={idx}
                cx={col.netX}
                cy={col.netY}
                r={hoveredIndex === idx ? '5' : '3.5'}
                fill="#10b981"
                stroke="#ffffff"
                strokeWidth="2"
                className="transition-all duration-150"
              />
            ))}

            {/* Baseline bottom axis */}
            <line
              x1={leftOffset}
              y1={baselineY}
              x2={chartWidth - rightMargin}
              y2={baselineY}
              stroke="#cbd5e1"
              strokeWidth="1"
            />
          </svg>

          {/* Interactive Floating Tooltip on Hover */}
          {activeHoveredCol && (
            <div
              className="absolute pointer-events-none z-20 transform -translate-x-1/2 -translate-y-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl p-3 min-w-[150px] transition-all"
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
                    <span className="h-2 w-2 rounded-full bg-[#3b82f6]" /> {basis === 'cash' ? 'Cash In' : 'Income'}
                  </span>
                  <span className="font-extrabold font-financial text-slate-900 dark:text-white">
                    {money(activeHoveredCol.income)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                    <span className="h-2 w-2 rounded-full bg-[#fba979]" /> {basis === 'cash' ? 'Cash Out' : 'Expense'}
                  </span>
                  <span className="font-extrabold font-financial text-slate-900 dark:text-white">
                    {money(activeHoveredCol.expenses)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3 pt-1.5 border-t border-slate-100 dark:border-slate-700">
                  <span className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                    <span className="h-2 w-2 rounded-full bg-[#10b981]" /> {basis === 'cash' ? 'Net Cash' : 'Net Profit'}
                  </span>
                  <span className={`font-extrabold font-financial ${activeHoveredCol.net >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
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
        <div className="mt-5 rounded-xl border border-slate-100 bg-slate-50/70 px-4 py-2.5 text-center text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-400 flex flex-wrap items-center justify-center gap-2">
          <span className="text-slate-400">ⓘ</span>
          <span>
            {activePoints.length > 0
              ? `Displaying ${activePoints.length} verified posted ${basis === 'cash' ? 'cash-flow' : 'journal'} timeline point${activePoints.length === 1 ? '' : 's'}.`
              : basis === 'cash' && timelinePoints.length > 0
                ? `No direct cash/bank movements recorded for this timeline.`
                : `No posted journal transactions recorded for the selected timeline.`}
          </span>
          {basis === 'cash' && timelinePoints.length > 0 && activePoints.length === 0 && (
            <button
              type="button"
              onClick={() => {
                setUserToggledBasis(true);
                setBasis('accrual');
              }}
              className="text-xs font-bold text-blue-600 hover:text-blue-700 underline cursor-pointer"
            >
              Switch to Accrual (P&L) View →
            </button>
          )}
        </div>

        {/* BOTTOM 3 SUMMARY CARDS */}
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3.5 sm:gap-4">
          {/* Card 1: Total Income / Cash In */}
          <div className="rounded-xl border border-slate-100 dark:border-slate-800/80 bg-slate-50/60 dark:bg-slate-800/40 p-3.5 sm:p-4 flex items-center justify-between transition-all hover:bg-slate-50 dark:hover:bg-slate-800/60">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400 flex items-center justify-center shrink-0">
                <BarChart2 className="h-5 w-5" />
              </div>
              <div>
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  {basis === 'cash' ? 'Cash Inflows' : 'Total Income'} ({currentPeriodBadge})
                </span>
                <p className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white font-financial">
                  {money(totals.totalIncome)}
                </p>
              </div>
            </div>
            <span className="text-[11px] font-bold text-blue-600 dark:text-blue-400 shrink-0">
              {basis === 'cash' ? 'Received' : 'Revenue'}
            </span>
          </div>

          {/* Card 2: Total Expenses / Cash Out */}
          <div className="rounded-xl border border-slate-100 dark:border-slate-800/80 bg-slate-50/60 dark:bg-slate-800/40 p-3.5 sm:p-4 flex items-center justify-between transition-all hover:bg-slate-50 dark:hover:bg-slate-800/60">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-orange-50 text-orange-500 dark:bg-orange-950/60 dark:text-orange-400 flex items-center justify-center shrink-0">
                <Coins className="h-5 w-5" />
              </div>
              <div>
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  {basis === 'cash' ? 'Cash Outflows' : 'Total Expenses'} ({currentPeriodBadge})
                </span>
                <p className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white font-financial">
                  {money(totals.totalExpenses)}
                </p>
              </div>
            </div>
            <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400 shrink-0">
              {basis === 'cash' ? 'Disbursed' : 'Expense'}
            </span>
          </div>

          {/* Card 3: Net Cash Movement / Net Profit */}
          <div className="rounded-xl border border-slate-100 dark:border-slate-800/80 bg-slate-50/60 dark:bg-slate-800/40 p-3.5 sm:p-4 flex items-center justify-between transition-all hover:bg-slate-50 dark:hover:bg-slate-800/60">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400 flex items-center justify-center shrink-0">
                <TrendingUp className="h-5 w-5" />
              </div>
              <div>
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  {basis === 'cash' ? 'Net Cash Movement' : 'Net Profit'} ({currentPeriodBadge})
                </span>
                <p className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white font-financial">
                  {money(totals.totalNet)}
                </p>
              </div>
            </div>
            <span className={`text-[11px] font-bold shrink-0 ${totals.totalNet >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
              {totals.totalNet >= 0 ? 'Surplus' : 'Deficit'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
