import React, { useEffect, useState } from 'react';
import { Building2, Coins, Globe, ShieldCheck, X } from 'lucide-react';
import { useBooks } from '../../context/BooksContext';
import { CreateOrganizationInput } from '../../types';

interface CreateOrganizationWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (orgCode: string, orgName: string) => void;
}

const INDUSTRIES = [
  'Accounting & Financial Services',
  'Software & Technology Services',
  'Consulting & Advisory',
  'Retail & E-commerce',
  'Construction & Real Estate',
  'Healthcare & Medical',
  'Legal & Law Practice',
  'Manufacturing & Industrial',
  'General Trading & Business',
];

const CURRENCIES = [
  { code: 'USD', symbol: '$', name: 'US Dollar' },
  { code: 'INR', symbol: '₹', name: 'Indian Rupee' },
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'GBP', symbol: '£', name: 'British Pound' },
  { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar' },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar' },
  { code: 'AED', symbol: 'AED', name: 'UAE Dirham' },
  { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar' },
];

export const CreateOrganizationWizardModal: React.FC<CreateOrganizationWizardModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { createOrganization } = useBooks();
  const [name, setName] = useState('');
  const [industry, setIndustry] = useState(INDUSTRIES[0]);
  const [country, setCountry] = useState('India');
  const [currencyCode, setCurrencyCode] = useState('INR');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isSubmitting) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const normalizedName = name.trim();
    if (normalizedName.length < 2 || normalizedName.length > 120) {
      setError('Organization name must contain 2 to 120 characters.');
      return;
    }
    const currency = CURRENCIES.find((entry) => entry.code === currencyCode)!;
    setIsSubmitting(true);
    setError('');
    try {
      const payload: CreateOrganizationInput = {
        name: normalizedName,
        industry,
        country: country.trim(),
        baseCurrency: currency.code,
        currencySymbol: currency.symbol,
        includeSampleData: false,
      };
      const created = await createOrganization(payload);
      onSuccess?.(created.orgCode, created.name);
      setName('');
      onClose();
    } catch (submitError: any) {
      setError(submitError?.message || 'Organization could not be created.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/65 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-xl rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Building2 className="w-5 h-5 text-blue-600" />
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">Create organization</h2>
              <p className="text-[11px] text-slate-500">Only fields persisted by the server are collected.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={isSubmitting} aria-label="Close" className="p-1.5 text-slate-400 hover:text-slate-700 disabled:opacity-50">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-800">{error}</div>}

          <label className="block">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Organization name</span>
            <input value={name} onChange={(event) => setName(event.target.value)} maxLength={120} required autoFocus className="mt-1.5 w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm text-slate-900 dark:text-white outline-none focus:border-blue-500" />
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Industry</span>
              <select value={industry} onChange={(event) => setIndustry(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2.5 text-xs text-slate-900 dark:text-white">
                {INDUSTRIES.map((entry) => <option key={entry}>{entry}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1"><Globe className="w-3.5 h-3.5" /> Country</span>
              <input value={country} onChange={(event) => setCountry(event.target.value)} maxLength={100} required className="mt-1.5 w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2.5 text-xs text-slate-900 dark:text-white" />
            </label>
          </div>

          <label className="block">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1"><Coins className="w-3.5 h-3.5" /> Base currency</span>
            <select value={currencyCode} onChange={(event) => setCurrencyCode(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2.5 text-xs text-slate-900 dark:text-white">
              {CURRENCIES.map((entry) => <option key={entry.code} value={entry.code}>{entry.code} · {entry.name} ({entry.symbol})</option>)}
            </select>
          </label>

          <div className="rounded-xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-900 p-3 flex items-start gap-2 text-xs text-emerald-900 dark:text-emerald-200">
            <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
            The server assigns organization identifiers, provisions a zero-balance control chart, records ownership, and commits all setup work atomically. No demo transactions are created.
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <button type="button" onClick={onClose} disabled={isSubmitting} className="px-4 py-2 text-xs font-bold text-slate-600 rounded-xl hover:bg-slate-100 disabled:opacity-50">Cancel</button>
            <button type="submit" disabled={isSubmitting} className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl disabled:opacity-50">
              {isSubmitting ? 'Creating…' : 'Create organization'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
