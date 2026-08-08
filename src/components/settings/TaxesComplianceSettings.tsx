import React, { useState } from 'react';
import { Calculator, FileText, Award, Plus, CheckCircle, Trash2 } from 'lucide-react';
import { useBooks } from '../../context/BooksContext';
import { TaxRateSetting } from '../../types';

interface TaxesComplianceSettingsProps {
  subTab: 'taxes' | 'direct-taxes' | 'msme';
}

export const TaxesComplianceSettings: React.FC<TaxesComplianceSettingsProps> = ({ subTab }) => {
  const { settings, updateSettings } = useBooks();
  const [successMsg, setSuccessMsg] = useState('');

  const triggerSave = (newValues: Partial<typeof settings>) => {
    updateSettings(newValues);
    setSuccessMsg('Tax & Compliance rules updated!');
    setTimeout(() => setSuccessMsg(''), 3000);
  };

  // State for Taxes
  const [taxRates, setTaxRates] = useState<TaxRateSetting[]>(
    settings.taxRates || [
      { id: 'tax-1', name: 'Standard Sales Tax (8.5%)', rate: 8.5, code: 'TAX-STD', isCompound: false },
      { id: 'tax-2', name: 'GST 18%', rate: 18.0, code: 'GST-18', isCompound: false },
      { id: 'tax-3', name: 'Reduced VAT (5%)', rate: 5.0, code: 'VAT-5', isCompound: false },
      { id: 'tax-4', name: 'Exempt / Zero Tax', rate: 0.0, code: 'TAX-0', isCompound: false },
    ]
  );
  const [newTaxName, setNewTaxName] = useState('');
  const [newTaxRate, setNewTaxRate] = useState('10.0');
  const [newTaxCode, setNewTaxCode] = useState('');

  // State for Direct Taxes
  const [tdsEnabled, setTdsEnabled] = useState(settings.directTaxes?.tdsEnabled ?? true);
  const [panNumber, setPanNumber] = useState(settings.directTaxes?.panNumber || 'AAAPA1234F');
  const [tanNumber, setTanNumber] = useState(settings.directTaxes?.tanNumber || 'SFOA12345B');
  const [defaultTdsRate, setDefaultTdsRate] = useState(String(settings.directTaxes?.defaultTdsRate || 10.0));

  // State for MSME
  const [isMsmeRegistered, setIsMsmeRegistered] = useState(settings.msme?.isRegistered ?? true);
  const [udyamNumber, setUdyamNumber] = useState(settings.msme?.udyamNumber || 'UDYAM-CA-01-0094821');
  const [msmeCategory, setMsmeCategory] = useState<'Micro' | 'Small' | 'Medium'>(settings.msme?.category || 'Small');
  const [alert45Days, setAlert45Days] = useState(settings.msme?.alert45Days ?? true);

  const handleAddTaxRate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaxName) return;
    const newTax: TaxRateSetting = {
      id: `tax-${Date.now()}`,
      name: newTaxName,
      rate: Number(newTaxRate) || 0,
      code: newTaxCode || `TAX-${Math.floor(Math.random() * 1000)}`,
      isCompound: false,
    };
    const updated = [...taxRates, newTax];
    setTaxRates(updated);
    triggerSave({ taxRates: updated });
    setNewTaxName('');
    setNewTaxRate('10.0');
    setNewTaxCode('');
  };

  const handleDeleteTaxRate = (id: string) => {
    const updated = taxRates.filter((t) => t.id !== id);
    setTaxRates(updated);
    triggerSave({ taxRates: updated });
  };

  return (
    <div className="space-y-6 text-xs text-slate-700">
      {successMsg && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 p-3 rounded-xl font-bold flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-emerald-600" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Taxes Tab */}
      {subTab === 'taxes' && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Calculator className="w-5 h-5 text-blue-600" />
            <h3 className="text-sm font-bold text-slate-800">Tax Rates & Schedules</h3>
          </div>

          <form onSubmit={handleAddTaxRate} className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-3">
            <h4 className="font-bold text-slate-800">Add New Tax Rate</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <input
                type="text"
                placeholder="Tax Name (e.g. State Sales Tax)"
                value={newTaxName}
                onChange={(e) => setNewTaxName(e.target.value)}
                required
                className="bg-white border border-slate-300 rounded p-2 text-xs font-bold"
              />
              <input
                type="number"
                step="0.01"
                placeholder="Tax Rate % (e.g. 8.5)"
                value={newTaxRate}
                onChange={(e) => setNewTaxRate(e.target.value)}
                required
                className="bg-white border border-slate-300 rounded p-2 text-xs font-mono"
              />
              <input
                type="text"
                placeholder="Tax Code (e.g. TAX-8.5)"
                value={newTaxCode}
                onChange={(e) => setNewTaxCode(e.target.value)}
                className="bg-white border border-slate-300 rounded p-2 text-xs font-mono"
              />
            </div>
            <button
              type="submit"
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-3 py-1.5 rounded flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Save Tax Rate
            </button>
          </form>

          <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="w-full text-left">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                <tr>
                  <th className="p-2.5">Tax Name</th>
                  <th className="p-2.5">Code</th>
                  <th className="p-2.5">Percentage Rate</th>
                  <th className="p-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {taxRates.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50">
                    <td className="p-2.5 font-bold text-slate-800">{t.name}</td>
                    <td className="p-2.5 font-mono">{t.code}</td>
                    <td className="p-2.5 font-mono font-bold text-blue-700">{t.rate}%</td>
                    <td className="p-2.5 text-right">
                      <button
                        onClick={() => handleDeleteTaxRate(t.id)}
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

      {/* Direct Taxes Tab */}
      {subTab === 'direct-taxes' && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <FileText className="w-5 h-5 text-indigo-600" />
            <h3 className="text-sm font-bold text-slate-800">Direct Tax, TDS & TCS Deduction Setup</h3>
          </div>

          <div className="space-y-4">
            <label className="flex items-center gap-3 cursor-pointer bg-slate-50 p-3 rounded-xl border border-slate-200">
              <input
                type="checkbox"
                checked={tdsEnabled}
                onChange={(e) => setTdsEnabled(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded"
              />
              <div>
                <span className="font-bold text-slate-800 block">Enable Automatic TDS/TCS Deductions on Vendor Payments</span>
                <span className="text-[11px] text-slate-500">Calculate tax withholding directly during bill creation and payouts</span>
              </div>
            </label>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-slate-600 font-bold mb-1">Permanent Account Number (PAN)</label>
                <input
                  type="text"
                  value={panNumber}
                  onChange={(e) => setPanNumber(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-mono font-bold text-slate-800"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-bold mb-1">Tax Deduction Account Number (TAN)</label>
                <input
                  type="text"
                  value={tanNumber}
                  onChange={(e) => setTanNumber(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-mono text-slate-800"
                />
              </div>
            </div>

            <div>
              <label className="block text-slate-600 font-bold mb-1">Default Professional Services TDS Rate (%)</label>
              <input
                type="number"
                step="0.1"
                value={defaultTdsRate}
                onChange={(e) => setDefaultTdsRate(e.target.value)}
                className="w-full md:w-48 bg-slate-50 border border-slate-300 rounded-lg p-2 font-mono font-bold text-slate-800"
              />
            </div>

            <div className="pt-3 border-t border-slate-100 flex justify-end">
              <button
                onClick={() =>
                  triggerSave({
                    directTaxes: { tdsEnabled, panNumber, tanNumber, defaultTdsRate: Number(defaultTdsRate) || 10 },
                  })
                }
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-5 rounded-lg transition-colors cursor-pointer"
              >
                Save Direct Tax Setup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MSME Settings Tab */}
      {subTab === 'msme' && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Award className="w-5 h-5 text-amber-600" />
            <h3 className="text-sm font-bold text-slate-800">MSME Enterprise & Compliance Settings</h3>
          </div>

          <div className="space-y-4">
            <label className="flex items-center gap-3 cursor-pointer bg-amber-50 p-3 rounded-xl border border-amber-200">
              <input
                type="checkbox"
                checked={isMsmeRegistered}
                onChange={(e) => setIsMsmeRegistered(e.target.checked)}
                className="w-4 h-4 text-amber-600 rounded"
              />
              <div>
                <span className="font-bold text-amber-900 block">Registered MSME Enterprise Status</span>
                <span className="text-[11px] text-amber-800">Enable 45-day payment statutory rule alerts and Udyam certification tags on client invoices</span>
              </div>
            </label>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-slate-600 font-bold mb-1">Udyam Registration Number</label>
                <input
                  type="text"
                  value={udyamNumber}
                  onChange={(e) => setUdyamNumber(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-mono font-bold text-slate-800"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-bold mb-1">Enterprise Category</label>
                <select
                  value={msmeCategory}
                  onChange={(e) => setMsmeCategory(e.target.value as any)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-slate-800 font-bold"
                >
                  <option value="Micro">Micro Enterprise</option>
                  <option value="Small">Small Enterprise</option>
                  <option value="Medium">Medium Enterprise</option>
                </select>
              </div>
            </div>

            <label className="flex items-center gap-2 cursor-pointer pt-2">
              <input
                type="checkbox"
                checked={alert45Days}
                onChange={(e) => setAlert45Days(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded"
              />
              <span className="font-bold text-slate-700">Enforce Statutory 45-Day Overdue Payment Rules & Warning Alerts</span>
            </label>

            <div className="pt-3 border-t border-slate-100 flex justify-end">
              <button
                onClick={() =>
                  triggerSave({
                    msme: { isRegistered: isMsmeRegistered, udyamNumber, category: msmeCategory, alert45Days },
                  })
                }
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-5 rounded-lg transition-colors cursor-pointer"
              >
                Save MSME Configuration
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
