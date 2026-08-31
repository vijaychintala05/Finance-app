import React, { useState, useMemo } from 'react';
import {
  ArrowLeft,
  BadgeDollarSign,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  CreditCard,
  Download,
  Edit2,
  ExternalLink,
  FileCheck,
  FilePlus2,
  FileSpreadsheet,
  FileText,
  FolderKanban,
  History,
  Layers,
  Mail,
  MapPin,
  MoreVertical,
  Phone,
  Plus,
  Printer,
  Receipt,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Tag,
  Trash2,
  TrendingDown,
  TrendingUp,
  User,
  Wallet,
  Zap,
} from 'lucide-react';
import { Client, Invoice, Estimate, PaymentReceipt, CreditNote } from '../../types';
import { useBooks } from '../../context/BooksContext';
import { formatCurrency, formatDate, getStatusBadgeStyle } from '../../utils/formatters';
import { InvoiceEditorModal } from '../invoices/InvoiceEditorModal';
import { RecordCustomerPaymentModal } from '../sales/RecordCustomerPaymentModal';

interface CustomerWorkspaceProps {
  client: Client;
  onBack: () => void;
  onEdit: (client: Client) => void;
}

type WorkspaceTab = 'details' | 'activity' | 'quotes' | 'invoices' | 'payments' | 'statement';
type StatementPeriod = 'mtd' | 'last_month' | 'qtd' | 'ytd' | 'all';

