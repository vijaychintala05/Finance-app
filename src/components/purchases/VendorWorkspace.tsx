import React, { useState, useMemo, useEffect } from 'react';
import {
  AlertCircle,
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
  Loader2,
  Mail,
  MapPin,
  MoreVertical,
  Phone,
  Plus,
  Printer,
  Receipt,
  RefreshCw,
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
import { Vendor, Bill, PurchaseOrder, PaymentMade, VendorCredit } from '../../types';
import { useBooks } from '../../context/BooksContext';
import { formatCurrency, formatDate, getStatusBadgeStyle } from '../../utils/formatters';
import { RecordVendorPaymentModal } from './RecordVendorPaymentModal';
import { apiClient } from '../../api/client';

interface VendorWorkspaceProps {
  vendor: Vendor;
  onBack: () => void;
  onEdit: (vendor: Vendor) => void;
  onNavigateToBill?: (billId: string) => void;
}

interface VendorStatementData {
  vendorId: string;
  vendorName: string;
  fromDate: string;
  toDate: string;
  openingBalance: number;
  totalBills: number;
  totalPayments: number;
  totalDebits: number;
  closingBalance: number;
  transactions: Array<{
    date: string;
    type: string;
    reference: string;
    debit: number;
    credit: number;
    runningBalance: number;
  }>;
}

type WorkspaceTab = 'details' | 'activity' | 'purchase_orders' | 'bills' | 'payments' | 'credits' | 'statement';
type StatementPeriod = 'mtd' | 'last_month' | 'qtd' | 'ytd' | 'all';

export const VendorWorkspace: React.FC<VendorWorkspaceProps> = ({
  vendor,
  onBack,
  onEdit,
  onNavigateToBill,
}) => {
  const {
    bills,
    purchaseOrders,
    paymentsMade,
    vendorCredits,
    settings,
    deleteVendor,
  } = useBooks();

  const [activeTab, setActiveTab] = useState<WorkspaceTab>('details');
  const [statementPeriod, setStatementPeriod] = useState<StatementPeriod>('ytd');
  const [serverStatement, setServerStatement] = useState<VendorStatementData | null>(null);
  const [isLoadingStatement, setIsLoadingStatement] = useState(false);
  const [statementError, setStatementError] = useState<string | null>(null);
  const [statementFetchKey, setStatementFetchKey] = useState<number>(0);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [selectedBillForPayment, setSelectedBillForPayment] = useState<Bill | null>(null);

  const money = (value: number) => formatCurrency(value, settings.currencySymbol);

  // Filtered vendor records
  const vendorBills = useMemo(
    () => bills.filter((b) => (b.vendorName === vendor.name || b.vendorName === vendor.companyName) && b.status !== 'VOIDED'),
    [bills, vendor]
  );

  const vendorPOs = useMemo(
    () => purchaseOrders.filter((po) => po.vendorName === vendor.name || po.vendorName === vendor.companyName),
    [purchaseOrders, vendor]
  );

  const vendorPayments = useMemo(
    () => paymentsMade.filter((p) => p.vendorName === vendor.name || p.vendorName === vendor.companyName),
    [paymentsMade, vendor]
  );

  const vendorCreditNotes = useMemo(
    () => vendorCredits.filter((c) => c.vendorName === vendor.name || c.vendorName === vendor.companyName),
    [vendorCredits, vendor]
  );

  // Financial aggregates
  const totalBilled = useMemo(
    () => vendorBills.reduce((acc, b) => acc + Number(b.totalAmount || 0), 0),
    [vendorBills]
  );

  const totalPaid = useMemo(
    () => vendorPayments.reduce((acc, p) => acc + Number(p.amount || 0), 0),
    [vendorPayments]
  );

  const totalCreditsAvailable = useMemo(
    () => vendorCreditNotes.reduce((acc, c) => acc + Number(c.remainingAmount !== undefined ? c.remainingAmount : c.creditAmount || 0), 0),
    [vendorCreditNotes]
  );

  const totalPayablesDue = useMemo(
    () =>
      vendorBills.reduce((acc, b) => {
        const bal =
          b.balanceDue !== undefined
            ? b.balanceDue
            : Math.max(0, Number(b.totalAmount || 0) - Number(b.amountPaid || 0));
        return acc + bal;
      }, 0),
    [vendorBills]
  );

  // Payables Aging Radar breakdown
  const agingBuckets = useMemo(() => {
    const today = new Date();
    let current = 0; // 0-30 days
    let overdue30 = 0; // 31-60 days
    let overdue60 = 0; // 61-90 days
    let overdue90 = 0; // 90+ days

    vendorBills.forEach((bill) => {
      const bal =
        bill.balanceDue !== undefined
          ? bill.balanceDue
          : Math.max(0, Number(bill.totalAmount || 0) - Number(bill.amountPaid || 0));
      if (bal <= 0) return;

      const due = bill.dueDate ? new Date(bill.dueDate) : today;
      const diffDays = Math.floor((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));

      if (diffDays <= 0) {
        current += bal;
      } else if (diffDays <= 30) {
        current += bal;
      } else if (diffDays <= 60) {
        overdue30 += bal;
      } else if (diffDays <= 90) {
        overdue60 += bal;
      } else {
        overdue90 += bal;
      }
    });

    const totalOpen = current + overdue30 + overdue60 + overdue90 || 1;

    return {
      current,
      overdue30,
      overdue60,
      overdue90,
      totalOpen,
      currentPct: Math.round((current / totalOpen) * 100),
      overdue30Pct: Math.round((overdue30 / totalOpen) * 100),
      overdue60Pct: Math.round((overdue60 / totalOpen) * 100),
      overdue90Pct: Math.round((overdue90 / totalOpen) * 100),
    };
  }, [vendorBills]);

  // Unified Chronological Activity Timeline
  const activityEvents = useMemo(() => {
    const events: Array<{
      id: string;
      date: string;
      type: 'PO' | 'BILL' | 'PAYMENT' | 'CREDIT';
      title: string;
      subtitle: string;
      amount: number;
      status?: string;
    }> = [];

    vendorPOs.forEach((po) => {
      events.push({
        id: `po-${po.id}`,
        date: po.orderDate,
        type: 'PO',
        title: `Purchase Order Issued #${po.poNumber}`,
        subtitle: po.notes || 'Procurement order',
        amount: po.totalAmount,
        status: po.status,
      });
    });

    vendorBills.forEach((b) => {
      events.push({
        id: `bill-${b.id}`,
        date: b.billDate,
        type: 'BILL',
        title: `Bill Received #${b.billNumber}`,
        subtitle: `Due ${formatDate(b.dueDate)}`,
        amount: b.totalAmount,
        status: b.status,
      });
    });

    vendorPayments.forEach((p) => {
      events.push({
        id: `pay-${p.id}`,
        date: p.paymentDate,
        type: 'PAYMENT',
        title: `Payment Remitted #${p.paymentNumber}`,
        subtitle: `Via ${p.paymentMethod || 'Bank Wire'} (${p.billNumber || 'Direct'})`,
        amount: p.amount,
        status: 'SETTLED',
      });
    });

    vendorCreditNotes.forEach((c) => {
      events.push({
        id: `cn-${c.id}`,
        date: c.issueDate,
        type: 'CREDIT',
        title: `Vendor Credit Note #${c.creditNoteNumber}`,
        subtitle: c.notes || 'Purchase return / correction',
        amount: c.creditAmount,
        status: c.status,
      });
    });

    return events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [vendorPOs, vendorBills, vendorPayments, vendorCreditNotes]);

  // Statement Date Range Calculation
  const statementDateRange = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const todayStr = now.toISOString().slice(0, 10);

    if (statementPeriod === 'mtd') {
      const fromDate = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
      return { fromDate, toDate: todayStr, label: 'Month to Date' };
    }
    if (statementPeriod === 'last_month') {
      const fromDate = new Date(Date.UTC(year, month - 1, 1)).toISOString().slice(0, 10);
      const toDate = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
      return { fromDate, toDate, label: 'Last Month' };
    }
    if (statementPeriod === 'qtd') {
      const quarterStartMonth = Math.floor(month / 3) * 3;
      const fromDate = new Date(Date.UTC(year, quarterStartMonth, 1)).toISOString().slice(0, 10);
      return { fromDate, toDate: todayStr, label: 'Quarter to Date' };
    }
    if (statementPeriod === 'ytd') {
      const fiscalYear = month >= 3 ? year : year - 1;
      const fromDate = new Date(Date.UTC(fiscalYear, 3, 1)).toISOString().slice(0, 10);
      return { fromDate, toDate: todayStr, label: 'Year to Date' };
    }
    return { fromDate: '1970-01-01', toDate: todayStr, label: 'All Time' };
  }, [statementPeriod]);

  // Fetch Authoritative Server Statement
  useEffect(() => {
    if (activeTab !== 'statement') return;
    let active = true;
    setServerStatement(null);
    setIsLoadingStatement(true);
    setStatementError(null);

    const { fromDate, toDate } = statementDateRange;
    apiClient
      .get<VendorStatementData>(`/finance/reports/vendor-statement/${vendor.id}?fromDate=${fromDate}&toDate=${toDate}`)
      .then((res) => {
        if (!active) return;
        if (res.data) {
          setServerStatement(res.data);
        } else if (res.error) {
          setStatementError(res.error);
        }
      })
      .catch((err) => {
        if (!active) return;
        setStatementError(err.message || 'Failed to load vendor statement from server');
      })
      .finally(() => {
        if (active) setIsLoadingStatement(false);
      });

    return () => {
      active = false;
    };
  }, [activeTab, vendor.id, statementDateRange, statementFetchKey]);

  // Statement Ledger Calculation - Strictly Authoritative Server Data (No client fallback)
  const statementLedger = useMemo(() => {
    const { fromDate, toDate } = statementDateRange;
    const isMatching =
      serverStatement &&
      serverStatement.vendorId === vendor.id &&
      serverStatement.fromDate === fromDate &&
      serverStatement.toDate === toDate;

    if (isMatching) {
      return {
        openingBalance: serverStatement.openingBalance,
        rows: serverStatement.transactions.map((t, idx) => ({
          id: `srv-${idx}-${t.reference}`,
          date: t.date,
          title: `${t.type} #${t.reference}`,
          reference: t.reference,
          debit: t.debit,
          credit: t.credit,
          runningBalance: t.runningBalance,
        })),
        totalPeriodBills: serverStatement.totalBills,
        totalPeriodPayments: serverStatement.totalPayments,
        closingBalance: serverStatement.closingBalance,
        isAuthoritative: true,
      };
    }

    return {
      openingBalance: 0,
      rows: [],
      totalPeriodBills: 0,
      totalPeriodPayments: 0,
      closingBalance: 0,
      isAuthoritative: false,
    };
  }, [serverStatement, vendor.id, statementDateRange]);

  const handlePrintStatement = () => {
    window.print();
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 animate-fade-in text-slate-900 dark:text-slate-100">
      {/* 1. Header & Navigation Breadcrumb */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/90 dark:border-slate-800 pb-5">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-2xs hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            title="Back to Vendors Directory"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold font-mono tracking-wider uppercase text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/80 px-2 py-0.5 rounded">
                Vendor 360 Workspace
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Verified Supplier
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight mt-0.5 flex items-center gap-2">
              <Building2 className="h-6 w-6 text-purple-600" />
              <span>{vendor.name}</span>
            </h1>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => {
              setSelectedBillForPayment(null);
              setIsPaymentModalOpen(true);
            }}
            className="flex items-center gap-1.5 rounded-xl bg-purple-600 px-3.5 py-2 text-xs font-bold text-white shadow-2xs hover:bg-purple-700 dark:bg-purple-600 dark:hover:bg-purple-500 transition-colors cursor-pointer"
          >
            <CreditCard className="h-4 w-4" />
            <span>Record Payment</span>
          </button>

          <button
            onClick={() => onEdit(vendor)}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
          >
            <Edit2 className="h-3.5 w-3.5" />
            <span>Edit Profile</span>
          </button>

          <button
            onClick={() => {
              if (window.confirm(`Are you sure you want to delete vendor "${vendor.name}"?`)) {
                deleteVendor(vendor.id);
                onBack();
              }
            }}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-rose-200 bg-white text-rose-600 shadow-2xs hover:bg-rose-50 dark:border-rose-900/60 dark:bg-slate-900 dark:text-rose-400 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
            title="Delete Vendor"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* 2. Top Financial KPI Summary Cards */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-2xs dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total Payables Due</span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-50 text-rose-600 dark:bg-rose-950 dark:text-rose-400">
              <TrendingDown className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 font-financial text-xl sm:text-2xl font-black text-rose-600 dark:text-rose-400">
            {money(totalPayablesDue)}
          </p>
          <p className="mt-0.5 text-[11px] font-medium text-slate-400">
            {vendorBills.filter((b) => b.status !== 'Paid').length} open vendor bills
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-2xs dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total Lifetime Billed</span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400">
              <FileText className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 font-financial text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
            {money(totalBilled)}
          </p>
          <p className="mt-0.5 text-[11px] font-medium text-slate-400">{vendorBills.length} total bills received</p>
        </div>

        <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-2xs dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total Payments Made</span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 font-financial text-xl sm:text-2xl font-black text-emerald-600 dark:text-emerald-400">
            {money(totalPaid)}
          </p>
          <p className="mt-0.5 text-[11px] font-medium text-slate-400">{vendorPayments.length} disbursements</p>
        </div>

        <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-2xs dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Vendor Credits / Advances</span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-50 text-purple-600 dark:bg-purple-950 dark:text-purple-400">
              <Tag className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 font-financial text-xl sm:text-2xl font-black text-purple-600 dark:text-purple-400">
            {money(totalCreditsAvailable)}
          </p>
          <p className="mt-0.5 text-[11px] font-medium text-slate-400">{vendorCreditNotes.length} debit notes available</p>
        </div>
      </section>

      {/* 3. Payables Aging Radar & Priority Ratings */}
      <section className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs dark:border-slate-800 dark:bg-slate-900 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-purple-600 dark:text-purple-400" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
              Payables Aging Radar & Supplier Terms
            </h3>
          </div>

          {/* Supplier Priority Tag */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-slate-500">Terms:</span>
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-extrabold text-slate-700 border border-slate-200/60 dark:bg-slate-800 dark:text-slate-300">
              {vendor.paymentTerms || 'Net 30'}
            </span>
            {agingBuckets.overdue90 > 0 ? (
              <span className="rounded-full bg-rose-50 px-2.5 py-0.5 text-[11px] font-extrabold text-rose-700 border border-rose-200/60 dark:bg-rose-950 dark:text-rose-300">
                ⚠️ Critical Overdue Balance
              </span>
            ) : (
              <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-extrabold text-emerald-700 border border-emerald-200/60 dark:bg-emerald-950 dark:text-emerald-300">
                🟢 Clean Credit History
              </span>
            )}
          </div>
        </div>

        {/* Proportional Segmented Aging Bar */}
        <div className="space-y-2">
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            {agingBuckets.current > 0 && (
              <div
                style={{ width: `${agingBuckets.currentPct}%` }}
                className="h-full bg-emerald-500 transition-all duration-500"
                title={`Current (0-30d): ${money(agingBuckets.current)}`}
              />
            )}
            {agingBuckets.overdue30 > 0 && (
              <div
                style={{ width: `${agingBuckets.overdue30Pct}%` }}
                className="h-full bg-amber-500 transition-all duration-500"
                title={`31-60d Overdue: ${money(agingBuckets.overdue30)}`}
              />
            )}
            {agingBuckets.overdue60 > 0 && (
              <div
                style={{ width: `${agingBuckets.overdue60Pct}%` }}
                className="h-full bg-orange-500 transition-all duration-500"
                title={`61-90d Overdue: ${money(agingBuckets.overdue60)}`}
              />
            )}
            {agingBuckets.overdue90 > 0 && (
              <div
                style={{ width: `${agingBuckets.overdue90Pct}%` }}
                className="h-full bg-rose-500 transition-all duration-500"
                title={`90+ Days Overdue: ${money(agingBuckets.overdue90)}`}
              />
            )}
          </div>

          {/* Aging Chips Legend */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 pt-1">
            <div className="rounded-xl border border-emerald-200/60 bg-emerald-50/40 p-2.5 dark:border-emerald-900/40 dark:bg-emerald-950/20">
              <span className="text-[10px] font-bold text-emerald-800 dark:text-emerald-300">Current (0-30d)</span>
              <p className="mt-0.5 font-financial text-xs font-bold text-emerald-900 dark:text-emerald-200">
                {money(agingBuckets.current)}
              </p>
            </div>

            <div className="rounded-xl border border-amber-200/60 bg-amber-50/40 p-2.5 dark:border-amber-900/40 dark:bg-amber-950/20">
              <span className="text-[10px] font-bold text-amber-800 dark:text-amber-300">31-60 Days</span>
              <p className="mt-0.5 font-financial text-xs font-bold text-amber-900 dark:text-amber-200">
                {money(agingBuckets.overdue30)}
              </p>
            </div>

            <div className="rounded-xl border border-orange-200/60 bg-orange-50/40 p-2.5 dark:border-orange-900/40 dark:bg-orange-950/20">
              <span className="text-[10px] font-bold text-orange-800 dark:text-orange-300">61-90 Days</span>
              <p className="mt-0.5 font-financial text-xs font-bold text-orange-900 dark:text-orange-200">
                {money(agingBuckets.overdue60)}
              </p>
            </div>

            <div className="rounded-xl border border-rose-200/60 bg-rose-50/40 p-2.5 dark:border-rose-900/40 dark:bg-rose-950/20">
              <span className="text-[10px] font-bold text-rose-800 dark:text-rose-300">90+ Days</span>
              <p className="mt-0.5 font-financial text-xs font-bold text-rose-900 dark:text-rose-200">
                {money(agingBuckets.overdue90)}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 4. Tabbed Workspace Navigation */}
      <div className="border-b border-slate-200/90 dark:border-slate-800">
        <nav className="flex space-x-2 overflow-x-auto pb-2">
          {(
            [
              { id: 'details', label: 'Details & Profile', icon: User },
              { id: 'activity', label: 'Activity Timeline', icon: History, count: activityEvents.length },
              { id: 'purchase_orders', label: 'Purchase Orders', icon: FileCheck, count: vendorPOs.length },
              { id: 'bills', label: 'Bills & Payables', icon: FileText, count: vendorBills.length },
              { id: 'payments', label: 'Payments Made', icon: CreditCard, count: vendorPayments.length },
              { id: 'credits', label: 'Vendor Credits', icon: Tag, count: vendorCreditNotes.length },
              { id: 'statement', label: 'Statement of Account', icon: FileSpreadsheet },
            ] as Array<{ id: WorkspaceTab; label: string; icon: React.ElementType; count?: number }>
          ).map((tab) => {
            const Icon = tab.icon;
            const isSelected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-purple-600 text-white shadow-2xs dark:bg-purple-600'
                    : 'bg-white border border-slate-200/80 text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{tab.label}</span>
                {tab.count !== undefined && (
                  <span
                    className={`rounded-full px-1.5 py-0.2 text-[10px] font-extrabold ${
                      isSelected
                        ? 'bg-purple-800 text-purple-100'
                        : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* 5. Tab Panels */}

      {/* TAB 1: DETAILS & PROFILE */}
      {activeTab === 'details' && (
        <div className="grid gap-6 md:grid-cols-2">
          {/* Contact Details Card */}
          <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs dark:border-slate-800 dark:bg-slate-900 space-y-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
              <User className="h-4 w-4 text-purple-600" />
              <span>Contact & Identity Information</span>
            </h3>

            <div className="space-y-3 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-50 dark:border-slate-800/50">
                <span className="text-slate-400">Company Name</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">{vendor.name}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-50 dark:border-slate-800/50">
                <span className="text-slate-400">Contact Person</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">{vendor.contactPerson || '—'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-50 dark:border-slate-800/50">
                <span className="text-slate-400">Email</span>
                <span className="font-semibold text-blue-600 dark:text-blue-400">{vendor.email || '—'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-50 dark:border-slate-800/50">
                <span className="text-slate-400">Phone</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">{vendor.phone || '—'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-50 dark:border-slate-800/50">
                <span className="text-slate-400">Address / Location</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200 text-right max-w-[200px] truncate">
                  {vendor.address || '—'}
                </span>
              </div>
            </div>
          </div>

          {/* Tax & Commercial Terms Card */}
          <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs dark:border-slate-800 dark:bg-slate-900 space-y-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
              <BadgeDollarSign className="h-4 w-4 text-purple-600" />
              <span>Commercial & Tax Settings</span>
            </h3>

            <div className="space-y-3 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-50 dark:border-slate-800/50">
                <span className="text-slate-400">Tax ID / GSTIN / VAT</span>
                <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{vendor.taxId || '—'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-50 dark:border-slate-800/50">
                <span className="text-slate-400">Default Payment Terms</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">{vendor.paymentTerms || 'Net 30'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-50 dark:border-slate-800/50">
                <span className="text-slate-400">Supplier Category</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">{vendor.category || 'Materials / Plywood'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-50 dark:border-slate-800/50">
                <span className="text-slate-400">Account Status</span>
                <span className="font-extrabold text-emerald-600 dark:text-emerald-400">{vendor.status || 'Active'}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: ACTIVITY TIMELINE */}
      {activeTab === 'activity' && (
        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <History className="h-4 w-4 text-purple-600" />
              <span>Unified Procurement Audit Trail</span>
            </h3>
            <span className="text-xs text-slate-400">{activityEvents.length} total events</span>
          </div>

          {activityEvents.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-400">No activity recorded for this vendor yet.</div>
          ) : (
            <div className="mt-4 space-y-4">
              {activityEvents.map((event) => (
                <div key={event.id} className="flex items-start gap-3 text-xs">
                  <div
                    className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                      event.type === 'BILL'
                        ? 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400'
                        : event.type === 'PO'
                        ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400'
                        : event.type === 'PAYMENT'
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400'
                        : 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-400'
                    }`}
                  >
                    {event.type === 'BILL' && <FileText className="h-3.5 w-3.5" />}
                    {event.type === 'PO' && <FileCheck className="h-3.5 w-3.5" />}
                    {event.type === 'PAYMENT' && <CreditCard className="h-3.5 w-3.5" />}
                    {event.type === 'CREDIT' && <Tag className="h-3.5 w-3.5" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-slate-900 dark:text-white">{event.title}</span>
                      <span className="font-financial font-extrabold text-slate-900 dark:text-white">{money(event.amount)}</span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-400 mt-0.5">
                      <span>{event.subtitle}</span>
                      <span>{formatDate(event.date)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: PURCHASE ORDERS */}
      {activeTab === 'purchase_orders' && (
        <div className="rounded-2xl border border-slate-200/90 bg-white shadow-2xs dark:border-slate-800 dark:bg-slate-900 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 dark:bg-slate-800/80 dark:text-slate-400 font-bold border-b border-slate-200 dark:border-slate-800 uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="p-3 pl-4">PO Number</th>
                  <th className="p-3">Order Date</th>
                  <th className="p-3">Expected Date</th>
                  <th className="p-3 text-right">Total Amount</th>
                  <th className="p-3 text-center">Status</th>
                  <th className="p-3 text-right pr-4">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {vendorPOs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-400">
                      No purchase orders recorded for this vendor.
                    </td>
                  </tr>
                ) : (
                  vendorPOs.map((po) => (
                    <tr key={po.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                      <td className="p-3 pl-4 font-bold text-blue-600 dark:text-blue-400 font-mono">{po.poNumber}</td>
                      <td className="p-3 text-slate-600 dark:text-slate-300">{formatDate(po.orderDate)}</td>
                      <td className="p-3 text-slate-600 dark:text-slate-300">{formatDate(po.expectedDate)}</td>
                      <td className="p-3 text-right font-financial font-bold text-slate-900 dark:text-white">
                        {money(po.totalAmount)}
                      </td>
                      <td className="p-3 text-center">
                        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700 border border-blue-200 dark:bg-blue-950 dark:text-blue-300">
                          {po.status}
                        </span>
                      </td>
                      <td className="p-3 text-right pr-4">
                        <button
                          onClick={() => {
                            // Convert PO to Bill
                            window.alert(`PO #${po.poNumber} ready to convert to Bill.`);
                          }}
                          className="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-2 py-1 text-[11px] font-bold text-blue-700 hover:bg-blue-100 dark:bg-blue-950 dark:text-blue-300 cursor-pointer"
                        >
                          <Zap className="h-3 w-3" />
                          <span>Convert to Bill</span>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: BILLS & PAYABLES */}
      {activeTab === 'bills' && (
        <div className="rounded-2xl border border-slate-200/90 bg-white shadow-2xs dark:border-slate-800 dark:bg-slate-900 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 dark:bg-slate-800/80 dark:text-slate-400 font-bold border-b border-slate-200 dark:border-slate-800 uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="p-3 pl-4">Bill Number</th>
                  <th className="p-3">Bill Date</th>
                  <th className="p-3">Due Date</th>
                  <th className="p-3 text-right">Bill Total</th>
                  <th className="p-3 text-right">Balance Due</th>
                  <th className="p-3 text-center">Status</th>
                  <th className="p-3 text-right pr-4">Quick Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {vendorBills.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-400">
                      No bills recorded for this vendor.
                    </td>
                  </tr>
                ) : (
                  vendorBills.map((b) => {
                    const bal =
                      b.balanceDue !== undefined
                        ? b.balanceDue
                        : Math.max(0, Number(b.totalAmount || 0) - Number(b.amountPaid || 0));

                    return (
                      <tr key={b.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                        <td className="p-3 pl-4 font-bold text-purple-600 dark:text-purple-400 font-mono">{b.billNumber}</td>
                        <td className="p-3 text-slate-600 dark:text-slate-300">{formatDate(b.billDate)}</td>
                        <td className="p-3 text-slate-600 dark:text-slate-300">{formatDate(b.dueDate)}</td>
                        <td className="p-3 text-right font-financial font-bold text-slate-900 dark:text-white">
                          {money(b.totalAmount)}
                        </td>
                        <td className="p-3 text-right font-financial font-black text-rose-600 dark:text-rose-400">
                          {money(bal)}
                        </td>
                        <td className="p-3 text-center">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold border ${
                              bal === 0
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                : 'bg-rose-50 text-rose-800 border-rose-200'
                            }`}
                          >
                            {b.status}
                          </span>
                        </td>
                        <td className="p-3 text-right pr-4">
                          {bal > 0 && (
                            <button
                              onClick={() => {
                                setSelectedBillForPayment(b);
                                setIsPaymentModalOpen(true);
                              }}
                              className="inline-flex items-center gap-1 rounded-lg bg-purple-50 px-2 py-1 text-[11px] font-bold text-purple-700 hover:bg-purple-100 dark:bg-purple-950 dark:text-purple-300 cursor-pointer"
                            >
                              <CreditCard className="h-3 w-3" />
                              <span>Pay Bill</span>
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 5: PAYMENTS MADE */}
      {activeTab === 'payments' && (
        <div className="rounded-2xl border border-slate-200/90 bg-white shadow-2xs dark:border-slate-800 dark:bg-slate-900 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 dark:bg-slate-800/80 dark:text-slate-400 font-bold border-b border-slate-200 dark:border-slate-800 uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="p-3 pl-4">Payment #</th>
                  <th className="p-3">Payment Date</th>
                  <th className="p-3">Payment Mode</th>
                  <th className="p-3">Target Bill / Ref</th>
                  <th className="p-3 text-right pr-4">Amount Disbursed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {vendorPayments.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-slate-400">
                      No payment disbursements recorded for this vendor.
                    </td>
                  </tr>
                ) : (
                  vendorPayments.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                      <td className="p-3 pl-4 font-bold text-emerald-600 dark:text-emerald-400 font-mono">{p.paymentNumber}</td>
                      <td className="p-3 text-slate-600 dark:text-slate-300">{formatDate(p.paymentDate)}</td>
                      <td className="p-3 font-semibold text-slate-800 dark:text-slate-200">{p.paymentMethod || 'Bank Wire'}</td>
                      <td className="p-3 text-slate-500 dark:text-slate-400">
                        {p.billNumber} {p.referenceNumber ? `(${p.referenceNumber})` : ''}
                      </td>
                      <td className="p-3 text-right pr-4 font-financial font-black text-emerald-600 dark:text-emerald-400">
                        {money(p.amount)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 6: VENDOR CREDITS */}
      {activeTab === 'credits' && (
        <div className="rounded-2xl border border-slate-200/90 bg-white shadow-2xs dark:border-slate-800 dark:bg-slate-900 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 dark:bg-slate-800/80 dark:text-slate-400 font-bold border-b border-slate-200 dark:border-slate-800 uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="p-3 pl-4">Credit #</th>
                  <th className="p-3">Issue Date</th>
                  <th className="p-3">Total Credit</th>
                  <th className="p-3 text-right">Remaining Credit</th>
                  <th className="p-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {vendorCreditNotes.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-slate-400">
                      No vendor credits available.
                    </td>
                  </tr>
                ) : (
                  vendorCreditNotes.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                      <td className="p-3 pl-4 font-bold text-purple-600 dark:text-purple-400 font-mono">{c.creditNoteNumber}</td>
                      <td className="p-3 text-slate-600 dark:text-slate-300">{formatDate(c.issueDate)}</td>
                      <td className="p-3 font-financial font-bold text-slate-900 dark:text-white">{money(c.creditAmount)}</td>
                      <td className="p-3 text-right font-financial font-black text-purple-600 dark:text-purple-400">
                        {money(c.remainingAmount !== undefined ? c.remainingAmount : c.creditAmount)}
                      </td>
                      <td className="p-3 text-center">
                        <span className="rounded-full bg-purple-50 px-2 py-0.5 text-[10px] font-extrabold text-purple-700 border border-purple-200">
                          {c.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 7: STATEMENT OF VENDOR ACCOUNT */}
      {activeTab === 'statement' && (
        <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-2xs dark:border-slate-800 dark:bg-slate-900 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4 dark:border-slate-800">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-purple-600" />
                <span>Vendor Statement of Account</span>
              </h3>
              <p className="text-xs text-slate-500">
                Official general ledger running statement for {vendor.name} ({statementDateRange.label}: {statementDateRange.fromDate === '1970-01-01' ? 'All Time' : `${formatDate(statementDateRange.fromDate)} – ${formatDate(statementDateRange.toDate)}`})
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 print:hidden">
              <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs font-bold dark:border-slate-700 dark:bg-slate-800">
                {(['mtd', 'last_month', 'qtd', 'ytd', 'all'] as StatementPeriod[]).map((p) => (
                  <button
                    key={p}
                    onClick={() => setStatementPeriod(p)}
                    className={`rounded-md px-2.5 py-1 uppercase tracking-wider transition-all cursor-pointer ${
                      statementPeriod === p
                        ? 'bg-white text-purple-700 shadow-xs dark:bg-slate-900 dark:text-purple-400'
                        : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                    }`}
                  >
                    {p.replace('_', ' ')}
                  </button>
                ))}
              </div>

              <button
                onClick={handlePrintStatement}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 cursor-pointer"
              >
                <Printer className="h-4 w-4" />
                <span>Print Statement</span>
              </button>
            </div>
          </div>

          {/* Loading State */}
          {isLoadingStatement && (
            <div className="flex flex-col items-center justify-center py-16 text-slate-500" data-testid="statement-loading">
              <Loader2 className="h-8 w-8 animate-spin text-purple-600 dark:text-purple-400" />
              <p className="mt-3 text-xs font-semibold text-slate-700 dark:text-slate-300">
                Fetching authoritative statement from server...
              </p>
            </div>
          )}

          {/* Error State */}
          {!isLoadingStatement && statementError && (
            <div className="rounded-xl border border-rose-200 bg-rose-50/70 p-6 text-center dark:border-rose-900/50 dark:bg-rose-950/20" data-testid="statement-error">
              <AlertCircle className="mx-auto h-8 w-8 text-rose-500" />
              <p className="mt-2 text-sm font-bold text-rose-800 dark:text-rose-300">Unable to load statement</p>
              <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">{statementError}</p>
              <button
                onClick={() => setStatementFetchKey((k) => k + 1)}
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-rose-700 transition-colors cursor-pointer"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>Retry</span>
              </button>
            </div>
          )}

          {/* Authoritative Server Statement Presentation */}
          {!isLoadingStatement && !statementError && statementLedger.isAuthoritative && (
            <>
              {/* Statement Period Metric Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-800/40">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Opening Balance</p>
                  <p className={`mt-0.5 text-sm font-black font-financial ${statementLedger.openingBalance > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-white'}`}>
                    {money(statementLedger.openingBalance)}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-800/40">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Billed (Debits)</p>
                  <p className="mt-0.5 text-sm font-black font-financial text-slate-900 dark:text-white">
                    {money(statementLedger.totalPeriodBills)}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-800/40">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Paid / Credited</p>
                  <p className="mt-0.5 text-sm font-black font-financial text-emerald-600 dark:text-emerald-400">
                    {money(statementLedger.totalPeriodPayments)}
                  </p>
                </div>
                <div className="rounded-xl border border-purple-200/80 bg-purple-50/30 p-3 dark:border-purple-900/50 dark:bg-purple-950/20">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400">Balance Owed</p>
                  <p className={`mt-0.5 text-sm font-black font-financial ${statementLedger.closingBalance > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-white'}`}>
                    {money(statementLedger.closingBalance)}
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 dark:bg-slate-800/80 dark:text-slate-400 font-bold border-b border-slate-200 dark:border-slate-800 uppercase text-[10px] tracking-wider">
                    <tr>
                      <th className="p-3 pl-4">Date</th>
                      <th className="p-3">Description</th>
                      <th className="p-3 text-right">Debit (+)</th>
                      <th className="p-3 text-right">Credit (-)</th>
                      <th className="p-3 text-right pr-4">Balance Owed</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                    {/* Opening Balance Row */}
                    {statementDateRange.fromDate !== '1970-01-01' && (
                      <tr className="bg-slate-50/50 dark:bg-slate-800/30 font-semibold">
                        <td className="p-3 pl-4 text-slate-500">{formatDate(statementDateRange.fromDate)}</td>
                        <td className="p-3 text-slate-700 dark:text-slate-300 italic">Opening Balance Forward</td>
                        <td className="p-3 text-right font-financial text-slate-400">—</td>
                        <td className="p-3 text-right font-financial text-slate-400">—</td>
                        <td className={`p-3 text-right pr-4 font-financial font-extrabold ${statementLedger.openingBalance > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-white'}`}>
                          {money(statementLedger.openingBalance)}
                        </td>
                      </tr>
                    )}

                    {statementLedger.rows.length === 0 && statementLedger.openingBalance === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-8 text-center text-slate-400">
                          No ledger transactions found for this statement period.
                        </td>
                      </tr>
                    ) : (
                      statementLedger.rows.map((row) => (
                        <tr key={row.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                          <td className="p-3 pl-4 text-slate-600 dark:text-slate-400">{formatDate(row.date)}</td>
                          <td className="p-3 font-semibold text-slate-800 dark:text-slate-200">{row.title}</td>
                          <td className="p-3 text-right font-financial font-bold text-slate-900 dark:text-white">
                            {row.debit > 0 ? money(row.debit) : '—'}
                          </td>
                          <td className="p-3 text-right font-financial font-bold text-emerald-600 dark:text-emerald-400">
                            {row.credit > 0 ? money(row.credit) : '—'}
                          </td>
                          <td className="p-3 text-right pr-4 font-financial font-black text-rose-600 dark:text-rose-400">
                            {money(row.runningBalance)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-slate-300 dark:border-slate-700 font-bold">
                      <td colSpan={2} className="p-3 pl-4 text-xs uppercase tracking-wider text-slate-500">Period Movement & Closing Balance</td>
                      <td className="p-3 text-right font-financial font-bold">{money(statementLedger.totalPeriodBills)}</td>
                      <td className="p-3 text-right font-financial font-bold text-emerald-600">{money(statementLedger.totalPeriodPayments)}</td>
                      <td className="p-3 text-right pr-4 font-financial font-black text-rose-600 dark:text-rose-400 text-sm">
                        {money(statementLedger.closingBalance)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* Record Vendor Payment Modal */}
      {isPaymentModalOpen && (
        <RecordVendorPaymentModal
          isOpen={isPaymentModalOpen}
          onClose={() => {
            setIsPaymentModalOpen(false);
            setSelectedBillForPayment(null);
          }}
          vendor={vendor}
          initialBill={selectedBillForPayment}
        />
      )}
    </div>
  );
};
