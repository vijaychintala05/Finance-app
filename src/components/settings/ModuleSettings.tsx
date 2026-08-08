import React, { useState } from 'react';
import { Layers, Users, Box, BookOpen, Briefcase, Clock, CheckCircle } from 'lucide-react';
import { useBooks } from '../../context/BooksContext';

interface ModuleSettingsProps {
  subTab: 'mod-general' | 'mod-customers-vendors' | 'mod-items' | 'mod-accountant' | 'mod-projects' | 'mod-timesheet';
}

export const ModuleSettings: React.FC<ModuleSettingsProps> = ({ subTab }) => {
  const { settings, updateSettings } = useBooks();
  const [successMsg, setSuccessMsg] = useState('');

  const triggerSave = (newValues: Partial<typeof settings>) => {
    updateSettings(newValues);
    setSuccessMsg('Module settings saved!');
    setTimeout(() => setSuccessMsg(''), 3000);
  };

  // Customers & Vendors State
  const [cvTerms, setCvTerms] = useState(settings.customersVendorsSettings?.defaultPaymentTerms || 'Net 30');
  const [cvLimit, setCvLimit] = useState(settings.customersVendorsSettings?.creditLimitWarning || 50000);
  const [cvDupCheck, setCvDupCheck] = useState(settings.customersVendorsSettings?.duplicateCheck ?? true);

  // Items State
  const [itemSku, setItemSku] = useState(settings.itemsSettings?.enableSku ?? true);
  const [itemValuation, setItemValuation] = useState<'FIFO' | 'Weighted Average'>(settings.itemsSettings?.valuationMethod || 'FIFO');
  const [itemLowStock, setItemLowStock] = useState(settings.itemsSettings?.lowStockAlert || 10);

  // Accountant State
  const [lockDate, setLockDate] = useState(settings.accountantSettings?.lockBooksDate || '2025-12-31');
  const [strictCoa, setStrictCoa] = useState(settings.accountantSettings?.strictCoaMode ?? true);

  // Projects State
  const [hourlyRate, setHourlyRate] = useState(settings.projectsSettings?.defaultHourlyRate || 150);

  // Timesheet State
  const [tsApproval, setTsApproval] = useState(settings.timesheetSettings?.requireApproval ?? true);
  const [tsMaxHours, setTsMaxHours] = useState(settings.timesheetSettings?.maxDailyHours || 12);

  return (
    <div className="space-y-6 text-xs text-slate-700">
      {successMsg && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 p-3 rounded-xl font-bold flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-emerald-600" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Module General */}
      {subTab === 'mod-general' && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Layers className="w-5 h-5 text-blue-600" />
            <h3 className="text-sm font-bold text-slate-800">Module Preferences Overview</h3>
          </div>
          <p className="text-slate-600">
            Configure global defaults, validation rules, stock tracking thresholds, and accounting locks across all specialized functional modules.
          </p>
        </div>
      )}

      {/* Customers & Vendors */}
      {subTab === 'mod-customers-vendors' && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Users className="w-5 h-5 text-indigo-600" />
            <h3 className="text-sm font-bold text-slate-800">Customers & Vendors Module Settings</h3>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-slate-600 font-bold mb-1">Default Payment Terms for New Clients</label>
              <input
                type="text"
                value={cvTerms}
                onChange={(e) => setCvTerms(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-bold text-slate-800"
              />
            </div>

            <div>
              <label className="block text-slate-600 font-bold mb-1">Credit Limit Exceeded Warning Threshold ($)</label>
              <input
                type="number"
                value={cvLimit}
                onChange={(e) => setCvLimit(Number(e.target.value))}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-mono font-bold text-slate-800"
              />
            </div>

            <label className="flex items-center gap-2 cursor-pointer pt-2">
              <input
                type="checkbox"
                checked={cvDupCheck}
                onChange={(e) => setCvDupCheck(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded"
              />
              <span className="font-bold text-slate-700">Check for Duplicate Tax ID / Email on Client Creation</span>
            </label>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() =>
                  triggerSave({
                    customersVendorsSettings: { defaultPaymentTerms: cvTerms, creditLimitWarning: cvLimit, duplicateCheck: cvDupCheck },
                  })
                }
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-5 rounded-lg cursor-pointer"
              >
                Save Settings
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Items */}
      {subTab === 'mod-items' && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Box className="w-5 h-5 text-amber-600" />
            <h3 className="text-sm font-bold text-slate-800">Inventory & Services Item Settings</h3>
          </div>

          <div className="space-y-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={itemSku}
                onChange={(e) => setItemSku(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded"
              />
              <span className="font-bold text-slate-700">Enable Stock Keeping Unit (SKU) Identifiers</span>
            </label>

            <div>
              <label className="block text-slate-600 font-bold mb-1">Inventory Valuation Accounting Method</label>
              <select
                value={itemValuation}
                onChange={(e) => setItemValuation(e.target.value as any)}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-slate-800 font-bold"
              >
                <option value="FIFO">First In First Out (FIFO)</option>
                <option value="Weighted Average">Weighted Average Cost</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-600 font-bold mb-1">Low Stock Warning Alert Threshold (Units)</label>
              <input
                type="number"
                value={itemLowStock}
                onChange={(e) => setItemLowStock(Number(e.target.value))}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-mono font-bold text-slate-800"
              />
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() =>
                  triggerSave({
                    itemsSettings: { enableSku: itemSku, valuationMethod: itemValuation, lowStockAlert: itemLowStock },
                  })
                }
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-5 rounded-lg cursor-pointer"
              >
                Save Item Settings
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Accountant */}
      {subTab === 'mod-accountant' && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <BookOpen className="w-5 h-5 text-emerald-600" />
            <h3 className="text-sm font-bold text-slate-800">Accountant Controls & Lock Books</h3>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-slate-600 font-bold mb-1">Lock Accounting Books Closing Date</label>
              <input
                type="date"
                value={lockDate}
                onChange={(e) => setLockDate(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-mono font-bold text-slate-800"
              />
              <p className="text-[11px] text-slate-500 mt-1">No transactions prior to this date can be edited or deleted without CFO override.</p>
            </div>

            <label className="flex items-center gap-2 cursor-pointer pt-2">
              <input
                type="checkbox"
                checked={strictCoa}
                onChange={(e) => setStrictCoa(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded"
              />
              <span className="font-bold text-slate-700">Enforce Strict Chart of Accounts Sub-Type Matching</span>
            </label>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() =>
                  triggerSave({
                    accountantSettings: { lockBooksDate: lockDate, strictCoaMode: strictCoa },
                  })
                }
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-5 rounded-lg cursor-pointer"
              >
                Save Accountant Controls
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Projects */}
      {subTab === 'mod-projects' && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Briefcase className="w-5 h-5 text-indigo-600" />
            <h3 className="text-sm font-bold text-slate-800">Projects Module Settings</h3>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-slate-600 font-bold mb-1">Default Billable Client Rate ($ / hour)</label>
              <input
                type="number"
                value={hourlyRate}
                onChange={(e) => setHourlyRate(Number(e.target.value))}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-mono font-bold text-slate-800"
              />
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() =>
                  triggerSave({
                    projectsSettings: { roundingMinutes: 15, defaultHourlyRate: hourlyRate },
                  })
                }
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-5 rounded-lg cursor-pointer"
              >
                Save Project Settings
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Timesheet */}
      {subTab === 'mod-timesheet' && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Clock className="w-5 h-5 text-blue-600" />
            <h3 className="text-sm font-bold text-slate-800">Timesheet Logging Controls</h3>
          </div>

          <div className="space-y-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={tsApproval}
                onChange={(e) => setTsApproval(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded"
              />
              <span className="font-bold text-slate-700">Require Manager Approval for Time Log Submission</span>
            </label>

            <div>
              <label className="block text-slate-600 font-bold mb-1">Max Daily Loggable Hours</label>
              <input
                type="number"
                value={tsMaxHours}
                onChange={(e) => setTsMaxHours(Number(e.target.value))}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-mono font-bold text-slate-800"
              />
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() =>
                  triggerSave({
                    timesheetSettings: { requireApproval: tsApproval, maxDailyHours: tsMaxHours },
                  })
                }
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-5 rounded-lg cursor-pointer"
              >
                Save Timesheet Controls
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
