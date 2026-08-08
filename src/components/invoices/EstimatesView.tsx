import React, { useState } from 'react';
import { FileCheck, FileSpreadsheet, Plus, Search } from 'lucide-react';
import { Estimate, Invoice } from '../../types';
import { useBooks } from '../../context/BooksContext';
import { formatCurrency, formatDate, getStatusBadgeStyle } from '../../utils/formatters';
import { InvoicePreviewModal } from './InvoicePreviewModal';
import { EstimateDetailsModal } from './EstimateDetailsModal';
import { QuickAddClientModal } from '../common/QuickAddClientModal';
import { QuickAddProjectModal } from '../common/QuickAddProjectModal';

export const EstimatesView: React.FC = () => {
  const { estimates, clients, projects, settings, addEstimate, convertEstimateToInvoice } =
    useBooks();

  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [previewInvoice, setPreviewInvoice] = useState<Invoice | null>(null);
  const [viewingEstimate, setViewingEstimate] = useState<Estimate | null>(null);

  const [isQuickClientOpen, setIsQuickClientOpen] = useState(false);
  const [isQuickProjectOpen, setIsQuickProjectOpen] = useState(false);

  const [clientId, setClientId] = useState(clients[0]?.id || '');
  const [projectId, setProjectId] = useState('');
  const [amount, setAmount] = useState('25000');
  const [description, setDescription] = useState('Scope proposal & milestone quotation');

  const filteredEstimates = estimates.filter(
    (e) =>
      e.estimateNumber.toLowerCase().includes(search.toLowerCase()) ||
      e.clientName.toLowerCase().includes(search.toLowerCase())
  );

  const handleCreateEstimate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientId) return;

    const cli = clients.find((c) => c.id === clientId);
    const prj = projects.find((p) => p.id === projectId);
    const numAmt = Number(amount) || 0;
    const taxAmt = Math.round(numAmt * (settings.defaultTaxRate / 100));

    addEstimate({
      clientId,
      clientName: cli?.name || 'Client',
      projectId: projectId || undefined,
      issueDate: new Date().toISOString().split('T')[0],
      expiryDate: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
      items: [
        {
          id: `eitem-${Date.now()}`,
          description,
          accountId: 'acc-4000',
          quantity: 1,
          unitPrice: numAmt,
          taxRate: settings.defaultTaxRate,
          amount: numAmt,
        },
      ],
      subtotal: numAmt,
      taxTotal: taxAmt,
      totalAmount: numAmt + taxAmt,
      status: 'Sent',
      notes: 'Estimate valid for 30 days.',
    });

    setIsModalOpen(false);
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center space-x-2">
            <FileSpreadsheet className="w-6 h-6 text-blue-600" />
            <span>Quotes & Estimates</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Send client proposals and convert accepted quotes into sales invoices with 1-click
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl text-xs font-semibold flex items-center space-x-1.5 shadow-sm transition-all cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>New Quote</span>
        </button>
      </div>

      {/* Search */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex items-center">
        <div className="relative w-full max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search estimate #, client..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 pl-9 pr-3 py-2 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Estimates Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 uppercase text-[10px] tracking-wider border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="p-3 pl-4">Quote #</th>
                <th className="p-3">Client</th>
                <th className="p-3">Issue Date</th>
                <th className="p-3">Expiry Date</th>
                <th className="p-3">Total Amount</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-right pr-4">Convert Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredEstimates.map((est) => (
                <tr
                  key={est.id}
                  onClick={() => setViewingEstimate(est)}
                  className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors cursor-pointer"
                >
                  <td className="p-3 pl-4 font-mono font-bold text-blue-600 dark:text-blue-400">
                    {est.estimateNumber}
                  </td>
                  <td className="p-3 font-semibold text-slate-800 dark:text-slate-200">
                    {est.clientName}
                  </td>
                  <td className="p-3 text-slate-500">{formatDate(est.issueDate)}</td>
                  <td className="p-3 text-slate-500">{formatDate(est.expiryDate)}</td>
                  <td className="p-3 font-bold text-slate-900 dark:text-slate-100">
                    {formatCurrency(est.totalAmount, settings.currencySymbol)}
                  </td>
                  <td className="p-3">
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded border font-semibold ${getStatusBadgeStyle(
                        est.status
                      )}`}
                    >
                      {est.status}
                    </span>
                  </td>
                  <td className="p-3 pr-4 text-right" onClick={(e) => e.stopPropagation()}>
                    {est.status !== 'Converted' ? (
                      <button
                        onClick={() => {
                          const inv = convertEstimateToInvoice(est.id);
                          if (inv) setPreviewInvoice(inv);
                        }}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white px-2.5 py-1 rounded text-[11px] font-semibold flex items-center space-x-1 ml-auto cursor-pointer shadow-xs"
                      >
                        <FileCheck className="w-3.5 h-3.5" />
                        <span>Convert & View Bill</span>
                      </button>
                    ) : (
                      <span className="text-[11px] text-emerald-600 font-semibold">
                        ✓ Invoiced
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal to Create New Quote */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 w-full max-w-md overflow-hidden shadow-xl">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
              <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm">
                Create Client Quote / Estimate
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="p-1 text-slate-400">
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateEstimate} className="p-5 space-y-4 text-xs">
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-slate-600 dark:text-slate-300 font-medium">
                    Select Client
                  </label>
                  <button
                    type="button"
                    onClick={() => setIsQuickClientOpen(true)}
                    className="text-emerald-600 dark:text-emerald-400 font-bold hover:underline text-[11px] flex items-center space-x-0.5 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    <span>New Client</span>
                  </button>
                </div>
                <select
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  required
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-slate-800 dark:text-slate-200"
                >
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.companyName} ({c.name})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-slate-600 dark:text-slate-300 font-medium">
                    Link Project (Optional)
                  </label>
                  <button
                    type="button"
                    onClick={() => setIsQuickProjectOpen(true)}
                    className="text-blue-600 dark:text-blue-400 font-bold hover:underline text-[11px] flex items-center space-x-0.5 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    <span>New Project</span>
                  </button>
                </div>
                <select
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-slate-800 dark:text-slate-200"
                >
                  <option value="">-- No Project --</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      [{p.code}] {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-600 dark:text-slate-300 font-medium mb-1">
                  Proposal Scope / Item Detail
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  required
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-slate-800 dark:text-slate-200"
                />
              </div>

              <div>
                <label className="block text-slate-600 dark:text-slate-300 font-medium mb-1">
                  Quoted Subtotal Amount ($)
                </label>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-slate-800 dark:text-slate-200 font-bold"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-semibold shadow-sm cursor-pointer"
                >
                  Save Quote
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <InvoicePreviewModal
        invoice={previewInvoice}
        onClose={() => setPreviewInvoice(null)}
      />

      <EstimateDetailsModal
        isOpen={!!viewingEstimate}
        onClose={() => setViewingEstimate(null)}
        estimate={viewingEstimate}
        onConverted={(inv) => {
          setViewingEstimate(null);
          setPreviewInvoice(inv);
        }}
      />

      <QuickAddClientModal
        isOpen={isQuickClientOpen}
        onClose={() => setIsQuickClientOpen(false)}
        onClientCreated={(newCli) => {
          setClientId(newCli.id);
        }}
      />

      <QuickAddProjectModal
        isOpen={isQuickProjectOpen}
        onClose={() => setIsQuickProjectOpen(false)}
        defaultClientId={clientId}
        onProjectCreated={(newPrj) => {
          setProjectId(newPrj.id);
          if (newPrj.clientId) {
            setClientId(newPrj.clientId);
          }
        }}
      />
    </div>
  );
};
