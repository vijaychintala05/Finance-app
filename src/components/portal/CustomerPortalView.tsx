import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Globe,
  ShieldCheck,
  CreditCard,
  FileText,
  Clock,
  CheckCircle2,
  AlertCircle,
  Copy,
  ExternalLink,
  DollarSign,
  Calendar,
  Search,
  Filter,
  ArrowUpRight,
  Printer,
  RefreshCw,
  Eye,
  Lock,
  UserCheck,
  ChevronRight,
  Send,
  Building,
  Mail,
  Phone,
  Ban,
  Check,
  Sparkles,
} from 'lucide-react';
import { ApiClient } from '../../api/client';

interface PortalCustomer {
  id: string;
  name: string;
  email?: string;
  phone?: string;
}

interface PortalOrg {
  id: string;
  name: string;
  email?: string;
  currency: string;
}

interface PortalInvoice {
  id: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  totalAmount: number;
  balanceDue: number;
  status: string;
}

interface PortalPayment {
  id: string;
  paymentNumber: string;
  paymentDate: string;
  amount: number;
  reference: string | null;
}

interface PortalContext {
  organization: PortalOrg;
  customer: PortalCustomer;
  summary: {
    totalOutstanding: number;
    openInvoicesCount: number;
    overdueCount: number;
  };
  invoices: PortalInvoice[];
  recentPayments: PortalPayment[];
}

interface StatementEntry {
  date: string;
  type: string;
  reference: string;
  debit: number;
  credit: number;
  runningBalance: number;
}

interface StatementData {
  openingBalance: number;
  closingBalance: number;
  totalDebits: number;
  totalCredits: number;
  entries: StatementEntry[];
}

interface CustomerPortalViewProps {
  initialToken?: string;
  customerId?: string;
  onClose?: () => void;
}

