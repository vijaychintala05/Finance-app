import React from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatCurrency } from '../../../utils/formatters';

interface CashFlowChartWidgetProps {
  cashFlowAnalysisData: any[];
  cashFlowPeriod: 'fiscal' | 'six_months';
  setCashFlowPeriod: (period: 'fiscal' | 'six_months') => void;
  totalInflowPeriod: number;
  totalOutflowPeriod: number;
  netCashFlowPeriod: number;
  currencySymbol: string;
  onNavigate: (tab: any) => void;
}

export const CashFlowChartWidget: React.FC<CashFlowChartWidgetProps> = ({
  cashFlowAnalysisData,
  cashFlowPeriod,
  setCashFlowPeriod,
  totalInflowPeriod,
  totalOutflowPeriod,
  netCashFlowPeriod,
  currencySymbol,
  onNavigate,
}) => {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs flex flex-col justify-between">
      <div>
        <div className="flex justify-between items-center mb-4">
          <div>
            <div className="flex items-center space-x-2">
              <span className="bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-400 font-bold text-[10px] uppercase px-2 py-0.5 rounded">
                Financial Performance
              </span>
              <span className="text-xs text-slate-400">Inflow vs Outflow Analysis</span>
            </div>
            <h3 className="text-lg font-black text-slate-900 dark:text-white mt-1">Cash Flow Analysis</h3>
          </div>

          <div className="flex items-center space-x-2">
            <select
              value={cashFlowPeriod}
              onChange={(e) => setCashFlowPeriod(e.target.value as any)}
              className="text-xs font-bold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-1.5 text-slate-700 dark:text-slate-200 focus:outline-hidden cursor-pointer"
            >
              <option value="fiscal">This Fiscal Year</option>
              <option value="six_months">Last 6 Months</option>
            </select>
            <button
              onClick={() => onNavigate('reports')}
              className="p-1.5 text-blue-600 dark:text-blue-400 hover:underline text-xs font-bold cursor-pointer"
            >
              Statement →
            </button>
          </div>
        </div>

        {/* Summary Mini Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <div className="bg-emerald-50/70 dark:bg-emerald-950/30 p-3 rounded-xl border border-emerald-100 dark:border-emerald-900/50">
            <span className="text-[10px] uppercase font-bold text-emerald-800 dark:text-emerald-400 block">Total Cash Inflow</span>
            <span className="text-base font-black font-mono text-emerald-700 dark:text-emerald-300">
              {formatCurrency(totalInflowPeriod, currencySymbol)}
            </span>
          </div>
          <div className="bg-rose-50/70 dark:bg-rose-950/30 p-3 rounded-xl border border-rose-100 dark:border-rose-900/50">
            <span className="text-[10px] uppercase font-bold text-rose-800 dark:text-rose-400 block">Total Cash Outflow</span>
            <span className="text-base font-black font-mono text-rose-700 dark:text-rose-300">
              {formatCurrency(totalOutflowPeriod, currencySymbol)}
            </span>
          </div>
          <div className={`p-3 rounded-xl border ${
            netCashFlowPeriod >= 0
              ? 'bg-blue-50/70 dark:bg-blue-950/30 border-blue-100 dark:border-blue-900/50'
              : 'bg-amber-50/70 dark:bg-amber-950/30 border-amber-100 dark:border-amber-900/50'
          }`}>
            <span className="text-[10px] uppercase font-bold text-slate-600 dark:text-slate-400 block">Net Cash Flow</span>
            <span className={`text-base font-black font-mono ${
              netCashFlowPeriod >= 0 ? 'text-blue-700 dark:text-blue-300' : 'text-amber-700 dark:text-amber-300'
            }`}>
              {netCashFlowPeriod >= 0 ? '+' : ''}{formatCurrency(netCashFlowPeriod, currencySymbol)}
            </span>
          </div>
        </div>

        {/* Bar Chart */}
        <div className="h-52 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={cashFlowAnalysisData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} />
              <Tooltip
                formatter={(val: number) => formatCurrency(val, currencySymbol)}
                contentStyle={{
                  backgroundColor: '#0f172a',
                  borderColor: '#1e293b',
                  color: '#ffffff',
                  borderRadius: '12px',
                  fontSize: '11px',
                }}
              />
              <Bar dataKey="inflow" fill="#10b981" name="Inflow (Revenue)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="outflow" fill="#f43f5e" name="Outflow (Expense)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};
