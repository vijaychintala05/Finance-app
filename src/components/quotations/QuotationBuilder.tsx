import React, { useMemo, useState } from 'react';
import { X, Save, FileSpreadsheet, AlertCircle, Loader2 } from 'lucide-react';
import { useQuotationBuilder, QuotationBuilderData } from '../../hooks/useQuotationBuilder';
import { QuotationHeaderForm } from './QuotationHeaderForm';
import { QuotationLineItems } from './QuotationLineItems';
import { QuotationTotals } from './QuotationTotals';
import { QuotationTermsSection } from './QuotationTermsSection';
import { QuickAddClientModal } from '../common/QuickAddClientModal';
import { QuickAddProjectModal } from '../common/QuickAddProjectModal';
import { ItemPicker } from './ItemPicker';
import { quotationApi } from '../../services/quotationApi';

interface QuotationBuilderProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (quotation: any) => void;
  initialQuotation?: any;
  clients: any[];
  projects: any[];
  onOpenQuickClient?: () => void;
  onOpenQuickProject?: () => void;
  onClientCreated?: (newCust: any) => void;
  onProjectCreated?: (newProj: any) => void;
  currencySymbol?: string;
  currencyCode?: string;
  customersLoading?: boolean;
  customerError?: string | null;
  projectsLoading?: boolean;
  projectError?: string | null;
  onSearchCustomers?: (query: string) => void;
}

