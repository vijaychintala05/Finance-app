import React, { useEffect, useState } from 'react';
import {
  Archive, Building2, ChevronRight, Plus, RotateCcw, Search, X,
} from 'lucide-react';
import { useBooks } from '../../context/BooksContext';
import { Vendor, VendorAddress, VendorContact } from '../../types';
import { formatCurrency } from '../../utils/formatters';
import { VendorWorkspace } from './VendorWorkspace';
import { apiClient } from '../../api/client';

interface VendorsViewProps {
  autoOpenCreateModal?: boolean;
  onModalClosed?: () => void;
  selectedEntityId?: string;
  onSelectedEntityClosed?: () => void;
}

type VendorStatusFilter = 'all' | 'active' | 'inactive';
type VendorCustomField = { key: string; value: string };
type AddressFields = Required<Pick<VendorAddress, 'attention' | 'street' | 'street2' | 'city' | 'state' | 'postalCode' | 'country'>>;
type VendorDraft = {
  name: string;
  companyName: string;
  legalName: string;
  vendorType: 'Business' | 'Individual';
  gstStatus: 'Registered' | 'Unregistered' | 'Composition' | 'SEZ';
  gstin: string;
  pan: string;
  placeOfSupply: string;
  salutation: string;
  firstName: string;
  lastName: string;
  contactName: string;
  email: string;
  phoneCode: string;
  phone: string;
  mobileCode: string;
  mobile: string;
  website: string;
  bankName: string;
  bankAccountName: string;
  bankAccountNumber: string;
  bankIfsc: string;
  bankSwiftCode: string;
  bankBranch: string;
  bankAccountType: string;
  clearBankDetails: boolean;
  billingAddress: AddressFields;
  shippingAddress: AddressFields;
  paymentTerms: string;
  defaultExpenseAccountId: string;
  notes: string;
  additionalContacts: VendorContact[];
  customFields: VendorCustomField[];
};

const emptyAddress = (): AddressFields => ({ attention: '', street: '', street2: '', city: '', state: '', postalCode: '', country: '' });

const addressFromVendor = (value: Vendor['billingAddress']): AddressFields => {
  if (typeof value === 'string') return { ...emptyAddress(), street: value };
  if (!value || typeof value !== 'object') return emptyAddress();
  return {
    attention: value.attention || '', street: value.street || '', street2: value.street2 || '',
    city: value.city || '', state: value.state || '', postalCode: value.postalCode || '', country: value.country || '',
  };
};

const emptyDraft = (): VendorDraft => ({
  name: '', companyName: '', legalName: '', vendorType: 'Business', gstStatus: 'Unregistered',
  gstin: '', pan: '', placeOfSupply: '', salutation: '', firstName: '', lastName: '', contactName: '', email: '', phoneCode: '', phone: '', mobileCode: '', mobile: '',
  website: '', bankName: '', bankAccountName: '', bankAccountNumber: '', bankIfsc: '', bankSwiftCode: '', bankBranch: '', bankAccountType: '', clearBankDetails: false,
  billingAddress: emptyAddress(), shippingAddress: emptyAddress(), paymentTerms: 'Net 30',
  defaultExpenseAccountId: '', notes: '', additionalContacts: [], customFields: [],
});

const draftFromVendor = (vendor: Vendor): VendorDraft => ({
  ...emptyDraft(),
  name: vendor.name || '', companyName: vendor.companyName || '', legalName: vendor.legalName || '',
  vendorType: vendor.vendorType || 'Business', gstStatus: vendor.gstStatus || 'Unregistered',
  gstin: vendor.gstin || vendor.taxId || '', pan: vendor.pan || '', placeOfSupply: vendor.placeOfSupply || '',
  salutation: vendor.primaryContact?.salutation || '', firstName: vendor.primaryContact?.firstName || '',
  lastName: vendor.primaryContact?.lastName || '', contactName: vendor.primaryContact?.name || vendor.contactPerson || '', email: vendor.email || '',
  phoneCode: vendor.primaryContact?.phoneCode || '', phone: vendor.primaryContact?.phone || vendor.phone || '',
  mobileCode: vendor.primaryContact?.mobileCode || '', mobile: vendor.primaryContact?.mobile || vendor.mobile || '', website: vendor.website || '',
  bankName: vendor.bankDetails?.bankName || '', bankAccountName: vendor.bankDetails?.accountName || '',
  bankIfsc: vendor.bankDetails?.ifsc || '', bankSwiftCode: vendor.bankDetails?.swiftCode || '',
  bankBranch: vendor.bankDetails?.branch || '', bankAccountType: vendor.bankDetails?.accountType || '',
  billingAddress: addressFromVendor(vendor.billingAddress || vendor.address),
  shippingAddress: addressFromVendor(vendor.shippingAddress), paymentTerms: vendor.paymentTerms || 'Net 30',
  defaultExpenseAccountId: vendor.defaultExpenseAccountId || '', notes: vendor.notes || '',
  additionalContacts: Array.isArray(vendor.additionalContacts) ? vendor.additionalContacts : [],
  customFields: Object.entries(vendor.customFields || {}).map(([key, value]) => ({ key, value: value == null ? '' : String(value) })),
});

const fieldClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-purple-400 focus:ring-2 focus:ring-purple-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:ring-purple-950';
const labelClass = 'mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300';

export const VendorsView: React.FC<VendorsViewProps> = ({
  autoOpenCreateModal,
  onModalClosed,
  selectedEntityId,
  onSelectedEntityClosed,
}) => {
  const {
    vendors, settings, accounts, addVendor, updateVendor, archiveVendor, restoreVendor,
  } = useBooks();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<VendorStatusFilter>('active');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null);
  const [viewingVendor, setViewingVendor] = useState<Vendor | null>(null);
  const [draft, setDraft] = useState<VendorDraft>(emptyDraft);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [vendorsLoading, setVendorsLoading] = useState(true);
  const [pageVendors, setPageVendors] = useState<Vendor[]>([]);
  const [vendorCount, setVendorCount] = useState(0);
  const [pageIndex, setPageIndex] = useState(0);
  const [refreshSequence, setRefreshSequence] = useState(0);
  const pageSize = 25;

  useEffect(() => {
    if (autoOpenCreateModal) {
      openCreate();
      onModalClosed?.();
    }
  // This effect intentionally responds only to the host's one-shot open signal.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpenCreateModal]);

  useEffect(() => {
    if (!selectedEntityId) return;
    const selected = vendors.find((vendor) => vendor.id === selectedEntityId);
    if (selected) setViewingVendor(selected);
  }, [selectedEntityId, vendors]);

  useEffect(() => {
    let current = true;
    setVendorsLoading(true);
    setPageVendors([]);
    setLoadError('');
    const query = new URLSearchParams({
      paginate: 'true', status: statusFilter, search: search.trim(), limit: String(pageSize), offset: String(pageIndex * pageSize),
    });
    apiClient.get<Vendor[] | { items: Vendor[]; total: number }>(`/finance/vendors?${query.toString()}`).then((response) => {
      if (!current) return;
      if (response.error || !response.data) {
        setLoadError(response.error || 'Vendor directory could not be loaded.');
        return;
      }

      let items: Vendor[];
      let total: number;
      if (Array.isArray(response.data)) {
        // Older servers return the complete directory and ignore pagination
        // query parameters. Preserve the directory experience by filtering and
        // paging that legacy response in the client.
        const searchTerms = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
        const matches = response.data.filter((vendor) => {
          const isActive = vendor.active ?? String(vendor.status ?? 'active').toLowerCase() === 'active';
          if (statusFilter === 'active' && !isActive) return false;
          if (statusFilter === 'inactive' && isActive) return false;
          if (searchTerms.length === 0) return true;

          const contactDetails = [vendor.primaryContact, ...(vendor.additionalContacts ?? [])]
            .flatMap((contact) => [contact?.name, contact?.email, contact?.phone]);
          const searchableText = [
            vendor.name, vendor.companyName, vendor.legalName, vendor.vendorId,
            vendor.email, vendor.phone, vendor.mobile, vendor.website,
            vendor.gstin, vendor.pan, vendor.taxId, vendor.contactPerson,
            ...contactDetails,
          ].filter(Boolean).join(' ').toLowerCase();
          return searchTerms.every((term) => searchableText.includes(term));
        });
        total = matches.length;
        items = matches.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize);
      } else if (Array.isArray(response.data.items)) {
        items = response.data.items;
        total = Number.isFinite(response.data.total) ? response.data.total : items.length;
      } else {
        setLoadError('Vendor directory could not be loaded.');
        return;
      }

      if (pageIndex > 0 && pageIndex * pageSize >= total) {
        setVendorCount(total);
        setPageIndex(Math.max(0, Math.ceil(total / pageSize) - 1));
        return;
      }
      setPageVendors(items);
      setVendorCount(total);
    }).finally(() => {
      if (current) setVendorsLoading(false);
    });
    return () => { current = false; };
  }, [statusFilter, search, pageIndex, pageSize, refreshSequence, vendors]);

  const filteredVendors = pageVendors;

  const openCreate = () => {
    setSelectedVendor(null);
    setDraft(emptyDraft());
    setError('');
    setIsModalOpen(true);
  };

  const openEdit = (vendor: Vendor) => {
    setSelectedVendor(vendor);
    setDraft(draftFromVendor(vendor));
    setError('');
    setIsModalOpen(true);
  };

  const closeModal = () => {
    if (isSaving) return;
    setIsModalOpen(false);
    setError('');
    onSelectedEntityClosed?.();
  };

  const setField = <K extends keyof VendorDraft>(key: K, value: VendorDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const setAddressField = (kind: 'billingAddress' | 'shippingAddress', field: keyof AddressFields, value: string) => {
    setDraft((current) => ({ ...current, [kind]: { ...current[kind], [field]: value } }));
  };

  const renderAddressFields = (kind: 'billingAddress' | 'shippingAddress', title: string) => (
    <section>
      <h3 className="mb-3 text-sm font-bold text-slate-900 dark:text-white">{title}</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        {([
          ['attention', 'Attention'], ['street', 'Street address'], ['street2', 'Apartment / suite'],
          ['city', 'City'], ['state', 'State / province'], ['postalCode', 'Postal code'], ['country', 'Country'],
        ] as Array<[keyof AddressFields, string]>).map(([field, label]) => (
          <label key={`${kind}-${field}`} className={field === 'street' || field === 'street2' ? 'sm:col-span-2' : ''}>
            <span className={labelClass}>{label}</span>
            <input className={fieldClass} maxLength={field === 'street' || field === 'street2' ? 255 : 120}
              value={draft[kind][field]} onChange={(event) => setAddressField(kind, field, event.target.value)} />
          </label>
        ))}
      </div>
    </section>
  );

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft.name.trim()) {
      setError('Enter a display name for this vendor.');
      return;
    }
    setError('');
    setIsSaving(true);
    const primaryContactName = draft.contactName.trim() || [draft.firstName.trim(), draft.lastName.trim()].filter(Boolean).join(' ');
    const payload: Partial<Vendor> = {
      name: draft.name.trim(), companyName: draft.companyName.trim(), legalName: draft.legalName.trim(),
      vendorType: draft.vendorType, gstStatus: draft.gstStatus, gstin: draft.gstin.trim().toUpperCase(),
      taxId: draft.gstin.trim().toUpperCase(), pan: draft.pan.trim().toUpperCase(),
      placeOfSupply: draft.placeOfSupply.trim(),
      primaryContact: { salutation: draft.salutation, firstName: draft.firstName.trim(), lastName: draft.lastName.trim(), name: primaryContactName, email: draft.email.trim(), phoneCode: draft.phoneCode, phone: draft.phone.trim(), mobileCode: draft.mobileCode, mobile: draft.mobile.trim(), isPrimary: true },
      contactPerson: primaryContactName, email: draft.email.trim(), phone: [draft.phoneCode, draft.phone.trim()].filter(Boolean).join(' '),
      mobile: [draft.mobileCode, draft.mobile.trim()].filter(Boolean).join(' '), website: draft.website.trim(), billingAddress: draft.billingAddress,
      shippingAddress: draft.shippingAddress, paymentTerms: draft.paymentTerms,
      defaultExpenseAccountId: draft.defaultExpenseAccountId || undefined,
      additionalContacts: draft.additionalContacts.filter((contact) => contact.name || contact.email || contact.phone || contact.mobile),
      customFields: Object.fromEntries(draft.customFields.filter((field) => field.key.trim()).map((field) => [field.key.trim(), field.value])),
      bankDetails: draft.clearBankDetails ? null : draft.bankAccountNumber.trim() ? {
        bankName: draft.bankName.trim(), accountName: draft.bankAccountName.trim(), accountNumber: draft.bankAccountNumber.trim(),
        ifsc: draft.bankIfsc.trim().toUpperCase(), swiftCode: draft.bankSwiftCode.trim().toUpperCase(),
        branch: draft.bankBranch.trim(), accountType: draft.bankAccountType,
      } : undefined,
      notes: draft.notes.trim(),
    };
    try {
      if (selectedVendor) {
        const saved = await updateVendor(selectedVendor.id, payload);
        setViewingVendor((current) => current?.id === saved.id ? { ...current, ...saved } : current);
      } else {
        await addVendor({ ...payload, currency: settings.currencyCode, payablesBalance: 0, unusedCredits: 0, advanceBalance: 0, active: true } as Omit<Vendor, 'id'>);
      }
      setRefreshSequence((current) => current + 1);
      setIsModalOpen(false);
      onSelectedEntityClosed?.();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Vendor details could not be saved.');
    } finally {
      setIsSaving(false);
    }
  };

  const changeArchiveState = async (vendor: Vendor) => {
    try {
      if (vendor.active === false) await restoreVendor(vendor.id);
      else await archiveVendor(vendor.id);
      setRefreshSequence((current) => current + 1);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Vendor status could not be changed.');
    }
  };

  const renderVendorModal = () => isModalOpen ? (

        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/60 sm:items-center sm:p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeModal(); }}>
          <form onSubmit={submit} className="flex max-h-[94dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl dark:bg-slate-900 sm:rounded-2xl" aria-label={selectedVendor ? 'Edit vendor' : 'Create vendor'}>
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800 sm:px-6">
              <div><h2 className="text-lg font-bold text-slate-900 dark:text-white">{selectedVendor ? 'Edit vendor' : 'New vendor'}</h2><p className="text-xs text-slate-500">Financial balances are calculated from posted transactions.</p></div>
              <button type="button" onClick={closeModal} className="rounded-full p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Close"><X className="h-5 w-5" /></button>
            </div>
            <div className="flex-1 space-y-6 overflow-y-auto px-4 py-5 sm:px-6">
              {error && <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">{error}</p>}
              <section>
                <h3 className="mb-3 text-sm font-bold text-slate-900 dark:text-white">Identity</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label><span className={labelClass}>Display name *</span><input className={fieldClass} required maxLength={255} autoFocus value={draft.name} onChange={(e) => setField('name', e.target.value)} /></label>
                  <label><span className={labelClass}>Vendor type</span><select className={fieldClass} value={draft.vendorType} onChange={(e) => setField('vendorType', e.target.value as VendorDraft['vendorType'])}><option>Business</option><option>Individual</option></select></label>
                  <label><span className={labelClass}>Company name</span><input className={fieldClass} maxLength={255} value={draft.companyName} onChange={(e) => setField('companyName', e.target.value)} /></label>
                  <label><span className={labelClass}>Legal name</span><input className={fieldClass} maxLength={255} value={draft.legalName} onChange={(e) => setField('legalName', e.target.value)} /></label>
                </div>
              </section>
              <section>
                <h3 className="mb-3 text-sm font-bold text-slate-900 dark:text-white">Primary contact</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label><span className={labelClass}>Salutation</span><select className={fieldClass} value={draft.salutation} onChange={(e) => setField('salutation', e.target.value)}><option value="">Select</option><option>Mr.</option><option>Ms.</option><option>Mrs.</option><option>Dr.</option><option>Prof.</option></select></label>
                  <label><span className={labelClass}>First name</span><input className={fieldClass} maxLength={120} value={draft.firstName} onChange={(e) => setField('firstName', e.target.value)} /></label>
                  <label><span className={labelClass}>Last name</span><input className={fieldClass} maxLength={120} value={draft.lastName} onChange={(e) => setField('lastName', e.target.value)} /></label>
                  <label><span className={labelClass}>Contact name (if different)</span><input className={fieldClass} maxLength={255} value={draft.contactName} onChange={(e) => setField('contactName', e.target.value)} /></label>
                  <label><span className={labelClass}>Email</span><input className={fieldClass} type="email" maxLength={255} value={draft.email} onChange={(e) => setField('email', e.target.value)} /></label>
                  <label><span className={labelClass}>Phone code and work phone</span><span className="flex gap-2"><input aria-label="Work phone country code" className={`${fieldClass} w-28 shrink-0`} type="tel" inputMode="tel" maxLength={5} placeholder="+91" value={draft.phoneCode} onChange={(e) => setField('phoneCode', e.target.value.replace(/[^+\d]/g, '').replace(/(?!^)\+/g, '').slice(0, 5))} /><input className={fieldClass} type="tel" maxLength={40} value={draft.phone} onChange={(e) => setField('phone', e.target.value)} /></span></label>
                  <label><span className={labelClass}>Mobile code and number</span><span className="flex gap-2"><input aria-label="Mobile country code" className={`${fieldClass} w-28 shrink-0`} type="tel" inputMode="tel" maxLength={5} placeholder="+91" value={draft.mobileCode} onChange={(e) => setField('mobileCode', e.target.value.replace(/[^+\d]/g, '').replace(/(?!^)\+/g, '').slice(0, 5))} /><input className={fieldClass} type="tel" maxLength={40} value={draft.mobile} onChange={(e) => setField('mobile', e.target.value)} /></span></label>
                  <label className="sm:col-span-2"><span className={labelClass}>Website</span><input className={fieldClass} type="url" maxLength={255} placeholder="https://example.com" value={draft.website} onChange={(e) => setField('website', e.target.value)} /></label>
                </div>
              </section>
              <section>
                <h3 className="mb-3 text-sm font-bold text-slate-900 dark:text-white">Tax details</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label><span className={labelClass}>GST registration</span><select className={fieldClass} value={draft.gstStatus} onChange={(e) => setField('gstStatus', e.target.value as VendorDraft['gstStatus'])}><option>Unregistered</option><option>Registered</option><option>Composition</option><option>SEZ</option></select></label>
                  <label><span className={labelClass}>Place of supply</span><input className={fieldClass} maxLength={100} value={draft.placeOfSupply} onChange={(e) => setField('placeOfSupply', e.target.value)} /></label>
                  <label><span className={labelClass}>GSTIN</span><input className={fieldClass} maxLength={15} value={draft.gstin} onChange={(e) => setField('gstin', e.target.value.toUpperCase())} /></label>
                  <label><span className={labelClass}>PAN</span><input className={fieldClass} maxLength={10} value={draft.pan} onChange={(e) => setField('pan', e.target.value.toUpperCase())} /></label>
                </div>
              </section>
              {renderAddressFields('billingAddress', 'Billing address')}
              {renderAddressFields('shippingAddress', 'Shipping address')}
              <section>
                <h3 className="mb-3 text-sm font-bold text-slate-900 dark:text-white">Purchasing details</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label><span className={labelClass}>Payment terms</span><select className={fieldClass} value={draft.paymentTerms} onChange={(e) => setField('paymentTerms', e.target.value)}><option>Due on Receipt</option><option>Net 15</option><option>Net 30</option><option>Net 45</option><option>Net 60</option></select></label>
                  <label><span className={labelClass}>Default expense account</span><select className={fieldClass} value={draft.defaultExpenseAccountId} onChange={(e) => setField('defaultExpenseAccountId', e.target.value)}><option value="">No default</option>{accounts.filter((account) => account.type === 'Expense' || account.type === 'Other Expense').map((account) => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}</select></label>
                  <div className="sm:col-span-2 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">Currency: <strong>{settings.currencyCode}</strong> (organization base currency)</div>
                  <p className="sm:col-span-2 text-xs text-slate-500">Opening payable balances must be entered through opening unpaid bills or the migration workflow so the Accounts Payable subledger and General Ledger stay aligned.</p>
                </div>
              </section>
              <section>
                <h3 className="mb-1 text-sm font-bold text-slate-900 dark:text-white">Supplier bank details</h3>
                <p className="mb-3 text-xs text-slate-500">Account numbers are encrypted at rest. Only the last four digits are shown after saving.</p>
                {selectedVendor?.bankDetails?.maskedAccountNumber && !draft.clearBankDetails && <p className="mb-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-200">Saved account {selectedVendor.bankDetails.maskedAccountNumber} · {selectedVendor.bankDetails.bankName || 'Bank'}{selectedVendor.bankDetails.ifsc ? ` · IFSC ${selectedVendor.bankDetails.ifsc}` : ''}. Enter a new account number to replace the saved details.</p>}
                <div className="grid gap-3 sm:grid-cols-2">
                  <label><span className={labelClass}>Bank name</span><input className={fieldClass} maxLength={120} value={draft.bankName} onChange={(e) => setField('bankName', e.target.value)} /></label>
                  <label><span className={labelClass}>Account holder name</span><input className={fieldClass} maxLength={120} value={draft.bankAccountName} onChange={(e) => setField('bankAccountName', e.target.value)} /></label>
                  <label><span className={labelClass}>Account number {selectedVendor?.bankDetails?.maskedAccountNumber ? '(enter only to replace)' : ''}</span><input className={fieldClass} type="password" autoComplete="new-password" maxLength={34} value={draft.bankAccountNumber} onChange={(e) => setField('bankAccountNumber', e.target.value)} /></label>
                  <label><span className={labelClass}>IFSC</span><input className={fieldClass} maxLength={20} value={draft.bankIfsc} onChange={(e) => setField('bankIfsc', e.target.value.toUpperCase())} /></label>
                  <label><span className={labelClass}>SWIFT code</span><input className={fieldClass} maxLength={11} value={draft.bankSwiftCode} onChange={(e) => setField('bankSwiftCode', e.target.value.toUpperCase())} /></label>
                  <label><span className={labelClass}>Branch</span><input className={fieldClass} maxLength={120} value={draft.bankBranch} onChange={(e) => setField('bankBranch', e.target.value)} /></label>
                  <label><span className={labelClass}>Account type</span><select className={fieldClass} value={draft.bankAccountType} onChange={(e) => setField('bankAccountType', e.target.value)}><option value="">Select account type</option><option>Current</option><option>Savings</option><option>Checking</option><option>Other</option></select></label>
                  {selectedVendor?.bankDetails?.maskedAccountNumber && <label className="flex items-center gap-2 self-end pb-2 text-sm text-rose-700 dark:text-rose-300"><input type="checkbox" checked={draft.clearBankDetails} onChange={(e) => setField('clearBankDetails', e.target.checked)} />Remove saved bank details</label>}
                </div>
              </section>
              <section>
                <div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-bold text-slate-900 dark:text-white">Contact persons</h3><button type="button" onClick={() => setField('additionalContacts', [...draft.additionalContacts, { name: '', email: '', phone: '', mobile: '', designation: '' }])} className="text-xs font-semibold text-purple-700 dark:text-purple-300">Add contact</button></div>
                <div className="space-y-3">{draft.additionalContacts.map((contact, index) => <div key={index} className="grid gap-2 rounded-xl border border-slate-200 p-3 dark:border-slate-700 sm:grid-cols-2"><input aria-label={`Contact ${index + 1} name`} placeholder="Name" className={fieldClass} value={contact.name || ''} onChange={(e) => setField('additionalContacts', draft.additionalContacts.map((row, i) => i === index ? { ...row, name: e.target.value } : row))} /><input aria-label={`Contact ${index + 1} designation`} placeholder="Role / designation" className={fieldClass} value={contact.designation || ''} onChange={(e) => setField('additionalContacts', draft.additionalContacts.map((row, i) => i === index ? { ...row, designation: e.target.value } : row))} /><input aria-label={`Contact ${index + 1} email`} placeholder="Email" type="email" className={fieldClass} value={contact.email || ''} onChange={(e) => setField('additionalContacts', draft.additionalContacts.map((row, i) => i === index ? { ...row, email: e.target.value } : row))} /><input aria-label={`Contact ${index + 1} phone`} placeholder="Work phone" type="tel" className={fieldClass} value={contact.phone || ''} onChange={(e) => setField('additionalContacts', draft.additionalContacts.map((row, i) => i === index ? { ...row, phone: e.target.value } : row))} /><input aria-label={`Contact ${index + 1} mobile`} placeholder="Mobile" type="tel" className={fieldClass} value={contact.mobile || ''} onChange={(e) => setField('additionalContacts', draft.additionalContacts.map((row, i) => i === index ? { ...row, mobile: e.target.value } : row))} /><button type="button" onClick={() => setField('additionalContacts', draft.additionalContacts.filter((_, i) => i !== index))} className="rounded-xl px-3 text-sm text-rose-600 hover:bg-rose-50">Remove contact</button></div>)}</div>
              </section>
              <section>
                <div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-bold text-slate-900 dark:text-white">Custom fields</h3><button type="button" onClick={() => setField('customFields', [...draft.customFields, { key: '', value: '' }])} className="text-xs font-semibold text-purple-700 dark:text-purple-300">Add field</button></div>
                {draft.customFields.length === 0 ? <p className="text-xs text-slate-500">Add optional organization-specific supplier details.</p> : <div className="space-y-2">{draft.customFields.map((field, index) => <div key={index} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]"><input aria-label={`Custom field ${index + 1} name`} placeholder="Field name" maxLength={80} className={fieldClass} value={field.key} onChange={(e) => setField('customFields', draft.customFields.map((row, i) => i === index ? { ...row, key: e.target.value } : row))} /><input aria-label={`Custom field ${index + 1} value`} placeholder="Value" maxLength={500} className={fieldClass} value={field.value} onChange={(e) => setField('customFields', draft.customFields.map((row, i) => i === index ? { ...row, value: e.target.value } : row))} /><button type="button" onClick={() => setField('customFields', draft.customFields.filter((_, i) => i !== index))} className="rounded-xl px-3 text-sm text-rose-600 hover:bg-rose-50">Remove</button></div>)}</div>}
              </section>
              <section><label><span className={labelClass}>Notes</span><textarea className={`${fieldClass} min-h-24 resize-y`} maxLength={20000} value={draft.notes} onChange={(e) => setField('notes', e.target.value)} /></label></section>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900 sm:px-6">
              <button type="button" onClick={closeModal} disabled={isSaving} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">Cancel</button>
              <button type="submit" disabled={isSaving} className="rounded-xl bg-purple-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-purple-700 disabled:opacity-60">{isSaving ? 'Saving…' : selectedVendor ? 'Save changes' : 'Create vendor'}</button>
            </div>
          </form>
        </div>

  ) : null;

  if (viewingVendor) {
    const liveVendor = vendors.find((vendor) => vendor.id === viewingVendor.id) || viewingVendor;
    const workspaceVendors = filteredVendors.some((vendor) => vendor.id === liveVendor.id)
      ? filteredVendors
      : [liveVendor, ...filteredVendors];
    return (
      <div className="mx-auto min-h-[calc(100vh-5rem)] max-w-[1800px] lg:grid lg:grid-cols-[290px_minmax(0,1fr)]">
        <aside className="sticky top-0 hidden h-screen overflow-y-auto border-r border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950 lg:block">
          <div className="mb-4 flex items-center justify-between"><h2 className="font-bold text-slate-900 dark:text-white">Vendors</h2><button onClick={openCreate} className="rounded-lg bg-purple-600 p-2 text-white" aria-label="Add vendor"><Plus className="h-4 w-4" /></button></div>
          <label className="relative block"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input aria-label="Search vendors in workspace" value={search} onChange={(event) => { setPageIndex(0); setSearch(event.target.value); }} placeholder="Search vendors" className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white" /></label>
          <div className="my-3 flex gap-1">{(['active', 'inactive', 'all'] as VendorStatusFilter[]).map((filter) => <button key={filter} onClick={() => { setPageIndex(0); setStatusFilter(filter); }} className={`rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize ${statusFilter === filter ? 'bg-purple-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>{filter}</button>)}</div>
          <div className="space-y-1">{workspaceVendors.map((vendor) => <button key={vendor.id} onClick={() => setViewingVendor(vendor)} className={`w-full rounded-xl p-3 text-left ${vendor.id === liveVendor.id ? 'bg-purple-50 ring-1 ring-purple-200 dark:bg-purple-950/40 dark:ring-purple-900' : 'hover:bg-slate-50 dark:hover:bg-slate-900'}`}><span className="block truncate text-sm font-semibold text-slate-900 dark:text-white">{vendor.name}</span><span className="mt-1 block truncate text-xs text-slate-500">{vendor.companyName || vendor.email || 'Vendor'}</span><span className="mt-2 block text-xs font-semibold text-slate-700 dark:text-slate-300">{formatCurrency(vendor.payablesBalance || 0, settings.currencySymbol)} due</span></button>)}</div>
          {vendorsLoading && <p className="p-3 text-xs text-slate-500">Loading vendors…</p>}
        </aside>
        <div className="min-w-0">
          <VendorWorkspace
            vendor={liveVendor}
            onBack={() => { setViewingVendor(null); onSelectedEntityClosed?.(); }}
            onEdit={openEdit}
            onVendorStatusChanged={() => setViewingVendor(null)}
          />
        </div>
        {renderVendorModal()}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 pb-24 sm:p-6 lg:pb-6">
      <header className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-purple-600 dark:text-purple-400">Purchases</p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold text-slate-900 dark:text-white">
            <Building2 className="h-6 w-6 text-purple-600" /> Vendors
          </h1>
          <p className="mt-1 hidden text-sm text-slate-500 sm:block">Contact details, tax profile, payables, and supplier history.</p>
        </div>
        <button onClick={openCreate} className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-purple-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-purple-700">
          <Plus className="h-4 w-4" /><span className="hidden sm:inline">New Vendor</span><span className="sm:hidden">Add</span>
        </button>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-2" role="group" aria-label="Filter vendors by status">
            {(['all', 'active', 'inactive'] as VendorStatusFilter[]).map((filter) => (
              <button key={filter} onClick={() => { setPageIndex(0); setStatusFilter(filter); }} aria-pressed={statusFilter === filter}
                className={`rounded-full px-3.5 py-2 text-xs font-semibold capitalize transition ${statusFilter === filter ? 'bg-purple-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'}`}>
                {filter}
              </button>
            ))}
          </div>
          <label className="relative block w-full sm:max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input aria-label="Search vendors" value={search} onChange={(event) => { setPageIndex(0); setSearch(event.target.value); }} placeholder="Search vendors, tax ID, contact…"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:ring-purple-950" />
          </label>
        </div>
        {error && !isModalOpen && <p role="alert" className="mt-3 text-sm text-rose-600">{error}</p>}
        {loadError && <p role="alert" className="mt-3 text-sm text-rose-600">{loadError}</p>}

        <div className="mt-4 hidden overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 md:block">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              <tr><th className="px-4 py-3">Vendor</th><th className="px-4 py-3">Email / Phone</th><th className="px-4 py-3">Payment terms</th><th className="px-4 py-3 text-right">Payables</th><th className="px-4 py-3 text-right">Unused credits</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Actions</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredVendors.map((vendor) => (
                <tr key={vendor.id} onClick={() => setViewingVendor(vendor)} className="cursor-pointer hover:bg-purple-50/50 dark:hover:bg-slate-800/60">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-slate-900 dark:text-white">{vendor.name}</div>
                    <div className="mt-0.5 text-xs text-slate-500">{vendor.companyName || vendor.legalName || vendor.vendorId || '—'}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300"><div>{vendor.email || '—'}</div><div className="mt-0.5 text-xs text-slate-500">{vendor.phone || vendor.mobile || '—'}</div></td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{vendor.paymentTerms || 'Due on Receipt'}</td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-900 dark:text-white">{formatCurrency(vendor.payablesBalance || 0, settings.currencySymbol)}</td>
                  <td className="px-4 py-3 text-right text-slate-700 dark:text-slate-300">{formatCurrency(vendor.unusedCredits || 0, settings.currencySymbol)}</td>
                  <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${vendor.active === false ? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'}`}>{vendor.active === false ? 'Inactive' : 'Active'}</span></td>
                  <td className="px-4 py-3 text-right" onClick={(event) => event.stopPropagation()}>
                    <button onClick={() => openEdit(vendor)} className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-purple-700 hover:bg-purple-50 dark:text-purple-300 dark:hover:bg-purple-950">Edit</button>
                    <button onClick={() => void changeArchiveState(vendor)} aria-label={vendor.active === false ? `Restore ${vendor.name}` : `Archive ${vendor.name}`} title={vendor.active === false ? 'Restore vendor' : 'Archive vendor'} className="ml-1 rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
                      {vendor.active === false ? <RotateCcw className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                    </button>
                  </td>
                </tr>
              ))}
              {vendorsLoading && <tr><td colSpan={7} className="px-4 py-12 text-center text-sm text-slate-500">Loading vendors…</td></tr>}
              {!vendorsLoading && filteredVendors.length === 0 && <tr><td colSpan={7} className="px-4 py-12 text-center text-sm text-slate-500">No vendors match this search.</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="mt-4 space-y-2 md:hidden">
          {filteredVendors.map((vendor) => (
            <article key={vendor.id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
              <button onClick={() => setViewingVendor(vendor)} className="flex w-full items-start gap-3 text-left">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-purple-100 text-sm font-bold text-purple-700 dark:bg-purple-950 dark:text-purple-300">
                  {(vendor.name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('') || 'V').toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2"><span className="truncate font-semibold text-slate-900 dark:text-white">{vendor.name}</span><ChevronRight className="h-4 w-4 shrink-0 text-slate-400" /></span>
                  <span className="mt-0.5 block truncate text-xs text-slate-500">{vendor.companyName || vendor.legalName || vendor.vendorId || 'Vendor'}</span>
                  <span className="mt-2 grid grid-cols-2 gap-2 text-xs">
                    <span><span className="block text-slate-500">Payables</span><span className="font-semibold text-slate-900 dark:text-white">{formatCurrency(vendor.payablesBalance || 0, settings.currencySymbol)}</span></span>
                    <span><span className="block text-slate-500">Unused credits</span><span className="font-semibold text-slate-900 dark:text-white">{formatCurrency(vendor.unusedCredits || 0, settings.currencySymbol)}</span></span>
                  </span>
                </span>
              </button>
              <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2 dark:border-slate-800">
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${vendor.active === false ? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'}`}>{vendor.active === false ? 'Inactive' : 'Active'}</span>
                <div className="flex gap-1"><button onClick={() => openEdit(vendor)} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-purple-700 hover:bg-purple-50 dark:text-purple-300">Edit</button><button onClick={() => void changeArchiveState(vendor)} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">{vendor.active === false ? 'Restore' : 'Archive'}</button></div>
              </div>
            </article>
          ))}
          {vendorsLoading && <div className="px-4 py-12 text-center text-sm text-slate-500">Loading vendors…</div>}
          {!vendorsLoading && filteredVendors.length === 0 && <div className="px-4 py-12 text-center text-sm text-slate-500">No vendors match this search.</div>}
        </div>
        <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-500 dark:border-slate-800">
          <span>{vendorCount === 0 ? 'No vendors' : `${pageIndex * pageSize + 1}–${Math.min(pageIndex * pageSize + filteredVendors.length, vendorCount)} of ${vendorCount}`}</span>
          <div className="flex gap-2">
            <button disabled={pageIndex === 0 || vendorsLoading} onClick={() => setPageIndex((value) => Math.max(0, value - 1))} className="rounded-lg border border-slate-200 px-3 py-2 font-semibold disabled:opacity-40 dark:border-slate-700">Previous</button>
            <button disabled={(pageIndex + 1) * pageSize >= vendorCount || vendorsLoading} onClick={() => setPageIndex((value) => value + 1)} className="rounded-lg border border-slate-200 px-3 py-2 font-semibold disabled:opacity-40 dark:border-slate-700">Next</button>
          </div>
        </div>
      </section>

      {renderVendorModal()}
    </div>
  );
};
