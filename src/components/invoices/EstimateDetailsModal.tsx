import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Calendar,
  FileCheck,
  FileSpreadsheet,
  Printer,
  User,
  X,
  Loader2,
  AlertCircle,
  Edit3,
  Building,
  Mail,
  Phone,
  MapPin,
  Tag,
  Percent,
} from 'lucide-react';
import { quotationApi } from '../../services/quotationApi';
import { formatCurrency, formatDate, getStatusBadgeStyle } from '../../utils/formatters';

export interface EstimateDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  quotationId?: string | null;
  estimate?: any | null;
  onConverted?: (inv: any) => void;
  onEditDraft?: (quotation: any) => void;
  currencySymbol?: string;
}

const formatAddress = (addr: any): string => {
  if (!addr) return '';
  if (typeof addr === 'string') return addr;
  if (typeof addr === 'object') {
    const parts = [addr.street, addr.city, addr.state, addr.pincode || addr.zipCode, addr.country].filter(Boolean);
    return parts.join(', ');
  }
  return '';
};

export const EstimateDetailsModal: React.FC<EstimateDetailsModalProps> = ({
  isOpen,
  onClose,
  quotationId,
  estimate,
  onConverted,
  onEditDraft,
  currencySymbol = '₹',
}) => {
  const [quotation, setQuotation] = useState<any | null>(estimate || null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [converting, setConverting] = useState<boolean>(false);
  const [convertError, setConvertError] = useState<string | null>(null);

  // Close on Escape key press
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Fetch authoritative quotation snapshot from server on open
  useEffect(() => {
    if (!isOpen) return;
    const targetId = quotationId || estimate?.id;

    if (!targetId) {
      setQuotation(estimate || null);
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError(null);
    setConvertError(null);

    quotationApi
      .getQuotation(targetId)
      .then((data) => {
        if (isMounted) {
          setQuotation(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          // If fetch fails but estimate snapshot was passed, fallback to estimate snapshot while showing alert
          if (estimate) {
            setQuotation(estimate);
          }
          setError(err.message || 'Failed to load authoritative quotation details from server');
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, quotationId, estimate]);

  if (!isOpen) return null;

  const isConverted = quotation?.status?.toUpperCase() === 'CONVERTED';
  const isDraft = quotation?.status?.toUpperCase() === 'DRAFT';

  const handleConvert = async () => {
    if (!quotation?.id || isConverted || converting) return;

    setConverting(true);
    setConvertError(null);

    try {
      const resultingInvoice = await quotationApi.convertQuotationToInvoice(quotation.id);
      
      // Update local status representation to CONVERTED
      setQuotation((prev: any) => ({
        ...prev,
        status: 'CONVERTED',
      }));

      if (onConverted) {
        onConverted(resultingInvoice);
      }
    } catch (err: any) {
      setConvertError(err.message || 'Failed to convert quotation to invoice. Please try again.');
    } finally {
      setConverting(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const items = quotation?.items || quotation?.lineItems || [];
  const customerSnap = quotation?.customerSnapshot || {};
  const customerName =
    quotation?.customerName ||
    quotation?.clientName ||
    customerSnap?.displayName ||
    customerSnap?.companyName ||
    customerSnap?.name ||
    'Customer';

  const billingAddr = formatAddress(customerSnap?.billingAddress || customerSnap?.address);

  // Line item total calculation summary helper
  let calculatedLineDiscountsTotal = 0;
  items.forEach((it: any) => {
    const qty = Math.max(0, Number(it.quantity) || 0);
    const rate = Math.max(0, Number(it.rate ?? it.unitPrice) || 0);
    const gross = qty * rate;
    let discAmt = Math.max(0, Number(it.discountAmount) || 0);
    if (discAmt === 0 && it.discountPercent && Number(it.discountPercent) > 0) {
      discAmt = Math.round(gross * (Number(it.discountPercent) / 100) * 100) / 100;
    }
    calculatedLineDiscountsTotal += discAmt;
  });

  const overallDiscount = Math.max(0, Number(quotation?.overallDiscount ?? quotation?.discount) || 0);
  const subtotal = Number(quotation?.subtotal || 0);
  const taxableTotal = Math.max(0, subtotal - overallDiscount);
  const taxTotal = Number(quotation?.taxTotal || 0);
  const grandTotal = Number(quotation?.totalAmount || 0);

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 z-50 animate-fade-in overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-3xl w-full overflow-hidden shadow-2xl border border-slate-200 dark:border-slate-800 my-auto flex flex-col max-h-[92vh]">
        {/* TOP HEADER BAR */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 sticky top-0 z-10 shrink-0">
          <div className="flex items-center space-x-3">
            <button
              onClick={onClose}
              aria-label="Close modal"
              className="p-1.5 rounded-xl hover:bg-slate-200/60 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 cursor-pointer transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 flex items-center space-x-2">
                <FileSpreadsheet className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                <span>Quotation Commercial Summary</span>
              </h3>
              <p className="text-[11px] text-slate-500">
                Authoritative PostgreSQL quotation snapshot
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handlePrint}
              aria-label="Print Quote Summary"
              title="Print Summary"
              className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center space-x-1.5 transition-colors cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5 text-slate-500" />
              <span className="hidden sm:inline">Print Summary</span>
            </button>

            <button
              onClick={onClose}
              aria-label="Close modal"
              className="p-1.5 rounded-xl hover:bg-slate-200/60 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* CONTENT CONTAINER */}
        <div className="p-4 sm:p-6 space-y-6 overflow-y-auto flex-1">
          {/* LOADING STATE */}
          {loading && (
            <div className="py-12 text-center text-slate-400 flex flex-col items-center space-y-2">
              <Loader2 className="w-7 h-7 animate-spin text-blue-600" />
              <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                Loading authoritative quotation details...
              </span>
            </div>
          )}

          {/* FETCH ERROR BANNER */}
          {error && (
            <div className="p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-2xl text-xs text-rose-600 dark:text-rose-400 flex items-center justify-between gap-3">
              <div className="flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
              <button
                onClick={() => {
                  const targetId = quotationId || estimate?.id;
                  if (targetId) {
                    setLoading(true);
                    setError(null);
                    quotationApi.getQuotation(targetId).then((data) => {
                      setQuotation(data);
                      setLoading(false);
                    }).catch((err) => {
                      setError(err.message || 'Retry failed');
                      setLoading(false);
                    });
                  }
                }}
                className="px-2.5 py-1 bg-rose-100 dark:bg-rose-900/50 hover:bg-rose-200 dark:hover:bg-rose-900 text-rose-700 dark:text-rose-300 font-semibold rounded-lg shrink-0 cursor-pointer"
              >
                Retry
              </button>
            </div>
          )}

          {/* CONVERSION ERROR BANNER */}
          {convertError && (
            <div className="p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-2xl text-xs text-rose-600 dark:text-rose-400 flex items-center justify-between gap-3 animate-fade-in">
              <div className="flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{convertError}</span>
              </div>
              <button
                onClick={handleConvert}
                className="px-2.5 py-1 bg-rose-600 text-white font-semibold rounded-lg hover:bg-rose-700 shrink-0 cursor-pointer"
              >
                Retry Conversion
              </button>
            </div>
          )}

          {!loading && quotation && (
            <>
              {/* QUOTATION HEADER CARD */}
              <div className="bg-slate-50/80 dark:bg-slate-800/40 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded border border-blue-200 dark:border-blue-800">
                      Quotation Reference
                    </span>
                    {quotation.revisionNumber > 0 && (
                      <span className="text-[10px] font-bold text-slate-500 bg-slate-200 dark:bg-slate-700 px-1.5 py-0.5 rounded">
                        Rev #{quotation.revisionNumber}
                      </span>
                    )}
                  </div>

                  <h2 className="text-xl sm:text-2xl font-mono font-black text-slate-900 dark:text-slate-100 tracking-tight mt-1">
                    {quotation.estimateNumber}
                  </h2>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 font-medium mt-1">
                    <span className="flex items-center space-x-1">
                      <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>Issued: {formatDate(quotation.issueDate)}</span>
                    </span>
                    <span className="flex items-center space-x-1">
                      <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>Expires: {formatDate(quotation.expiryDate)}</span>
                    </span>
                  </div>
                </div>

                <div className="flex flex-col items-start sm:items-end space-y-2">
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-extrabold border ${getStatusBadgeStyle(
                      quotation.status
                    )}`}
                  >
                    {quotation.status}
                  </span>

                  {quotation.isGstInclusive && (
                    <span className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/50 px-2 py-0.5 rounded-lg border border-blue-200 dark:border-blue-900">
                      Prices include GST
                    </span>
                  )}
                </div>
              </div>

              {/* COMMERCIAL ENTITIES GRID: CUSTOMER SNAPSHOT & PROJECT */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                {/* CUSTOMER SNAPSHOT CARD */}
                <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2.5 shadow-xs">
                  <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                    <span className="font-extrabold uppercase text-[10px] tracking-wider text-slate-500 flex items-center space-x-1">
                      <User className="w-3.5 h-3.5 text-blue-600" />
                      <span>Customer Details</span>
                    </span>
                    {customerSnap?.gstin && (
                      <span className="font-mono text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-1.5 py-0.5 rounded font-bold">
                        GSTIN: {customerSnap.gstin}
                      </span>
                    )}
                  </div>

                  <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                    {customerName}
                  </h4>

                  <div className="space-y-1.5 text-slate-600 dark:text-slate-400">
                    {customerSnap?.email && (
                      <div className="flex items-center space-x-2 text-[11px]">
                        <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="truncate">{customerSnap.email}</span>
                      </div>
                    )}

                    {customerSnap?.phone && (
                      <div className="flex items-center space-x-2 text-[11px]">
                        <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>{customerSnap.phone}</span>
                      </div>
                    )}

                    {billingAddr && (
                      <div className="flex items-start space-x-2 text-[11px] pt-1">
                        <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                        <span>{billingAddr}</span>
                      </div>
                    )}

                    {customerSnap?.placeOfSupply && (
                      <div className="text-[10px] text-slate-500 font-medium pt-1">
                        Place of Supply: <span className="font-semibold text-slate-700 dark:text-slate-300">{customerSnap.placeOfSupply}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* PROJECT & METADATA CARD */}
                <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2.5 shadow-xs flex flex-col justify-between">
                  <div className="space-y-2.5">
                    <div className="border-b border-slate-100 dark:border-slate-800 pb-2">
                      <span className="font-extrabold uppercase text-[10px] tracking-wider text-slate-500 flex items-center space-x-1">
                        <Building className="w-3.5 h-3.5 text-blue-600" />
                        <span>Linked Project & Context</span>
                      </span>
                    </div>

                    {quotation.projectId ? (
                      <div>
                        <p className="text-[10px] text-slate-400 font-medium">Project Identifier</p>
                        <p className="font-bold text-slate-800 dark:text-slate-200 text-xs mt-0.5">
                          {quotation.projectId}
                        </p>
                      </div>
                    ) : (
                      <p className="text-slate-400 text-xs italic">No project linked to quote</p>
                    )}

                    {quotation.validityDays && (
                      <p className="text-slate-500 text-[11px]">
                        Validity Period: <span className="font-semibold text-slate-800 dark:text-slate-200">{quotation.validityDays} Days</span>
                      </p>
                    )}
                  </div>

                  {quotation.isGstInclusive && (
                    <div className="p-2.5 bg-blue-50/70 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900 rounded-xl text-[11px] text-blue-700 dark:text-blue-300 font-medium">
                      Prices include GST. Tax is extracted during billing.
                    </div>
                  )}
                </div>
              </div>

              {/* LINE ITEMS CONTAINER */}
              <div className="space-y-3">
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-900 dark:text-slate-100 border-b border-slate-200 dark:border-slate-800 pb-2">
                  Quoted Line Items ({items.length})
                </h4>

                {/* DESKTOP TABLE VIEW */}
                <div className="hidden sm:block overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200 dark:border-slate-800">
                      <tr>
                        <th className="p-3 pl-4 w-8">#</th>
                        <th className="p-3">Item / Service</th>
                        <th className="p-3 w-24">HSN/SAC</th>
                        <th className="p-3 text-right w-20">Qty</th>
                        <th className="p-3 w-20">Unit</th>
                        <th className="p-3 text-right w-28">Rate</th>
                        <th className="p-3 text-right w-20">Disc %</th>
                        <th className="p-3 w-20">GST %</th>
                        <th className="p-3 text-right pr-4 min-w-[100px]">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {items.map((it: any, idx: number) => {
                        const name = it.name || it.itemName || it.description || 'Line Item';
                        const desc = it.description && it.description !== name ? it.description : '';
                        const qty = Math.max(0, Number(it.quantity) || 0);
                        const rate = Math.max(0, Number(it.rate ?? it.unitPrice) || 0);
                        const gross = qty * rate;
                        let discAmt = Math.max(0, Number(it.discountAmount) || 0);
                        if (discAmt === 0 && it.discountPercent && Number(it.discountPercent) > 0) {
                          discAmt = Math.round(gross * (Number(it.discountPercent) / 100) * 100) / 100;
                        }
                        const netLine = Math.max(0, gross - discAmt);
                        const lineTotal = Number(it.lineTotal ?? it.amount ?? netLine);

                        return (
                          <tr key={it.id || idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                            <td className="p-3 pl-4 text-slate-400 font-mono">{idx + 1}</td>
                            <td className="p-3">
                              <div className="font-semibold text-slate-800 dark:text-slate-200">{name}</div>
                              {desc && <div className="text-[11px] text-slate-400 mt-0.5">{desc}</div>}
                            </td>
                            <td className="p-3 text-slate-500 font-mono text-[11px]">{it.hsnSac || it.hsn_sac || '-'}</td>
                            <td className="p-3 text-right font-mono font-semibold text-slate-700 dark:text-slate-300">{qty}</td>
                            <td className="p-3 text-slate-500 text-[11px]">{it.unit || 'Pcs'}</td>
                            <td className="p-3 text-right font-mono text-slate-700 dark:text-slate-300">
                              {formatCurrency(rate, currencySymbol)}
                            </td>
                            <td className="p-3 text-right font-mono text-slate-500">
                              {it.discountPercent ? `${it.discountPercent}%` : '-'}
                            </td>
                            <td className="p-3 font-mono text-slate-500">
                              {it.taxRate !== undefined ? `${it.taxRate}%` : '0%'}
                            </td>
                            <td className="p-3 text-right pr-4 font-mono font-bold text-slate-900 dark:text-slate-100">
                              {formatCurrency(lineTotal, currencySymbol)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* MOBILE CARD LIST VIEW */}
                <div className="sm:hidden space-y-3">
                  {items.map((it: any, idx: number) => {
                    const name = it.name || it.itemName || it.description || 'Line Item';
                    const desc = it.description && it.description !== name ? it.description : '';
                    const qty = Math.max(0, Number(it.quantity) || 0);
                    const rate = Math.max(0, Number(it.rate ?? it.unitPrice) || 0);
                    const gross = qty * rate;
                    let discAmt = Math.max(0, Number(it.discountAmount) || 0);
                    if (discAmt === 0 && it.discountPercent && Number(it.discountPercent) > 0) {
                      discAmt = Math.round(gross * (Number(it.discountPercent) / 100) * 100) / 100;
                    }
                    const netLine = Math.max(0, gross - discAmt);
                    const lineTotal = Number(it.lineTotal ?? it.amount ?? netLine);

                    return (
                      <div
                        key={it.id || idx}
                        className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2 shadow-xs text-xs"
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="font-bold text-blue-600 dark:text-blue-400">
                              #{idx + 1} {name}
                            </span>
                            {desc && <p className="text-[11px] text-slate-400 mt-0.5">{desc}</p>}
                          </div>
                          {it.hsnSac && (
                            <span className="text-[10px] font-mono text-slate-500 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                              HSN: {it.hsnSac}
                            </span>
                          )}
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-[11px] pt-1 text-slate-600 dark:text-slate-400 border-t border-slate-100 dark:border-slate-800">
                          <div>
                            Qty: <span className="font-semibold text-slate-800 dark:text-slate-200">{qty} {it.unit || 'Pcs'}</span>
                          </div>
                          <div className="text-right">
                            Rate: <span className="font-semibold text-slate-800 dark:text-slate-200">{formatCurrency(rate, currencySymbol)}</span>
                          </div>
                          <div>
                            GST: <span className="font-semibold text-slate-800 dark:text-slate-200">{it.taxRate || 0}%</span>
                          </div>
                          <div className="text-right">
                            Disc: <span className="font-semibold text-slate-800 dark:text-slate-200">{it.discountPercent ? `${it.discountPercent}%` : '-'}</span>
                          </div>
                        </div>

                        <div className="flex justify-between items-center pt-2 border-t border-slate-100 dark:border-slate-800 font-bold">
                          <span>Line Total:</span>
                          <span className="text-slate-900 dark:text-slate-100">
                            {formatCurrency(lineTotal, currencySymbol)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* COMMERCIAL SUMMARY & TOTALS */}
              <div className="bg-slate-50/70 dark:bg-slate-800/40 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3 text-xs max-w-xs ml-auto">
                <h5 className="font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider text-[11px] border-b border-slate-200 dark:border-slate-800 pb-2">
                  Quotation Financial Summary
                </h5>

                <div className="flex justify-between items-center text-slate-600 dark:text-slate-400">
                  <span>Gross Subtotal:</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {formatCurrency(subtotal, currencySymbol)}
                  </span>
                </div>

                {calculatedLineDiscountsTotal > 0 && (
                  <div className="flex justify-between items-center text-emerald-600 dark:text-emerald-400">
                    <span>Line Discounts:</span>
                    <span className="font-semibold">
                      -{formatCurrency(calculatedLineDiscountsTotal, currencySymbol)}
                    </span>
                  </div>
                )}

                {overallDiscount > 0 && (
                  <div className="flex justify-between items-center text-emerald-600 dark:text-emerald-400">
                    <span>Overall Discount:</span>
                    <span className="font-semibold">
                      -{formatCurrency(overallDiscount, currencySymbol)}
                    </span>
                  </div>
                )}

                <div className="flex justify-between items-center text-slate-600 dark:text-slate-400 border-t border-slate-200/60 dark:border-slate-800 pt-2">
                  <span>Taxable Amount:</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {formatCurrency(taxableTotal, currencySymbol)}
                  </span>
                </div>

                <div className="flex justify-between items-center text-slate-600 dark:text-slate-400">
                  <span>GST / Tax:</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {formatCurrency(taxTotal, currencySymbol)}
                  </span>
                </div>

                <div className="flex justify-between items-center pt-3 border-t-2 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 font-extrabold text-sm">
                  <span>Grand Total:</span>
                  <span className="text-blue-600 dark:text-blue-400">
                    {formatCurrency(grandTotal, currencySymbol)}
                  </span>
                </div>
              </div>

              {/* NOTES & TERMS */}
              {(quotation.notes || quotation.terms) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs pt-2">
                  {quotation.notes && (
                    <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-1">
                      <h5 className="font-bold text-slate-700 dark:text-slate-300 uppercase text-[10px] tracking-wider">
                        Notes & Proposals
                      </h5>
                      <p className="text-slate-600 dark:text-slate-400 text-xs whitespace-pre-line">
                        {quotation.notes}
                      </p>
                    </div>
                  )}

                  {quotation.terms && (
                    <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-1">
                      <h5 className="font-bold text-slate-700 dark:text-slate-300 uppercase text-[10px] tracking-wider">
                        Terms & Conditions
                      </h5>
                      <p className="text-slate-600 dark:text-slate-400 text-xs whitespace-pre-line">
                        {quotation.terms}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* ACTION BUTTONS BAR */}
              <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-end gap-3">
                {isDraft && onEditDraft && (
                  <button
                    onClick={() => {
                      onClose();
                      onEditDraft(quotation);
                    }}
                    className="w-full sm:w-auto px-4 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-xl text-xs font-bold flex items-center justify-center space-x-1.5 transition-colors cursor-pointer border border-slate-200 dark:border-slate-700"
                  >
                    <Edit3 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    <span>Edit Draft</span>
                  </button>
                )}

                {!isConverted ? (
                  <button
                    onClick={handleConvert}
                    disabled={converting}
                    aria-label="Convert to Invoice"
                    className="w-full sm:w-auto px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center justify-center space-x-2 transition-all shadow-xs disabled:opacity-50 cursor-pointer"
                  >
                    {converting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Converting to Invoice...</span>
                      </>
                    ) : (
                      <>
                        <FileCheck className="w-4 h-4" />
                        <span>Convert to Invoice</span>
                      </>
                    )}
                  </button>
                ) : (
                  <div className="w-full sm:w-auto px-4 py-2.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 rounded-xl text-center text-xs font-bold text-emerald-700 dark:text-emerald-400 flex items-center justify-center space-x-1.5">
                    <FileCheck className="w-4 h-4 text-emerald-600" />
                    <span>✓ Quote Has Been Converted to Invoice</span>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// Export alias for clean architectural naming
export const QuotationDetailsModal = EstimateDetailsModal;
