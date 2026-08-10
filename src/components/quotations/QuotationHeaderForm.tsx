import React from 'react';
import { User, Building, Plus, Calendar, FileText } from 'lucide-react';

interface Client {
  id: string;
  name: string;
  companyName?: string;
  email?: string;
  gstin?: string;
}

interface Project {
  id: string;
  name: string;
}

interface QuotationHeaderFormProps {
  estimateNumber?: string;
  customerId: string;
  setCustomerId: (id: string) => void;
  setCustomerName: (name: string) => void;
  clients: Client[];
  onOpenQuickClient: () => void;
  projectId: string;
  setProjectId: (id: string) => void;
  projects: Project[];
  onOpenQuickProject: () => void;
  issueDate: string;
  setIssueDate: (d: string) => void;
  expiryDate: string;
  setExpiryDate: (d: string) => void;
  isGstInclusive: boolean;
  setIsGstInclusive: (v: boolean) => void;
}

export const QuotationHeaderForm: React.FC<QuotationHeaderFormProps> = ({
  estimateNumber,
  customerId,
  setCustomerId,
  setCustomerName,
  clients,
  onOpenQuickClient,
  projectId,
  setProjectId,
  projects,
  onOpenQuickProject,
  issueDate,
  setIssueDate,
  expiryDate,
  setExpiryDate,
  isGstInclusive,
  setIsGstInclusive,
}) => {
  const selectedClient = clients.find((c) => c.id === customerId);

  return (
    <div className="bg-slate-50/70 dark:bg-slate-800/40 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
        {/* Customer Selection */}
        <div className="lg:col-span-2 space-y-1.5">
          <div className="flex justify-between items-center">
            <label htmlFor="customer-select" className="font-semibold text-slate-700 dark:text-slate-300 flex items-center space-x-1">
              <User className="w-3.5 h-3.5 text-blue-600" />
              <span>Customer / Client *</span>
            </label>
            <button
              type="button"
              onClick={onOpenQuickClient}
              className="text-emerald-600 dark:text-emerald-400 font-bold hover:underline text-[11px] flex items-center space-x-0.5 cursor-pointer"
            >
              <Plus className="w-3 h-3" />
              <span>New Client</span>
            </button>
          </div>
          <select
            id="customer-select"
            value={customerId}
            onChange={(e) => {
              const val = e.target.value;
              setCustomerId(val);
              const cli = clients.find((c) => c.id === val);
              if (cli) setCustomerName(cli.name || cli.companyName || '');
            }}
            required
            className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
          >
            <option value="">Select a customer...</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.companyName ? `${c.companyName} (${c.name})` : c.name}
              </option>
            ))}
          </select>

          {selectedClient && (
            <div className="text-[11px] text-slate-500 dark:text-slate-400 space-x-3 pt-0.5">
              <span>{selectedClient.companyName || selectedClient.name}</span>
              {selectedClient.email && <span>• {selectedClient.email}</span>}
              {selectedClient.gstin && <span>• GSTIN: {selectedClient.gstin}</span>}
            </div>
          )}
        </div>

        {/* Project Link */}
        <div className="space-y-1.5">
          <div className="flex justify-between items-center">
            <label className="font-semibold text-slate-700 dark:text-slate-300 flex items-center space-x-1">
              <Building className="w-3.5 h-3.5 text-slate-400" />
              <span>Project (Optional)</span>
            </label>
            <button
              type="button"
              onClick={onOpenQuickProject}
              className="text-emerald-600 dark:text-emerald-400 font-bold hover:underline text-[11px] flex items-center space-x-0.5 cursor-pointer"
            >
              <Plus className="w-3 h-3" />
              <span>New</span>
            </button>
          </div>
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">No linked project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        {/* Quotation Number */}
        <div className="space-y-1.5">
          <label className="font-semibold text-slate-700 dark:text-slate-300 flex items-center space-x-1">
            <FileText className="w-3.5 h-3.5 text-slate-400" />
            <span>Quotation #</span>
          </label>
          <input
            type="text"
            readOnly
            value={estimateNumber || 'Auto-generated on save'}
            className="w-full bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-slate-500 font-mono font-semibold"
          />
        </div>
      </div>

      {/* Date & Tax Settings */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs pt-2 border-t border-slate-200/60 dark:border-slate-800">
        <div className="space-y-1">
          <label className="font-semibold text-slate-700 dark:text-slate-300 flex items-center space-x-1">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <span>Issue Date</span>
          </label>
          <input
            type="date"
            value={issueDate}
            onChange={(e) => setIssueDate(e.target.value)}
            required
            className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2 text-slate-800 dark:text-slate-200"
          />
        </div>

        <div className="space-y-1">
          <label className="font-semibold text-slate-700 dark:text-slate-300 flex items-center space-x-1">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <span>Expiry / Valid Until</span>
          </label>
          <input
            type="date"
            value={expiryDate}
            onChange={(e) => setExpiryDate(e.target.value)}
            required
            className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2 text-slate-800 dark:text-slate-200"
          />
        </div>

        <div className="flex items-center justify-between sm:justify-start sm:space-x-3 pt-4 sm:pt-6">
          <label htmlFor="gst-inclusive-toggle" className="font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
            GST Inclusive Pricing
          </label>
          <button
            type="button"
            id="gst-inclusive-toggle"
            role="switch"
            aria-checked={isGstInclusive}
            onClick={() => setIsGstInclusive(!isGstInclusive)}
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              isGstInclusive ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-700'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-xs ring-0 transition duration-200 ease-in-out ${
                isGstInclusive ? 'translate-x-4' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>
    </div>
  );
};
