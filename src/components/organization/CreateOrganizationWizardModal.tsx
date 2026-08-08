import React, { useEffect, useState } from 'react';
import {
  Building2,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  Coins,
  Globe,
  Hash,
  HelpCircle,
  MapPin,
  Sparkles,
  X,
  Briefcase,
  User,
  Mail,
  Phone,
  Calendar,
  FileText,
  ShieldCheck,
} from 'lucide-react';
import { useBooks } from '../../context/BooksContext';
import { CreateOrganizationInput } from '../../types';

interface CreateOrganizationWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (orgCode: string, orgName: string) => void;
}

const INDUSTRY_OPTIONS = [
  'Accounting & Financial Services',
  'Software & Technology Services',
  'Consulting & Advisory',
  'Retail & E-commerce',
  'Construction & Real Estate',
  'Healthcare & Medical',
  'Legal & Law Practice',
  'Manufacturing & Industrial',
  'Marketing & Advertising Agency',
  'Hospitality & Restaurants',
  'General Trading & Business',
];

const CURRENCY_OPTIONS = [
  { code: 'USD', symbol: '$', name: 'US Dollar (USD)' },
  { code: 'INR', symbol: '₹', name: 'Indian Rupee (INR)' },
  { code: 'EUR', symbol: '€', name: 'Euro (EUR)' },
  { code: 'GBP', symbol: '£', name: 'British Pound (GBP)' },
  { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar (CAD)' },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar (AUD)' },
  { code: 'AED', symbol: 'AED', name: 'UAE Dirham (AED)' },
  { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar (SGD)' },
  { code: 'JPY', symbol: '¥', name: 'Japanese Yen (JPY)' },
];

const FISCAL_YEAR_OPTIONS = [
  'January - December',
  'April - March',
  'July - June',
  'October - September',
];

export const CreateOrganizationWizardModal: React.FC<CreateOrganizationWizardModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { createOrganization, organizations } = useBooks();

  const [currentStep, setCurrentStep] = useState<number>(1);

  // Form State
  const [formData, setFormData] = useState<CreateOrganizationInput>(() => {
    // Generate unique code suggestion
    const randomCode = 'ORG-' + Math.floor(10000 + Math.random() * 90000);
    return {
      name: '',
      orgCode: randomCode,
      industry: 'Accounting & Financial Services',
      country: 'United States',
      address: '',
      city: '',
      state: '',
      zipCode: '',
      phone: '',
      website: '',
      primaryContactName: '',
      primaryContactEmail: '',
      baseCurrency: 'USD',
      currencySymbol: '$',
      fiscalYearStart: 'January',
      reportBasis: 'Accrual',
      taxId: '',
      includeSampleData: false,
    };
  });

  const [codeError, setCodeError] = useState<string>('');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleChange = (field: keyof CreateOrganizationInput, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (field === 'orgCode') {
      setCodeError('');
    }
  };

  const validateStep1 = (): boolean => {
    if (!formData.name.trim()) {
      alert('Please enter an Organization Name.');
      return false;
    }

    const code = (formData.orgCode || '').trim().toUpperCase();
    if (!code) {
      alert('Please enter a unique Organization Code.');
      return false;
    }

    // Check code uniqueness
    const exists = organizations.some(
      (o) => o.orgCode.toUpperCase() === code
    );
    if (exists) {
      setCodeError(`Code "${code}" is already assigned to another organization.`);
      return false;
    }

    return true;
  };

  const handleNext = () => {
    if (currentStep === 1) {
      if (!validateStep1()) return;
    }
    if (currentStep < 4) {
      setCurrentStep((prev) => prev + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateStep1()) return;

    try {
      const created = createOrganization(formData);
      if (onSuccess) {
        onSuccess(created.orgCode, created.name);
      }
      onClose();
    } catch (err) {
      console.error(err);
      alert('Failed to create organization. Please try again.');
    }
  };

  const regenerateCode = () => {
    const code = 'ORG-' + Math.floor(10000 + Math.random() * 90000);
    setFormData((prev) => ({ ...prev, orgCode: code }));
    setCodeError('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-2xl overflow-hidden flex flex-col my-8 animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header / Wizard Progress Banner */}
        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-blue-950 text-white p-6 relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center space-x-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-blue-600/30 border border-blue-400/30 flex items-center justify-center text-blue-300">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight">
                Create New Organization
              </h2>
              <p className="text-xs text-slate-300">
                Setup your standalone firm workspace with a unique Organization Code
              </p>
            </div>
          </div>

          {/* Stepper Tabs */}
          <div className="grid grid-cols-4 gap-2 mt-6">
            {[
              { num: 1, label: 'General Info' },
              { num: 2, label: 'Address & Contact' },
              { num: 3, label: 'Accounting Config' },
              { num: 4, label: 'Review & Launch' },
            ].map((step) => {
              const isActive = currentStep === step.num;
              const isDone = currentStep > step.num;
              return (
                <div
                  key={step.num}
                  className={`flex items-center space-x-2 p-2 rounded-lg transition-colors text-xs font-semibold ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-sm'
                      : isDone
                      ? 'bg-white/10 text-emerald-300'
                      : 'bg-white/5 text-slate-400'
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                      isActive
                        ? 'bg-white text-blue-700'
                        : isDone
                        ? 'bg-emerald-400 text-slate-950'
                        : 'bg-slate-700 text-slate-300'
                    }`}
                  >
                    {isDone ? '✓' : step.num}
                  </div>
                  <span className="truncate hidden sm:inline">{step.label}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Wizard Step Body */}
        <div className="p-6 flex-1 overflow-y-auto space-y-6 max-h-[60vh]">
          
          {/* STEP 1: General Info & Organization Code */}
          {currentStep === 1 && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="bg-blue-50/70 border border-blue-200 rounded-xl p-3 flex items-start space-x-3 text-xs text-blue-900">
                <Sparkles className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <span>
                  Each organization is assigned a <strong>Unique Organization Code</strong> for statutory tracking, audit logs, and data exports.
                </span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Organization Name <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Building2 className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    required
                    placeholder="e.g. Apex Global Consulting LLC"
                    value={formData.name}
                    onChange={(e) => handleChange('name', e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-medium"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-slate-700">
                    Unique Organization Code <span className="text-rose-500">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={regenerateCode}
                    className="text-[11px] font-bold text-blue-600 hover:text-blue-700 cursor-pointer"
                  >
                    Auto-Generate New Code
                  </button>
                </div>
                <div className="relative">
                  <Hash className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    required
                    value={formData.orgCode}
                    onChange={(e) => handleChange('orgCode', e.target.value.toUpperCase())}
                    className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-mono uppercase font-bold text-slate-800"
                  />
                </div>
                {codeError && (
                  <p className="text-xs text-rose-600 mt-1 font-medium">{codeError}</p>
                )}
                <p className="text-[11px] text-slate-500 mt-1">
                  Custom code for fast identification (e.g., ORG-84920, ACME-US).
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Industry Type
                  </label>
                  <div className="relative">
                    <Briefcase className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                    <select
                      value={formData.industry}
                      onChange={(e) => handleChange('industry', e.target.value)}
                      className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-medium bg-white"
                    >
                      {INDUSTRY_OPTIONS.map((ind) => (
                        <option key={ind} value={ind}>
                          {ind}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Primary Contact Name
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                    <input
                      type="text"
                      placeholder="e.g. Sarah Jenkins"
                      value={formData.primaryContactName}
                      onChange={(e) => handleChange('primaryContactName', e.target.value)}
                      className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-medium"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Primary Contact Email
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="email"
                    placeholder="e.g. contact@apexgrowth.com"
                    value={formData.primaryContactEmail}
                    onChange={(e) => handleChange('primaryContactEmail', e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-medium"
                  />
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: Address & Contact */}
          {currentStep === 2 && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Country / Jurisdiction
                  </label>
                  <div className="relative">
                    <Globe className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                    <input
                      type="text"
                      placeholder="e.g. United States, India, United Kingdom"
                      value={formData.country}
                      onChange={(e) => handleChange('country', e.target.value)}
                      className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-medium"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Phone Number
                  </label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                    <input
                      type="text"
                      placeholder="+1 (555) 019-2834"
                      value={formData.phone}
                      onChange={(e) => handleChange('phone', e.target.value)}
                      className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-medium"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Street Address
                </label>
                <div className="relative">
                  <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    placeholder="e.g. 500 Financial Plaza, Suite 1400"
                    value={formData.address}
                    onChange={(e) => handleChange('address', e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-medium"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">City</label>
                  <input
                    type="text"
                    placeholder="New York"
                    value={formData.city}
                    onChange={(e) => handleChange('city', e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-medium"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">State / Province</label>
                  <input
                    type="text"
                    placeholder="NY"
                    value={formData.state}
                    onChange={(e) => handleChange('state', e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-medium"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Zip / Postal Code</label>
                  <input
                    type="text"
                    placeholder="10005"
                    value={formData.zipCode}
                    onChange={(e) => handleChange('zipCode', e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-medium"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Website URL (Optional)
                </label>
                <input
                  type="text"
                  placeholder="https://apexgrowth.com"
                  value={formData.website}
                  onChange={(e) => handleChange('website', e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-medium"
                />
              </div>
            </div>
          )}

          {/* STEP 3: Accounting & Currency Configuration */}
          {currentStep === 3 && (
            <div className="space-y-5 animate-in fade-in duration-200">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Base Reporting Currency
                  </label>
                  <div className="relative">
                    <Coins className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                    <select
                      value={formData.baseCurrency}
                      onChange={(e) => {
                        const sel = CURRENCY_OPTIONS.find((c) => c.code === e.target.value);
                        setFormData((prev) => ({
                          ...prev,
                          baseCurrency: e.target.value,
                          currencySymbol: sel ? sel.symbol : '$',
                        }));
                      }}
                      className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-medium bg-white"
                    >
                      {CURRENCY_OPTIONS.map((curr) => (
                        <option key={curr.code} value={curr.code}>
                          {curr.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Fiscal Year Cycle
                  </label>
                  <div className="relative">
                    <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                    <select
                      value={formData.fiscalYearStart}
                      onChange={(e) => handleChange('fiscalYearStart', e.target.value)}
                      className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-medium bg-white"
                    >
                      {FISCAL_YEAR_OPTIONS.map((fy) => (
                        <option key={fy} value={fy}>
                          {fy}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Accounting Report Basis
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {['Accrual', 'Cash'].map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => handleChange('reportBasis', mode)}
                        className={`py-2 px-3 text-xs font-bold rounded-xl border transition-all cursor-pointer ${
                          formData.reportBasis === mode
                            ? 'bg-blue-50 text-blue-700 border-blue-500 shadow-xs'
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        {mode} Basis
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Tax Registration / VAT ID
                  </label>
                  <div className="relative">
                    <FileText className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                    <input
                      type="text"
                      placeholder="e.g. US984210492 or GSTIN"
                      value={formData.taxId}
                      onChange={(e) => handleChange('taxId', e.target.value)}
                      className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-medium"
                    />
                  </div>
                </div>
              </div>

              {/* Data Initialization Mode */}
              <div className="border-t border-slate-200 pt-4">
                <label className="block text-xs font-bold text-slate-800 mb-2">
                  Initial Workspace Data Mode
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div
                    onClick={() => handleChange('includeSampleData', false)}
                    className={`p-3.5 rounded-xl border-2 cursor-pointer transition-all ${
                      !formData.includeSampleData
                        ? 'bg-blue-50/60 border-blue-600 shadow-xs'
                        : 'bg-white border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-slate-900">
                        Start Fresh (Empty Workspace)
                      </span>
                      {!formData.includeSampleData && (
                        <CheckCircle2 className="w-4 h-4 text-blue-600" />
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 leading-snug">
                      Clean Chart of Accounts with $0 balances. No demo clients or entries.
                    </p>
                  </div>

                  <div
                    onClick={() => handleChange('includeSampleData', true)}
                    className={`p-3.5 rounded-xl border-2 cursor-pointer transition-all ${
                      formData.includeSampleData
                        ? 'bg-blue-50/60 border-blue-600 shadow-xs'
                        : 'bg-white border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-slate-900 flex items-center gap-1">
                        <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                        Load Sample Seed Records
                      </span>
                      {formData.includeSampleData && (
                        <CheckCircle2 className="w-4 h-4 text-blue-600" />
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 leading-snug">
                      Pre-populates sample clients, demo invoices, and expenses for walkthroughs.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: Review & Finalize */}
          {currentStep === 4 && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="bg-gradient-to-br from-slate-900 to-blue-950 text-white rounded-2xl p-5 border border-slate-800 shadow-lg">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
                  <div>
                    <span className="text-[10px] font-extrabold uppercase tracking-widest text-blue-400">
                      Organization Preview
                    </span>
                    <h3 className="text-lg font-bold text-white">
                      {formData.name || 'Untitled Organization'}
                    </h3>
                  </div>
                  <div className="bg-blue-600 text-white font-mono font-extrabold px-3 py-1 rounded-lg text-xs tracking-wider shadow-sm">
                    {formData.orgCode || 'ORG-XXXXX'}
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                  <div>
                    <span className="text-slate-400 block text-[10px]">Industry</span>
                    <span className="font-semibold text-slate-200">{formData.industry}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Base Currency</span>
                    <span className="font-semibold text-emerald-400">
                      {formData.baseCurrency} ({formData.currencySymbol})
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Country</span>
                    <span className="font-semibold text-slate-200">{formData.country}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Accounting Basis</span>
                    <span className="font-semibold text-slate-200">{formData.reportBasis} Basis</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Primary Contact</span>
                    <span className="font-semibold text-slate-200">
                      {formData.primaryContactName || 'N/A'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Data Mode</span>
                    <span className="font-semibold text-indigo-300">
                      {formData.includeSampleData ? 'Sample Demo Data' : 'Clean Fresh Start'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3.5 flex items-start space-x-3 text-xs text-emerald-900">
                <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">Ready to Launch Organization Workspace</p>
                  <p className="text-[11px] text-emerald-800">
                    Clicking finish will save this organization, create its ledger environment, and immediately switch your active view to it.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Wizard Footer Controls */}
        <div className="bg-slate-50 border-t border-slate-200 p-4 flex items-center justify-between">
          <button
            type="button"
            onClick={handleBack}
            disabled={currentStep === 1}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center space-x-1 transition-all cursor-pointer ${
              currentStep === 1
                ? 'opacity-0 pointer-events-none'
                : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-100'
            }`}
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Back</span>
          </button>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 transition-colors cursor-pointer"
            >
              Cancel
            </button>

            {currentStep < 4 ? (
              <button
                type="button"
                onClick={handleNext}
                className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-xl text-xs font-bold flex items-center space-x-1.5 shadow-sm transition-all cursor-pointer"
              >
                <span>Next Step</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2 rounded-xl text-xs font-bold flex items-center space-x-1.5 shadow-md transition-all cursor-pointer"
              >
                <Sparkles className="w-4 h-4 text-emerald-200" />
                <span>Create & Launch Organization</span>
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