export const CustomerPortalView: React.FC<CustomerPortalViewProps> = ({
  initialToken,
  customerId: initialCustomerId,
  onClose,
}) => {
  // Mode selection: either public portal via token or internal admin management
  const [activeToken, setActiveToken] = useState<string>(() => {
    if (initialToken) return initialToken;
    const urlParams = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.includes('?') ? window.location.hash.split('?')[1] : '');
    return urlParams.get('portal_token') || hashParams.get('portal_token') || '';
  });

  const [portalData, setPortalData] = useState<PortalContext | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'invoices' | 'payments' | 'statement'>('invoices');

  // Admin Management State
  const [customersList, setCustomersList] = useState<Array<{ id: string; name: string; email?: string }>>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(initialCustomerId || '');
  const [tokenExpiryDays, setTokenExpiryDays] = useState<number>(30);
  const [generatedToken, setGeneratedToken] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);

  // Statement Filters
  const [statementFrom, setStatementFrom] = useState<string>(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().split('T')[0];
  });
  const [statementTo, setStatementTo] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [statementData, setStatementData] = useState<StatementData | null>(null);
  const [isLoadingStatement, setIsLoadingStatement] = useState<boolean>(false);

  // Pay Modal State
  const [payingInvoice, setPayingInvoice] = useState<PortalInvoice | null>(null);
  const [payAmount, setPayAmount] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<'CARD' | 'ACH' | 'UPI'>('CARD');
  const [paymentReference, setPaymentReference] = useState<string>('');
  const [isProcessingPayment, setIsProcessingPayment] = useState<boolean>(false);
  const [checkoutSession, setCheckoutSession] = useState<{
    sessionId: string;
    checkoutUrl: string;
    providerReference: string;
    expiresAt: string;
  } | null>(null);
  const [isInitiatingSession, setIsInitiatingSession] = useState<boolean>(false);
  const [isCheckingStatus, setIsCheckingStatus] = useState<boolean>(false);
  const [sessionStatusNotice, setSessionStatusNotice] = useState<string | null>(null);
  const [paymentSuccessReceipt, setPaymentSuccessReceipt] = useState<{
    paymentNumber: string;
    paidAmount: number;
    remainingBalance: number;
  } | null>(null);

  // Invoice Filters
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'UNPAID' | 'PAID'>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const apiClient = useMemo(() => new ApiClient(), []);

  // Fetch Customers List for Admin mode
  useEffect(() => {
    const fetchCustomers = async () => {
      try {
        const res = await apiClient.get<{ clients?: any[]; customers?: any[] }>('/finance/clients');
        const list = res.data?.clients || res.data?.customers || [];
        setCustomersList(
          list.map((c: any) => ({
            id: c.id,
            name: c.display_name || c.name || c.company_name || 'Customer',
            email: c.email || undefined,
          }))
        );
        if (list.length > 0 && !selectedCustomerId) {
          setSelectedCustomerId(list[0].id);
        }
      } catch {
        // May be in external public context where internal auth isn't available
      }
    };
    fetchCustomers();
  }, [apiClient, selectedCustomerId]);

  // Fetch Public Portal Context when activeToken is present
  const fetchPortalContext = useCallback(async (token: string) => {
    if (!token) return;
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const response = await fetch(`/api/v1/public/portal/${encodeURIComponent(token)}`);
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to load customer portal');
      }
      setPortalData(data.context);
    } catch (err: any) {
      setErrorMessage(err.message || 'Unable to connect to customer portal');
      setPortalData(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeToken) {
      fetchPortalContext(activeToken);
    }
  }, [activeToken, fetchPortalContext]);

  // Fetch Statement Data
  const fetchStatement = useCallback(async () => {
    if (!activeToken) return;
    setIsLoadingStatement(true);
    try {
      const query = new URLSearchParams({
        fromDate: statementFrom,
        toDate: statementTo,
      });
      const response = await fetch(`/api/v1/public/portal/${encodeURIComponent(activeToken)}/statement?${query.toString()}`);
      const data = await response.json();
      if (response.ok && data.statement) {
        setStatementData(data.statement);
      }
    } catch {
      // ignore
    } finally {
      setIsLoadingStatement(false);
    }
  }, [activeToken, statementFrom, statementTo]);

  useEffect(() => {
    if (activeTab === 'statement' && activeToken) {
      fetchStatement();
    }
  }, [activeTab, activeToken, fetchStatement]);

  // Generate Token Handler
  const handleGenerateToken = async () => {
    if (!selectedCustomerId) return;
    setIsGenerating(true);
    try {
      const res = await apiClient.post<{ token: string; portalUrl: string }>('/stage6/portal/tokens', {
        customerId: selectedCustomerId,
        expiresInDays: tokenExpiryDays,
      });
      if (res.error) throw new Error(res.error);
      const token = res.data?.token || '';
      setGeneratedToken(token);
      setActiveToken(token);
    } catch (err: any) {
      alert(err.message || 'Failed to generate portal link');
    } finally {
      setIsGenerating(false);
    }
  };

  // Revoke Token Handler
  const handleRevokeToken = async () => {
    if (!selectedCustomerId) return;
    if (!confirm('Are you sure you want to revoke customer portal access for this customer?')) return;
    try {
      const res = await apiClient.delete(`/stage6/portal/tokens/${selectedCustomerId}`);
      if (res.error) throw new Error(res.error);
      setGeneratedToken(null);
      if (activeToken) {
        setActiveToken('');
        setPortalData(null);
      }
      alert('Customer portal access revoked successfully.');
    } catch (err: any) {
      alert(err.message || 'Failed to revoke portal access');
    }
  };

  // Copy Portal Link
  const handleCopyLink = () => {
    const token = activeToken || generatedToken || '';
    const url = `${window.location.origin}${window.location.pathname}#customer_portal?portal_token=${token}`;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  // Open Payment Modal
  const handleOpenPayModal = (inv: PortalInvoice) => {
    setPayingInvoice(inv);
    setPayAmount(inv.balanceDue);
    setPaymentReference(`ONLINE-${Date.now().toString().slice(-4)}`);
    setCheckoutSession(null);
    setSessionStatusNotice(null);
    setPaymentSuccessReceipt(null);
  };

  // Initiate Hosted Processor Checkout
  const handleInitiateCheckout = async () => {
    if (!activeToken || !payingInvoice) return;
    if (payAmount <= 0 || payAmount > payingInvoice.balanceDue) {
      alert('Please enter a valid payment amount up to the balance due.');
      return;
    }

    setIsInitiatingSession(true);
    setSessionStatusNotice(null);
    try {
      const res = await fetch(`/api/v1/public/portal/${encodeURIComponent(activeToken)}/checkout-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoiceId: payingInvoice.id,
          amount: payAmount,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to initiate secure checkout');
      }
      setCheckoutSession(data.session);
    } catch (err: any) {
      alert(err.message || 'Unable to initiate checkout session');
    } finally {
      setIsInitiatingSession(false);
    }
  };

  // Poll / Check Payment Confirmation Status (Read-Only)
  const handleCheckPaymentStatus = async () => {
    if (!activeToken || !checkoutSession) return;
    setIsCheckingStatus(true);
    try {
      const res = await fetch(
        `/api/v1/public/portal/${encodeURIComponent(activeToken)}/payment-status/${encodeURIComponent(checkoutSession.providerReference)}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to check status');

      const st = data.paymentStatus;
      if (st.status === 'SUCCEEDED' && st.isConfirmed) {
        setPaymentSuccessReceipt({
          paymentNumber: st.paymentNumber || 'PMT-CONFIRMED',
          paidAmount: st.amount,
          remainingBalance: st.remainingBalance ?? 0,
        });
        fetchPortalContext(activeToken);
      } else if (st.status === 'PENDING') {
        setSessionStatusNotice('Payment session is active. Complete checkout on the payment gateway, then click refresh.');
      } else if (st.status === 'CANCELLED') {
        setSessionStatusNotice('Checkout session was cancelled.');
      } else if (st.status === 'EXPIRED') {
        setSessionStatusNotice('Checkout session has expired. Please initiate a new session.');
      } else {
        setSessionStatusNotice(`Payment status: ${st.status}`);
      }
    } catch (err: any) {
      setSessionStatusNotice(err.message || 'Failed to check payment status');
    } finally {
      setIsCheckingStatus(false);
    }
  };

  // Filtered Invoices
  const filteredInvoices = useMemo(() => {
    if (!portalData?.invoices) return [];
    return portalData.invoices.filter((inv) => {
      const matchesSearch =
        inv.invoiceNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        inv.status.toLowerCase().includes(searchQuery.toLowerCase());
      if (!matchesSearch) return false;

      if (statusFilter === 'UNPAID') {
        return inv.balanceDue > 0;
      }
      if (statusFilter === 'PAID') {
        return inv.balanceDue <= 0 || inv.status.toUpperCase() === 'PAID';
      }
      return true;
    });
  }, [portalData?.invoices, searchQuery, statusFilter]);

  const currencySymbol = portalData?.organization.currency === 'INR' ? '₹' : '$';

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-950 overflow-y-auto">
      {/* Top Admin / Control Strip */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 p-4 shadow-sm">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-slate-900 dark:text-white">Customer Self-Service Portal</h1>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                  <ShieldCheck className="w-3 h-3 mr-1" /> Secure Tokenized
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Provide clients with instant self-service access to review invoices, download statements, and submit payments.
              </p>
            </div>
          </div>

          {/* Admin Customer Switcher & Link Generator */}
          {customersList.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={selectedCustomerId}
                onChange={(e) => setSelectedCustomerId(e.target.value)}
                className="text-xs px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500"
              >
                {customersList.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>

              <select
                value={tokenExpiryDays}
                onChange={(e) => setTokenExpiryDays(Number(e.target.value))}
                className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              >
                <option value={7}>7 Days Expiry</option>
                <option value={30}>30 Days Expiry</option>
                <option value={90}>90 Days Expiry</option>
                <option value={365}>1 Year Expiry</option>
              </select>

              <button
                onClick={handleGenerateToken}
                disabled={isGenerating || !selectedCustomerId}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow transition-colors disabled:opacity-50"
              >
                {isGenerating ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                Generate / Switch
              </button>

              {activeToken && (
                <>
                  <button
                    onClick={handleCopyLink}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs text-slate-700 dark:text-slate-300 transition-colors"
                  >
                    {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedLink ? 'Copied!' : 'Copy Portal Link'}
                  </button>

                  <button
                    onClick={handleRevokeToken}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-red-300 dark:border-red-900/60 hover:bg-red-50 dark:hover:bg-red-950/40 text-xs text-red-600 dark:text-red-400 transition-colors"
                    title="Revoke access"
                  >
                    <Ban className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Main Portal Content Container */}
      <div className="flex-1 p-4 md:p-8 max-w-7xl mx-auto w-full">
        {/* Loading State */}
        {isLoading && (
          <div className="flex flex-col items-center justify-center py-20">
            <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin mb-4" />
            <p className="text-sm text-slate-600 dark:text-slate-400">Loading secure customer portal...</p>
          </div>
        )}

        {/* Error State */}
        {!isLoading && errorMessage && (
          <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-xl p-6 text-center max-w-lg mx-auto my-12">
            <AlertCircle className="w-10 h-10 text-red-500 mx-auto mb-3" />
            <h3 className="text-base font-semibold text-red-900 dark:text-red-300">Portal Link Unavailable</h3>
            <p className="text-sm text-red-700 dark:text-red-400 mt-1 mb-4">{errorMessage}</p>
            <p className="text-xs text-slate-500">
              Please check your link or request an updated portal invitation link from the business.
            </p>
          </div>
        )}

        {/* Empty Token State */}
        {!isLoading && !errorMessage && !portalData && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-12 text-center max-w-xl mx-auto my-12 shadow-sm">
            <Lock className="w-12 h-12 text-slate-400 mx-auto mb-4" />
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Customer Portal Workspace</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 mb-6">
              Select a customer above and click <strong>Generate / Switch</strong> to preview this customer’s live portal view, or enter a portal token.
            </p>
            <div className="flex items-center gap-2 max-w-md mx-auto">
              <input
                type="text"
                placeholder="Enter Portal Token (e.g. prt_...)"
                value={activeToken}
                onChange={(e) => setActiveToken(e.target.value)}
                className="flex-1 px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              />
              <button
                onClick={() => fetchPortalContext(activeToken)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold shadow"
              >
                Access
              </button>
            </div>
          </div>
        )}

        {/* Active Portal Presentation */}
        {!isLoading && portalData && (
          <div className="space-y-6 animate-fadeIn">
            {/* Customer Banner & Info */}
            <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl p-6 shadow-md border border-slate-800">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                  <div className="text-xs uppercase tracking-wider text-indigo-300 font-semibold mb-1">
                    {portalData.organization.name}
                  </div>
                  <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                    {portalData.customer.name}
                  </h2>
                  <div className="flex flex-wrap items-center gap-4 mt-2 text-xs text-slate-300">
                    {portalData.customer.email && (
                      <span className="flex items-center gap-1">
                        <Mail className="w-3.5 h-3.5 text-indigo-400" /> {portalData.customer.email}
                      </span>
                    )}
                    {portalData.customer.phone && (
                      <span className="flex items-center gap-1">
                        <Phone className="w-3.5 h-3.5 text-indigo-400" /> {portalData.customer.phone}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Building className="w-3.5 h-3.5 text-indigo-400" /> Org ID: {portalData.organization.id}
                    </span>
                  </div>
                </div>

                <div className="bg-white/10 backdrop-blur-md rounded-xl p-4 text-right border border-white/10 min-w-[200px]">
                  <div className="text-xs text-indigo-200">Total Outstanding Balance</div>
                  <div className="text-2xl font-black text-white mt-1">
                    {currencySymbol}
                    {portalData.summary.totalOutstanding.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                    })}
                  </div>
                  <div className="text-[11px] text-slate-300 mt-1">
                    {portalData.summary.openInvoicesCount} open invoice{portalData.summary.openInvoicesCount === 1 ? '' : 's'}
                    {portalData.summary.overdueCount > 0 && (
                      <span className="text-rose-400 font-bold ml-1.5">({portalData.summary.overdueCount} overdue)</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setActiveTab('invoices')}
                  className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all flex items-center gap-2 ${
                    activeTab === 'invoices'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <FileText className="w-4 h-4" />
                  Invoices ({portalData.invoices.length})
                </button>

                <button
                  onClick={() => setActiveTab('payments')}
                  className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all flex items-center gap-2 ${
                    activeTab === 'payments'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <CreditCard className="w-4 h-4" />
                  Recent Payments ({portalData.recentPayments.length})
                </button>

                <button
                  onClick={() => setActiveTab('statement')}
                  className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all flex items-center gap-2 ${
                    activeTab === 'statement'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <Calendar className="w-4 h-4" />
                  Account Statement
                </button>
              </div>

              <div className="text-xs text-slate-500 dark:text-slate-400 hidden sm:block">
                Currency: <strong className="text-slate-700 dark:text-slate-300">{portalData.organization.currency}</strong>
              </div>
            </div>

            {/* TAB 1: INVOICES */}
            {activeTab === 'invoices' && (
              <div className="space-y-4">
                {/* Filters */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
                  <div className="relative w-full sm:w-72">
                    <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search invoice number..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                    />
                  </div>

                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <button
                      onClick={() => setStatusFilter('ALL')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        statusFilter === 'ALL'
                          ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      All
                    </button>
                    <button
                      onClick={() => setStatusFilter('UNPAID')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        statusFilter === 'UNPAID'
                          ? 'bg-amber-600 text-white'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      Unpaid Due
                    </button>
                    <button
                      onClick={() => setStatusFilter('PAID')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        statusFilter === 'PAID'
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      Settled
                    </button>
                  </div>
                </div>

                {/* Invoices Table */}
                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 uppercase tracking-wider font-semibold">
                          <th className="p-3">Invoice #</th>
                          <th className="p-3">Date</th>
                          <th className="p-3">Due Date</th>
                          <th className="p-3 text-right">Total Amount</th>
                          <th className="p-3 text-right">Balance Due</th>
                          <th className="p-3 text-center">Status</th>
                          <th className="p-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {filteredInvoices.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="p-8 text-center text-slate-400">
                              No invoices found matching the current criteria.
                            </td>
                          </tr>
                        ) : (
                          filteredInvoices.map((inv) => {
                            const isPaid = inv.balanceDue <= 0;
                            const isOverdue = !isPaid && inv.dueDate && inv.dueDate < new Date().toISOString().split('T')[0];

                            return (
                              <tr key={inv.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                                <td className="p-3 font-semibold text-slate-900 dark:text-white">
                                  {inv.invoiceNumber}
                                </td>
                                <td className="p-3 text-slate-600 dark:text-slate-400">{inv.issueDate || '—'}</td>
                                <td className={`p-3 ${isOverdue ? 'text-rose-600 dark:text-rose-400 font-semibold' : 'text-slate-600 dark:text-slate-400'}`}>
                                  {inv.dueDate || '—'}
                                </td>
                                <td className="p-3 text-right font-medium text-slate-700 dark:text-slate-300">
                                  {currencySymbol}{inv.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </td>
                                <td className="p-3 text-right font-bold text-slate-900 dark:text-white">
                                  {currencySymbol}{inv.balanceDue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </td>
                                <td className="p-3 text-center">
                                  {isPaid ? (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                                      <CheckCircle2 className="w-3 h-3 mr-1" /> Paid
                                    </span>
                                  ) : isOverdue ? (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300">
                                      <Clock className="w-3 h-3 mr-1" /> Overdue
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                                      Due
                                    </span>
                                  )}
                                </td>
                                <td className="p-3 text-right">
                                  {!isPaid ? (
                                    <button
                                      onClick={() => handleOpenPayModal(inv)}
                                      title="Click to initiate secure payment via hosted processor checkout"
                                      className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg shadow-sm text-xs transition-colors"
                                    >
                                      <CreditCard className="w-3.5 h-3.5" /> Pay Now
                                    </button>
                                  ) : (
                                    <span className="text-slate-400 text-xs">Settled</span>
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
              </div>
            )}

            {/* TAB 2: RECENT PAYMENTS */}
            {activeTab === 'payments' && (
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
                <div className="p-4 border-b border-slate-200 dark:border-slate-800">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">Payment Receipts & History</h3>
                  <p className="text-xs text-slate-500">Record of confirmed settlements received for this account.</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 uppercase tracking-wider font-semibold">
                        <th className="p-3">Payment #</th>
                        <th className="p-3">Date</th>
                        <th className="p-3">Reference</th>
                        <th className="p-3 text-right">Amount Paid</th>
                        <th className="p-3 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {portalData.recentPayments.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="p-8 text-center text-slate-400">
                            No recorded payments found for this account.
                          </td>
                        </tr>
                      ) : (
                        portalData.recentPayments.map((pmt) => (
                          <tr key={pmt.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                            <td className="p-3 font-semibold text-slate-900 dark:text-white">{pmt.paymentNumber}</td>
                            <td className="p-3 text-slate-600 dark:text-slate-400">{pmt.paymentDate || '—'}</td>
                            <td className="p-3 text-slate-600 dark:text-slate-400">{pmt.reference || 'Online Portal'}</td>
                            <td className="p-3 text-right font-bold text-emerald-600 dark:text-emerald-400">
                              {currencySymbol}{pmt.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </td>
                            <td className="p-3 text-center">
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                                <CheckCircle2 className="w-3 h-3 mr-1" /> Confirmed
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

            {/* TAB 3: ACCOUNT STATEMENT */}
            {activeTab === 'statement' && (
              <div className="space-y-4">
                <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="flex items-center gap-3 w-full sm:w-auto">
                    <div>
                      <label className="block text-[11px] text-slate-500 font-medium mb-1">From Date</label>
                      <input
                        type="date"
                        value={statementFrom}
                        onChange={(e) => setStatementFrom(e.target.value)}
                        className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-500 font-medium mb-1">To Date</label>
                      <input
                        type="date"
                        value={statementTo}
                        onChange={(e) => setStatementTo(e.target.value)}
                        className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                      />
                    </div>
                    <button
                      onClick={fetchStatement}
                      disabled={isLoadingStatement}
                      className="mt-4 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold shadow transition-colors flex items-center gap-1"
                    >
                      {isLoadingStatement ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Filter className="w-3.5 h-3.5" />}
                      Filter
                    </button>
                  </div>

                  <button
                    onClick={() => window.print()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                  >
                    <Printer className="w-3.5 h-3.5" /> Print / Save PDF
                  </button>
                </div>

                {/* Statement Summary KPI */}
                {statementData && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
                      <div className="text-[11px] text-slate-500">Opening Balance</div>
                      <div className="text-base font-bold text-slate-900 dark:text-white mt-1">
                        {currencySymbol}{statementData.openingBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </div>
                    </div>
                    <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
                      <div className="text-[11px] text-slate-500">Total Invoiced</div>
                      <div className="text-base font-bold text-amber-600 dark:text-amber-400 mt-1">
                        +{currencySymbol}{statementData.totalDebits.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </div>
                    </div>
                    <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
                      <div className="text-[11px] text-slate-500">Total Payments</div>
                      <div className="text-base font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                        -{currencySymbol}{statementData.totalCredits.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </div>
                    </div>
                    <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
                      <div className="text-[11px] text-slate-500">Closing Balance</div>
                      <div className="text-base font-bold text-indigo-600 dark:text-indigo-400 mt-1">
                        {currencySymbol}{statementData.closingBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </div>
                    </div>
                  </div>
                )}

                {/* Statement Entries Ledger */}
                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 uppercase tracking-wider font-semibold">
                          <th className="p-3">Date</th>
                          <th className="p-3">Transaction</th>
                          <th className="p-3">Reference</th>
                          <th className="p-3 text-right">Invoiced (Debit)</th>
                          <th className="p-3 text-right">Paid (Credit)</th>
                          <th className="p-3 text-right">Balance</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {isLoadingStatement ? (
                          <tr>
                            <td colSpan={6} className="p-8 text-center text-slate-400">
                              <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2" />
                              Loading statement transactions...
                            </td>
                          </tr>
                        ) : !statementData?.entries || statementData.entries.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="p-8 text-center text-slate-400">
                              No statement activity within selected period.
                            </td>
                          </tr>
                        ) : (
                          statementData.entries.map((ent, idx) => (
                            <tr key={idx} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                              <td className="p-3 text-slate-600 dark:text-slate-400">{ent.date}</td>
                              <td className="p-3 font-semibold text-slate-900 dark:text-white">{ent.type}</td>
                              <td className="p-3 text-slate-600 dark:text-slate-400">{ent.reference || '—'}</td>
                              <td className="p-3 text-right font-medium text-slate-800 dark:text-slate-200">
                                {ent.debit > 0 ? `${currencySymbol}${ent.debit.toFixed(2)}` : '—'}
                              </td>
                              <td className="p-3 text-right font-medium text-emerald-600 dark:text-emerald-400">
                                {ent.credit > 0 ? `${currencySymbol}${ent.credit.toFixed(2)}` : '—'}
                              </td>
                              <td className="p-3 text-right font-bold text-slate-900 dark:text-white">
                                {currencySymbol}{ent.runningBalance.toFixed(2)}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Pay Invoice Modal */}
      {payingInvoice && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full shadow-2xl p-6 overflow-hidden">
            {!paymentSuccessReceipt ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-indigo-600/10 text-indigo-600 flex items-center justify-center">
                      <CreditCard className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white">Pay Invoice</h3>
                      <p className="text-xs text-slate-500">{payingInvoice.invoiceNumber}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setPayingInvoice(null)}
                    className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    &times;
                  </button>
                </div>

                <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl flex items-center justify-between">
                  <span className="text-xs text-slate-500">Balance Due:</span>
                  <span className="text-sm font-bold text-slate-900 dark:text-white">
                    {currencySymbol}{payingInvoice.balanceDue.toFixed(2)}
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Amount to Pay ({currencySymbol})
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={payingInvoice.balanceDue}
                    value={payAmount}
                    onChange={(e) => setPayAmount(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-bold"
                  />
                  <div className="flex justify-end gap-2 mt-1">
                    <button
                      type="button"
                      onClick={() => setPayAmount(payingInvoice.balanceDue)}
                      className="text-[11px] text-indigo-600 hover:underline"
                    >
                      Pay Full Amount
                    </button>
                    {payingInvoice.balanceDue > 50 && (
                      <button
                        type="button"
                        onClick={() => setPayAmount(Math.round((payingInvoice.balanceDue / 2) * 100) / 100)}
                        className="text-[11px] text-indigo-600 hover:underline"
                      >
                        Pay 50%
                      </button>
                    )}
                  </div>
                </div>

                {!checkoutSession ? (
                  <>
                    <div className="p-3.5 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200/80 dark:border-indigo-800/60 text-xs space-y-2">
                      <div className="flex items-center gap-2 font-semibold text-indigo-900 dark:text-indigo-300">
                        <ShieldCheck className="w-4 h-4 text-indigo-600 dark:text-indigo-400 flex-shrink-0" />
                        PCI-DSS Hosted Checkout
                      </div>
                      <p className="text-slate-600 dark:text-slate-400 text-[11px] leading-relaxed">
                        Payment will be processed securely on the certified payment gateway. FirmBooks never receives, handles, or stores raw cardholder data (PAN) or security codes (CVC).
                      </p>
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                      <button
                        type="button"
                        onClick={() => setPayingInvoice(null)}
                        className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleInitiateCheckout}
                        disabled={isInitiatingSession || payAmount <= 0}
                        className="px-4 py-2 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg shadow transition-colors flex items-center gap-1.5 disabled:opacity-50"
                      >
                        {isInitiatingSession ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Lock className="w-3.5 h-3.5" />
                        )}
                        Proceed to Secure Checkout
                      </button>
                    </div>
                  </>
                ) : (
                  /* Active Hosted Checkout Session Card */
                  <div className="space-y-4">
                    <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-xs space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Checkout Session Active
                        </span>
                        <span className="text-[10px] text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/60 px-2 py-0.5 rounded-full font-semibold">
                          Session Ref: {checkoutSession.providerReference.slice(0, 16)}...
                        </span>
                      </div>
                      <p className="text-slate-600 dark:text-slate-400 text-[11px]">
                        Please launch the processor checkout session to complete your payment of <strong>{currencySymbol}{payAmount.toFixed(2)}</strong>.
                      </p>
                      <div className="pt-2">
                        <a
                          href={checkoutSession.checkoutUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow transition-colors text-xs"
                        >
                          Launch Hosted Checkout <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    </div>

                    {sessionStatusNotice && (
                      <div className="p-2.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs text-center font-medium">
                        {sessionStatusNotice}
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-slate-800">
                      <button
                        type="button"
                        onClick={() => setPayingInvoice(null)}
                        className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
                      >
                        Close
                      </button>
                      <button
                        type="button"
                        onClick={handleCheckPaymentStatus}
                        disabled={isCheckingStatus}
                        className="px-4 py-2 text-xs font-semibold bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-white text-white dark:text-slate-900 rounded-lg shadow transition-colors flex items-center gap-1.5 disabled:opacity-50"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isCheckingStatus ? 'animate-spin' : ''}`} />
                        Check Payment Status
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* Payment Success Receipt */
              <div className="text-center py-4 space-y-4">
                <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-7 h-7" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">Payment Successful!</h3>
                  <p className="text-xs text-slate-500 mt-1">Your payment has been recorded and settled.</p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-xl text-left text-xs space-y-2">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Payment Ref:</span>
                    <span className="font-semibold text-slate-900 dark:text-white">{paymentSuccessReceipt.paymentNumber}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Amount Paid:</span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">
                      {currencySymbol}{paymentSuccessReceipt.paidAmount.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Remaining Balance:</span>
                    <span className="font-semibold text-slate-900 dark:text-white">
                      {currencySymbol}{paymentSuccessReceipt.remainingBalance.toFixed(2)}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setPayingInvoice(null)}
                  className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg shadow"
                >
                  Done
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
