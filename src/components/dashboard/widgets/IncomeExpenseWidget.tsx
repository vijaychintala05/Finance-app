import React from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { formatCurrency } from '../../../utils/formatters';

interface IncomeExpenseWidgetProps {
  topExpensesData: { name: string; value: number }[];
  totalExpensePieAmount: number;
  pieColors: string[];
  currencySymbol: string;
  onNavigate: (tab: any) => void;
}

export const IncomeExpenseWidget: React.FC<IncomeExpenseWidgetProps> = ({
  topExpensesData,
  totalExpensePieAmount,
  pieColors,
  currencySymbol,
  onNavigate,
}) => {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs flex flex-col justify-between">
      <div>
        <div className="flex justify-between items-center mb-4">
          <div>
            <h3 className="text-slate-900 dark:text-white font-bold text-base">Top Expenses Breakdown</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">Distribution by operating category</p>
          </div>
          <button
            onClick={() => onNavigate('expenses')}
            className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
          >
            View Expenses →
          </button>
        </div>

        {/* Pie Chart & Legend Container */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-center">
          <div className="sm:col-span-6 h-52 relative flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={topExpensesData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={75}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {topExpensesData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={pieColors[index % pieColors.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(val: number) => [
                    formatCurrency(val, currencySymbol),
                    'Amount',
                  ]}
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    borderColor: '#1e293b',
                    color: '#ffffff',
                    borderRadius: '12px',
                    fontSize: '11px',
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            {/* Center Stat */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-[10px] uppercase font-bold text-slate-400">Total</span>
              <span className="text-xs font-mono font-bold text-slate-900 dark:text-white">
                {formatCurrency(totalExpensePieAmount, currencySymbol)}
              </span>
            </div>
          </div>

          {/* Legend Breakdown */}
          <div className="sm:col-span-6 space-y-2 text-xs">
            {topExpensesData.map((item, idx) => {
              const percent =
                totalExpensePieAmount > 0
                  ? Math.round((item.value / totalExpensePieAmount) * 100)
                  : 0;
              return (
                <div key={item.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-2 truncate pr-2">
                    <div
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: pieColors[idx % pieColors.length] }}
                    />
                    <span className="text-slate-700 dark:text-slate-300 font-medium truncate">
                      {item.name}
                    </span>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="font-mono font-bold text-slate-900 dark:text-white">
                      {formatCurrency(item.value, currencySymbol)}
                    </span>
                    <span className="text-[10px] text-slate-400 ml-1 font-mono">({percent}%)</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
