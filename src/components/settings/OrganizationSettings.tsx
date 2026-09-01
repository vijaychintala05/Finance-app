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

export type OrganizationSection = 'profile' | 'tax' | 'invoicing' | 'bank';

type OrganizationForm = {
  name: string; industry: string; legalName: string; tradeName: string; taxId: string; gstin: string; pan: string;
  addressLine1: string; addressLine2: string; city: string; state: string; postalCode: string; phone: string;
  email: string; website: string; fiscalYearStart: string; defaultPaymentTerms: string; invoicePrefix: string;
  estimatePrefix: string; poPrefix: string; billPrefix: string; logoUrl: string; invoiceNotes: string;
  bankName: string; bankAccountNumber: string; bankIfscSwift: string;
};

const organizationDrafts = new Map<string, OrganizationForm>();

export const OrganizationSettings: React.FC<{
  section?: OrganizationSection;
  onDirtyChange?: (dirty: boolean) => void;
}> = ({ section = 'profile', onDirtyChange }) => {
  const { currentOrg, refreshOrganizations } = useBooks();
  const [role, setRole] = useState<string | null>(null);
  const isPrivileged = ['Owner', 'Admin'].includes(role);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [baseline, setBaseline] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [form, setForm] = useState<OrganizationForm>({
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
      setLoaded(false);
      setRole(null);
      setError(null);
      try {
        const [res, identity] = await Promise.all([
          apiClient.get<OrgProfileData>('/organizations/current'),
          apiClient.get<{ organizations: { id: string; role: string }[] }>('/auth/me'),
        ]);
        if (!mounted) return;
        setRole(identity.data?.organizations.find(org => org.id === currentOrg.id)?.role || null);
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
        const loadedForm = {
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
        };
        setForm(organizationDrafts.get(currentOrg.id) || loadedForm);
        setBaseline(JSON.stringify(loadedForm));
        setLoaded(true);
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

  useEffect(() => {
    if (loaded) organizationDrafts.set(currentOrg.id, form);
  }, [currentOrg.id, form, loaded]);

  const dirty = loaded && JSON.stringify(form) !== baseline;
  useEffect(() => {
    onDirtyChange?.(dirty || saving);
    return () => onDirtyChange?.(false);
  }, [dirty, saving, onDirtyChange]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isPrivileged || !loaded || saving) return;

    setSaving(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const res = await apiClient.patch('/organizations/current', form);
      if (res.error) {
        setError(res.error);
        return;
      }
      setBaseline(JSON.stringify(form));
      setSuccessMsg('Changes saved.');
      try {
        await refreshOrganizations();
      } catch {
        setError('Changes were saved, but the organization header could not refresh. Reload the page to see the latest details.');
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
    <form onSubmit={handleSave} className="organization-form space-y-6 text-xs text-slate-700">
      <div className="organization-meta">
        <div className="min-w-0">
          <div className="font-semibold text-slate-900 dark:text-slate-100 break-words">{form.name || currentOrg.name}</div>
          <div className="mt-1 text-slate-500 break-all">{orgMeta.orgCode || orgMeta.publicOrgId}</div>
        </div>
        <div className="flex items-center gap-2 text-slate-500">
          <Lock className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{orgMeta.baseCurrency} · {orgMeta.country}</span>
        </div>
      </div>

      {/* Status Notifications */}
      {error && (
        <div role="alert" className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
          <AlertCircle className="h-5 w-5 shrink-0 text-red-600" />
          <p className="font-medium">{error}</p>
        </div>
      )}

      {successMsg && (
        <div role="status" className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-emerald-800">
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

      <fieldset disabled={!isPrivileged || saving || !loaded} className="organization-fields">
        {/* Section 1: Business Identity */}
        <div hidden={section !== 'profile'} className="space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Building2 className="h-4 w-4 text-indigo-600" />
            <h4 className="text-sm font-bold text-slate-900">General Business Identity</h4>
          </div>

          <div className="space-y-3">
            <div>
              <label htmlFor="org-name" className="block font-semibold text-slate-700 mb-1">Organization Display Name *</label>
              <input id="org-name"
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
                <label htmlFor="org-legalName" className="block font-semibold text-slate-700 mb-1">Legal Entity Name</label>
                <input id="org-legalName"
                  disabled={!isPrivileged}
                  value={form.legalName}
                  onChange={(e) => setForm({ ...form, legalName: e.target.value })}
                  placeholder="Official legal name"
                  className="w-full rounded-lg border border-slate-200 p-2.5 font-medium text-slate-800 focus:border-indigo-500 focus:outline-none disabled:bg-slate-50"
                />
              </div>
              <div>
                <label htmlFor="org-tradeName" className="block font-semibold text-slate-700 mb-1">Trade / Brand Name</label>
                <input id="org-tradeName"
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
                <label htmlFor="org-industry" className="block font-semibold text-slate-700 mb-1">Industry</label>
                <input id="org-industry"
                  disabled={!isPrivileged}
                  value={form.industry}
                  onChange={(e) => setForm({ ...form, industry: e.target.value })}
                  placeholder="e.g. Technology"
                  className="w-full rounded-lg border border-slate-200 p-2.5 font-medium text-slate-800 focus:border-indigo-500 focus:outline-none disabled:bg-slate-50"
                />
              </div>
              <div>
                <label htmlFor="org-email" className="block font-semibold text-slate-700 mb-1">Corporate Email</label>
                <div className="relative">
                  <Mail className="h-3.5 w-3.5 absolute left-3 top-3.5 text-slate-400" />
                  <input id="org-email"
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
                <label htmlFor="org-phone" className="block font-semibold text-slate-700 mb-1">Corporate Phone</label>
                <div className="relative">
                  <Phone className="h-3.5 w-3.5 absolute left-3 top-3.5 text-slate-400" />
                  <input id="org-phone"
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
              <label htmlFor="org-website" className="block font-semibold text-slate-700 mb-1">Website URL</label>
              <div className="relative">
                <Globe className="h-3.5 w-3.5 absolute left-3 top-3.5 text-slate-400" />
                <input id="org-website"
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
        <div hidden={section !== 'tax'} className="space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <ShieldCheck className="h-4 w-4 text-indigo-600" />
            <h4 className="text-sm font-bold text-slate-900">Legal Tax & Regulatory Credentials</h4>
          </div>

          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label htmlFor="org-gstin" className="block font-semibold text-slate-700 mb-1">GSTIN / VAT Number</label>
                <input id="org-gstin"
                  disabled={!isPrivileged}
                  value={form.gstin}
                  onChange={(e) => setForm({ ...form, gstin: e.target.value.toUpperCase() })}
                  placeholder="e.g. 36AABCU9603R1ZM"
                  className="w-full rounded-lg border border-slate-200 p-2.5 font-mono uppercase text-slate-800 focus:border-indigo-500 focus:outline-none disabled:bg-slate-50"
                />
              </div>
              <div>
                <label htmlFor="org-pan" className="block font-semibold text-slate-700 mb-1">PAN / Entity Tax ID</label>
                <input id="org-pan"
                  disabled={!isPrivileged}
                  value={form.pan}
                  onChange={(e) => setForm({ ...form, pan: e.target.value.toUpperCase() })}
                  placeholder="e.g. AABCU9603R"
                  className="w-full rounded-lg border border-slate-200 p-2.5 font-mono uppercase text-slate-800 focus:border-indigo-500 focus:outline-none disabled:bg-slate-50"
                />
              </div>
              <div>
                <label htmlFor="org-taxId" className="block font-semibold text-slate-700 mb-1">Tax ID / CIN Number</label>
                <input id="org-taxId"
                  disabled={!isPrivileged}
                  value={form.taxId}
                  onChange={(e) => setForm({ ...form, taxId: e.target.value })}
                  placeholder="e.g. U72200TG2020PTC123456"
                  className="w-full rounded-lg border border-slate-200 p-2.5 font-mono text-slate-800 focus:border-indigo-500 focus:outline-none disabled:bg-slate-50"
                />
              </div>
            </div>

            <div>
              <label htmlFor="org-addressLine1" className="block font-semibold text-slate-700 mb-1">Registered Address Line 1</label>
              <div className="relative">
                <MapPin className="h-3.5 w-3.5 absolute left-3 top-3.5 text-slate-400" />
                <input id="org-addressLine1"
                  disabled={!isPrivileged}
                  value={form.addressLine1}
                  onChange={(e) => setForm({ ...form, addressLine1: e.target.value })}
                  placeholder="Street address, building, floor"
                  className="w-full rounded-lg border border-slate-200 pl-8 pr-2.5 py-2.5 font-medium text-slate-800 focus:border-indigo-500 focus:outline-none disabled:bg-slate-50"
                />
              </div>
            </div>

            <div>
              <label htmlFor="org-addressLine2" className="block font-semibold text-slate-700 mb-1">Address Line 2 (Optional)</label>
              <input id="org-addressLine2"
                disabled={!isPrivileged}
                value={form.addressLine2}
                onChange={(e) => setForm({ ...form, addressLine2: e.target.value })}
                placeholder="Suite, landmark, locality"
                className="w-full rounded-lg border border-slate-200 p-2.5 font-medium text-slate-800 focus:border-indigo-500 focus:outline-none disabled:bg-slate-50"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label htmlFor="org-city" className="block font-semibold text-slate-700 mb-1">City</label>
                <input id="org-city"
                  disabled={!isPrivileged}
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                  placeholder="Hyderabad"
                  className="w-full rounded-lg border border-slate-200 p-2.5 font-medium text-slate-800 focus:border-indigo-500 focus:outline-none disabled:bg-slate-50"
                />
              </div>
              <div>
                <label htmlFor="org-state" className="block font-semibold text-slate-700 mb-1">State / Province</label>
                <input id="org-state"
                  disabled={!isPrivileged}
                  value={form.state}
                  onChange={(e) => setForm({ ...form, state: e.target.value })}
                  placeholder="Telangana"
                  className="w-full rounded-lg border border-slate-200 p-2.5 font-medium text-slate-800 focus:border-indigo-500 focus:outline-none disabled:bg-slate-50"
                />
              </div>
              <div>
                <label htmlFor="org-postalCode" className="block font-semibold text-slate-700 mb-1">Postal / ZIP Code</label>
                <input id="org-postalCode"
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
        <div hidden={section !== 'invoicing'} className="space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <FileText className="h-4 w-4 text-indigo-600" />
            <h4 className="text-sm font-bold text-slate-900">Invoicing & Fiscal Defaults</h4>
          </div>

          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="org-fiscalYearStart" className="block font-semibold text-slate-700 mb-1">Fiscal Year Start Month</label>
                <select id="org-fiscalYearStart"
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
                <label htmlFor="org-defaultPaymentTerms" className="block font-semibold text-slate-700 mb-1">Default Payment Terms</label>
                <select id="org-defaultPaymentTerms"
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
                <label htmlFor="org-invoicePrefix" className="block font-semibold text-slate-700 mb-1">Invoice Prefix</label>
                <div className="relative">
                  <Hash className="h-3.5 w-3.5 absolute left-2.5 top-3.5 text-slate-400" />
                  <input id="org-invoicePrefix"
                    disabled={!isPrivileged}
                    value={form.invoicePrefix}
                    onChange={(e) => setForm({ ...form, invoicePrefix: e.target.value })}
                    placeholder="INV-"
                    className="w-full rounded-lg border border-slate-200 pl-7 pr-2 py-2.5 font-mono text-slate-800 focus:border-indigo-500 focus:outline-none disabled:bg-slate-50"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="org-estimatePrefix" className="block font-semibold text-slate-700 mb-1">Quote Prefix</label>
                <div className="relative">
                  <Hash className="h-3.5 w-3.5 absolute left-2.5 top-3.5 text-slate-400" />
                  <input id="org-estimatePrefix"
                    disabled={!isPrivileged}
                    value={form.estimatePrefix}
                    onChange={(e) => setForm({ ...form, estimatePrefix: e.target.value })}
                    placeholder="EST-"
                    className="w-full rounded-lg border border-slate-200 pl-7 pr-2 py-2.5 font-mono text-slate-800 focus:border-indigo-500 focus:outline-none disabled:bg-slate-50"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="org-poPrefix" className="block font-semibold text-slate-700 mb-1">PO Prefix</label>
                <div className="relative">
                  <Hash className="h-3.5 w-3.5 absolute left-2.5 top-3.5 text-slate-400" />
                  <input id="org-poPrefix"
                    disabled={!isPrivileged}
                    value={form.poPrefix}
                    onChange={(e) => setForm({ ...form, poPrefix: e.target.value })}
                    placeholder="PO-"
                    className="w-full rounded-lg border border-slate-200 pl-7 pr-2 py-2.5 font-mono text-slate-800 focus:border-indigo-500 focus:outline-none disabled:bg-slate-50"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="org-billPrefix" className="block font-semibold text-slate-700 mb-1">Bill Prefix</label>
                <div className="relative">
                  <Hash className="h-3.5 w-3.5 absolute left-2.5 top-3.5 text-slate-400" />
                  <input id="org-billPrefix"
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
              <label htmlFor="org-invoiceNotes" className="block font-semibold text-slate-700 mb-1">Default Terms & Payment Notes on Invoices</label>
              <textarea id="org-invoiceNotes"
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
        <div hidden={section !== 'bank'} className="space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Landmark className="h-4 w-4 text-indigo-600" />
            <h4 className="text-sm font-bold text-slate-900">Bank Settlement & Wire Instructions</h4>
          </div>

          <div className="space-y-3">
            <div>
              <label htmlFor="org-bankName" className="block font-semibold text-slate-700 mb-1">Beneficiary Bank Name</label>
              <div className="relative">
                <Landmark className="h-3.5 w-3.5 absolute left-3 top-3.5 text-slate-400" />
                <input id="org-bankName"
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
                <label htmlFor="org-bankAccountNumber" className="block font-semibold text-slate-700 mb-1">Account / IBAN Number</label>
                <div className="relative">
                  <CreditCard className="h-3.5 w-3.5 absolute left-3 top-3.5 text-slate-400" />
                  <input id="org-bankAccountNumber"
                    disabled={!isPrivileged}
                    value={form.bankAccountNumber}
                    onChange={(e) => setForm({ ...form, bankAccountNumber: e.target.value })}
                    placeholder="e.g. 50200012345678"
                    className="w-full rounded-lg border border-slate-200 pl-8 pr-2.5 py-2.5 font-mono text-slate-800 focus:border-indigo-500 focus:outline-none disabled:bg-slate-50"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="org-bankIfscSwift" className="block font-semibold text-slate-700 mb-1">IFSC / SWIFT / Routing Code</label>
                <input id="org-bankIfscSwift"
                  disabled={!isPrivileged}
                  value={form.bankIfscSwift}
                  onChange={(e) => setForm({ ...form, bankIfscSwift: e.target.value.toUpperCase() })}
                  placeholder="e.g. HDFC0001234 / CHASUS33"
                  className="w-full rounded-lg border border-slate-200 p-2.5 font-mono uppercase text-slate-800 focus:border-indigo-500 focus:outline-none disabled:bg-slate-50"
                />
              </div>
            </div>

            <p className="text-[11px] text-slate-500 leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-100">
              Bank settlement details for customer payments.
            </p>
          </div>
        </div>
      </fieldset>
      {isPrivileged && loaded && <div className="organization-save">
        <span className="mr-auto text-slate-500" role="status">{dirty ? 'Unsaved changes' : ''}</span>
        <button type="button" disabled={!dirty || saving} onClick={() => { setForm(JSON.parse(baseline)); setError(null); setSuccessMsg(null); }}
          className="rounded-md border border-slate-300 px-4 py-2 font-medium disabled:opacity-50">Reset</button>
        <button type="submit" disabled={!dirty || saving}
          className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
          <Save className="h-4 w-4" />{saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>}
    </form>
  );
};