export const QuotationBuilder: React.FC<QuotationBuilderProps> = ({
  isOpen,
  onClose,
  onSuccess,
  initialQuotation,
  clients,
  projects,
  onOpenQuickClient,
  onOpenQuickProject,
  onClientCreated,
  onProjectCreated,
  currencySymbol = '',
  currencyCode = '',
  customersLoading = false,
  customerError = null,
  projectsLoading = false,
  projectError = null,
  onSearchCustomers,
}) => {
  const [isItemPickerOpen, setIsItemPickerOpen] = useState(false);
  const [isQuickClientOpen, setIsQuickClientOpen] = useState(false);
  const [isQuickProjectOpen, setIsQuickProjectOpen] = useState(false);
  const [localAddedClients, setLocalAddedClients] = useState<any[]>([]);
  const [localAddedProjects, setLocalAddedProjects] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const initialData: Partial<QuotationBuilderData> | undefined = useMemo(() => initialQuotation
    ? ({
        id: initialQuotation.id,
        estimateNumber: initialQuotation.estimateNumber,
        customerId: initialQuotation.customerId || initialQuotation.clientId,
        customerName: initialQuotation.customerName || initialQuotation.clientName,
        projectId: initialQuotation.projectId,
        issueDate: initialQuotation.issueDate,
        expiryDate: initialQuotation.expiryDate,
        items: (initialQuotation.items || initialQuotation.lineItems || []).map((it: any, idx: number) => ({
          id: it.id || `line-init-${idx}`,
          itemId: it.itemId,
          name: it.name || it.itemName || it.description || '',
          description: it.description || '',
          hsnSac: it.hsnSac || '',
          quantity: Number(it.quantity) || 1,
          unit: it.unit || 'Pcs',
          rate: Number(it.rate || it.unitPrice || 0),
          discountPercent: Number(it.discountPercent || 0),
          discountAmount: Number(it.discountAmount || 0),
          taxRate: Number(it.taxRate || 0),
        })),
        overallDiscount: Number(initialQuotation.overallDiscount || initialQuotation.discount || 0),
        isGstInclusive: Boolean(initialQuotation.isGstInclusive),
        notes: initialQuotation.notes || 'Quotation valid for 30 days.',
        terms: initialQuotation.terms || 'Payment within 30 days of invoice issuance.',
        status: initialQuotation.status || 'DRAFT',
      })
    : undefined, [initialQuotation]);

  const builder = useQuotationBuilder(initialData);

  if (!isOpen) return null;

  const handleClose = () => {
    if (builder.isDirty) {
      const confirmDiscard = window.confirm('You have unsaved changes in this quotation. Discard changes?');
      if (!confirmDiscard) return;
    }
    onClose();
  };

  const handleSaveDraft = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!builder.customerId) {
      setErrorMessage('Please select a customer for the quotation.');
      return;
    }

    if (builder.items.length === 0) {
      setErrorMessage('Quotation must contain at least one line item.');
      return;
    }

    for (let i = 0; i < builder.items.length; i++) {
      const line = builder.items[i];
      if (!line.name || !line.name.trim()) {
        setErrorMessage(`Line ${i + 1}: Item name or title is required.`);
        return;
      }
      if (Number(line.quantity) <= 0) {
        setErrorMessage(`Line ${i + 1}: Quantity must be greater than 0.`);
        return;
      }
      if (Number(line.rate) < 0) {
        setErrorMessage(`Line ${i + 1}: Rate must be non-negative.`);
        return;
      }
    }

    setSaving(true);
    setErrorMessage(null);

    try {
      const payload = {
        customerId: builder.customerId,
        customerName: builder.customerName,
        projectId: builder.projectId || undefined,
        issueDate: builder.issueDate,
        expiryDate: builder.expiryDate,
        items: builder.items.map((it) => ({
          id: it.id,
          itemId: it.itemId,
          name: it.name,
          description: it.description,
          hsnSac: it.hsnSac,
          quantity: Number(it.quantity),
          unit: it.unit,
          rate: Number(it.rate),
          discountPercent: Number(it.discountPercent || 0),
          discountAmount: Number(it.discountAmount || 0),
          taxRate: Number(it.taxRate || 0),
        })),
        overallDiscount: Number(builder.overallDiscount || 0),
        isGstInclusive: Boolean(builder.isGstInclusive),
        notes: builder.notes,
        terms: builder.terms,
        status: builder.status || 'DRAFT',
      };

      let savedQuotation: any;
      if (initialQuotation && initialQuotation.id) {
        savedQuotation = await quotationApi.updateQuotation(initialQuotation.id, payload);
      } else {
        savedQuotation = await quotationApi.createQuotation(payload);
      }

      builder.setIsDirty(false);
      setSaving(false);
      onSuccess(savedQuotation);
    } catch (err: any) {
      setSaving(false);
      setErrorMessage(err.message || 'Failed to save quotation. Please try again.');
    }
  };

  const handleOpenQuickClient = () => {
    setIsQuickClientOpen(true);
  };

  const handleOpenQuickProject = () => {
    setIsQuickProjectOpen(true);
  };

  const handleClientCreated = (newCust: any) => {
    setLocalAddedClients((prev) => [...prev, newCust]);
    builder.setCustomerId(newCust.id);
    builder.setCustomerName(newCust.displayName || newCust.name || 'Customer');
    setIsQuickClientOpen(false);
    if (onClientCreated) onClientCreated(newCust);
  };

  const handleProjectCreated = (newProj: any) => {
    setLocalAddedProjects((prev) => [...prev, newProj]);
    builder.setProjectId(newProj.id);
    setIsQuickProjectOpen(false);
    if (onProjectCreated) onProjectCreated(newProj);
  };

  const combinedClients = [...clients];
  localAddedClients.forEach((c) => {
    if (!combinedClients.some((existing) => existing.id === c.id)) {
      combinedClients.unshift(c);
    }
  });

  const combinedProjects = [...projects];
  localAddedProjects.forEach((p) => {
    if (!combinedProjects.some((existing) => existing.id === p.id)) {
      combinedProjects.unshift(p);
    }
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50/60 dark:bg-slate-800/40">
          <div className="flex items-center space-x-2">
            <FileSpreadsheet className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <div>
              <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm sm:text-base">
                {initialQuotation ? `Edit Quotation (${builder.estimateNumber})` : 'Professional Quotation Builder'}
              </h3>
              <p className="text-[11px] text-slate-500">
                Authoritative PostgreSQL backend quotation builder
              </p>
            </div>
          </div>

          <button
            onClick={handleClose}
            aria-label="Close modal"
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSaveDraft} className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-6">
          {errorMessage && (
            <div className="p-3 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-xl text-xs text-rose-600 dark:text-rose-400 flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Quotation Header */}
          <QuotationHeaderForm
            estimateNumber={builder.estimateNumber}
            customerId={builder.customerId}
            setCustomerId={builder.setCustomerId}
            setCustomerName={builder.setCustomerName}
            clients={combinedClients}
            onOpenQuickClient={handleOpenQuickClient}
            projectId={builder.projectId}
            setProjectId={builder.setProjectId}
            projects={combinedProjects}
            onOpenQuickProject={handleOpenQuickProject}
            issueDate={builder.issueDate}
            setIssueDate={builder.setIssueDate}
            expiryDate={builder.expiryDate}
            setExpiryDate={builder.setExpiryDate}
            isGstInclusive={builder.isGstInclusive}
            setIsGstInclusive={builder.setIsGstInclusive}
            customersLoading={customersLoading}
            customerError={customerError}
            projectsLoading={projectsLoading}
            projectError={projectError}
            onSearchCustomers={onSearchCustomers}
          />

          {/* Line Items */}
          <QuotationLineItems
            items={builder.items}
            onUpdateLine={builder.updateLine}
            onRemoveLine={builder.removeLine}
            onDuplicateLine={builder.duplicateLine}
            onAddCustomLine={builder.addCustomLine}
            onOpenItemPicker={() => setIsItemPickerOpen(true)}
            currencySymbol={currencySymbol}
            isGstInclusive={builder.isGstInclusive}
          />

          {/* Totals & Notes */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-2">
            <div className="lg:col-span-2">
              <QuotationTermsSection
                notes={builder.notes}
                setNotes={builder.setNotes}
                terms={builder.terms}
                setTerms={builder.setTerms}
              />
            </div>
            <div>
              <QuotationTotals
                totals={builder.totals}
                overallDiscount={builder.overallDiscount}
                setOverallDiscount={builder.setOverallDiscount}
                currencySymbol={currencySymbol}
                isGstInclusive={builder.isGstInclusive}
              />
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex justify-end items-center space-x-3">
            <button
              type="button"
              onClick={handleClose}
              disabled={saving}
              className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={saving}
              className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-5 py-2.5 rounded-xl text-xs font-semibold flex items-center space-x-1.5 shadow-sm transition-all cursor-pointer"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Saving Quotation...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>Save Draft</span>
                </>
              )}
            </button>
          </div>
        </form>

        {/* Item Master Picker */}
        <ItemPicker
          isOpen={isItemPickerOpen}
          onClose={() => setIsItemPickerOpen(false)}
          onSelectItem={(item) => builder.addSavedItem(item)}
          currencySymbol={currencySymbol}
        />

        {/* Quick Add Client Modal */}
        {isQuickClientOpen && (
          <QuickAddClientModal
            isOpen={isQuickClientOpen}
            onClose={() => setIsQuickClientOpen(false)}
            currencyCode={currencyCode}
            onClientCreated={handleClientCreated}
          />
        )}

        {/* Quick Add Project Modal */}
        {isQuickProjectOpen && (
          <QuickAddProjectModal
            isOpen={isQuickProjectOpen}
            onClose={() => setIsQuickProjectOpen(false)}
            clients={combinedClients}
            currencyCode={currencyCode}
            onProjectCreated={handleProjectCreated}
          />
        )}
      </div>
    </div>
  );
};
