import React, { useState } from 'react';
import { useBooks } from '../../../context/BooksContext';
import { formatCurrency, formatDate } from '../../../utils/formatters';

interface Props {
  reportId: string;
  dateRangeLabel: string;
}

export const SalesReceivablesReports: React.FC<Props> = ({ reportId, dateRangeLabel }) => {
  const { settings, invoices, clients, salespersons, paymentsReceived, creditNotes } = useBooks();
  const [selectedClientId, setSelectedClientId] = useState<string>(clients[0]?.id || '');

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

  // Customer Statement of Account
  if (reportId === 'customer_statement') {
    const activeClient = clients.find((c) => c.id === selectedClientId) || clients[0];
    const clientInvoices = invoices.filter(
      (inv) => inv.clientId === activeClient?.id || inv.clientName.toLowerCase() === activeClient?.name.toLowerCase()
    );
    const clientPayments = paymentsReceived.filter(
      (p) => p.clientId === activeClient?.id || p.clientName?.toLowerCase() === activeClient?.name.toLowerCase()
    );
    const clientCredits = creditNotes.filter(
      (c) => c.clientId === activeClient?.id || c.clientName?.toLowerCase() === activeClient?.name.toLowerCase()
    );

    // Build timeline entries
    interface TimelineEntry {
      id: string;
      date: string;
      type: 'Invoice' | 'Payment Received' | 'Credit Note';
      refNumber: string;
      description: string;
      debit: number;
      credit: number;
    }

    const timeline: TimelineEntry[] = [];

    clientInvoices.forEach((inv) => {
      timeline.push({
        id: inv.id,
        date: inv.issueDate,
        type: 'Invoice',
        refNumber: inv.invoiceNumber,
        description: `Invoice generated - ${inv.status}`,
        debit: inv.totalAmount,
        credit: 0,
      });
    });

    clientPayments.forEach((p) => {
      timeline.push({
        id: p.id,
        date: p.paymentDate,
        type: 'Payment Received',
        refNumber: p.paymentNumber,
        description: `Payment received via ${p.paymentMode || 'Bank/Cash'}`,
        debit: 0,
        credit: p.amount,
      });
    });

    clientCredits.forEach((cn) => {
      timeline.push({
        id: cn.id,
        date: cn.creditNoteDate,
        type: 'Credit Note',
        refNumber: cn.creditNoteNumber,
        description: `Credit note issued - ${cn.reason || 'Adjustment'}`,
        debit: 0,
        credit: cn.totalAmount,
      });
    });

    // Sort chronologically
    timeline.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    let runningBalance = 0;
    const ledgerRows = timeline.map((entry) => {
      runningBalance += entry.debit - entry.credit;
      return {
        ...entry,
        balance: runningBalance,
      };
    });

    const totalDebits = timeline.reduce((sum, e) => sum + e.debit, 0);
    const totalCredits = timeline.reduce((sum, e) => sum + e.credit, 0);
    const netBalanceDue = totalDebits - totalCredits;

    return (
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-8 shadow-xs max-w-5xl mx-auto space-y-6 text-xs">
        {/* Customer Selector Header */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-1">
              Select Customer / Client
            </label>
            <select
              value={selectedClientId}
              onChange={(e) => setSelectedClientId(e.target.value)}
              className="px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg font-bold text-xs text-slate-800 dark:text-slate-200 focus:outline-hidden"
            >
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.companyName ? `(${c.companyName})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="text-right">
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Statement Period</span>
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">{dateRangeLabel}</span>
          </div>
        </div>

        {/* Customer Header Card */}
        {activeClient && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
            <div>
              <h2 className="text-lg font-black text-slate-900 dark:text-white">{activeClient.companyName || activeClient.name}</h2>
              <p className="text-xs text-slate-500">Contact: {activeClient.name} • {activeClient.email}</p>
              {activeClient.taxNumber && (
                <p className="text-xs text-slate-500 mt-1 font-mono">Tax / GSTIN: {activeClient.taxNumber}</p>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2.5 bg-blue-50 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900 rounded-xl">
                <span className="text-[9px] font-bold text-blue-600 dark:text-blue-400 uppercase block">Total Billed</span>
                <span className="text-xs font-black font-mono text-blue-700 dark:text-blue-300">{formatCurrency(totalDebits, settings.currencySymbol)}</span>
              </div>
              <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-900 rounded-xl">
                <span className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400 uppercase block">Total Paid/Credits</span>
                <span className="text-xs font-black font-mono text-emerald-700 dark:text-emerald-300">{formatCurrency(totalCredits, settings.currencySymbol)}</span>
              </div>
              <div className="p-2.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-100 dark:border-amber-900 rounded-xl">
                <span className="text-[9px] font-bold text-amber-600 dark:text-amber-400 uppercase block">Net Balance Due</span>
                <span className="text-xs font-black font-mono text-amber-700 dark:text-amber-300">{formatCurrency(netBalanceDue, settings.currencySymbol)}</span>
              </div>
            </div>
          </div>
        )}

        {/* Ledger Table */}
        <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
          <table className="w-full text-left">
            <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-b border-slate-200 dark:border-slate-700 font-bold uppercase text-[10px]">
              <tr>
                <th className="p-3">Date</th>
                <th className="p-3">Type</th>
                <th className="p-3">Reference #</th>
                <th className="p-3">Description</th>
                <th className="p-3 text-right">Debit ({settings.currencySymbol})</th>
                <th className="p-3 text-right">Credit ({settings.currencySymbol})</th>
                <th className="p-3 text-right">Balance ({settings.currencySymbol})</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium text-slate-800 dark:text-slate-200">
              {ledgerRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-slate-400 italic">
                    No transactions recorded for this customer statement period.
                  </td>
                </tr>
              ) : (
                ledgerRows.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="p-3 text-slate-500 font-mono">{formatDate(row.date)}</td>
                    <td className="p-3 font-bold">
                      <span className={`px-2 py-0.5 rounded text-[10px] ${
                        row.type === 'Invoice' ? 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300' :
                        row.type === 'Payment Received' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' :
                        'bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300'
                      }`}>
                        {row.type}
                      </span>
                    </td>
                    <td className="p-3 font-mono font-bold text-slate-900 dark:text-white">{row.refNumber}</td>
                    <td className="p-3 text-slate-600 dark:text-slate-400">{row.description}</td>
                    <td className="p-3 text-right font-mono font-bold text-blue-600 dark:text-blue-400">
                      {row.debit > 0 ? formatCurrency(row.debit, settings.currencySymbol) : '-'}
                    </td>
                    <td className="p-3 text-right font-mono text-emerald-600 dark:text-emerald-400">
                      {row.credit > 0 ? formatCurrency(row.credit, settings.currencySymbol) : '-'}
                    </td>
                    <td className="p-3 text-right font-mono font-bold text-slate-900 dark:text-white">
                      {formatCurrency(row.balance, settings.currencySymbol)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot className="bg-slate-100 dark:bg-slate-800 font-bold border-t border-slate-200 dark:border-slate-700">
              <tr>
                <td colSpan={4} className="p-3 text-right uppercase text-[10px]">Total Statement Activity:</td>
                <td className="p-3 text-right font-mono text-blue-600 dark:text-blue-400">{formatCurrency(totalDebits, settings.currencySymbol)}</td>
                <td className="p-3 text-right font-mono text-emerald-600 dark:text-emerald-400">{formatCurrency(totalCredits, settings.currencySymbol)}</td>
                <td className="p-3 text-right font-mono text-amber-600 dark:text-amber-400">{formatCurrency(netBalanceDue, settings.currencySymbol)}</td>
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
