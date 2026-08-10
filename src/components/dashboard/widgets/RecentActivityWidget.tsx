import React from 'react';
import { Invoice } from '../../../types';
import { formatCurrency, formatDate, getStatusBadgeStyle } from '../../../utils/formatters';

interface RecentActivityWidgetProps {
  invoices: Invoice[];
  currencySymbol: string;
  onNavigate: (tab: any) => void;
}

export const RecentActivityWidget: React.FC<RecentActivityWidgetProps> = ({
  invoices,
  currencySymbol,
  onNavigate,
}) => {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs overflow-hidden">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h3 className="text-slate-900 dark:text-white font-bold text-base">Recent Ledger Invoices</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">Latest client billing activity and payment status</p>
        </div>
        <button
          onClick={() => onNavigate('invoices')}
          className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
        >
          All Invoices
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs text-left">
          <thead>
            <tr className="text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-slate-800 uppercase tracking-wider font-semibold text-[10px]">
              <th className="py-2.5 px-3">Date</th>
              <th className="py-2.5 px-3">Invoice #</th>
              <th className="py-2.5 px-3">Entity / Client</th>
              <th className="py-2.5 px-3">Project</th>
              <th className="py-2.5 px-3 text-right">Total Amount</th>
              <th className="py-2.5 px-3 text-right">Balance Due</th>
              <th className="py-2.5 px-3 text-right">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {invoices.slice(0, 5).map((inv) => (
              <tr key={inv.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors">
                <td className="py-3 px-3 text-slate-500 dark:text-slate-400 font-mono">{formatDate(inv.issueDate)}</td>
                <td className="py-3 px-3 font-mono font-bold text-blue-600 dark:text-blue-400">{inv.invoiceNumber}</td>
                <td className="py-3 px-3">
                  <div className="font-bold text-slate-900 dark:text-white">{inv.clientName}</div>
                </td>
                <td className="py-3 px-3 text-slate-500 dark:text-slate-400 font-mono text-[11px]">
                  {inv.projectName || '-'}
                </td>
                <td className="py-3 px-3 text-right font-mono font-bold text-slate-900 dark:text-white">
                  {formatCurrency(inv.totalAmount, currencySymbol)}
                </td>
                <td className="py-3 px-3 text-right font-mono font-bold text-amber-600 dark:text-amber-400">
                  {formatCurrency(inv.balanceDue, currencySymbol)}
                </td>
                <td className="py-3 px-3 text-right">
                  <span
                    className={`text-[10px] px-2.5 py-1 rounded-lg border font-bold uppercase ${getStatusBadgeStyle(
                      inv.status
                    )}`}
                  >
                    {inv.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
