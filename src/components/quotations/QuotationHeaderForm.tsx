import React, { useState, useEffect, useRef } from 'react';
import { User, Building, Plus, Calendar, FileText, AlertCircle, Loader2, Search } from 'lucide-react';

interface Client {
  id: string;
  name?: string;
  displayName?: string;
  companyName?: string;
  legalName?: string;
  customerCode?: string;
  code?: string;
  email?: string;
  phone?: string;
  gstin?: string;
  taxId?: string;
}

interface Project {
  id: string;
  name: string;
  code?: string;
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
  customersLoading?: boolean;
  customerError?: string | null;
  projectsLoading?: boolean;
  projectError?: string | null;
  onSearchCustomers?: (query: string) => void;
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
  customersLoading = false,
  customerError = null,
  projectsLoading = false,
  projectError = null,
  onSearchCustomers,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const requestIdRef = useRef(0);

  const [prevSelectedClient, setPrevSelectedClient] = useState<Client | null>(null);

  useEffect(() => {
    if (customerId) {
      const found = clients.find((c) => c.id === customerId);
      if (found) {
        setPrevSelectedClient(found);
      }
    }
  }, [customerId, clients]);

  const selectedClient = clients.find((c) => c.id === customerId) || prevSelectedClient;

  const getClientDisplayName = (c: Client) => {
    return c.displayName || c.name || c.companyName || c.legalName || 'Customer';
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value;
    setSearchQuery(q);
    if (onSearchCustomers) {
      const currentReqId = ++requestIdRef.current;
      setTimeout(() => {
        if (currentReqId === requestIdRef.current) {
          onSearchCustomers(q);
        }
      }, 300);
    }
  };

  const filteredClients = clients.filter((c) => {
    if (!searchQuery.trim()) return true;
    const term = searchQuery.toLowerCase();
    const nameStr = (c.displayName || c.name || c.companyName || c.legalName || '').toLowerCase();
    const codeStr = (c.customerCode || c.code || '').toLowerCase();
    const emailStr = (c.email || '').toLowerCase();
    const phoneStr = (c.phone || '').toLowerCase();
    const gstinStr = (c.gstin || c.taxId || '').toLowerCase();
    return (
      nameStr.includes(term) ||
      codeStr.includes(term) ||
      emailStr.includes(term) ||
      phoneStr.includes(term) ||
      gstinStr.includes(term)
    );
  });

  const displayClients = [...filteredClients];
  if (selectedClient && !displayClients.some((c) => c.id === selectedClient.id)) {
    displayClients.unshift(selectedClient);
  }

  const isDateInvalid = Boolean(issueDate && expiryDate && new Date(expiryDate) < new Date(issueDate));

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

          {/* Search Filter input */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search by customer name, code, GSTIN, email..."
              value={searchQuery}
              onChange={handleSearchChange}
              className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl pl-8 pr-3 py-1.5 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 mb-1"
            />
          </div>

          {customersLoading ? (
            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl text-blue-600 dark:text-blue-400 flex items-center space-x-2">
              <Loader2 className="w-4 h-4 animate-spin shrink-0" />
              <span>Loading customers...</span>
            </div>
          ) : customerError ? (
            <div className="p-3 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-xl text-rose-600 dark:text-rose-400 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>Unable to load customers. {customerError}</span>
              </div>
              <button
                type="button"
                onClick={onOpenQuickClient}
                className="text-xs font-bold underline cursor-pointer"
              >
                + Quick Add
              </button>
            </div>
          ) : (
            <>
              <select
                id="customer-select"
                value={customerId}
                onChange={(e) => {
                  const val = e.target.value;
                  setCustomerId(val);
                  const cli = clients.find((c) => c.id === val);
                  if (cli) setCustomerName(getClientDisplayName(cli));
                }}
                className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
              >
                <option value="">Select a customer...</option>
                {displayClients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {getClientDisplayName(c)} {c.companyName && c.companyName !== getClientDisplayName(c) ? `(${c.companyName})` : ''}
                  </option>
                ))}
              </select>

              {displayClients.length === 0 && (
                <div className="p-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl text-amber-700 dark:text-amber-400 text-xs flex items-center justify-between mt-1">
                  <span>No customers found.</span>
                  <button
                    type="button"
                    onClick={onOpenQuickClient}
                    className="font-bold underline cursor-pointer"
                  >
                    + Quick Add Customer
                  </button>
                </div>
              )}
            </>
          )}

          {selectedClient && (
            <div className="text-[11px] text-slate-500 dark:text-slate-400 space-x-3 pt-0.5">
              <span>{getClientDisplayName(selectedClient)}</span>
              {selectedClient.email && <span>• {selectedClient.email}</span>}
              {(selectedClient.gstin || selectedClient.taxId) && <span>• GSTIN: {selectedClient.gstin || selectedClient.taxId}</span>}
            </div>
          )}
        </div>

        {/* Project Link */}
        <div className="space-y-1.5">
          <div className="flex justify-between items-center">
            <label htmlFor="project-select" className="font-semibold text-slate-700 dark:text-slate-300 flex items-center space-x-1">
              <Building className="w-3.5 h-3.5 text-slate-400" />
              <span>Project (Optional)</span>
            </label>
            <button
              type="button"
              onClick={onOpenQuickProject}
              className="text-emerald-600 dark:text-emerald-400 font-bold hover:underline text-[11px] flex items-center space-x-0.5 cursor-pointer"
            >
              <Plus className="w-3 h-3" />
              <span>New Project</span>
            </button>
          </div>

          {projectsLoading ? (
            <div className="p-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl text-blue-600 dark:text-blue-400 flex items-center space-x-2 text-xs">
              <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
              <span>Loading projects...</span>
            </div>
          ) : projectError ? (
            <div className="p-2 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-xl text-rose-600 dark:text-rose-400 flex items-center space-x-1 text-xs">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>Unable to load projects: {projectError}</span>
            </div>
          ) : (
            <select
              id="project-select"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">No linked project</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} {p.code ? `(${p.code})` : ''}
                </option>
              ))}
            </select>
          )}
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
          <label htmlFor="issue-date-input" className="font-semibold text-slate-700 dark:text-slate-300 flex items-center space-x-1">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <span>Issue Date</span>
          </label>
          <input
            id="issue-date-input"
            type="date"
            value={issueDate}
            onChange={(e) => setIssueDate(e.target.value)}
            required
            className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2 text-slate-800 dark:text-slate-200"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="expiry-date-input" className="font-semibold text-slate-700 dark:text-slate-300 flex items-center space-x-1">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <span>Expiry / Valid Until</span>
          </label>
          <input
            id="expiry-date-input"
            type="date"
            value={expiryDate}
            onChange={(e) => setExpiryDate(e.target.value)}
            required
            className={`w-full bg-white dark:bg-slate-800 border ${
              isDateInvalid ? 'border-rose-500 ring-1 ring-rose-500' : 'border-slate-200 dark:border-slate-700'
            } rounded-xl p-2 text-slate-800 dark:text-slate-200`}
          />
          {isDateInvalid && (
            <p className="text-[11px] text-rose-600 flex items-center space-x-1 mt-0.5">
              <AlertCircle className="w-3 h-3 shrink-0" />
              <span>Expiry date cannot precede issue date</span>
            </p>
          )}
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
