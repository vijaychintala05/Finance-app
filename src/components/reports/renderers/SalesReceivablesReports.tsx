import React from 'react';
import { useBooks } from '../../../context/BooksContext';
import { formatCurrency, formatDate } from '../../../utils/formatters';

interface Props {
  reportId: string;
  dateRangeLabel: string;
}

export const SalesReceivablesReports: React.FC<Props> = ({ reportId, dateRangeLabel }) => {
  const { settings, invoices, clients, salespersons } = useBooks();

  // Sales by Customer calculation
  const customerSalesMap = clients.map((client) => {
    const clientInvoices = invoices.filter(
      (inv) => inv.clientId === client.id || inv.clientName.toLowerCase() === client.name.toLowerCase()
    );
    const totalBilled = clientInvoices.reduce((sum, i) => sum + i.totalAmount, 0);
    const totalPaid = clientInvoices.reduce((sum, i) => sum + i.paidAmount, 0);
    const balanceDue = clientInvoices.reduce((sum, i) => sum + i.balanceDue, 0);

    return {
      client,
      invoiceCount: clientInvoices.length,
      totalBilled,
      totalPaid,
      balanceDue,
    };
  });

  // Sales by Item calculation
  const itemMap = new Map<string, { name: string; count: number; totalAmount: number }>();
  invoices.forEach((inv) => {
    inv.items?.forEach((item) => {
      const key = item.description || 'General Service';
      const existing = itemMap.get(key) || { name: key, count: 0, totalAmount: 0 };
      itemMap.set(key, {
        name: key,
        count: existing.count + (item.quantity || 1),
        totalAmount: existing.totalAmount + (item.amount || item.quantity * item.rate),
      });
    });
  });
  const salesByItems = Array.from(itemMap.values());

  // Aged Receivables calculation
  const today = new Date();
  const arBuckets = invoices
    .filter((inv) => inv.balanceDue > 0)
    .map((inv) => {
      const dueDate = new Date(inv.dueDate);
      const diffDays = Math.max(0, Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 3600 * 24)));

      let bucket: 'Current' | '1-30 Days' | '31-60 Days' | '61-90 Days' | '90+ Days' = 'Current';
      if (diffDays > 90) bucket = '90+ Days';
      else if (diffDays > 60) bucket = '61-90 Days';
      else if (diffDays > 30) bucket = '31-60 Days';
      else if (diffDays > 0) bucket = '1-30 Days';

      return { ...inv, diffDays, bucket };
    });

  const bucket0 = arBuckets.filter((i) => i.bucket === 'Current').reduce((s, i) => s + i.balanceDue, 0);
  const bucket30 = arBuckets.filter((i) => i.bucket === '1-30 Days').reduce((s, i) => s + i.balanceDue, 0);
  const bucket60 = arBuckets.filter((i) => i.bucket === '31-60 Days').reduce((s, i) => s + i.balanceDue, 0);
  const bucket90 = arBuckets.filter((i) => i.bucket === '61-90 Days').reduce((s, i) => s + i.balanceDue, 0);
  const bucket90Plus = arBuckets.filter((i) => i.bucket === '90+ Days').reduce((s, i) => s + i.balanceDue, 0);
  const totalAR = arBuckets.reduce((s, i) => s + i.balanceDue, 0);

  // Aged Receivables Report
  if (reportId === 'aged_receivables') {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-xs max-w-5xl mx-auto space-y-6 text-xs">
        <div className="text-center border-b border-slate-200 pb-5">
          <h2 className="text-xl font-black text-slate-900">{settings.firmName}</h2>
          <h3 className="text-xs font-bold text-blue-600 uppercase tracking-widest mt-1">
            ACCOUNTS RECEIVABLE (AR) AGING SCHEDULE
          </h3>
          <p className="text-slate-500 text-[11px] mt-0.5">{dateRangeLabel}</p>
        </div>

        {/* KPI Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3 text-center">
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
            <span className="text-[10px] font-bold text-slate-400 uppercase">Current</span>
            <div className="text-sm font-black text-emerald-600 mt-1">{formatCurrency(bucket0, settings.currencySymbol)}</div>
          </div>
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
            <span className="text-[10px] font-bold text-slate-400 uppercase">1-30 Days</span>
            <div className="text-sm font-black text-blue-600 mt-1">{formatCurrency(bucket30, settings.currencySymbol)}</div>
          </div>
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
            <span className="text-[10px] font-bold text-slate-400 uppercase">31-60 Days</span>
            <div className="text-sm font-black text-amber-600 mt-1">{formatCurrency(bucket60, settings.currencySymbol)}</div>
          </div>
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
            <span className="text-[10px] font-bold text-slate-400 uppercase">61-90 Days</span>
            <div className="text-sm font-black text-orange-600 mt-1">{formatCurrency(bucket90, settings.currencySymbol)}</div>
          </div>
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
            <span className="text-[10px] font-bold text-slate-400 uppercase">90+ Days</span>
            <div className="text-sm font-black text-rose-600 mt-1">{formatCurrency(bucket90Plus, settings.currencySymbol)}</div>
          </div>
          <div className="p-3 bg-blue-50 dark:bg-slate-800 text-blue-900 dark:text-white border border-blue-200 dark:border-slate-700 rounded-xl col-span-2 md:col-span-1">
            <span className="text-[10px] font-bold uppercase text-blue-700 dark:text-slate-400">Total Due</span>
            <div className="text-sm font-black text-blue-900 dark:text-emerald-400 mt-1">{formatCurrency(totalAR, settings.currencySymbol)}</div>
          </div>
        </div>

        {/* Detailed Invoice Table */}
        <div className="overflow-x-auto border border-slate-200 rounded-xl">
          <table className="w-full text-left">
            <thead className="bg-slate-100 text-slate-700 font-bold uppercase text-[10px]">
              <tr>
                <th className="p-3">Invoice #</th>
                <th className="p-3">Customer / Client</th>
                <th className="p-3">Due Date</th>
                <th className="p-3 text-right">Total Invoice</th>
                <th className="p-3 text-right">Balance Due</th>
                <th className="p-3 text-center">Aging Bucket</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {arBuckets.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-4 text-center text-slate-400 italic">
                    No outstanding invoices. All receivables collected!
                  </td>
                </tr>
              ) : (
                arBuckets.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-50">
                    <td className="p-3 font-mono font-bold text-blue-600">{inv.invoiceNumber}</td>
                    <td className="p-3 font-semibold text-slate-800">{inv.clientName}</td>
                    <td className="p-3 text-slate-500">{formatDate(inv.dueDate)}</td>
                    <td className="p-3 text-right font-mono">{formatCurrency(inv.totalAmount, settings.currencySymbol)}</td>
                    <td className="p-3 text-right font-mono font-bold text-amber-600">
                      {formatCurrency(inv.balanceDue, settings.currencySymbol)}
                    </td>
                    <td className="p-3 text-center">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                          inv.bucket === 'Current'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : inv.bucket === '1-30 Days'
                            ? 'bg-blue-50 text-blue-700 border-blue-200'
                            : inv.bucket === '31-60 Days'
                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : 'bg-rose-50 text-rose-700 border-rose-200'
                        }`}
                      >
                        {inv.bucket} ({inv.diffDays} days)
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // Sales by Customer
  if (reportId === 'sales_by_customer') {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-xs max-w-5xl mx-auto space-y-6 text-xs">
        <div className="text-center border-b border-slate-200 pb-5">
          <h2 className="text-xl font-black text-slate-900">{settings.firmName}</h2>
          <h3 className="text-xs font-bold text-blue-600 uppercase tracking-widest mt-1">
            SALES BY CUSTOMER / CLIENT SUMMARY
          </h3>
          <p className="text-slate-500 text-[11px] mt-0.5">{dateRangeLabel}</p>
        </div>

        <div className="overflow-x-auto border border-slate-200 rounded-xl">
          <table className="w-full text-left">
            <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-b border-slate-200 dark:border-slate-700 font-bold uppercase text-[10px]">
              <tr>
                <th className="p-3">Customer Name</th>
                <th className="p-3">Company / Email</th>
                <th className="p-3 text-center">Invoices</th>
                <th className="p-3 text-right">Total Billed</th>
                <th className="p-3 text-right">Total Paid</th>
                <th className="p-3 text-right">Balance Due</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium font-mono text-slate-800">
              {customerSalesMap.map((row) => (
                <tr key={row.client.id} className="hover:bg-slate-50">
                  <td className="p-3 font-sans font-bold text-slate-900">{row.client.name}</td>
                  <td className="p-3 font-sans text-slate-500">{row.client.companyName || row.client.email}</td>
                  <td className="p-3 text-center">{row.invoiceCount}</td>
                  <td className="p-3 text-right font-bold text-blue-600">
                    {formatCurrency(row.totalBilled, settings.currencySymbol)}
                  </td>
                  <td className="p-3 text-right text-emerald-600">
                    {formatCurrency(row.totalPaid, settings.currencySymbol)}
                  </td>
                  <td className="p-3 text-right text-amber-600">
                    {formatCurrency(row.balanceDue, settings.currencySymbol)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // Sales by Salesperson
  if (reportId === 'sales_by_salesperson') {
    const spReportData = salespersons.map((sp) => {
      const spInvoices = invoices.filter(
        (inv) =>
          inv.salespersonId === sp.id ||
          inv.salespersonName?.toLowerCase() === sp.name.toLowerCase() ||
          inv.notes?.toLowerCase().includes(sp.name.toLowerCase())
      );
      const totalBilled = spInvoices.reduce((sum, i) => sum + i.totalAmount, 0);
      const totalPaid = spInvoices.reduce((sum, i) => sum + i.paidAmount, 0);
      const commissionEarned = (totalBilled * sp.commissionRate) / 100;

      return {
        salesperson: sp,
        invoiceCount: spInvoices.length,
        totalBilled,
        totalPaid,
        commissionEarned,
      };
    });

    const grandTotalBilled = spReportData.reduce((s, r) => s + r.totalBilled, 0);
    const grandTotalPaid = spReportData.reduce((s, r) => s + r.totalPaid, 0);
    const grandTotalCommission = spReportData.reduce((s, r) => s + r.commissionEarned, 0);

    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-xs max-w-5xl mx-auto space-y-6 text-xs">
        <div className="text-center border-b border-slate-200 pb-5">
          <h2 className="text-xl font-black text-slate-900">{settings.firmName}</h2>
          <h3 className="text-xs font-bold text-blue-600 uppercase tracking-widest mt-1">
            SALES & COMMISSIONS BY SALES PERSON
          </h3>
          <p className="text-slate-500 text-[11px] mt-0.5">{dateRangeLabel}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
            <span className="text-[10px] font-bold text-slate-500 uppercase">Total Sales Generated</span>
            <div className="text-lg font-black text-slate-900 mt-1">
              {formatCurrency(grandTotalBilled, settings.currencySymbol)}
            </div>
          </div>
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
            <span className="text-[10px] font-bold text-slate-500 uppercase">Total Sales Collected</span>
            <div className="text-lg font-black text-emerald-600 mt-1">
              {formatCurrency(grandTotalPaid, settings.currencySymbol)}
            </div>
          </div>
          <div className="p-4 bg-purple-50 rounded-xl border border-purple-200">
            <span className="text-[10px] font-bold text-purple-700 uppercase">Total Commission Payable</span>
            <div className="text-lg font-black text-purple-700 mt-1">
              {formatCurrency(grandTotalCommission, settings.currencySymbol)}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto border border-slate-200 rounded-xl">
          <table className="w-full text-left">
            <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-b border-slate-200 dark:border-slate-700 font-bold uppercase text-[10px]">
              <tr>
                <th className="p-3">Salesperson Name</th>
                <th className="p-3">Code / Region</th>
                <th className="p-3 text-center">Commission Rate</th>
                <th className="p-3 text-center">Invoices</th>
                <th className="p-3 text-right">Total Billed</th>
                <th className="p-3 text-right">Total Paid</th>
                <th className="p-3 text-right">Calculated Commission</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
              {spReportData.map((row) => (
                <tr key={row.salesperson.id} className="hover:bg-slate-50">
                  <td className="p-3 font-bold text-slate-900">{row.salesperson.name}</td>
                  <td className="p-3 text-slate-500 font-mono">
                    {row.salesperson.code} {row.salesperson.region ? `(${row.salesperson.region})` : ''}
                  </td>
                  <td className="p-3 text-center font-bold text-blue-600">
                    {row.salesperson.commissionRate}%
                  </td>
                  <td className="p-3 text-center">{row.invoiceCount}</td>
                  <td className="p-3 text-right font-mono font-bold text-slate-900">
                    {formatCurrency(row.totalBilled, settings.currencySymbol)}
                  </td>
                  <td className="p-3 text-right font-mono text-emerald-600">
                    {formatCurrency(row.totalPaid, settings.currencySymbol)}
                  </td>
                  <td className="p-3 text-right font-mono font-bold text-purple-600">
                    {formatCurrency(row.commissionEarned, settings.currencySymbol)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-slate-100 font-bold border-t border-slate-200">
              <tr>
                <td colSpan={4} className="p-3 text-right uppercase text-[10px]">Total:</td>
                <td className="p-3 text-right font-mono">{formatCurrency(grandTotalBilled, settings.currencySymbol)}</td>
                <td className="p-3 text-right font-mono text-emerald-600">{formatCurrency(grandTotalPaid, settings.currencySymbol)}</td>
                <td className="p-3 text-right font-mono text-purple-600">{formatCurrency(grandTotalCommission, settings.currencySymbol)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    );
  }

  // Default rendering for other Sales/Receivables views
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-xs max-w-5xl mx-auto space-y-6 text-xs">
      <div className="text-center border-b border-slate-200 pb-5">
        <h2 className="text-xl font-black text-slate-900">{settings.firmName}</h2>
        <h3 className="text-xs font-bold text-blue-600 uppercase tracking-widest mt-1">
          {reportId.replace(/_/g, ' ')} REPORT
        </h3>
        <p className="text-slate-500 text-[11px] mt-0.5">{dateRangeLabel}</p>
      </div>

      <div className="overflow-x-auto border border-slate-200 rounded-xl">
        <table className="w-full text-left">
          <thead className="bg-slate-100 text-slate-700 font-bold uppercase text-[10px]">
            <tr>
              <th className="p-3">Reference #</th>
              <th className="p-3">Description / Customer</th>
              <th className="p-3">Date</th>
              <th className="p-3 text-right">Amount ({settings.currencyCode})</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-mono">
            {invoices.map((inv) => (
              <tr key={inv.id} className="hover:bg-slate-50">
                <td className="p-3 font-bold text-blue-600">{inv.invoiceNumber}</td>
                <td className="p-3 font-sans text-slate-800">{inv.clientName}</td>
                <td className="p-3 font-sans text-slate-500">{formatDate(inv.issueDate)}</td>
                <td className="p-3 text-right font-bold">{formatCurrency(inv.totalAmount, settings.currencySymbol)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
