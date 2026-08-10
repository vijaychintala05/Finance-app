import React from 'react';
import { ArrowUpRight, FolderKanban } from 'lucide-react';
import { Project } from '../../../types';
import { formatCurrency } from '../../../utils/formatters';

interface ProjectProfitabilityWidgetProps {
  projectSummaries: any[];
  projects: Project[];
  currencySymbol: string;
  onNavigate: (tab: any) => void;
  onSelectProject?: (projectId: string) => void;
}

export const ProjectProfitabilityWidget: React.FC<ProjectProfitabilityWidgetProps> = ({
  projectSummaries,
  currencySymbol,
  onNavigate,
  onSelectProject,
}) => {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs flex flex-col justify-between">
      <div>
        <div className="flex justify-between items-center mb-6">
          <div>
            <h3 className="text-slate-900 dark:text-white font-bold text-base">Active Projects Performance</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">Invoiced revenue vs direct project expenses</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 bg-indigo-500 rounded-xs"></div>
              <span className="text-[10px] uppercase font-bold text-slate-400">Invoiced</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 bg-slate-200 dark:bg-slate-700 rounded-xs"></div>
              <span className="text-[10px] uppercase font-bold text-slate-400">Expenses</span>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          {projectSummaries.slice(0, 4).map((p) => {
            const { summary } = p;
            const totalActivity = summary.totalInvoiced + summary.directExpenses || 1;
            const invoicedRatio = Math.round((summary.totalInvoiced / totalActivity) * 100);
            const expenseRatio = 100 - invoicedRatio;

            return (
              <div
                key={p.id}
                onClick={() => onSelectProject && onSelectProject(p.id)}
                className="p-3 rounded-xl border border-slate-100 dark:border-slate-800 hover:border-indigo-200 dark:hover:border-indigo-500/50 hover:bg-slate-50/60 dark:hover:bg-slate-800/60 transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="sm:w-40">
                  <div className="text-xs font-bold text-slate-900 dark:text-white truncate">{p.name}</div>
                  <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400">{p.code} • {p.clientName}</div>
                </div>

                <div className="flex-1 h-6 flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5 overflow-hidden">
                  <div
                    className="bg-indigo-500 h-full rounded-l-md transition-all duration-300"
                    style={{ width: `${Math.max(10, invoicedRatio)}%` }}
                    title={`Invoiced: ${formatCurrency(summary.totalInvoiced, currencySymbol)}`}
                  />
                  <div
                    className="bg-slate-300 dark:bg-slate-600 h-full rounded-r-md transition-all duration-300"
                    style={{ width: `${Math.max(10, expenseRatio)}%` }}
                    title={`Expense: ${formatCurrency(summary.directExpenses, currencySymbol)}`}
                  />
                </div>

                <div className="sm:w-28 text-right font-mono text-xs">
                  <div className="font-bold text-slate-900 dark:text-white">
                    {formatCurrency(summary.netProfit, currencySymbol)}
                  </div>
                  <div
                    className={`text-[10px] font-semibold ${
                      summary.profitMarginPercent >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'
                    }`}
                  >
                    {summary.profitMarginPercent}% Margin
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <button
        onClick={() => onNavigate('projects')}
        className="mt-4 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 text-left cursor-pointer"
      >
        Manage All Projects & Bookkeeping →
      </button>
    </div>
  );
};
