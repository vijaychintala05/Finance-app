import React, { useState, useEffect, useRef } from 'react';
import { FileCheck, FileSpreadsheet, Plus, Search, Loader2, Edit3, AlertCircle } from 'lucide-react';
import { Estimate, Invoice } from '../../types';
import { useBooks } from '../../context/BooksContext';
import { formatCurrency, formatDate, getStatusBadgeStyle } from '../../utils/formatters';
import { InvoicePreviewModal } from './InvoicePreviewModal';
import { EstimateDetailsModal } from './EstimateDetailsModal';
import { QuickAddClientModal } from '../common/QuickAddClientModal';
import { QuickAddProjectModal } from '../common/QuickAddProjectModal';
import { QuotationBuilder } from '../quotations/QuotationBuilder';
import { quotationApi } from '../../services/quotationApi';
import { customerApi } from '../../services/customerApi';

interface EstimatesViewProps {
  autoOpenCreateModal?: boolean;
  onModalClosed?: () => void;
  selectedEntityId?: string;
  onSelectedEntityClosed?: () => void;
}

export const EstimatesView: React.FC<EstimatesViewProps> = ({
  autoOpenCreateModal,
  onModalClosed,
  selectedEntityId,
  onSelectedEntityClosed,
}) => {
  const { settings } = useBooks();

  const [backendQuotations, setBackendQuotations] = useState<any[]>([]);
  const [backendCustomers, setBackendCustomers] = useState<any[]>([]);
  const [backendProjects, setBackendProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [customerError, setCustomerError] = useState<string | null>(null);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [projectError, setProjectError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const customerReqSeqRef = useRef(0);

  const [search, setSearch] = useState('');
  const [isBuilderOpen, setIsBuilderOpen] = useState(false);
  const [editingQuotation, setEditingQuotation] = useState<any | null>(null);

  const [previewInvoice, setPreviewInvoice] = useState<Invoice | null>(null);
  const [viewingEstimate, setViewingEstimate] = useState<any | null>(null);

  const [isQuickClientOpen, setIsQuickClientOpen] = useState(false);
  const [isQuickProjectOpen, setIsQuickProjectOpen] = useState(false);

  // Load real backend quotations with search debounce
  const loadQuotations = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await quotationApi.listQuotations(search);
      setBackendQuotations(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load quotations from server');
    } finally {
      setLoading(false);
    }
  };

  // Separate backend customer loading with stale response sequence protection
  const loadCustomers = async (searchQuery?: string) => {
    const currentSeq = ++customerReqSeqRef.current;
    setCustomersLoading(true);
    setCustomerError(null);
    try {
      const custs = await customerApi.listCustomers(searchQuery);
      if (currentSeq === customerReqSeqRef.current) {
        setBackendCustomers(custs);
      }
    } catch (err: any) {
      if (currentSeq === customerReqSeqRef.current) {
        setCustomerError(err.message || 'Unable to load customers from server');
      }
    } finally {
      if (currentSeq === customerReqSeqRef.current) {
        setCustomersLoading(false);
      }
    }
  };

  // Separate backend project loading
  const loadProjects = async () => {
    setProjectsLoading(true);
    setProjectError(null);
    try {
      const projs = await customerApi.listProjects();
      setBackendProjects(projs);
    } catch (err: any) {
      setProjectError(err.message || 'Unable to load projects from server');
    } finally {
      setProjectsLoading(false);
    }
  };

  useEffect(() => {
    loadCustomers();
    loadProjects();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadQuotations();
    }, search ? 300 : 0);

    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (autoOpenCreateModal) {
      setEditingQuotation(null);
      setIsBuilderOpen(true);
      if (onModalClosed) onModalClosed();
    }
  }, [autoOpenCreateModal, onModalClosed]);

  useEffect(() => {
    if (selectedEntityId && backendQuotations.length > 0) {
      const found = backendQuotations.find(
        (e) => e.id === selectedEntityId || e.estimateNumber === selectedEntityId
      );
      if (found) {
        setViewingEstimate(found);
      }
    }
  }, [selectedEntityId, backendQuotations]);

  const handleConvert = async (est: any, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      const result = await quotationApi.convertQuotationToInvoice(est.id);
      if (result) {
        setPreviewInvoice({
          id: result.id,
          invoiceNumber: result.invoiceNumber,
          clientId: result.customerId || result.clientId,
          clientName: result.customerName || result.clientName,
          issueDate: result.issueDate,
          dueDate: result.dueDate,
          items: (result.lineItems || []).map((it: any, i: number) => ({
            id: it.id || `inv-item-${i}`,
            description: it.description || it.name || '',
            accountId: 'acc-4000',
            quantity: it.quantity || 1,
            unitPrice: it.unitPrice || it.rate || 0,
            taxRate: it.taxRate || 0,
            amount: it.amount || (it.quantity * it.unitPrice) || 0,
          })),
          subtotal: result.subtotal,
          taxTotal: result.taxTotal,
          totalAmount: result.totalAmount,
          paidAmount: result.paidAmount || 0,
          balance: result.totalAmount - (result.paidAmount || 0),
          status: result.status || 'Unpaid',
          notes: result.notes,
        });
        await loadQuotations();
      }
    } catch (err: any) {
      alert(`Conversion failed: ${err.message}`);
    }
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
          onClick={() => {
            setEditingQuotation(null);
            setIsBuilderOpen(true);
          }}
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

      {/* Error Message */}
      {error && (
        <div className="p-4 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-xl text-xs text-rose-600 dark:text-rose-400 flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Estimates Table / States */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
        {loading ? (
          <div className="py-16 text-center text-slate-400 flex flex-col items-center space-y-2">
            <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
            <span className="text-xs">Loading production quotations...</span>
          </div>
        ) : backendQuotations.length === 0 ? (
          <div className="py-16 text-center text-slate-400 space-y-3">
            <p className="text-sm font-medium">No quotations yet</p>
            <button
              onClick={() => {
                setEditingQuotation(null);
                setIsBuilderOpen(true);
              }}
              className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl text-xs font-semibold inline-flex items-center space-x-1.5 shadow-sm transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Create your first quotation</span>
            </button>
          </div>
        ) : (
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
                  <th className="p-3 text-right pr-4">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {backendQuotations.map((est) => (
                  <tr
                    key={est.id}
                    onClick={() => setViewingEstimate(est)}
                    className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors cursor-pointer"
                  >
                    <td className="p-3 pl-4 font-mono font-bold text-blue-600 dark:text-blue-400">
                      {est.estimateNumber}
                    </td>
                    <td className="p-3 font-semibold text-slate-800 dark:text-slate-200">
                      {est.customerName || est.clientName}
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
                      <div className="flex items-center justify-end space-x-2">
                        {est.status === 'DRAFT' && (
                          <button
                            onClick={() => {
                              setEditingQuotation(est);
                              setIsBuilderOpen(true);
                            }}
                            className="p-1 text-slate-400 hover:text-blue-600 transition-colors"
                            title="Edit Draft"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                        )}
                        {est.status !== 'CONVERTED' && est.status !== 'Converted' ? (
                          <button
                            onClick={(e) => handleConvert(est, e)}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white px-2.5 py-1 rounded text-[11px] font-semibold flex items-center space-x-1 ml-auto cursor-pointer shadow-xs"
                          >
                            <FileCheck className="w-3.5 h-3.5" />
                            <span>Convert to Invoice</span>
                          </button>
                        ) : (
                          <span className="text-[11px] text-emerald-600 font-semibold">
                            ✓ Invoiced
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Production Quotation Builder Modal */}
      {isBuilderOpen && (
        <QuotationBuilder
          isOpen={isBuilderOpen}
          onClose={() => {
            setIsBuilderOpen(false);
            setEditingQuotation(null);
          }}
          onSuccess={(savedQuotation) => {
            setIsBuilderOpen(false);
            setEditingQuotation(null);
            loadQuotations();
          }}
          initialQuotation={editingQuotation}
          clients={backendCustomers}
          projects={backendProjects}
          onOpenQuickClient={() => setIsQuickClientOpen(true)}
          onOpenQuickProject={() => setIsQuickProjectOpen(true)}
          currencySymbol={settings.currencySymbol}
          customersLoading={customersLoading}
          customerError={customerError}
        />
      )}

      {/* Estimate Details Modal */}
      {viewingEstimate && (
        <EstimateDetailsModal
          isOpen={!!viewingEstimate}
          onClose={() => {
            setViewingEstimate(null);
            if (onSelectedEntityClosed) onSelectedEntityClosed();
          }}
          estimate={{
            id: viewingEstimate.id,
            estimateNumber: viewingEstimate.estimateNumber,
            clientId: viewingEstimate.customerId || viewingEstimate.clientId || '',
            clientName: viewingEstimate.customerName || viewingEstimate.clientName || 'Customer',
            projectId: viewingEstimate.projectId,
            issueDate: viewingEstimate.issueDate,
            expiryDate: viewingEstimate.expiryDate,
            items: (viewingEstimate.items || viewingEstimate.lineItems || []).map((it: any, idx: number) => ({
              id: it.id || `view-item-${idx}`,
              description: it.name || it.itemName || it.description || 'Line Item',
              accountId: 'acc-4000',
              quantity: Number(it.quantity) || 1,
              unitPrice: Number(it.rate || it.unitPrice || 0),
              taxRate: Number(it.taxRate || 0),
              amount: Number(it.lineTotal || it.amount || (it.quantity * it.rate) || 0),
            })),
            subtotal: viewingEstimate.subtotal,
            taxTotal: viewingEstimate.taxTotal,
            totalAmount: viewingEstimate.totalAmount,
            status: viewingEstimate.status,
            notes: viewingEstimate.notes,
          }}
          onConverted={(inv) => {
            setViewingEstimate(null);
            setPreviewInvoice(inv);
            loadQuotations();
          }}
        />
      )}

      {/* Invoice Preview Modal */}
      {previewInvoice && (
        <InvoicePreviewModal
          isOpen={!!previewInvoice}
          onClose={() => setPreviewInvoice(null)}
          invoice={previewInvoice}
        />
      )}

      {/* Quick Add Client Modal */}
      {isQuickClientOpen && (
        <QuickAddClientModal
          isOpen={isQuickClientOpen}
          onClose={() => setIsQuickClientOpen(false)}
          onClientCreated={(newCust) => {
            loadCustomers();
            loadProjects();
          }}
        />
      )}

      {/* Quick Add Project Modal */}
      {isQuickProjectOpen && (
        <QuickAddProjectModal
          isOpen={isQuickProjectOpen}
          onClose={() => setIsQuickProjectOpen(false)}
          clients={backendCustomers}
          onProjectCreated={(newProj) => {
            loadCustomers();
            loadProjects();
          }}
        />
      )}
    </div>
  );
};
