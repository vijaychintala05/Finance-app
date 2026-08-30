import React, { useEffect, useState } from 'react';
import {
  Building2,
  Lock,
  Save,
  CheckCircle2,
  AlertCircle,
  FileText,
  CreditCard,
  MapPin,
  ShieldCheck,
  Globe,
  Mail,
  Phone,
  Hash,
  Landmark,
} from 'lucide-react';
import { useBooks } from '../../context/BooksContext';
import { apiClient } from '../../api/client';

interface OrgProfileData {
  id: string;
  name: string;
  industry: string;
  country: string;
  baseCurrency: string;
  currencySymbol: string;
  publicOrgId: string;
  orgCode: string;
  status: string;
  profile: {
    legalName: string;
    tradeName: string;
    taxId: string;
    gstin: string;
    pan: string;
    addressLine1: string;
    addressLine2: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
    phone: string;
    email: string;
    website: string;
    fiscalYearStart: string;
    defaultPaymentTerms: string;
    invoicePrefix: string;
    estimatePrefix: string;
    poPrefix: string;
    billPrefix: string;
    logoUrl: string;
    invoiceNotes: string;
    bankName: string;
    bankAccountNumber: string;
    bankIfscSwift: string;
    updatedAt?: string;
  };
}

export const OrganizationSettings: React.FC = () => {
  const { currentOrg, role, fetchInitialData } = useBooks();
  const isPrivileged = ['Owner', 'Admin'].includes(role);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: '',
    industry: '',
    legalName: '',
    tradeName: '',
    taxId: '',
    gstin: '',
    pan: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    state: '',
    postalCode: '',
    phone: '',
    email: '',
    website: '',
    fiscalYearStart: 'April',
    defaultPaymentTerms: 'Net 30',
    invoicePrefix: 'INV-',
    estimatePrefix: 'EST-',
    poPrefix: 'PO-',
    billPrefix: 'BILL-',
    logoUrl: '',
    invoiceNotes: '',
    bankName: '',
    bankAccountNumber: '',
    bankIfscSwift: '',
  });

  const [orgMeta, setOrgMeta] = useState<{
    publicOrgId: string;
    orgCode: string;
    baseCurrency: string;
    currencySymbol: string;
    country: string;
    status: string;
  }>({
    publicOrgId: currentOrg?.publicOrgId || '',
    orgCode: currentOrg?.orgCode || '',
    baseCurrency: currentOrg?.baseCurrency || 'INR',
    currencySymbol: currentOrg?.currencySymbol || '₹',
    country: currentOrg?.country || 'India',
    status: currentOrg?.status || 'Active',
  });

  useEffect(() => {
    let mounted = true;
    const loadOrg = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await apiClient.get<OrgProfileData>('/organizations/current');
        if (!mounted) return;
        if (res.error || !res.data) {
          setError(res.error || 'Failed to load organization settings');
          return;
        }
        const data = res.data;
        setOrgMeta({
          publicOrgId: data.publicOrgId,
          orgCode: data.orgCode,
          baseCurrency: data.baseCurrency,
          currencySymbol: data.currencySymbol,
          country: data.country,
          status: data.status,
        });

        const p = data.profile || ({} as Partial<OrgProfileData['profile']>);
        setForm({
          name: data.name || '',
          industry: data.industry || 'General',
          legalName: p.legalName || data.name || '',
          tradeName: p.tradeName || data.name || '',
          taxId: p.taxId || '',
          gstin: p.gstin || '',
          pan: p.pan || '',
          addressLine1: p.addressLine1 || '',
          addressLine2: p.addressLine2 || '',
          city: p.city || '',
          state: p.state || '',
          postalCode: p.postalCode || '',
          phone: p.phone || '',
          email: p.email || '',
          website: p.website || '',
          fiscalYearStart: p.fiscalYearStart || 'April',
          defaultPaymentTerms: p.defaultPaymentTerms || 'Net 30',
          invoicePrefix: p.invoicePrefix || 'INV-',
          estimatePrefix: p.estimatePrefix || 'EST-',
          poPrefix: p.poPrefix || 'PO-',
          billPrefix: p.billPrefix || 'BILL-',
          logoUrl: p.logoUrl || '',
          invoiceNotes: p.invoiceNotes || '',
          bankName: p.bankName || '',
          bankAccountNumber: p.bankAccountNumber || '',
          bankIfscSwift: p.bankIfscSwift || '',
        });
      } catch (err: any) {
        if (!mounted) return;
        setError(err.message || 'Failed to load organization settings');
      } finally {
        if (mounted) setLoading(false);
      }
    };
    loadOrg();
    return () => {
      mounted = false;
    };
  }, [currentOrg.id]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isPrivileged) return;

    setSaving(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const res = await apiClient.patch('/organizations/current', form);
      if (res.error) {
        setError(res.error);
        return;
      }
      setSuccessMsg('Organization profile and settings saved successfully.');
      if (fetchInitialData) {
        await fetchInitialData();
      }
      setTimeout(() => setSuccessMsg(null), 5000);
    } catch (err: any) {
      setError(err.message || 'Failed to save organization settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="flex items-center space-x-2 text-xs text-slate-500">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
          <span>Loading organization settings…</span>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="space-y-6 text-xs text-slate-700">
      {/* Top Header Card */}
      <div className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs md:flex-row md:items-center">
        <div className="flex items-start gap-3.5">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 shadow-inner">
            <Building2 className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-slate-900">{form.name || 'Organization Profile'}</h3>
              <span
                className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${
                  orgMeta.status === 'Active' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                }`}
              >
                {orgMeta.status}
              </span>
            </div>
            <p className="mt-1 text-slate-500">
              Public Org Code: <span className="font-mono font-semibold text-slate-800">{orgMeta.orgCode}</span> • ID:{' '}
              <span className="font-mono text-slate-500">{orgMeta.publicOrgId}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-3.5 py-2 text-right">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Ledger Currency</span>
            <div className="flex items-center gap-1 font-bold text-slate-800">
              <Lock className="h-3 w-3 text-slate-400" />
              <span>{orgMeta.baseCurrency} ({orgMeta.currencySymbol})</span>
            </div>
          </div>

          {isPrivileged && (
            <button
              type="submit"
              disabled={saving}
              className="flex items-center space-x-2 rounded-xl bg-indigo-600 px-5 py-2.5 font-bold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              <span>{saving ? 'Saving…' : 'Save Changes'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Status Notifications */}
      {error && (
        <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">
          <AlertCircle className="h-5 w-5 shrink-0 text-red-600" />
          <p className="font-medium">{error}</p>
        </div>
      )}

      {successMsg && (
        <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
          <p className="font-medium">{successMsg}</p>
        </div>
      )}

      {!isPrivileged && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-800">
          <Lock className="h-5 w-5 shrink-0 text-amber-600" />
          <p className="font-medium">
            You are viewing organization settings in read-only mode. Only Organization Owners and Administrators can modify firm configuration.
          </p>
        </div>
      )}

      {/* Grid of Configuration Cards */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Section 1: Business Identity */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Building2 className="h-4 w-4 text-indigo-600" />
            <h4 className="text-sm font-bold text-slate-900">General Business Identity</h4>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Organization Display Name *</label>
              <input
                required
                disabled={!isPrivileged}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Sense Studios Private Limited"
                className="w-full rounded-lg border border-slate-200 p-2.5 font-medium text-slate-800 focus:border-indigo-500 focus:outline-none disabled:bg-slate-50"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Legal Entity Name</label>
                <input
                  disabled={!isPrivileged}
                  value={form.legalName}
                  onChange={(e) => setForm({ ...form, legalName: e.target.value })}
                  placeholder="Official legal name"
                  className="w-full rounded-lg border border-slate-200 p-2.5 font-medium text-slate-800 focus:border-indigo-500 focus:outline-none disabled:bg-slate-50"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Trade / Brand Name</label>
                <input
                  disabled={!isPrivileged}
                  value={form.tradeName}
                  onChange={(e) => setForm({ ...form, tradeName: e.target.value })}
                  placeholder="Trade name (DBA)"
                  className="w-full rounded-lg border border-slate-200 p-2.5 font-medium text-slate-800 focus:border-indigo-500 focus:outline-none disabled:bg-slate-50"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Industry</label>
                <input
                  disabled={!isPrivileged}
                  value={form.industry}
                  onChange={(e) => setForm({ ...form, industry: e.target.value })}
                  placeholder="e.g. Technology"
                  className="w-full rounded-lg border border-slate-200 p-2.5 font-medium text-slate-800 focus:border-indigo-500 focus:outline-none disabled:bg-slate-50"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Corporate Email</label>
                <div className="relative">
                  <Mail className="h-3.5 w-3.5 absolute left-3 top-3.5 text-slate-400" />
                  <input
                    type="email"
                    disabled={!isPrivileged}
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="finance@firm.com"
                    className="w-full rounded-lg border border-slate-200 pl-8 pr-2.5 py-2.5 font-medium text-slate-800 focus:border-indigo-500 focus:outline-none disabled:bg-slate-50"
                  />
                </div>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Corporate Phone</label>
                <div className="relative">
                  <Phone className="h-3.5 w-3.5 absolute left-3 top-3.5 text-slate-400" />
                  <input
                    disabled={!isPrivileged}
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    placeholder="+91 98765 43210"
                    className="w-full rounded-lg border border-slate-200 pl-8 pr-2.5 py-2.5 font-medium text-slate-800 focus:border-indigo-500 focus:outline-none disabled:bg-slate-50"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Website URL</label>
              <div className="relative">
                <Globe className="h-3.5 w-3.5 absolute left-3 top-3.5 text-slate-400" />
                <input
                  type="url"
                  disabled={!isPrivileged}
                  value={form.website}
                  onChange={(e) => setForm({ ...form, website: e.target.value })}
                  placeholder="https://yourfirm.com"
                  className="w-full rounded-lg border border-slate-200 pl-8 pr-2.5 py-2.5 font-medium text-slate-800 focus:border-indigo-500 focus:outline-none disabled:bg-slate-50"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Section 2: Legal & Tax Identifiers */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <ShieldCheck className="h-4 w-4 text-indigo-600" />
            <h4 className="text-sm font-bold text-slate-900">Legal Tax & Regulatory Credentials</h4>
          </div>

          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">GSTIN / VAT Number</label>
                <input
                  disabled={!isPrivileged}
                  value={form.gstin}
                  onChange={(e) => setForm({ ...form, gstin: e.target.value.toUpperCase() })}
                  placeholder="e.g. 36AABCU9603R1ZM"
                  className="w-full rounded-lg border border-slate-200 p-2.5 font-mono uppercase text-slate-800 focus:border-indigo-500 focus:outline-none disabled:bg-slate-50"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">PAN / Entity Tax ID</label>
                <input
                  disabled={!isPrivileged}
                  value={form.pan}
                  onChange={(e) => setForm({ ...form, pan: e.target.value.toUpperCase() })}
                  placeholder="e.g. AABCU9603R"
                  className="w-full rounded-lg border border-slate-200 p-2.5 font-mono uppercase text-slate-800 focus:border-indigo-500 focus:outline-none disabled:bg-slate-50"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Tax ID / CIN Number</label>
                <input
                  disabled={!isPrivileged}
                  value={form.taxId}
                  onChange={(e) => setForm({ ...form, taxId: e.target.value })}
                  placeholder="e.g. U72200TG2020PTC123456"
                  className="w-full rounded-lg border border-slate-200 p-2.5 font-mono text-slate-800 focus:border-indigo-500 focus:outline-none disabled:bg-slate-50"
                />
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Registered Address Line 1</label>
              <div className="relative">
                <MapPin className="h-3.5 w-3.5 absolute left-3 top-3.5 text-slate-400" />
                <input
                  disabled={!isPrivileged}
                  value={form.addressLine1}
                  onChange={(e) => setForm({ ...form, addressLine1: e.target.value })}
                  placeholder="Street address, building, floor"
                  className="w-full rounded-lg border border-slate-200 pl-8 pr-2.5 py-2.5 font-medium text-slate-800 focus:border-indigo-500 focus:outline-none disabled:bg-slate-50"
                />
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Address Line 2 (Optional)</label>
              <input
                disabled={!isPrivileged}
                value={form.addressLine2}
                onChange={(e) => setForm({ ...form, addressLine2: e.target.value })}
                placeholder="Suite, landmark, locality"
                className="w-full rounded-lg border border-slate-200 p-2.5 font-medium text-slate-800 focus:border-indigo-500 focus:outline-none disabled:bg-slate-50"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">City</label>
                <input
                  disabled={!isPrivileged}
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                  placeholder="Hyderabad"
                  className="w-full rounded-lg border border-slate-200 p-2.5 font-medium text-slate-800 focus:border-indigo-500 focus:outline-none disabled:bg-slate-50"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">State / Province</label>
                <input
                  disabled={!isPrivileged}
                  value={form.state}
                  onChange={(e) => setForm({ ...form, state: e.target.value })}
                  placeholder="Telangana"
                  className="w-full rounded-lg border border-slate-200 p-2.5 font-medium text-slate-800 focus:border-indigo-500 focus:outline-none disabled:bg-slate-50"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Postal / ZIP Code</label>
                <input
                  disabled={!isPrivileged}
                  value={form.postalCode}
                  onChange={(e) => setForm({ ...form, postalCode: e.target.value })}
                  placeholder="500081"
                  className="w-full rounded-lg border border-slate-200 p-2.5 font-medium text-slate-800 focus:border-indigo-500 focus:outline-none disabled:bg-slate-50"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Section 3: Invoicing & Fiscal Defaults */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <FileText className="h-4 w-4 text-indigo-600" />
            <h4 className="text-sm font-bold text-slate-900">Invoicing & Fiscal Defaults</h4>
          </div>

          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Fiscal Year Start Month</label>
                <select
                  disabled={!isPrivileged}
                  value={form.fiscalYearStart}
                  onChange={(e) => setForm({ ...form, fiscalYearStart: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 p-2.5 font-medium text-slate-800 focus:border-indigo-500 focus:outline-none disabled:bg-slate-50"
                >
                  {['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map(
                    (m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    )
                  )}
                </select>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Default Payment Terms</label>
                <select
                  disabled={!isPrivileged}
                  value={form.defaultPaymentTerms}
                  onChange={(e) => setForm({ ...form, defaultPaymentTerms: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 p-2.5 font-medium text-slate-800 focus:border-indigo-500 focus:outline-none disabled:bg-slate-50"
                >
                  {['Due on Receipt', 'Net 15', 'Net 30', 'Net 45', 'Net 60', 'Net 90'].map((term) => (
                    <option key={term} value={term}>
                      {term}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Invoice Prefix</label>
                <div className="relative">
                  <Hash className="h-3.5 w-3.5 absolute left-2.5 top-3.5 text-slate-400" />
                  <input
                    disabled={!isPrivileged}
                    value={form.invoicePrefix}
                    onChange={(e) => setForm({ ...form, invoicePrefix: e.target.value })}
                    placeholder="INV-"
                    className="w-full rounded-lg border border-slate-200 pl-7 pr-2 py-2.5 font-mono text-slate-800 focus:border-indigo-500 focus:outline-none disabled:bg-slate-50"
                  />
                </div>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Quote Prefix</label>
                <div className="relative">
                  <Hash className="h-3.5 w-3.5 absolute left-2.5 top-3.5 text-slate-400" />
                  <input
                    disabled={!isPrivileged}
                    value={form.estimatePrefix}
                    onChange={(e) => setForm({ ...form, estimatePrefix: e.target.value })}
                    placeholder="EST-"
                    className="w-full rounded-lg border border-slate-200 pl-7 pr-2 py-2.5 font-mono text-slate-800 focus:border-indigo-500 focus:outline-none disabled:bg-slate-50"
                  />
                </div>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">PO Prefix</label>
                <div className="relative">
                  <Hash className="h-3.5 w-3.5 absolute left-2.5 top-3.5 text-slate-400" />
                  <input
                    disabled={!isPrivileged}
                    value={form.poPrefix}
                    onChange={(e) => setForm({ ...form, poPrefix: e.target.value })}
                    placeholder="PO-"
                    className="w-full rounded-lg border border-slate-200 pl-7 pr-2 py-2.5 font-mono text-slate-800 focus:border-indigo-500 focus:outline-none disabled:bg-slate-50"
                  />
                </div>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Bill Prefix</label>
                <div className="relative">
                  <Hash className="h-3.5 w-3.5 absolute left-2.5 top-3.5 text-slate-400" />
                  <input
                    disabled={!isPrivileged}
                    value={form.billPrefix}
                    onChange={(e) => setForm({ ...form, billPrefix: e.target.value })}
                    placeholder="BILL-"
                    className="w-full rounded-lg border border-slate-200 pl-7 pr-2 py-2.5 font-mono text-slate-800 focus:border-indigo-500 focus:outline-none disabled:bg-slate-50"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Default Terms & Payment Notes on Invoices</label>
              <textarea
                rows={2}
                disabled={!isPrivileged}
                value={form.invoiceNotes}
                onChange={(e) => setForm({ ...form, invoiceNotes: e.target.value })}
                placeholder="e.g. Payment is due within 30 days. Please quote the invoice number on your wire transfer."
                className="w-full rounded-lg border border-slate-200 p-2.5 font-medium text-slate-800 focus:border-indigo-500 focus:outline-none disabled:bg-slate-50"
              />
            </div>
          </div>
        </div>

        {/* Section 4: Bank Settlement Details */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Landmark className="h-4 w-4 text-indigo-600" />
            <h4 className="text-sm font-bold text-slate-900">Bank Settlement & Wire Instructions</h4>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Beneficiary Bank Name</label>
              <div className="relative">
                <Landmark className="h-3.5 w-3.5 absolute left-3 top-3.5 text-slate-400" />
                <input
                  disabled={!isPrivileged}
                  value={form.bankName}
                  onChange={(e) => setForm({ ...form, bankName: e.target.value })}
                  placeholder="e.g. HDFC Bank / Chase Manhattan"
                  className="w-full rounded-lg border border-slate-200 pl-8 pr-2.5 py-2.5 font-medium text-slate-800 focus:border-indigo-500 focus:outline-none disabled:bg-slate-50"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Account / IBAN Number</label>
                <div className="relative">
                  <CreditCard className="h-3.5 w-3.5 absolute left-3 top-3.5 text-slate-400" />
                  <input
                    disabled={!isPrivileged}
                    value={form.bankAccountNumber}
                    onChange={(e) => setForm({ ...form, bankAccountNumber: e.target.value })}
                    placeholder="e.g. 50200012345678"
                    className="w-full rounded-lg border border-slate-200 pl-8 pr-2.5 py-2.5 font-mono text-slate-800 focus:border-indigo-500 focus:outline-none disabled:bg-slate-50"
                  />
                </div>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">IFSC / SWIFT / Routing Code</label>
                <input
                  disabled={!isPrivileged}
                  value={form.bankIfscSwift}
                  onChange={(e) => setForm({ ...form, bankIfscSwift: e.target.value.toUpperCase() })}
                  placeholder="e.g. HDFC0001234 / CHASUS33"
                  className="w-full rounded-lg border border-slate-200 p-2.5 font-mono uppercase text-slate-800 focus:border-indigo-500 focus:outline-none disabled:bg-slate-50"
                />
              </div>
            </div>

            <p className="text-[11px] text-slate-500 leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-100">
              💡 These settlement instructions will automatically print on outgoing invoices and delivery challans for customer wire transfers.
            </p>
          </div>
        </div>
      </div>
    </form>
  );
};