export const CustomerWorkspace: React.FC<CustomerWorkspaceProps> = ({
  client,
  onBack,
  onEdit,
}) => {
  const {
    invoices,
    estimates,
    paymentsReceived,
    creditNotes,
    projects,
    settings,
    deleteClient,
  } = useBooks();

  const [activeTab, setActiveTab] = useState<WorkspaceTab>('details');
  const [statementPeriod, setStatementPeriod] = useState<StatementPeriod>('ytd');
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [selectedEstimateForConvert, setSelectedEstimateForConvert] = useState<Estimate | null>(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [selectedInvoiceForPayment, setSelectedInvoiceForPayment] = useState<Invoice | null>(null);

  const money = (value: number) => formatCurrency(value, settings.currencySymbol);

  // Filtered customer records
  const clientInvoices = useMemo(
    () => invoices.filter((i) => (i.clientId === client.id || i.clientName === client.companyName) && i.status !== 'Void'),
    [invoices, client]
  );

  const clientEstimates = useMemo(
    () => estimates.filter((e) => e.clientId === client.id || e.clientName === client.companyName),
    [estimates, client]
  );

  const clientPayments = useMemo(
    () => paymentsReceived.filter((p) => p.clientId === client.id),
    [paymentsReceived, client]
  );

  const clientCredits = useMemo(
    () => creditNotes.filter((c) => c.clientId === client.id),
    [creditNotes, client]
  );

  const clientProjects = useMemo(
    () => projects.filter((p) => p.clientId === client.id),
    [projects, client]
  );

  // Financial Metrics
  const totalInvoiced = clientInvoices.reduce((sum, i) => sum + i.totalAmount, 0);
  const totalPaid = clientInvoices.reduce((sum, i) => sum + i.paidAmount, 0);
  const totalReceivable = clientInvoices.reduce((sum, i) => sum + i.balanceDue, 0);

  // Aging Radar Calculation
  const agingBuckets = useMemo(() => {
    const today = new Date().getTime();
    let current0_30 = 0;
    let days31_60 = 0;
    let days61_90 = 0;
    let days90Plus = 0;

    clientInvoices.forEach((inv) => {
      if (inv.balanceDue <= 0) return;
      const dueTime = new Date(inv.dueDate).getTime();
      const diffDays = Math.floor((today - dueTime) / (1000 * 60 * 60 * 24));

      if (diffDays <= 0 || diffDays <= 30) {
        current0_30 += inv.balanceDue;
      } else if (diffDays <= 60) {
        days31_60 += inv.balanceDue;
      } else if (diffDays <= 90) {
        days61_90 += inv.balanceDue;
      } else {
        days90Plus += inv.balanceDue;
      }
    });

    const overdueTotal = days31_60 + days61_90 + days90Plus;

    return {
      current0_30,
      days31_60,
      days61_90,
      days90Plus,
      overdueTotal,
    };
  }, [clientInvoices]);

  // Days Sales Outstanding (DSO) / Payment Velocity Metric
  const dsoStats = useMemo(() => {
    if (clientPayments.length === 0) {
      return {
        avgDays: null,
        label: 'New Customer · No payment history yet',
        badge: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
      };
    }

    let totalDays = 0;
    let countedInvoices = 0;

    clientInvoices.forEach((inv) => {
      if (inv.paidAmount > 0) {
        const invDate = new Date(inv.issueDate).getTime();
        // Find matching payment or use created date
        const matchPayment = clientPayments.find((p) => p.invoiceId === inv.id || p.invoiceNumber === inv.invoiceNumber);
        if (matchPayment) {
          const pmtDate = new Date(matchPayment.paymentDate).getTime();
          const days = Math.max(0, Math.round((pmtDate - invDate) / (1000 * 60 * 60 * 24)));
          totalDays += days;
          countedInvoices++;
        }
      }
    });

    const avgDays = countedInvoices > 0 ? Math.round(totalDays / countedInvoices) : 15;

    if (agingBuckets.days90Plus > 0) {
      return {
        avgDays,
        label: `⚠️ High Risk (${avgDays}d avg turnaround · 90d+ overdue)`,
        badge: 'bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-800',
      };
    } else if (avgDays <= 15) {
      return {
        avgDays,
        label: `⚡ Fast Payer (~${avgDays} days avg settlement)`,
        badge: 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800',
      };
    } else if (avgDays <= 35) {
      return {
        avgDays,
        label: `🟢 Standard Terms (~${avgDays} days avg settlement)`,
        badge: 'bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800',
      };
    } else {
      return {
        avgDays,
        label: `⚠️ Extended Terms (~${avgDays} days avg settlement)`,
        badge: 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800',
      };
    }
  }, [clientInvoices, clientPayments, agingBuckets]);

  const handleDelete = () => {
    if (confirm(`Are you sure you want to delete customer "${client.companyName}"? This action cannot be undone.`)) {
      deleteClient(client.id);
      onBack();
    }
  };

  const handleConvertToInvoice = (est: Estimate) => {
    setSelectedEstimateForConvert(est);
    setIsInvoiceModalOpen(true);
  };

  const handleOpenPaymentModal = (inv: Invoice) => {
    setSelectedInvoiceForPayment(inv);
    setIsPaymentModalOpen(true);
  };

  // Activity Timeline Events
  const activityEvents = useMemo(() => {
    const events: Array<{
      id: string;
      date: string;
      title: string;
      description: string;
      type: 'invoice' | 'estimate' | 'payment' | 'credit' | 'created';
      amount?: number;
      badge?: string;
      badgeTone?: string;
    }> = [];

    if (client.createdAt) {
      events.push({
        id: `client-created-${client.id}`,
        date: client.createdAt,
        title: 'Customer Account Created',
        description: `Customer account established with default terms: ${client.paymentTerms || 'Net 30'}.`,
        type: 'created',
      });
    }

    clientEstimates.forEach((est) => {
      events.push({
        id: `est-${est.id}`,
        date: est.createdAt || est.issueDate,
        title: `Quotation #${est.estimateNumber} Generated`,
        description: `Estimate total: ${money(est.totalAmount)}. Status: ${est.status}.`,
        type: 'estimate',
        amount: est.totalAmount,
        badge: est.status,
        badgeTone: getStatusBadgeStyle(est.status),
      });
    });

    clientInvoices.forEach((inv) => {
      events.push({
        id: `inv-${inv.id}`,
        date: inv.createdAt || inv.issueDate,
        title: `Sales Invoice #${inv.invoiceNumber} Posted`,
        description: `Billed: ${money(inv.totalAmount)} · Balance Due: ${money(inv.balanceDue)}. Due ${formatDate(inv.dueDate)}.`,
        type: 'invoice',
        amount: inv.totalAmount,
        badge: inv.status,
        badgeTone: getStatusBadgeStyle(inv.status),
      });
    });

    clientPayments.forEach((pmt) => {
      events.push({
        id: `pmt-${pmt.id}`,
        date: pmt.paymentDate,
        title: `Payment Received #${pmt.paymentNumber || pmt.id.slice(-6).toUpperCase()}`,
        description: `Received via ${pmt.paymentMode || 'Direct Transfer'} ${pmt.reference ? `(Ref: ${pmt.reference})` : ''}.`,
        type: 'payment',
        amount: pmt.amount,
        badge: 'Paid',
        badgeTone: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
      });
    });

    clientCredits.forEach((cn) => {
      events.push({
        id: `cn-${cn.id}`,
        date: cn.creditNoteDate || cn.createdAt,
        title: `Credit Note #${cn.creditNoteNumber} Issued`,
        description: `Credit allowance: ${money(cn.totalAmount)}. Reason: ${cn.reason || 'General credit adjustment'}.`,
        type: 'credit',
        amount: cn.totalAmount,
        badge: cn.status,
        badgeTone: getStatusBadgeStyle(cn.status),
      });
    });

    return events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [client, clientInvoices, clientEstimates, clientPayments, clientCredits]);

  // Statement Ledger Calculation
  const statementEntries = useMemo(() => {
    const entries: Array<{
      date: string;
      type: 'Invoice' | 'Payment' | 'Credit Note';
      reference: string;
      debit: number;
      credit: number;
      runningBalance: number;
    }> = [];

    const rawTx: Array<{ date: string; type: 'Invoice' | 'Payment' | 'Credit Note'; reference: string; debit: number; credit: number }> = [];

    clientInvoices.forEach((inv) => {
      rawTx.push({
        date: inv.issueDate,
        type: 'Invoice',
        reference: inv.invoiceNumber,
        debit: inv.totalAmount,
        credit: 0,
      });
    });

    clientPayments.forEach((pmt) => {
      rawTx.push({
        date: pmt.paymentDate,
        type: 'Payment',
        reference: pmt.paymentNumber || `PMT-${pmt.id.slice(-6).toUpperCase()}`,
        debit: 0,
        credit: pmt.amount,
      });
    });

    clientCredits.forEach((cn) => {
      rawTx.push({
        date: cn.creditNoteDate || cn.createdAt,
        type: 'Credit Note',
        reference: cn.creditNoteNumber,
        debit: 0,
        credit: cn.totalAmount,
      });
    });

    rawTx.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    let balance = 0;
    rawTx.forEach((tx) => {
      balance += tx.debit - tx.credit;
      entries.push({
        ...tx,
        runningBalance: balance,
      });
    });

    return entries;
  }, [clientInvoices, clientPayments, clientCredits]);

  return (
    <div className="mx-auto min-h-full max-w-[1440px] space-y-6 bg-slate-50/60 p-4 text-slate-900 sm:p-6 lg:p-8 dark:bg-slate-950 dark:text-slate-100">
      {/* HEADER BAR & BREADCRUMBS */}
      <div className="flex flex-col gap-4 rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs dark:border-slate-800/90 dark:bg-slate-900 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <button
              onClick={onBack}
              className="group inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 cursor-pointer"
            >
              <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" />
              <span>Back to Customers</span>
            </button>
            <span className="text-xs text-slate-400">/</span>
            <span className="text-xs font-bold text-blue-600 dark:text-blue-400">Customer 360 Workspace</span>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 font-extrabold text-white text-base shadow-sm">
              {client.companyName ? client.companyName.slice(0, 2).toUpperCase() : client.name.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">
                  {client.companyName || client.name}
                </h1>
                <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-[10px] font-bold text-blue-700 border border-blue-200/60 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800/50">
                  CUST #{client.id.slice(-6).toUpperCase()}
                </span>
                <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold ${dsoStats.badge}`}>
                  {dsoStats.label}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Primary Contact: <strong>{client.name}</strong> · {client.email} · {client.phone || 'No phone'}
              </p>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => {
              setSelectedEstimateForConvert(null);
              setIsInvoiceModalOpen(true);
            }}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-blue-600 px-4 text-xs font-bold text-white shadow-xs hover:bg-blue-700 transition-colors cursor-pointer"
          >
            <FilePlus2 className="h-4 w-4" />
            <span>+ Invoice</span>
          </button>
          <button
            onClick={() => {
              setSelectedInvoiceForPayment(null);
              setIsPaymentModalOpen(true);
            }}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-emerald-600 px-4 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 transition-colors cursor-pointer"
          >
            <Wallet className="h-4 w-4" />
            <span>+ Record Payment</span>
          </button>
          <button
            onClick={() => onEdit(client)}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 cursor-pointer"
          >
            <Edit2 className="h-3.5 w-3.5 text-slate-500" />
            <span>Edit Profile</span>
          </button>
          <button
            onClick={handleDelete}
            title="Delete customer"
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-400 shadow-xs hover:border-rose-300 hover:bg-rose-50 hover:text-rose-600 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-rose-950/40 cursor-pointer"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* EXECUTIVE FINANCIAL SUMMARY CARDS */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-xs dark:border-slate-800/90 dark:bg-slate-900">
          <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            <span>Total Invoiced</span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400">
              <Receipt className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="mt-2 font-financial text-2xl font-extrabold text-slate-900 dark:text-white">
            {money(totalInvoiced)}
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {clientInvoices.length} posted billing documents
          </p>
        </div>

        <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-xs dark:border-slate-800/90 dark:bg-slate-900">
          <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            <span>Total Collected</span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="mt-2 font-financial text-2xl font-extrabold text-emerald-600 dark:text-emerald-400">
            {money(totalPaid)}
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {clientPayments.length} payment transactions settled
          </p>
        </div>

        <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-xs dark:border-slate-800/90 dark:bg-slate-900">
          <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            <span>Outstanding Balance</span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-50 text-purple-600 dark:bg-purple-950 dark:text-purple-400">
              <TrendingUp className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="mt-2 font-financial text-2xl font-extrabold text-slate-900 dark:text-white">
            {money(totalReceivable)}
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Current open subledger liability
          </p>
        </div>

        <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-xs dark:border-slate-800/90 dark:bg-slate-900">
          <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            <span>Overdue Amount</span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-50 text-rose-600 dark:bg-rose-950 dark:text-rose-400">
              <Clock className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className={`mt-2 font-financial text-2xl font-extrabold ${agingBuckets.overdueTotal > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-white'}`}>
            {money(agingBuckets.overdueTotal)}
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {agingBuckets.overdueTotal > 0 ? 'Urgent collection follow-up required' : 'All accounts within terms'}
          </p>
        </div>
      </section>

      {/* RECEIVABLES AGING RADAR BAR */}
      {totalReceivable > 0 && (
        <section className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs dark:border-slate-800/90 dark:bg-slate-900 space-y-3">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-blue-600" />
                <span>Receivables Aging Radar & Risk Exposure</span>
              </h2>
              <p className="text-[11px] text-slate-500">Aging breakdown across outstanding unpaid customer balances</p>
            </div>
            <div className="text-xs font-bold text-slate-700 dark:text-slate-300">
              Total Open: <span className="font-financial font-extrabold text-blue-600 dark:text-blue-400">{money(totalReceivable)}</span>
            </div>
          </div>

          {/* Segmented Progress Bar */}
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            {agingBuckets.current0_30 > 0 && (
              <div
                style={{ width: `${(agingBuckets.current0_30 / totalReceivable) * 100}%` }}
                className="bg-emerald-500 transition-all"
                title={`Current 0-30d: ${money(agingBuckets.current0_30)}`}
              />
            )}
            {agingBuckets.days31_60 > 0 && (
              <div
                style={{ width: `${(agingBuckets.days31_60 / totalReceivable) * 100}%` }}
                className="bg-amber-500 transition-all"
                title={`31-60d Overdue: ${money(agingBuckets.days31_60)}`}
              />
            )}
            {agingBuckets.days61_90 > 0 && (
              <div
                style={{ width: `${(agingBuckets.days61_90 / totalReceivable) * 100}%` }}
                className="bg-orange-500 transition-all"
                title={`61-90d Overdue: ${money(agingBuckets.days61_90)}`}
              />
            )}
            {agingBuckets.days90Plus > 0 && (
              <div
                style={{ width: `${(agingBuckets.days90Plus / totalReceivable) * 100}%` }}
                className="bg-rose-600 transition-all"
                title={`90d+ Overdue: ${money(agingBuckets.days90Plus)}`}
              />
            )}
          </div>

          {/* Aging Chips */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
            <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-2.5 text-xs dark:border-emerald-950 dark:bg-emerald-950/30">
              <span className="font-semibold text-emerald-700 dark:text-emerald-300 text-[11px]">Current (0-30 Days)</span>
              <p className="mt-0.5 font-financial font-extrabold text-emerald-800 dark:text-emerald-200">{money(agingBuckets.current0_30)}</p>
            </div>
            <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-2.5 text-xs dark:border-amber-950 dark:bg-amber-950/30">
              <span className="font-semibold text-amber-700 dark:text-amber-300 text-[11px]">31-60 Days Overdue</span>
              <p className="mt-0.5 font-financial font-extrabold text-amber-800 dark:text-amber-200">{money(agingBuckets.days31_60)}</p>
            </div>
            <div className="rounded-xl border border-orange-100 bg-orange-50/50 p-2.5 text-xs dark:border-orange-950 dark:bg-orange-950/30">
              <span className="font-semibold text-orange-700 dark:text-orange-300 text-[11px]">61-90 Days Overdue</span>
              <p className="mt-0.5 font-financial font-extrabold text-orange-800 dark:text-orange-200">{money(agingBuckets.days61_90)}</p>
            </div>
            <div className="rounded-xl border border-rose-100 bg-rose-50/50 p-2.5 text-xs dark:border-rose-950 dark:bg-rose-950/30">
              <span className="font-semibold text-rose-700 dark:text-rose-300 text-[11px]">90+ Days Overdue</span>
              <p className="mt-0.5 font-financial font-extrabold text-rose-800 dark:text-rose-200">{money(agingBuckets.days90Plus)}</p>
            </div>
          </div>
        </section>
      )}

      {/* 6 WORKSPACE TABS */}
      <div className="flex border-b border-slate-200/90 gap-2 overflow-x-auto pb-2 dark:border-slate-800">
        {[
          { key: 'details', label: 'Details & Profile', icon: User },
          { key: 'activity', label: 'Activity & Audit Log', icon: History, badge: activityEvents.length },
          { key: 'quotes', label: 'Quotes & Estimates', icon: FileSpreadsheet, badge: clientEstimates.length },
          { key: 'invoices', label: 'Invoices & Billing', icon: Receipt, badge: clientInvoices.length },
          { key: 'payments', label: 'Payments Received', icon: Wallet, badge: clientPayments.length },
          { key: 'statement', label: 'Account Statement', icon: FileText },
        ].map((tab) => {
          const Icon = tab.icon;
          const isSelected = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as WorkspaceTab)}
              className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition-all cursor-pointer ${
                isSelected
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-white border border-slate-200/80 text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white'
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{tab.label}</span>
              {tab.badge !== undefined && (
                <span
                  className={`rounded-full px-1.5 py-0.2 text-[10px] font-extrabold ${
                    isSelected ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                  }`}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* TAB 1: DETAILS & PROFILE */}
      {activeTab === 'details' && (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Company & Contact Profile */}
          <section className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs dark:border-slate-800/90 dark:bg-slate-900 space-y-5">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
              <Building2 className="h-5 w-5 text-blue-600" />
              <h2 className="text-sm font-bold tracking-tight text-slate-900 dark:text-white">Customer & Contact Information</h2>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 text-xs">
              <div>
                <span className="font-semibold text-slate-400">Company Name</span>
                <p className="mt-1 font-bold text-slate-900 dark:text-slate-100 text-sm">{client.companyName || '—'}</p>
              </div>

              <div>
                <span className="font-semibold text-slate-400">Contact Person</span>
                <p className="mt-1 font-bold text-slate-900 dark:text-slate-100 text-sm">{client.name || '—'}</p>
              </div>

              <div>
                <span className="font-semibold text-slate-400">Email Address</span>
                <p className="mt-1 font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5 text-slate-400" />
                  {client.email || '—'}
                </p>
              </div>

              <div>
                <span className="font-semibold text-slate-400">Phone Number</span>
                <p className="mt-1 font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5 text-slate-400" />
                  {client.phone || '—'}
                </p>
              </div>
            </div>

            <div className="border-t border-slate-100 pt-4 dark:border-slate-800">
              <span className="font-semibold text-slate-400 text-xs">Billing & Corporate Address</span>
              <p className="mt-1.5 whitespace-pre-line text-xs font-medium text-slate-700 dark:text-slate-300 leading-relaxed bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                {client.billingAddress || 'No billing address configured.'}
              </p>
            </div>
          </section>

          {/* Financial & Terms Details */}
          <section className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs dark:border-slate-800/90 dark:bg-slate-900 space-y-5">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
              <CreditCard className="h-5 w-5 text-emerald-600" />
              <h2 className="text-sm font-bold tracking-tight text-slate-900 dark:text-white">Tax, Currency & Terms</h2>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 text-xs">
              <div>
                <span className="font-semibold text-slate-400">Tax Identification / GSTIN</span>
                <p className="mt-1 font-bold font-financial text-slate-900 dark:text-slate-100 text-sm">
                  {client.taxId || 'Not registered / Unspecified'}
                </p>
              </div>

              <div>
                <span className="font-semibold text-slate-400">Default Currency</span>
                <p className="mt-1 font-bold text-slate-900 dark:text-slate-100 text-sm">
                  {client.currency || settings.currencySymbol || 'USD'}
                </p>
              </div>

              <div>
                <span className="font-semibold text-slate-400">Payment Terms</span>
                <p className="mt-1 font-bold text-slate-900 dark:text-slate-100 text-sm">
                  {client.paymentTerms || 'Net 30'}
                </p>
              </div>

              <div>
                <span className="font-semibold text-slate-400">Active Linked Projects</span>
                <p className="mt-1 font-bold text-slate-900 dark:text-slate-100 text-sm">
                  {clientProjects.length} projects
                </p>
              </div>
            </div>

            <div className="border-t border-slate-100 pt-4 dark:border-slate-800">
              <span className="font-semibold text-slate-400 text-xs">Internal Notes & Remarks</span>
              <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-300 italic bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                {client.notes || 'No internal remarks noted for this customer.'}
              </p>
            </div>
          </section>
        </div>
      )}

      {/* TAB 2: ACTIVITY & AUDIT TIMELINE */}
      {activeTab === 'activity' && (
        <section className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs dark:border-slate-800/90 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4 dark:border-slate-800">
            <div>
              <h2 className="text-sm font-bold tracking-tight text-slate-900 dark:text-white">Customer Activity & Audit Trail</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Chronological history of invoices, quotes, and payment events.</p>
            </div>
            <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-bold text-blue-700 dark:bg-blue-950 dark:text-blue-300">
              {activityEvents.length} Events
            </span>
          </div>

          <div className="mt-6 flow-root">
            <ul className="-mb-8">
              {activityEvents.map((event, eventIdx) => (
                <li key={event.id}>
                  <div className="relative pb-8">
                    {eventIdx !== activityEvents.length - 1 ? (
                      <span className="absolute left-4 top-4 -ml-px h-full w-0.5 bg-slate-200 dark:bg-slate-800" aria-hidden="true" />
                    ) : null}
                    <div className="relative flex space-x-3">
                      <div>
                        <span
                          className={`flex h-8 w-8 items-center justify-center rounded-full ring-8 ring-white dark:ring-slate-900 ${
                            event.type === 'invoice'
                              ? 'bg-blue-600 text-white'
                              : event.type === 'payment'
                              ? 'bg-emerald-600 text-white'
                              : event.type === 'estimate'
                              ? 'bg-purple-600 text-white'
                              : 'bg-slate-600 text-white'
                          }`}
                        >
                          {event.type === 'invoice' && <Receipt className="h-4 w-4" />}
                          {event.type === 'payment' && <Wallet className="h-4 w-4" />}
                          {event.type === 'estimate' && <FileSpreadsheet className="h-4 w-4" />}
                          {event.type === 'created' && <User className="h-4 w-4" />}
                        </span>
                      </div>
                      <div className="flex min-w-0 flex-1 justify-between space-x-4 pt-1.5">
                        <div>
                          <p className="text-xs font-bold text-slate-900 dark:text-white">{event.title}</p>
                          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{event.description}</p>
                        </div>
                        <div className="whitespace-nowrap text-right text-xs text-slate-500 dark:text-slate-400 font-medium">
                          <time>{formatDate(event.date)}</time>
                        </div>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* TAB 3: QUOTES & ESTIMATES */}
      {activeTab === 'quotes' && (
        <section className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs dark:border-slate-800/90 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4 dark:border-slate-800">
            <div>
              <h2 className="text-sm font-bold tracking-tight text-slate-900 dark:text-white">Customer Quotations & Estimates</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">All proposals sent to this client.</p>
            </div>
          </div>

          {clientEstimates.length === 0 ? (
            <div className="py-12 text-center">
              <FileSpreadsheet className="mx-auto h-10 w-10 text-slate-300 dark:text-slate-600" />
              <p className="mt-2 text-xs font-bold text-slate-700 dark:text-slate-300">No quotes or estimates created yet</p>
              <p className="text-[11px] text-slate-400">Create quotes to send proposals to this customer.</p>
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:border-slate-800">
                    <th className="py-3 px-3">Quote #</th>
                    <th className="py-3 px-3">Date</th>
                    <th className="py-3 px-3">Expiry</th>
                    <th className="py-3 px-3">Status</th>
                    <th className="py-3 px-3 text-right">Amount</th>
                    <th className="py-3 px-3 text-right pr-4">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {clientEstimates.map((est) => (
                    <tr key={est.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                      <td className="py-3 px-3 font-bold text-blue-600 dark:text-blue-400">{est.estimateNumber}</td>
                      <td className="py-3 px-3 text-slate-600 dark:text-slate-300">{formatDate(est.issueDate)}</td>
                      <td className="py-3 px-3 text-slate-500">{formatDate(est.expiryDate)}</td>
                      <td className="py-3 px-3">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${getStatusBadgeStyle(est.status)}`}>
                          {est.status}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right font-financial font-extrabold text-slate-900 dark:text-white">
                        {money(est.totalAmount)}
                      </td>
                      <td className="py-3 px-3 text-right pr-4">
                        <button
                          onClick={() => handleConvertToInvoice(est)}
                          className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-blue-700 shadow-xs hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300 cursor-pointer"
                        >
                          <Zap className="h-3 w-3" />
                          <span>Convert to Invoice</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* TAB 4: INVOICES & BILLING */}
      {activeTab === 'invoices' && (
        <section className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs dark:border-slate-800/90 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4 dark:border-slate-800">
            <div>
              <h2 className="text-sm font-bold tracking-tight text-slate-900 dark:text-white">Invoices & Billing History</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">All posted invoices and payment settlements.</p>
            </div>
            <button
              onClick={() => {
                setSelectedEstimateForConvert(null);
                setIsInvoiceModalOpen(true);
              }}
              className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700 cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>New Invoice</span>
            </button>
          </div>

          {clientInvoices.length === 0 ? (
            <div className="py-12 text-center">
              <Receipt className="mx-auto h-10 w-10 text-slate-300 dark:text-slate-600" />
              <p className="mt-2 text-xs font-bold text-slate-700 dark:text-slate-300">No invoices issued to this customer</p>
              <p className="text-[11px] text-slate-400">Click "+ New Invoice" above to generate a sales invoice.</p>
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:border-slate-800">
                    <th className="py-3 px-3">Invoice #</th>
                    <th className="py-3 px-3">Date</th>
                    <th className="py-3 px-3">Due Date</th>
                    <th className="py-3 px-3">Status</th>
                    <th className="py-3 px-3 text-right">Total</th>
                    <th className="py-3 px-3 text-right">Paid</th>
                    <th className="py-3 px-3 text-right">Balance Due</th>
                    <th className="py-3 px-3 text-right pr-4">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {clientInvoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                      <td className="py-3 px-3 font-bold text-blue-600 dark:text-blue-400">{inv.invoiceNumber}</td>
                      <td className="py-3 px-3 text-slate-600 dark:text-slate-300">{formatDate(inv.issueDate)}</td>
                      <td className="py-3 px-3 text-slate-500">{formatDate(inv.dueDate)}</td>
                      <td className="py-3 px-3">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${getStatusBadgeStyle(inv.status)}`}>
                          {inv.status}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right font-financial font-bold text-slate-900 dark:text-white">
                        {money(inv.totalAmount)}
                      </td>
                      <td className="py-3 px-3 text-right font-financial text-emerald-600 dark:text-emerald-400">
                        {money(inv.paidAmount)}
                      </td>
                      <td className={`py-3 px-3 text-right font-financial font-extrabold ${inv.balanceDue > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-500'}`}>
                        {money(inv.balanceDue)}
                      </td>
                      <td className="py-3 px-3 text-right pr-4">
                        {inv.balanceDue > 0 ? (
                          <button
                            onClick={() => handleOpenPaymentModal(inv)}
                            className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700 shadow-xs hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 cursor-pointer"
                          >
                            <Wallet className="h-3 w-3" />
                            <span>Record Payment</span>
                          </button>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600">
                            <CheckCircle2 className="h-3 w-3" />
                            <span>Settled</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* TAB 5: PAYMENTS RECEIVED */}
      {activeTab === 'payments' && (
        <section className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs dark:border-slate-800/90 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4 dark:border-slate-800">
            <div>
              <h2 className="text-sm font-bold tracking-tight text-slate-900 dark:text-white">Payment Receipts</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">All customer cash and bank remittances.</p>
            </div>
            <button
              onClick={() => {
                setSelectedInvoiceForPayment(null);
                setIsPaymentModalOpen(true);
              }}
              className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Record Payment</span>
            </button>
          </div>

          {clientPayments.length === 0 ? (
            <div className="py-12 text-center">
              <Wallet className="mx-auto h-10 w-10 text-slate-300 dark:text-slate-600" />
              <p className="mt-2 text-xs font-bold text-slate-700 dark:text-slate-300">No payment records found</p>
              <p className="text-[11px] text-slate-400">Payments recorded against customer invoices will appear here.</p>
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:border-slate-800">
                    <th className="py-3 px-3">Payment #</th>
                    <th className="py-3 px-3">Date</th>
                    <th className="py-3 px-3">Payment Mode</th>
                    <th className="py-3 px-3">Reference / Cheque #</th>
                    <th className="py-3 px-3 text-right">Amount Received</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {clientPayments.map((pmt) => (
                    <tr key={pmt.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                      <td className="py-3 px-3 font-bold text-emerald-600 dark:text-emerald-400">
                        {pmt.paymentNumber || `PMT-${pmt.id.slice(-6).toUpperCase()}`}
                      </td>
                      <td className="py-3 px-3 text-slate-600 dark:text-slate-300">{formatDate(pmt.paymentDate)}</td>
                      <td className="py-3 px-3 font-semibold text-slate-700 dark:text-slate-300">{pmt.paymentMode || 'Bank Transfer'}</td>
                      <td className="py-3 px-3 text-slate-500 font-mono text-[11px]">{pmt.reference || '—'}</td>
                      <td className="py-3 px-3 text-right font-financial font-extrabold text-emerald-600 dark:text-emerald-400">
                        {money(pmt.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* TAB 6: STATEMENT OF ACCOUNT */}
      {activeTab === 'statement' && (
        <section className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs dark:border-slate-800/90 dark:bg-slate-900 space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-100 pb-4 dark:border-slate-800">
            <div>
              <h2 className="text-sm font-bold tracking-tight text-slate-900 dark:text-white">Customer Statement of Account</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Running ledger account statement for {client.companyName || client.name}.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 print:hidden">
              <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs font-bold dark:border-slate-700 dark:bg-slate-800">
                {(['mtd', 'qtd', 'ytd', 'all'] as StatementPeriod[]).map((p) => (
                  <button
                    key={p}
                    onClick={() => setStatementPeriod(p)}
                    className={`rounded-md px-2.5 py-1 uppercase tracking-wider transition-all cursor-pointer ${
                      statementPeriod === p
                        ? 'bg-white text-blue-700 shadow-xs dark:bg-slate-900 dark:text-blue-400'
                        : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>

              <button
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 cursor-pointer"
              >
                <Printer className="h-3.5 w-3.5" />
                <span>Print Statement</span>
              </button>
            </div>
          </div>

          {/* Statement Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:border-slate-800">
                  <th className="py-3 px-3">Date</th>
                  <th className="py-3 px-3">Transaction Type</th>
                  <th className="py-3 px-3">Reference #</th>
                  <th className="py-3 px-3 text-right">Debit (Invoiced)</th>
                  <th className="py-3 px-3 text-right">Credit (Paid)</th>
                  <th className="py-3 px-3 text-right">Running Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {statementEntries.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-xs text-slate-400">
                      No financial transactions recorded for this statement period.
                    </td>
                  </tr>
                ) : (
                  statementEntries.map((entry, idx) => (
                    <tr key={`${entry.reference}-${idx}`} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                      <td className="py-3 px-3 text-slate-700 dark:text-slate-300 font-medium">{formatDate(entry.date)}</td>
                      <td className="py-3 px-3 font-semibold text-slate-900 dark:text-white">{entry.type}</td>
                      <td className="py-3 px-3 font-bold text-blue-600 dark:text-blue-400">{entry.reference}</td>
                      <td className="py-3 px-3 text-right font-financial font-bold text-slate-900 dark:text-white">
                        {entry.debit > 0 ? money(entry.debit) : '—'}
                      </td>
                      <td className="py-3 px-3 text-right font-financial font-bold text-emerald-600 dark:text-emerald-400">
                        {entry.credit > 0 ? money(entry.credit) : '—'}
                      </td>
                      <td className={`py-3 px-3 text-right font-financial font-extrabold ${entry.runningBalance > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-white'}`}>
                        {money(entry.runningBalance)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {statementEntries.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-slate-300 dark:border-slate-700 font-bold">
                    <td colSpan={3} className="py-3 px-3 text-xs uppercase tracking-wider text-slate-500">Closing Balance</td>
                    <td className="py-3 px-3 text-right font-financial font-bold">{money(totalInvoiced)}</td>
                    <td className="py-3 px-3 text-right font-financial font-bold text-emerald-600">{money(totalPaid)}</td>
                    <td className="py-3 px-3 text-right font-financial font-black text-rose-600 dark:text-rose-400 text-sm">
                      {money(totalReceivable)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </section>
      )}

      {/* Invoice Editor Modal */}
      {isInvoiceModalOpen && (
        <InvoiceEditorModal
          isOpen={isInvoiceModalOpen}
          onClose={() => {
            setIsInvoiceModalOpen(false);
            setSelectedEstimateForConvert(null);
          }}
          initialClientId={client.id}
          initialEstimate={selectedEstimateForConvert}
        />
      )}

      {/* Record Customer Payment Modal */}
      {isPaymentModalOpen && (
        <RecordCustomerPaymentModal
          isOpen={isPaymentModalOpen}
          onClose={() => {
            setIsPaymentModalOpen(false);
            setSelectedInvoiceForPayment(null);
          }}
          clientId={client.id}
          targetInvoice={selectedInvoiceForPayment}
        />
      )}
    </div>
  );
};
