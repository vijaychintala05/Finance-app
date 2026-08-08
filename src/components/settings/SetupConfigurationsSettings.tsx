import React, { useState } from 'react';
import { Sliders, DollarSign, Calendar, Lock, Bell, Monitor, ExternalLink, Plus, CheckCircle, Trash2 } from 'lucide-react';
import { useBooks } from '../../context/BooksContext';
import { CurrencySetting, PaymentTermSetting, ReminderSetting } from '../../types';

interface SetupConfigurationsSettingsProps {
  subTab: 'general' | 'currencies' | 'payment-terms' | 'opening-balances' | 'reminders' | 'customer-portal' | 'vendor-portal';
}

export const SetupConfigurationsSettings: React.FC<SetupConfigurationsSettingsProps> = ({ subTab }) => {
  const { settings, updateSettings, accounts } = useBooks();
  const [successMsg, setSuccessMsg] = useState('');

  const triggerSave = (newValues: Partial<typeof settings>) => {
    updateSettings(newValues);
    setSuccessMsg('Configuration updated!');
    setTimeout(() => setSuccessMsg(''), 3000);
  };

  // General state
  const [defaultBankAccountId, setDefaultBankAccountId] = useState(settings.generalConfig?.defaultBankAccountId || 'acc-1000');
  const [baseCurrency, setBaseCurrency] = useState(settings.currencyCode || 'USD');

  // Currencies state
  const [defaultCode, setDefaultCode] = useState(settings.currencyCode || 'INR');
  const [defaultSymbol, setDefaultSymbol] = useState(settings.currencySymbol || '₹');
  const [onlyDefaultCurrency, setOnlyDefaultCurrency] = useState(settings.onlyDefaultCurrency ?? false);

  const [currencies, setCurrencies] = useState<CurrencySetting[]>(
    settings.currencies || [
      { code: 'INR', symbol: '₹', name: 'Indian Rupee', rate: 1.0, autoUpdate: false, isDefault: true },
      { code: 'USD', symbol: '$', name: 'US Dollar', rate: 1.0, autoUpdate: false, isDefault: false },
      { code: 'EUR', symbol: '€', name: 'Euro', rate: 0.92, autoUpdate: true, isDefault: false },
      { code: 'GBP', symbol: '£', name: 'British Pound', rate: 0.78, autoUpdate: true, isDefault: false },
      { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar', rate: 1.35, autoUpdate: true, isDefault: false },
    ]
  );

  const PRESET_CURRENCIES = [
    { code: 'INR', symbol: '₹', name: 'Indian Rupee' },
    { code: 'USD', symbol: '$', name: 'US Dollar' },
    { code: 'EUR', symbol: '€', name: 'Euro' },
    { code: 'GBP', symbol: '£', name: 'British Pound' },
    { code: 'AED', symbol: 'AED', name: 'UAE Dirham' },
    { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar' },
    { code: 'AUD', symbol: 'A$', name: 'Australian Dollar' },
    { code: 'JPY', symbol: '¥', name: 'Japanese Yen' },
    { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar' },
    { code: 'SAR', symbol: 'SAR', name: 'Saudi Riyal' },
  ];

  // Add Currency form state
  const [newCurrCode, setNewCurrCode] = useState('');
  const [newCurrSymbol, setNewCurrSymbol] = useState('');
  const [newCurrName, setNewCurrName] = useState('');
  const [newCurrRate, setNewCurrRate] = useState('1.0');

  const handleSelectDefaultPreset = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    const found = PRESET_CURRENCIES.find((c) => c.code === val);
    if (found) {
      setDefaultCode(found.code);
      setDefaultSymbol(found.symbol);
      updateCurrenciesDefault(found.code, found.symbol, found.name);
    }
  };

  const updateCurrenciesDefault = (code: string, symbol: string, name?: string) => {
    setCurrencies((prev) => {
      const exists = prev.some((c) => c.code === code);
      if (!exists) {
        return [
          ...prev.map((c) => ({ ...c, isDefault: false })),
          { code, symbol, name: name || code, rate: 1.0, autoUpdate: false, isDefault: true },
        ];
      }
      return prev.map((c) => ({
        ...c,
        isDefault: c.code === code,
        symbol: c.code === code ? symbol : c.symbol,
        rate: c.code === code ? 1.0 : c.rate,
      }));
    });
  };

  const handleAddCustomCurrency = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCurrCode || !newCurrSymbol) return;
    const codeUpper = newCurrCode.trim().toUpperCase();
    if (currencies.some((c) => c.code === codeUpper)) return;

    const newEntry: CurrencySetting = {
      code: codeUpper,
      symbol: newCurrSymbol.trim(),
      name: newCurrName.trim() || codeUpper,
      rate: Number(newCurrRate) || 1.0,
      autoUpdate: false,
      isDefault: false,
    };

    setCurrencies([...currencies, newEntry]);
    setNewCurrCode('');
    setNewCurrSymbol('');
    setNewCurrName('');
    setNewCurrRate('1.0');
  };

  const handleSaveCurrencySettings = () => {
    // Ensure default currency is updated in currencies list
    let updatedList = [...currencies];
    const exists = updatedList.some((c) => c.code === defaultCode);
    if (!exists) {
      updatedList.push({
        code: defaultCode,
        symbol: defaultSymbol,
        name: defaultCode,
        rate: 1.0,
        autoUpdate: false,
        isDefault: true,
      });
    } else {
      updatedList = updatedList.map((c) => ({
        ...c,
        isDefault: c.code === defaultCode,
        symbol: c.code === defaultCode ? defaultSymbol : c.symbol,
        rate: c.code === defaultCode ? 1.0 : c.rate,
      }));
    }

    triggerSave({
      currencyCode: defaultCode,
      currencySymbol: defaultSymbol,
      onlyDefaultCurrency,
      currencies: updatedList,
      generalConfig: {
        ...(settings.generalConfig || { defaultBankAccountId: 'acc-1000', rounding: 'Round to 0.01' }),
        baseCurrency: `${defaultCode} (${defaultSymbol})`,
      },
    });
  };

  // Payment Terms state
  const [paymentTerms, setPaymentTerms] = useState<PaymentTermSetting[]>(
    settings.paymentTerms || [
      { id: 'pt-1', name: 'Due on Receipt', days: 0, isDefault: false },
      { id: 'pt-2', name: 'Net 15 Days', days: 15, isDefault: false },
      { id: 'pt-3', name: 'Net 30 Days', days: 30, isDefault: true },
      { id: 'pt-4', name: 'Net 60 Days', days: 60, isDefault: false },
    ]
  );
  const [newTermName, setNewTermName] = useState('');
  const [newTermDays, setNewTermDays] = useState('30');

  // Opening Balances state
  const [openingBalancesLocked, setOpeningBalancesLocked] = useState(settings.openingBalancesLocked ?? true);

  // Reminders state
  const [reminders, setReminders] = useState<ReminderSetting[]>(
    settings.reminders || [
      { id: 'rem-1', name: 'Upcoming Due Date (3 Days Before)', daysBeforeOrAfter: 3, type: 'before', enabled: true, subject: 'Payment Reminder: Invoice {{invoice_number}} Due Soon' },
      { id: 'rem-2', name: 'Due Date Notification (On Due Date)', daysBeforeOrAfter: 0, type: 'before', enabled: true, subject: 'Invoice {{invoice_number}} is Due Today' },
      { id: 'rem-3', name: 'Overdue Alert (7 Days Overdue)', daysBeforeOrAfter: 7, type: 'after', enabled: true, subject: 'URGENT: Invoice {{invoice_number}} Overdue' },
    ]
  );

  // Customer Portal state
  const [cpEnabled, setCpEnabled] = useState(settings.customerPortal?.enabled ?? true);
  const [cpAllowPay, setCpAllowPay] = useState(settings.customerPortal?.allowPayOnline ?? true);
  const [cpAllowEstimate, setCpAllowEstimate] = useState(settings.customerPortal?.allowAcceptEstimate ?? true);
  const [cpDomain, setCpDomain] = useState(settings.customerPortal?.domain || 'portal.apexgrowth.com');

  // Vendor Portal state
  const [vpEnabled, setVpEnabled] = useState(settings.vendorPortal?.enabled ?? true);
  const [vpAllowUpload, setVpAllowUpload] = useState(settings.vendorPortal?.allowUploadBills ?? true);
  const [vpAllowPO, setVpAllowPO] = useState(settings.vendorPortal?.allowAcceptPO ?? true);

  const handleAddPaymentTerm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTermName) return;
    const newTerm: PaymentTermSetting = {
      id: `pt-${Date.now()}`,
      name: newTermName,
      days: Number(newTermDays) || 0,
      isDefault: false,
    };
    const updated = [...paymentTerms, newTerm];
    setPaymentTerms(updated);
    triggerSave({ paymentTerms: updated });
    setNewTermName('');
    setNewTermDays('30');
  };

  return (
    <div className="space-y-6 text-xs text-slate-700">
      {successMsg && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 p-3 rounded-xl font-bold flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-emerald-600" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* General */}
      {subTab === 'general' && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Sliders className="w-5 h-5 text-blue-600" />
            <h3 className="text-sm font-bold text-slate-800">General System Configurations</h3>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-slate-600 font-bold mb-1">Default Settlement Bank Account</label>
              <select
                value={defaultBankAccountId}
                onChange={(e) => setDefaultBankAccountId(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-bold text-slate-800"
              >
                {accounts.filter((a) => a.type === 'Asset').map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    [{acc.code}] {acc.name} (${acc.balance.toLocaleString()})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-slate-600 font-bold mb-1">Base Currency Code</label>
              <input
                type="text"
                value={baseCurrency}
                onChange={(e) => setBaseCurrency(e.target.value)}
                className="w-full md:w-48 bg-slate-50 border border-slate-300 rounded-lg p-2 font-mono font-bold text-slate-800"
              />
            </div>

            <div className="pt-3 border-t border-slate-100 flex justify-end">
              <button
                onClick={() =>
                  triggerSave({
                    currencyCode: baseCurrency,
                    generalConfig: { defaultBankAccountId, baseCurrency, rounding: 'Round to 0.01' },
                  })
                }
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-5 rounded-lg transition-colors cursor-pointer"
              >
                Save General Config
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Currencies */}
      {subTab === 'currencies' && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-emerald-600" />
              <div>
                <h3 className="text-sm font-bold text-slate-800">Currency & Exchange Rate Configurations</h3>
                <p className="text-[11px] text-slate-500">Manage primary operating currency, single-currency enforcement, and foreign exchange rates.</p>
              </div>
            </div>
            <div className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-3 py-1 rounded-full text-[11px] font-extrabold flex items-center gap-1.5">
              <span>Base Currency:</span>
              <span className="font-mono text-xs">{defaultCode} ({defaultSymbol})</span>
            </div>
          </div>

          {/* Section 1: Default Currency Selection */}
          <div className="bg-slate-50/80 p-4 rounded-xl border border-slate-200 space-y-4">
            <h4 className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
              <span className="bg-blue-600 text-white rounded-full w-4 h-4 text-[10px] inline-flex items-center justify-center font-mono">1</span>
              <span>Select Primary Operating Default Currency</span>
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Preset Standard Currencies</label>
                <select
                  value={defaultCode}
                  onChange={handleSelectDefaultPreset}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2 font-bold text-slate-800 text-xs focus:ring-2 focus:ring-blue-500"
                >
                  {PRESET_CURRENCIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name} - {c.code} ({c.symbol})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Currency Symbol</label>
                <input
                  type="text"
                  value={defaultSymbol}
                  onChange={(e) => {
                    setDefaultSymbol(e.target.value);
                    updateCurrenciesDefault(defaultCode, e.target.value);
                  }}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2 font-mono font-extrabold text-slate-800 text-xs"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Currency Code</label>
                <input
                  type="text"
                  value={defaultCode}
                  onChange={(e) => {
                    const code = e.target.value.toUpperCase();
                    setDefaultCode(code);
                    updateCurrenciesDefault(code, defaultSymbol);
                  }}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2 font-mono font-extrabold text-slate-800 text-xs"
                />
              </div>
            </div>
          </div>

          {/* Section 2: "Only Use Default Currency" Toggle Feature */}
          <div className="bg-amber-50/50 border border-amber-200/80 p-4 rounded-xl space-y-2">
            <h4 className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
              <span className="bg-amber-600 text-white rounded-full w-4 h-4 text-[10px] inline-flex items-center justify-center font-mono">2</span>
              <span>Single Currency Enforcement Rule</span>
            </h4>

            <label className="flex items-start gap-3 cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={onlyDefaultCurrency}
                onChange={(e) => setOnlyDefaultCurrency(e.target.checked)}
                className="w-4 h-4 text-amber-600 rounded mt-0.5 cursor-pointer"
              />
              <div>
                <span className="font-bold text-slate-900 text-xs block">
                  Only Use Default Currency ({defaultCode} {defaultSymbol}) Across All Transactions
                </span>
                <span className="text-[11px] text-slate-600 block mt-0.5 leading-relaxed">
                  When enabled, multi-currency features are turned off. All created invoices, estimates, expenses, bills, client profiles, purchase orders, and financial statements will strictly be restricted to <strong>{defaultCode} ({defaultSymbol})</strong>.
                </span>
              </div>
            </label>
          </div>

          {/* Section 3: Currencies Table */}
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <h4 className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                <span className="bg-slate-700 text-white rounded-full w-4 h-4 text-[10px] inline-flex items-center justify-center font-mono">3</span>
                <span>Configured Currencies & Exchange Rates Table</span>
              </h4>
              <span className="text-[11px] text-slate-500 font-medium">
                {onlyDefaultCurrency ? 'Multi-currency locked to default' : 'Rates relative to Base Currency'}
              </span>
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                  <tr>
                    <th className="p-2.5">Currency Name</th>
                    <th className="p-2.5">Code</th>
                    <th className="p-2.5">Symbol</th>
                    <th className="p-2.5">Exchange Rate</th>
                    <th className="p-2.5">Auto Rate Feed</th>
                    <th className="p-2.5">Default Status</th>
                    <th className="p-2.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {currencies.map((curr, idx) => {
                    const isDef = curr.code === defaultCode;
                    return (
                      <tr key={curr.code} className={`hover:bg-slate-50 ${isDef ? 'bg-emerald-50/30' : ''}`}>
                        <td className="p-2.5 font-bold text-slate-800">{curr.name}</td>
                        <td className="p-2.5 font-mono font-bold text-blue-600">{curr.code}</td>
                        <td className="p-2.5 font-bold">{curr.symbol}</td>
                        <td className="p-2.5 font-mono">
                          <input
                            type="number"
                            step="0.001"
                            disabled={isDef || onlyDefaultCurrency}
                            value={isDef ? 1.0 : curr.rate}
                            onChange={(e) => {
                              const updated = [...currencies];
                              updated[idx].rate = Number(e.target.value);
                              setCurrencies(updated);
                            }}
                            className="w-24 bg-white border border-slate-300 rounded p-1 font-mono text-xs font-bold disabled:opacity-60 disabled:bg-slate-100"
                          />
                        </td>
                        <td className="p-2.5">
                          <input
                            type="checkbox"
                            disabled={isDef || onlyDefaultCurrency}
                            checked={curr.autoUpdate}
                            onChange={(e) => {
                              const updated = [...currencies];
                              updated[idx].autoUpdate = e.target.checked;
                              setCurrencies(updated);
                            }}
                            className="w-4 h-4 text-blue-600 rounded disabled:opacity-60"
                          />
                        </td>
                        <td className="p-2.5">
                          {isDef ? (
                            <span className="bg-emerald-100 text-emerald-800 border border-emerald-300 text-[10px] font-extrabold px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                              <CheckCircle className="w-3 h-3 text-emerald-600" /> Primary Base Default
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setDefaultCode(curr.code);
                                setDefaultSymbol(curr.symbol);
                                updateCurrenciesDefault(curr.code, curr.symbol, curr.name);
                              }}
                              className="text-blue-600 hover:underline font-bold text-[11px] cursor-pointer"
                            >
                              Set as Default
                            </button>
                          )}
                        </td>
                        <td className="p-2.5 text-right">
                          {!isDef && (
                            <button
                              type="button"
                              onClick={() => {
                                setCurrencies(currencies.filter((c) => c.code !== curr.code));
                              }}
                              className="text-rose-500 hover:text-rose-700 p-1 cursor-pointer"
                              title="Delete Currency"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Section 4: Add New Custom Currency Form */}
          {!onlyDefaultCurrency && (
            <form onSubmit={handleAddCustomCurrency} className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-3">
              <h4 className="font-bold text-slate-800 text-xs flex items-center gap-1">
                <Plus className="w-4 h-4 text-blue-600" />
                <span>Add Additional Currency to System</span>
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                <input
                  type="text"
                  placeholder="Code (e.g. AUD)"
                  value={newCurrCode}
                  onChange={(e) => setNewCurrCode(e.target.value)}
                  className="bg-white border border-slate-300 rounded p-1.5 text-xs font-mono font-bold"
                />
                <input
                  type="text"
                  placeholder="Symbol (e.g. A$)"
                  value={newCurrSymbol}
                  onChange={(e) => setNewCurrSymbol(e.target.value)}
                  className="bg-white border border-slate-300 rounded p-1.5 text-xs font-bold"
                />
                <input
                  type="text"
                  placeholder="Currency Name (e.g. Australian Dollar)"
                  value={newCurrName}
                  onChange={(e) => setNewCurrName(e.target.value)}
                  className="bg-white border border-slate-300 rounded p-1.5 text-xs font-medium"
                />
                <input
                  type="number"
                  step="0.001"
                  placeholder="Exchange Rate (e.g. 1.35)"
                  value={newCurrRate}
                  onChange={(e) => setNewCurrRate(e.target.value)}
                  className="bg-white border border-slate-300 rounded p-1.5 text-xs font-mono font-bold"
                />
              </div>
              <button
                type="submit"
                className="bg-slate-800 hover:bg-slate-900 text-white font-bold px-3 py-1.5 rounded text-xs inline-flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> Add Currency
              </button>
            </form>
          )}

          {/* Save Action */}
          <div className="pt-3 border-t border-slate-100 flex justify-end">
            <button
              onClick={handleSaveCurrencySettings}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-6 rounded-xl text-xs shadow-xs transition-colors cursor-pointer flex items-center gap-2"
            >
              <CheckCircle className="w-4 h-4" />
              <span>Save Currency Settings & Apply App-Wide</span>
            </button>
          </div>
        </div>
      )}

      {/* Payment Terms */}
      {subTab === 'payment-terms' && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Calendar className="w-5 h-5 text-indigo-600" />
            <h3 className="text-sm font-bold text-slate-800">Payment Terms Presets</h3>
          </div>

          <form onSubmit={handleAddPaymentTerm} className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-3">
            <h4 className="font-bold text-slate-800">Add New Payment Term</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input
                type="text"
                placeholder="Term Name (e.g. Net 45 Days)"
                value={newTermName}
                onChange={(e) => setNewTermName(e.target.value)}
                required
                className="bg-white border border-slate-300 rounded p-2 text-xs"
              />
              <input
                type="number"
                placeholder="Number of Days (e.g. 45)"
                value={newTermDays}
                onChange={(e) => setNewTermDays(e.target.value)}
                required
                className="bg-white border border-slate-300 rounded p-2 text-xs font-mono"
              />
            </div>
            <button
              type="submit"
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-3 py-1.5 rounded flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Save Term
            </button>
          </form>

          <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="w-full text-left">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                <tr>
                  <th className="p-2.5">Term Name</th>
                  <th className="p-2.5">Days</th>
                  <th className="p-2.5">Default</th>
                  <th className="p-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paymentTerms.map((pt) => (
                  <tr key={pt.id} className="hover:bg-slate-50">
                    <td className="p-2.5 font-bold text-slate-800">{pt.name}</td>
                    <td className="p-2.5 font-mono">{pt.days} days</td>
                    <td className="p-2.5">
                      {pt.isDefault ? (
                        <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded font-bold text-[10px]">Default</span>
                      ) : (
                        <button
                          onClick={() => {
                            const updated = paymentTerms.map((t) => ({ ...t, isDefault: t.id === pt.id }));
                            setPaymentTerms(updated);
                            triggerSave({ paymentTerms: updated });
                          }}
                          className="text-blue-600 hover:underline font-medium"
                        >
                          Set Default
                        </button>
                      )}
                    </td>
                    <td className="p-2.5 text-right">
                      <button
                        onClick={() => {
                          const updated = paymentTerms.filter((t) => t.id !== pt.id);
                          setPaymentTerms(updated);
                          triggerSave({ paymentTerms: updated });
                        }}
                        className="text-red-500 hover:text-red-700 p-1 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Opening Balances */}
      {subTab === 'opening-balances' && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Lock className="w-5 h-5 text-amber-600" />
            <h3 className="text-sm font-bold text-slate-800">Opening Balances Verification</h3>
          </div>

          <label className="flex items-center gap-3 cursor-pointer bg-slate-50 p-3 rounded-xl border border-slate-200">
            <input
              type="checkbox"
              checked={openingBalancesLocked}
              onChange={(e) => {
                setOpeningBalancesLocked(e.target.checked);
                triggerSave({ openingBalancesLocked: e.target.checked });
              }}
              className="w-4 h-4 text-blue-600 rounded"
            />
            <div>
              <span className="font-bold text-slate-800 block">Lock Opening Balances</span>
              <span className="text-[11px] text-slate-500">Prevent modification of historical opening account ledger balances</span>
            </div>
          </label>

          <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="w-full text-left">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                <tr>
                  <th className="p-2.5">Code</th>
                  <th className="p-2.5">Account Name</th>
                  <th className="p-2.5">Type</th>
                  <th className="p-2.5 text-right">Opening Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {accounts.slice(0, 8).map((acc) => (
                  <tr key={acc.id} className="hover:bg-slate-50">
                    <td className="p-2.5 font-mono">{acc.code}</td>
                    <td className="p-2.5 font-bold text-slate-800">{acc.name}</td>
                    <td className="p-2.5">{acc.type}</td>
                    <td className="p-2.5 text-right font-mono font-bold text-slate-900">
                      ${acc.balance.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Reminders */}
      {subTab === 'reminders' && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Bell className="w-5 h-5 text-rose-600" />
            <h3 className="text-sm font-bold text-slate-800">Automated Payment Reminders</h3>
          </div>

          <div className="space-y-3">
            {reminders.map((rem, idx) => (
              <div key={rem.id} className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
                <div className="flex justify-between items-center">
                  <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-800">
                    <input
                      type="checkbox"
                      checked={rem.enabled}
                      onChange={(e) => {
                        const updated = [...reminders];
                        updated[idx].enabled = e.target.checked;
                        setReminders(updated);
                      }}
                      className="w-4 h-4 text-blue-600 rounded"
                    />
                    <span>{rem.name}</span>
                  </label>
                  <span className="bg-slate-200 text-slate-700 px-2 py-0.5 rounded font-mono text-[10px]">
                    {rem.type === 'before' ? `${rem.daysBeforeOrAfter} days prior` : `${rem.daysBeforeOrAfter} days overdue`}
                  </span>
                </div>
                <input
                  type="text"
                  value={rem.subject}
                  onChange={(e) => {
                    const updated = [...reminders];
                    updated[idx].subject = e.target.value;
                    setReminders(updated);
                  }}
                  className="w-full bg-white border border-slate-300 rounded p-1.5 text-xs text-slate-800"
                />
              </div>
            ))}
          </div>

          <div className="pt-2 flex justify-end">
            <button
              onClick={() => triggerSave({ reminders })}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-5 rounded-lg cursor-pointer"
            >
              Save Reminder Schedules
            </button>
          </div>
        </div>
      )}

      {/* Customer Portal */}
      {subTab === 'customer-portal' && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Monitor className="w-5 h-5 text-blue-600" />
            <h3 className="text-sm font-bold text-slate-800">Customer Client Portal Settings</h3>
          </div>

          <div className="space-y-4">
            <label className="flex items-center gap-3 cursor-pointer bg-slate-50 p-3 rounded-xl border border-slate-200">
              <input
                type="checkbox"
                checked={cpEnabled}
                onChange={(e) => setCpEnabled(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded"
              />
              <div>
                <span className="font-bold text-slate-800 block">Enable Customer Self-Service Portal</span>
                <span className="text-[11px] text-slate-500">Allow clients to log in, view open invoices, pay online, and approve estimates</span>
              </div>
            </label>

            <div>
              <label className="block text-slate-600 font-bold mb-1">Portal Domain</label>
              <input
                type="text"
                value={cpDomain}
                onChange={(e) => setCpDomain(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-mono font-bold text-slate-800"
              />
            </div>

            <div className="space-y-2">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={cpAllowPay}
                  onChange={(e) => setCpAllowPay(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded"
                />
                <span className="font-bold text-slate-700">Allow Online Credit Card / ACH Payment in Portal</span>
              </label>

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={cpAllowEstimate}
                  onChange={(e) => setCpAllowEstimate(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded"
                />
                <span className="font-bold text-slate-700">Allow Digital Acceptance of Quotes & Estimates</span>
              </label>
            </div>

            <div className="pt-3 border-t border-slate-100 flex justify-end">
              <button
                onClick={() =>
                  triggerSave({
                    customerPortal: { enabled: cpEnabled, allowPayOnline: cpAllowPay, allowAcceptEstimate: cpAllowEstimate, domain: cpDomain },
                  })
                }
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-5 rounded-lg cursor-pointer"
              >
                Save Customer Portal Config
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Vendor Portal */}
      {subTab === 'vendor-portal' && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <ExternalLink className="w-5 h-5 text-indigo-600" />
            <h3 className="text-sm font-bold text-slate-800">Vendor Supplier Portal Settings</h3>
          </div>

          <div className="space-y-4">
            <label className="flex items-center gap-3 cursor-pointer bg-slate-50 p-3 rounded-xl border border-slate-200">
              <input
                type="checkbox"
                checked={vpEnabled}
                onChange={(e) => setVpEnabled(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded"
              />
              <div>
                <span className="font-bold text-slate-800 block">Enable Vendor Collaboration Portal</span>
                <span className="text-[11px] text-slate-500">Allow suppliers to submit bills directly, track Purchase Orders, and view payout statuses</span>
              </div>
            </label>

            <div className="space-y-2">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={vpAllowUpload}
                  onChange={(e) => setVpAllowUpload(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded"
                />
                <span className="font-bold text-slate-700">Allow Vendors to Upload Digital Invoices & Receipts</span>
              </label>

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={vpAllowPO}
                  onChange={(e) => setVpAllowPO(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded"
                />
                <span className="font-bold text-slate-700">Require Purchase Order Acceptance in Vendor Portal</span>
              </label>
            </div>

            <div className="pt-3 border-t border-slate-100 flex justify-end">
              <button
                onClick={() =>
                  triggerSave({
                    vendorPortal: { enabled: vpEnabled, allowUploadBills: vpAllowUpload, allowAcceptPO: vpAllowPO },
                  })
                }
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-5 rounded-lg cursor-pointer"
              >
                Save Vendor Portal Config
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
