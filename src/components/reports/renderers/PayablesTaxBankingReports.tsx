import React from 'react';
import { useBooks } from '../../../context/BooksContext';
import { formatCurrency, formatDate } from '../../../utils/formatters';

interface Props {
  reportId: string;
  dateRangeLabel: string;
}

export const PayablesTaxBankingReports: React.FC<Props> = ({ reportId, dateRangeLabel }) => {
  const { settings, expenses, accounts, invoices } = useBooks();

  // Expenses by Category
  const categoryMap = new Map<string, number>();
  expenses.forEach((exp) => {
    const cat = exp.accountName || 'General Expense';
    const current = categoryMap.get(cat) || 0;
    categoryMap.set(cat, current + exp.amount);
  });
  const expensesByCategory = Array.from(categoryMap.entries()).map(([name, amount]) => ({ name, amount }));

  // Purchase / Expense by Vendor
  const vendorMap = new Map<string, number>();
  expenses.forEach((exp) => {
    const v = exp.vendorName || 'General Vendor';
    const current = vendorMap.get(v) || 0;
    vendorMap.set(v, current + exp.amount);
  });
  const purchasesByVendor = Array.from(vendorMap.entries()).map(([vendor, amount]) => ({ vendor, amount }));

  // Tax Calculations
  const outputTaxCollected = invoices.reduce((s, i) => s + (i.taxAmount || 0), 0);
  const inputTaxCredit = expenses.reduce((s, e) => s + (e.amount * 0.18), 0); // 18% GST/VAT estimate
  const netTaxLiability = Math.max(0, outputTaxCollected - inputTaxCredit);

  if (reportId === 'expenses_by_category') {
    const totalExpenses = expensesByCategory.reduce((s, c) => s + c.amount, 0);

    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-xs max-w-4xl mx-auto space-y-6 text-xs">
        <div className="text-center border-b border-slate-200 pb-5">
          <h2 className="text-xl font-black text-slate-900">{settings.firmName}</h2>
          <h3 className="text-xs font-bold text-rose-600 uppercase tracking-widest mt-1">
            EXPENSES BY ACCOUNT CATEGORY
          </h3>
          <p className="text-slate-500 text-[11px] mt-0.5">{dateRangeLabel}</p>
        </div>

        <div className="overflow-x-auto border border-slate-200 rounded-xl">
          <table className="w-full text-left">
            <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-b border-slate-200 dark:border-slate-700 font-bold uppercase text-[10px]">
              <tr>
                <th className="p-3">Expense Category</th>
                <th className="p-3 text-right">Amount ({settings.currencyCode})</th>
                <th className="p-3 text-right">% of Total Spend</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono">
              {expensesByCategory.map((cat) => {
                const pct = totalExpenses > 0 ? (cat.amount / totalExpenses) * 100 : 0;
                return (
                  <tr key={cat.name} className="hover:bg-slate-50">
                    <td className="p-3 font-sans font-bold text-slate-900">{cat.name}</td>
                    <td className="p-3 text-right font-bold text-rose-600">
                      {formatCurrency(cat.amount, settings.currencySymbol)}
                    </td>
                    <td className="p-3 text-right font-bold text-slate-700">{pct.toFixed(1)}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (reportId === 'tax_summary') {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-xs max-w-4xl mx-auto space-y-6 text-xs">
        <div className="text-center border-b border-slate-200 pb-5">
          <h2 className="text-xl font-black text-slate-900">{settings.firmName}</h2>
          <h3 className="text-xs font-bold text-blue-600 uppercase tracking-widest mt-1">
            TAX SUMMARY & GST/VAT AUDIT TRAIL
          </h3>
          <p className="text-slate-500 text-[11px] mt-0.5">{dateRangeLabel}</p>
        </div>

        <div className="space-y-4 font-mono">
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
            <div className="flex justify-between font-bold text-slate-900">
              <span>Output Tax Collected on Sales (Invoices)</span>
              <span className="text-blue-600">{formatCurrency(outputTaxCollected, settings.currencySymbol)}</span>
            </div>
            <div className="flex justify-between font-bold text-slate-900">
              <span>(-) Input Tax Credit (ITC) Claimed on Expenses</span>
              <span className="text-rose-600">-{formatCurrency(inputTaxCredit, settings.currencySymbol)}</span>
            </div>
            <div className="flex justify-between font-black text-sm text-emerald-800 pt-2 border-t border-slate-300">
              <span>NET TAX PAYABLE TO AUTHORITIES</span>
              <span className="text-emerald-700">{formatCurrency(netTaxLiability, settings.currencySymbol)}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-xs max-w-4xl mx-auto space-y-6 text-xs">
      <div className="text-center border-b border-slate-200 pb-5">
        <h2 className="text-xl font-black text-slate-900">{settings.firmName}</h2>
        <h3 className="text-xs font-bold text-blue-600 uppercase tracking-widest mt-1">
          {reportId.replace(/_/g, ' ')} REPORT
        </h3>
        <p className="text-slate-500 text-[11px] mt-0.5">{dateRangeLabel}</p>
      </div>

      <div className="overflow-x-auto border border-slate-200 rounded-xl">
        <table className="w-full text-left font-mono">
          <thead className="bg-slate-100 text-slate-700 font-bold uppercase text-[10px]">
            <tr>
              <th className="p-3">Vendor / Category</th>
              <th className="p-3 text-right">Amount ({settings.currencyCode})</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {purchasesByVendor.map((row) => (
              <tr key={row.vendor} className="hover:bg-slate-50">
                <td className="p-3 font-sans font-bold">{row.vendor}</td>
                <td className="p-3 text-right font-bold text-rose-600">{formatCurrency(row.amount, settings.currencySymbol)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
