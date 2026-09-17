import React, { useState, useEffect } from 'react';
import { X, FolderKanban, Lock } from 'lucide-react';
import { Client, Project } from '../../types';

export interface ProjectBillingDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (projectId: string, isBillable: boolean, markupPercentage: number) => void;
  client?: Client;
  projects: Project[];
  initialProjectId?: string;
  initialIsBillable?: boolean;
  initialMarkupPercentage?: number;
  costBasis: number;
  currencyCode?: string;
  currencySymbol?: string;
  isMobile?: boolean;
}

const PRESET_MARKUPS = [0, 10, 15, 20];

export const ProjectBillingDialog: React.FC<ProjectBillingDialogProps> = ({
  isOpen,
  onClose,
  onApply,
  client,
  projects = [],
  initialProjectId = '',
  initialIsBillable = false,
  initialMarkupPercentage = 0,
  costBasis = 0,
  currencyCode = 'INR',
  currencySymbol = '₹',
  isMobile = false,
}) => {
  const [selectedProjectId, setSelectedProjectId] = useState(initialProjectId);
  const [billable, setBillable] = useState(initialIsBillable);
  const [markup, setMarkup] = useState<number | string>(initialMarkupPercentage);

  // Sync state whenever dialog opens with new initial props
  useEffect(() => {
    if (isOpen) {
      setSelectedProjectId(initialProjectId);
      setBillable(initialIsBillable);
      setMarkup(initialMarkupPercentage !== undefined ? initialMarkupPercentage : 0);
    }
  }, [isOpen, initialProjectId, initialIsBillable, initialMarkupPercentage]);

  if (!isOpen) return null;

  const clientProjects = projects.filter(
    (p) => p.status !== 'Cancelled' && (!client?.id || !p.clientId || p.clientId === client.id)
  );

  const numMarkup = Math.max(0, Number(markup) || 0);
  const numCost = Math.max(0, Number(costBasis) || 0);
  const markupAmount = Math.round(numCost * (numMarkup / 100) * 100) / 100;
  const sellingPrice = Math.round((numCost + markupAmount) * 100) / 100;

  const handleSave = () => {
    onApply(selectedProjectId, billable, billable ? numMarkup : 0);
  };

  const clientDisplayName = client?.companyName || client?.name || 'Selected Customer';

  const content = (
    <div className="space-y-4">
      {/* Client Overview Card */}
      <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-3.5 dark:border-blue-900/40 dark:bg-blue-950/30 flex items-center justify-between">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 block">
            Customer
          </span>
          <span className="text-sm font-bold text-slate-900 dark:text-white block mt-0.5">
            {clientDisplayName}
          </span>
        </div>
        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-white dark:bg-zinc-800 text-slate-700 dark:text-slate-300 border border-slate-200/80 dark:border-zinc-700">
          {clientProjects.length} {clientProjects.length === 1 ? 'project' : 'projects'} available
        </span>
      </div>

      {/* 1. Project Selection */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label
            htmlFor="dialog-project-select"
            className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5"
          >
            <FolderKanban className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            <span>Project (Optional)</span>
          </label>
        </div>
        <select
          id="dialog-project-select"
          value={selectedProjectId}
          onChange={(e) => setSelectedProjectId(e.target.value)}
          className="w-full h-11 px-3 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm font-medium text-slate-900 dark:text-white outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-950 transition-all"
        >
          <option value="">No project (General customer expense)</option>
          {clientProjects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.code ? `${p.code} — ` : ''}{p.name}
            </option>
          ))}
        </select>
        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          Associate this expense with a specific project, or leave blank to bill directly to the customer.
        </p>
      </div>

      {/* 2. Billable to Client Toggle Switch */}
      <div className="rounded-2xl border border-slate-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-850 p-4 shadow-2xs space-y-2">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5 pr-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-slate-900 dark:text-white">
                Billable to Customer
              </span>
              {billable ? (
                <span className="text-[10px] uppercase font-black tracking-wider bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 px-2 py-0.5 rounded-full">
                  Recoverable
                </span>
              ) : (
                <span className="text-[10px] uppercase font-semibold text-slate-500 bg-slate-100 dark:bg-zinc-800 px-2 py-0.5 rounded-full">
                  Internal Cost
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Save as unbilled recoverable cost. You can pull this item directly into a customer invoice.
            </p>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={billable}
            aria-label="Billable to Client switch"
            onClick={() => setBillable(!billable)}
            className={`w-12 h-7 rounded-full p-0.5 transition-colors cursor-pointer relative shrink-0 ${
              billable ? 'bg-blue-600 dark:bg-blue-500' : 'bg-slate-300 dark:bg-zinc-700'
            }`}
          >
            <div
              className={`w-6 h-6 rounded-full bg-white shadow-md transform transition-transform ${
                billable ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>

      {/* 3. Markup & Final Customer Price (Revealed when Billable is ON) */}
      {billable && (
        <div className="rounded-2xl border border-blue-200/90 dark:border-blue-900/60 bg-blue-50/30 dark:bg-blue-950/20 p-4 space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label
                htmlFor="dialog-markup-input"
                className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-1.5"
              >
                <span>Markup Percentage</span>
              </label>
              <span className="text-xs font-bold text-blue-600 dark:text-blue-400">
                +{numMarkup}% Markup
              </span>
            </div>

            {/* Quick preset buttons */}
            <div className="grid grid-cols-4 gap-2">
              {PRESET_MARKUPS.map((preset) => {
                const isActive = numMarkup === preset && markup !== '';
                return (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setMarkup(preset)}
                    className={`py-2 px-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer border text-center ${
                      isActive
                        ? 'bg-blue-600 text-white border-blue-600 shadow-xs scale-[1.02]'
                        : 'bg-white dark:bg-zinc-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-zinc-700 hover:border-blue-300'
                    }`}
                  >
                    {preset === 0 ? '0% (Cost)' : `+${preset}%`}
                  </button>
                );
              })}
            </div>

            {/* Custom Input */}
            <div className="relative mt-2">
              <input
                id="dialog-markup-input"
                type="number"
                min="0"
                max="1000"
                step="0.5"
                placeholder="Enter custom markup %"
                value={markup}
                onChange={(e) => setMarkup(e.target.value)}
                className="w-full h-11 px-3 pr-8 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm font-semibold text-slate-900 dark:text-white outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-950"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 pointer-events-none">
                %
              </span>
            </div>
          </div>

          {/* Live Price Calculation Card */}
          <div className="rounded-xl bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800 p-3.5 space-y-2.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
              Live Billing Calculation
            </span>

            <div className="space-y-1.5 text-xs">
              <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                <span>Cost Basis (Your Cost)</span>
                <span className="font-financial font-medium text-slate-900 dark:text-white">
                  {currencySymbol} {numCost.toFixed(2)}
                </span>
              </div>
              <div className="flex items-center justify-between text-blue-600 dark:text-blue-400 font-medium">
                <span>Markup (+{numMarkup}%)</span>
                <span className="font-financial">
                  +{currencySymbol} {markupAmount.toFixed(2)}
                </span>
              </div>
              <div className="pt-2 border-t border-slate-100 dark:border-zinc-800 flex items-center justify-between text-sm font-bold text-slate-900 dark:text-white">
                <span>Customer Invoice Price</span>
                <span className="font-financial text-base text-blue-600 dark:text-blue-400">
                  {currencySymbol} {sellingPrice.toFixed(2)}
                </span>
              </div>
            </div>

            {numCost <= 0 && (
              <p className="text-[11px] italic text-amber-600 dark:text-amber-400 pt-1">
                * Note: Expense amount is currently 0.00. Enter the expense amount on the form to calculate exact figures.
              </p>
            )}
          </div>

          {/* Privacy Guarantee Badge */}
          <div className="rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/80 dark:border-emerald-900/50 p-3 flex items-start gap-2.5">
            <Lock className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <span className="text-xs font-bold text-emerald-900 dark:text-emerald-200 block">
                Customer Privacy Protection
              </span>
              <p className="text-[11px] text-emerald-800/90 dark:text-emerald-300/90 leading-relaxed">
                The customer invoice will display <strong>only the final selling price ({currencySymbol} {sellingPrice > 0 ? sellingPrice.toFixed(2) : '1,150.00'})</strong>.
                Your internal cost basis, receipt attachments, and markup percentage are private and will never appear on the customer invoice.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <>
      {isMobile ? (
        /* MOBILE VIEW: iOS-Style Slide-up Bottom Sheet */
        <div className="fixed inset-0 z-[80] flex flex-col justify-end" data-testid="project-billing-dialog-mobile">
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
            onClick={onClose}
          />
          <div className="relative z-10 max-h-[88vh] w-full rounded-t-3xl bg-[#f2f2f7] dark:bg-zinc-900 shadow-2xl flex flex-col overflow-hidden pb-6 animate-in slide-in-from-bottom duration-250">
            {/* Grabber Handle & Header */}
            <div className="pt-3 pb-3 px-5 bg-white dark:bg-[#1c1c1e] border-b border-slate-200/80 dark:border-white/10">
              <div className="w-10 h-1 rounded-full bg-slate-300 dark:bg-zinc-700 mx-auto mb-3" />
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Project & Billing
                  </h3>
                  <p className="text-xs text-slate-500">
                    Client: {clientDisplayName}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="w-7 h-7 rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-slate-300 flex items-center justify-center hover:bg-slate-200 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Scrollable Form */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {content}
            </div>

            {/* Mobile Footer Actions */}
            <div className="px-4 pt-2 bg-[#f2f2f7] dark:bg-zinc-900 flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-3 rounded-2xl bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-slate-200 font-bold text-sm transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="flex-1 py-3 rounded-2xl bg-blue-500 hover:bg-blue-600 active:scale-98 text-white font-bold text-sm shadow-xs transition-all cursor-pointer"
              >
                Apply & Save
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* DESKTOP VIEW: Centered Modal Overlay */
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4" data-testid="project-billing-dialog-desktop">
          <div
            className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900 animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-700">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400">
                  <FolderKanban className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Project & Billing Settings
                  </h3>
                  <p className="text-xs text-slate-500">
                    Configure customer billing and markup
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 cursor-pointer"
                aria-label="Close project and billing dialog"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {content}
            </div>

            {/* Desktop Footer Actions */}
            <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-6 py-3.5 dark:border-slate-700 dark:bg-slate-800/60">
              <span className="text-xs text-slate-500">
                {billable ? `Final selling price: ${currencySymbol} ${sellingPrice.toFixed(2)}` : 'Non-billable internal expense'}
              </span>
              <div className="flex gap-2.5">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  className="rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-98 px-5 py-2 text-sm font-bold text-white shadow-xs transition-all cursor-pointer"
                >
                  Apply Settings
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
