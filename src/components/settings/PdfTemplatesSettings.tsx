import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  FileText,
  Star,
  CheckCircle2,
  AlertCircle,
  Building2,
  Plus,
  SlidersHorizontal,
  Eye,
  Settings,
  X,
  Palette,
  Truck,
  Receipt,
  FileSpreadsheet,
  BookOpen,
  DollarSign,
  ArrowRight,
  ShieldCheck,
  Calendar,
  CreditCard,
  Layers,
  Package,
  Clock,
  FileCheck,
  ClipboardList,
  CheckSquare,
  Tag,
  Hash,
  RotateCcw,
} from 'lucide-react';
import { useBooks } from '../../context/BooksContext';
import { apiClient } from '../../api/client';
import { formatCurrency } from '../../utils/formatters';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { DocumentTemplateCategory, DocumentTemplateConfig } from '../../types';

export interface DocumentCategoryDef {
  id: DocumentTemplateCategory;
  label: string;
  title: string;
  singular: string;
  defaultTitle: string;
  description: string;
}

export const DOCUMENT_CATEGORIES: DocumentCategoryDef[] = [
  {
    id: 'quotes',
    label: 'Quotes',
    title: 'Quote Templates',
    singular: 'Quote',
    defaultTitle: 'COMMERCIAL QUOTATION',
    description: 'Proposals, cost estimates & client formal quotes',
  },
  {
    id: 'sales-orders',
    label: 'Sales Orders',
    title: 'Sales Order Templates',
    singular: 'Sales Order',
    defaultTitle: 'SALES ORDER',
    description: 'Confirmed customer sales orders & booking confirmations',
  },
  {
    id: 'delivery-challans',
    label: 'Delivery Challans',
    title: 'Delivery Challan Templates',
    singular: 'Delivery Challan',
    defaultTitle: 'DELIVERY CHALLAN',
    description: 'Delivery challan layouts with optional dispatch details',
  },
  {
    id: 'invoices',
    label: 'Invoices',
    title: 'Invoice Templates',
    singular: 'Tax Invoice',
    defaultTitle: 'TAX INVOICE',
    description: 'Invoice layouts for customer billing documents',
  },
  {
    id: 'credit-notes',
    label: 'Credit Notes',
    title: 'Credit Note Templates',
    singular: 'Credit Note',
    defaultTitle: 'CREDIT NOTE',
    description: 'Credit notes for customer account adjustments',
  },
  {
    id: 'purchase-orders',
    label: 'Purchase Orders',
    title: 'Purchase Order Templates',
    singular: 'Purchase Order',
    defaultTitle: 'PURCHASE ORDER',
    description: 'Purchase orders and related procurement layouts',
  },
  {
    id: 'payment-receipts',
    label: 'Payment Receipts',
    title: 'Payment Receipt Templates',
    singular: 'Payment Receipt',
    defaultTitle: 'PAYMENT RECEIPT',
    description: 'Customer payment receipts and allocation summaries',
  },
  {
    id: 'customer-statements',
    label: 'Customer Statements',
    title: 'Customer Statement Templates',
    singular: 'Customer Statement',
    defaultTitle: 'STATEMENT OF ACCOUNT',
    description: 'Customer account activity and balance statements',
  },
  {
    id: 'bills',
    label: 'Bills',
    title: 'Bill Templates',
    singular: 'Vendor Bill',
    defaultTitle: 'VENDOR BILL',
    description: 'Vendor bills and payable summaries',
  },
  {
    id: 'expenses',
    label: 'Expenses',
    title: 'Expense Templates',
    singular: 'Expense Voucher',
    defaultTitle: 'EXPENSE VOUCHER',
    description: 'Expense records with available category and tax details',
  },
  {
    id: 'vendor-credits',
    label: 'Vendor Credits',
    title: 'Vendor Credit Templates',
    singular: 'Vendor Credit',
    defaultTitle: 'VENDOR CREDIT',
    description: 'Vendor credits and balance adjustments',
  },
  {
    id: 'vendor-payments',
    label: 'Vendor Payments',
    title: 'Vendor Payment Templates',
    singular: 'Payment Advice',
    defaultTitle: 'PAYMENT ADVICE',
    description: 'Vendor payment records and available bill allocations',
  },
  {
    id: 'vendor-statements',
    label: 'Vendor Statements',
    title: 'Vendor Statement Templates',
    singular: 'Vendor Statement',
    defaultTitle: 'VENDOR STATEMENT',
    description: 'Payables ledger summary and statement of vendor transactions',
  },
  {
    id: 'journals',
    label: 'Journals',
    title: 'Journal Templates',
    singular: 'Journal Voucher',
    defaultTitle: 'JOURNAL VOUCHER',
    description: 'Journal entries with account postings and debit-credit totals',
  },
];

export interface CategoryTemplateItem {
  id: string;
  name: string;
  tagline: string;
  description: string;
  badgeText: string;
  presetTitle: string;
}

export const isTemplateMatching = (id1?: string, id2?: string): boolean => {
  if (!id1 || !id2) return false;
  if (id1 === id2) return true;
  const clean1 = id1.replace(/^(quote|so|dc|inv|cn|po|rec|stmt|bill|exp|vc|vp|vs|jrn)-/, '');
  const clean2 = id2.replace(/^(quote|so|dc|inv|cn|po|rec|stmt|bill|exp|vc|vp|vs|jrn)-/, '');
  return clean1 === clean2;
};

export const CATEGORY_TEMPLATES: Record<DocumentTemplateCategory, CategoryTemplateItem[]> = {
  quotes: [
    { id: 'proposal', name: 'Standard Quote', tagline: 'Standard Header', description: 'Quote details, line items, totals and terms in the standard header layout.', badgeText: 'Standard', presetTitle: 'FORMAL ESTIMATE' },
    { id: 'commercial', name: 'Ledger Quote', tagline: 'Ledger Header', description: 'Quote details, line items, totals and terms in the ledger header layout.', badgeText: 'Ledger', presetTitle: 'COMMERCIAL QUOTATION' },
    { id: 'milestone-proposal', name: 'Proposal / Bid', tagline: 'Standard Header', description: 'Quote details, line items, totals and terms in the standard header layout.', badgeText: 'Standard', presetTitle: 'PROPOSAL / BID' },
    { id: 'compact', name: 'Compact Quote', tagline: 'Compact Header', description: 'Quote details, line items, totals and terms in the compact header layout.', badgeText: 'Compact', presetTitle: 'QUOTATION' },
  ],
  'sales-orders': [
    { id: 'confirmation', name: 'Standard Sales Order', tagline: 'Standard Header', description: 'Order lines, totals and available customer PO and delivery details in the standard header layout.', badgeText: 'Standard', presetTitle: 'SALES ORDER' },
    { id: 'commercial', name: 'Ledger Sales Order', tagline: 'Ledger Header', description: 'Order lines, totals and available customer PO and delivery details in the ledger header layout.', badgeText: 'Ledger', presetTitle: 'ORDER CONFIRMATION' },
    { id: 'fulfillment', name: 'Compact Sales Order', tagline: 'Compact Header', description: 'Order lines, totals and available customer PO and delivery details in the compact header layout.', badgeText: 'Compact', presetTitle: 'SALES ORDER' },
  ],
  'delivery-challans': [
    { id: 'dispatch', name: 'Standard Delivery Challan', tagline: 'Standard Header', description: 'Challan items, quantities and available dispatch details in the standard header layout.', badgeText: 'Standard', presetTitle: 'DELIVERY CHALLAN' },
    { id: 'packing-list', name: 'Dispatch Note', tagline: 'Standard Header', description: 'The same challan details in the standard header layout; packages can be shown or hidden.', badgeText: 'Standard', presetTitle: 'DISPATCH NOTE' },
    { id: 'jobwork', name: 'Compact Challan Layout', tagline: 'Compact Header', description: 'Challan details arranged in the compact header layout.', badgeText: 'Compact', presetTitle: 'DELIVERY CHALLAN' },
  ],
  invoices: [
    { id: 'tax-invoice', name: 'Standard Tax Invoice', tagline: 'Standard Header', description: 'Invoice lines, available tax and discount totals, amount in words, notes and organization bank details in the standard header layout.', badgeText: 'Tax Invoice', presetTitle: 'TAX INVOICE' },
    { id: 'ledger-invoice', name: 'Ledger Invoice', tagline: 'Ledger Header', description: 'Invoice details arranged in the ledger header layout.', badgeText: 'Ledger', presetTitle: 'TAX INVOICE' },
    { id: 'export', name: 'Alternate Ledger Invoice', tagline: 'Ledger Header', description: 'Invoice details in an alternate ledger composition; export-specific fields are not included.', badgeText: 'Ledger', presetTitle: 'INVOICE' },
    { id: 'pos', name: 'Compact Invoice', tagline: 'Compact Header', description: 'Invoice details arranged in the compact header layout.', badgeText: 'Compact', presetTitle: 'RETAIL INVOICE' },
  ],
  'credit-notes': [
    { id: 'statutory', name: 'Standard Credit Note', tagline: 'Formal Credit Memo', description: 'Formal credit memo with a dedicated reason panel and prominent credit value; no unsupported item or tax split is shown.', badgeText: 'Credit Memo', presetTitle: 'CREDIT NOTE' },
    { id: 'goods-return', name: 'Credit Application Ledger', tagline: 'Return Credit Ledger', description: 'Application ledger with reason, total, remaining credit and posted invoice applications; no returned-item or tax details are invented.', badgeText: 'Credit Ledger', presetTitle: 'CREDIT NOTE' },
    { id: 'adjustment', name: 'Compact Credit Note', tagline: 'Adjustment Slip', description: 'Compact value-first adjustment slip with its own reason panel and available-credit balance; no unsupported item or tax split is shown.', badgeText: 'Adjustment', presetTitle: 'CREDIT ADJUSTMENT MEMO' },
  ],
  'purchase-orders': [
    { id: 'standard-po', name: 'Standard Purchase Order', tagline: 'Standard Header', description: 'Purchase order lines and available delivery destination and date details in the standard header layout.', badgeText: 'Procurement', presetTitle: 'PURCHASE ORDER' },
    { id: 'contract-po', name: 'Ledger Purchase Order', tagline: 'Ledger Header', description: 'Purchase order details arranged in the ledger header layout.', badgeText: 'Ledger', presetTitle: 'PURCHASE ORDER' },
    { id: 'requisition', name: 'Compact Purchase Order', tagline: 'Compact Header', description: 'Purchase order details arranged in the compact header layout.', badgeText: 'Compact', presetTitle: 'PURCHASE ORDER' },
  ],
  'payment-receipts': [
    { id: 'receipt-voucher', name: 'Standard Receipt Voucher', tagline: 'Standard Header', description: 'Receipt amount, payment details and allocations in the standard header layout.', badgeText: 'Receipt', presetTitle: 'PAYMENT RECEIPT' },
    { id: 'cash-receipt', name: 'Compact Receipt Layout', tagline: 'Compact Header', description: 'Receipt details arranged in the compact header layout.', badgeText: 'Compact', presetTitle: 'PAYMENT RECEIPT' },
    { id: 'allocation-advice', name: 'Ledger Receipt Layout', tagline: 'Ledger Header', description: 'Receipt details arranged in the ledger header layout.', badgeText: 'Ledger', presetTitle: 'PAYMENT RECEIPT' },
  ],
  'customer-statements': [
    { id: 'running-ledger', name: 'Detailed Transaction Ledger', tagline: 'Ledger Header', description: 'Dated transactions with references, debit, credit, optional running balance, opening balance and closing total.', badgeText: 'Ledger', presetTitle: 'STATEMENT OF ACCOUNT' },
    { id: 'aging-statement', name: 'Receivables Activity Summary', tagline: 'Standard Header', description: 'Receivables activity totals and closing balance without a transaction table or aging buckets.', badgeText: 'Activity Summary', presetTitle: 'RECEIVABLES ACTIVITY SUMMARY' },
    { id: 'open-summary', name: 'Account Summary', tagline: 'Compact Header', description: 'Opening balance, transaction count and closing balance in an overview without a transaction table.', badgeText: 'Summary', presetTitle: 'CUSTOMER ACCOUNT SUMMARY' },
  ],  bills: [
    { id: 'bill-itc', name: 'Standard Vendor Bill', tagline: 'Standard Header', description: 'Bill lines, available tax and discount totals, total and notes in the standard header layout.', badgeText: 'Payables', presetTitle: 'VENDOR BILL VOUCHER' },
    { id: 'accrual-voucher', name: 'Ledger Vendor Bill', tagline: 'Ledger Header', description: 'Vendor bill details arranged in the ledger header layout.', badgeText: 'Ledger', presetTitle: 'VENDOR BILL' },
    { id: 'matching', name: 'Compact Vendor Bill', tagline: 'Compact Header', description: 'Vendor bill details arranged in the compact header layout.', badgeText: 'Compact', presetTitle: 'VENDOR BILL' },
  ],
  expenses: [
    { id: 'reimbursement', name: 'Standard Expense Voucher', tagline: 'Standard Header', description: 'Expense details and amount with available description, category and TDS information in the standard header layout.', badgeText: 'Standard', presetTitle: 'EXPENSE VOUCHER' },
    { id: 'petty-cash', name: 'Compact Expense Voucher', tagline: 'Compact Header', description: 'Expense details arranged in the compact header layout.', badgeText: 'Compact', presetTitle: 'EXPENSE VOUCHER' },
    { id: 'project-billable', name: 'Project Recovery Voucher', tagline: 'Client Recovery', description: 'Project and client billing status with stored expense total, client charge and markup; invoice reference appears only when linked.', badgeText: 'Recovery', presetTitle: 'PROJECT EXPENSE RECOVERY VOUCHER' },
  ],
  'vendor-credits': [
    { id: 'debit-note', name: 'Standard Vendor Credit', tagline: 'Standard Header', description: 'Vendor credit details, totals and notes with any supplied original-bill or reason details in the standard header layout.', badgeText: 'Vendor Credit', presetTitle: 'VENDOR CREDIT' },
    { id: 'purchase-return', name: 'Ledger Vendor Credit', tagline: 'Ledger Header', description: 'Vendor credit details arranged in the ledger header layout.', badgeText: 'Ledger', presetTitle: 'VENDOR CREDIT' },
    { id: 'adjustment-memo', name: 'Compact Vendor Credit', tagline: 'Compact Header', description: 'Vendor credit details arranged in the compact header layout.', badgeText: 'Compact', presetTitle: 'VENDOR CREDIT' },
  ],
  'vendor-payments': [
    { id: 'remittance-advice', name: 'Standard Vendor Payment Advice', tagline: 'Standard Header', description: 'Payment details, allocations and available settled-bill rows in the standard header layout.', badgeText: 'Remittance', presetTitle: 'PAYMENT ADVICE' },
    { id: 'cheque-disbursement', name: 'Compact Vendor Payment', tagline: 'Compact Header', description: 'Vendor payment details arranged in the compact header layout.', badgeText: 'Compact', presetTitle: 'VENDOR PAYMENT' },
    { id: 'allocation-advice', name: 'Ledger Vendor Payment Advice', tagline: 'Ledger Header', description: 'Vendor payment details arranged in the ledger header layout.', badgeText: 'Ledger', presetTitle: 'VENDOR SETTLEMENT CONFIRMATION' },
  ],
  'vendor-statements': [
    { id: 'vendor-ledger', name: 'Vendor Transaction Ledger', tagline: 'Ledger Header', description: 'Dated vendor transactions with references, debit, credit, optional running balance and opening and closing values.', badgeText: 'Ledger', presetTitle: 'VENDOR TRANSACTION LEDGER' },
    { id: 'payables-aging', name: 'Payables Activity Summary', tagline: 'Standard Header', description: 'Payables activity totals and closing balance without a transaction table or aging buckets.', badgeText: 'Activity Summary', presetTitle: 'PAYABLES ACTIVITY SUMMARY' },
    { id: 'reconciliation', name: 'Vendor Balance Overview', tagline: 'Compact Header', description: 'Opening balance, transaction count and closing balance in an overview without a transaction table.', badgeText: 'Overview', presetTitle: 'VENDOR BALANCE OVERVIEW' },
  ],  journals: [
    { id: 'general-voucher', name: 'Standard Journal Voucher', tagline: 'Standard Header', description: 'Journal account and narration lines, debit-credit totals and signature blocks in the standard header layout.', badgeText: 'Journal', presetTitle: 'JOURNAL VOUCHER' },
     { id: 'audit-voucher', name: 'Ledger Journal Voucher', tagline: 'Ledger Header', description: 'Journal details arranged in the ledger header layout.', badgeText: 'Ledger', presetTitle: 'ADJUSTING JOURNAL VOUCHER' },
    { id: 'adjustment-journal', name: 'Compact Journal Voucher', tagline: 'Compact Header', description: 'Journal details arranged in the compact header layout.', badgeText: 'Compact', presetTitle: 'LEDGER POSTING VOUCHER' },
  ],
};

export interface PdfTemplatesSettingsProps {
  onNavigateToBranding?: () => void;
}

// Keep gallery PDF work small: only cards near the viewport request a sample,
// and no more than two samples are generated at once.
let galleryPdfActiveRequests = 0;
const galleryPdfQueue: Array<() => void> = [];
const withGalleryPdfSlot = async <T,>(work: () => Promise<T>): Promise<T> => {
  if (galleryPdfActiveRequests >= 2) await new Promise<void>((resolve) => galleryPdfQueue.push(resolve));
  galleryPdfActiveRequests += 1;
  try { return await work(); }
  finally {
    galleryPdfActiveRequests -= 1;
    galleryPdfQueue.shift()?.();
  }
};

const LEGACY_UNSUPPORTED_PRESET_TITLES: Partial<Record<DocumentTemplateCategory, Record<string, string[]>>> = {
  'delivery-challans': {
    'packing-list': ['PACKING LIST & TRANSIT MANIFEST'],
    jobwork: ['JOB WORK RETURNABLE CHALLAN', 'RETURNABLE CHALLAN'],
  },
  invoices: { export: ['COMMERCIAL EXPORT INVOICE', 'COMMERCIAL INVOICE'] },
  'credit-notes': { 'goods-return': ['SALES RETURN MEMO'] },
  'purchase-orders': {
    'contract-po': ['PROCUREMENT CONTRACT ORDER'],
    requisition: ['MATERIAL REQUISITION SLIP', 'MATERIAL REQUISITION'],
  },
  'customer-statements': {
    'aging-statement': ['RECEIVABLES AGING ANALYSIS', 'RECEIVABLES ACTIVITY SUMMARY'],
    'open-summary': ['OUTSTANDING INVOICE SUMMARY'],
  },
  bills: {
    'accrual-voucher': ['ACCOUNTS PAYABLE ACCRUAL VOUCHER', 'AP ACCRUAL VOUCHER'],
    matching: ['PURCHASE MATCHING VOUCHER', 'THREE-WAY MATCH VOUCHER'],
  },
  expenses: {
    reimbursement: ['EXPENSE REIMBURSEMENT VOUCHER', 'EXPENSE CLAIM VOUCHER'],
    'petty-cash': ['PETTY CASH DISBURSEMENT SLIP', 'PETTY CASH VOUCHER'],
  },
  'payment-receipts': { 'cash-receipt': ['CASH RECEIPT SLIP'] },
  'vendor-credits': { 'debit-note': ['DEBIT NOTE'], 'purchase-return': ['PURCHASE RETURN MEMO', 'PURCHASE RETURN NOTE'] },
  'vendor-payments': { 'cheque-disbursement': ['CHEQUE DISBURSEMENT VOUCHER'] },
  'vendor-statements': {
    'payables-aging': ['PAYABLES AGING REPORT'],
    reconciliation: ['SUPPLIER RECONCILIATION STATEMENT'],
  },
  journals: {
    'audit-voucher': ['AUDIT CERTIFIED JOURNAL VOUCHER'],
    'adjustment-journal': ['ADJUSTING JOURNAL VOUCHER'],
  },
};

export const isLegacyUnsupportedPresetTitle = (
  category: DocumentTemplateCategory,
  modelId: string,
  title?: string,
): boolean => Boolean(title && LEGACY_UNSUPPORTED_PRESET_TITLES[category]?.[modelId]?.includes(title.trim().toUpperCase()));

const PdfGalleryThumbnail: React.FC<{ organizationId: string; category: DocumentTemplateCategory; template: CategoryTemplateItem; modelKey: string; fallback: React.ReactNode }> = ({ organizationId, category, template, modelKey, fallback }) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<'waiting' | 'loading' | 'ready' | 'error'>('waiting');
  const cacheKey = `${organizationId}:${category}:${template.id}:${modelKey}`;

  useEffect(() => {
    let alive = true;
    let renderTask: { cancel: () => void; promise: Promise<void> } | null = null;
    let pdfDocument: { destroy: () => Promise<void> } | null = null;
    const load = async () => {
      setState('loading');
      try {
        const result = await withGalleryPdfSlot(() => apiClient.getBlob(
          `/finance/documents/${category}/preview/pdf?templateId=${encodeURIComponent(template.id)}`,
          organizationId,
        ));
        if (result.error || !result.data) throw new Error(result.error || 'PDF unavailable');
        if (!alive) return;
        const pdfjs = await import('pdfjs-dist/build/pdf.mjs');
        pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
        const loadingTask = pdfjs.getDocument({ data: new Uint8Array(await result.data.arrayBuffer()) });
        const document = await loadingTask.promise;
        pdfDocument = document;
        if (!alive) return;
        const page = await document.getPage(1);
        const host = hostRef.current;
        const canvas = canvasRef.current;
        const context = canvas?.getContext('2d');
        if (!host || !canvas || !context) throw new Error('PDF canvas unavailable');
        const natural = page.getViewport({ scale: 1 });
        const scale = Math.min(host.clientWidth / natural.width, host.clientHeight / natural.height);
        if (!Number.isFinite(scale) || scale <= 0) throw new Error('PDF thumbnail has no display area');
        const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
        const viewport = page.getViewport({ scale: scale * pixelRatio });
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        canvas.style.width = `${viewport.width / pixelRatio}px`;
        canvas.style.height = `${viewport.height / pixelRatio}px`;
        renderTask = page.render({ canvas, canvasContext: context, viewport });
        await renderTask.promise;
        if (alive) setState('ready');
      } catch {
        if (alive) setState('error');
      } finally {
        const finishedDocument = pdfDocument;
        pdfDocument = null;
        if (finishedDocument) void finishedDocument.destroy();
      }
    };
    const node = hostRef.current;
    if (!node) return () => { alive = false; };
    if (typeof IntersectionObserver === 'undefined') void load();
    else {
      const observer = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) { observer.disconnect(); void load(); }
      }, { rootMargin: '160px' });
      observer.observe(node);
      return () => {
        alive = false;
        observer.disconnect();
        renderTask?.cancel();
        const pendingDocument = pdfDocument;
        pdfDocument = null;
        if (pendingDocument) void pendingDocument.destroy();
      };
    }
    return () => {
      alive = false;
      renderTask?.cancel();
      const pendingDocument = pdfDocument;
      pdfDocument = null;
      if (pendingDocument) void pendingDocument.destroy();
    };
  }, [cacheKey, category, organizationId, template.id]);

  return <div ref={hostRef} className="absolute inset-0 flex items-center justify-center overflow-hidden" aria-label={`${template.name} PDF thumbnail`}>
    <canvas ref={canvasRef} role="img" aria-label={`${template.name} rendered PDF page`} className={state === 'ready' ? 'block max-h-full max-w-full' : 'hidden'} />
    {state !== 'ready' && <>{fallback}{state === 'error' && <span className="absolute right-1 top-1 z-10 rounded bg-white/90 px-1 text-[9px] text-slate-500">PDF unavailable</span>}</>}
  </div>;
};

const PdfPreviewPage: React.FC<{ document: PDFDocumentProxy; pageNumber: number; title: string }> = ({ document, pageNumber, title }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [rendered, setRendered] = useState(false);

  useEffect(() => {
    let alive = true;
    let renderTask: { cancel: () => void; promise: Promise<void> } | null = null;
    const renderPage = async () => {
      const page = await document.getPage(pageNumber);
      if (!alive) return;
      const canvas = canvasRef.current;
      const context = canvas?.getContext('2d');
      if (!canvas || !context) return;
      const natural = page.getViewport({ scale: 1 });
      const availableWidth = canvas.parentElement?.clientWidth || natural.width;
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      const viewport = page.getViewport({ scale: Math.min(1, availableWidth / natural.width) * pixelRatio });
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      canvas.style.width = `${viewport.width / pixelRatio}px`;
      canvas.style.height = `${viewport.height / pixelRatio}px`;
      renderTask = page.render({ canvas, canvasContext: context, viewport });
      await renderTask.promise;
      if (alive) setRendered(true);
    };
    void renderPage().catch(() => { if (alive) setRendered(false); });
    return () => { alive = false; renderTask?.cancel(); };
  }, [document, pageNumber]);

  return <div className="w-full bg-white p-2 text-center shadow-sm" aria-label={`${title} page ${pageNumber}`}>
    {!rendered && <span className="text-xs text-slate-500">Rendering page {pageNumber}…</span>}
    <canvas ref={canvasRef} role="img" aria-label={`${title} rendered page ${pageNumber}`} className={rendered ? 'mx-auto block max-w-full' : 'hidden'} />
  </div>;
};

const FullPdfPreview: React.FC<{ blob: Blob; title: string }> = ({ blob, title }) => {
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    let loadedDocument: PDFDocumentProxy | null = null;
    setDocument(null);
    setError(false);
    const load = async () => {
      try {
        const pdfjs = await import('pdfjs-dist/build/pdf.mjs');
        pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
        const loadingTask = pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) });
        loadedDocument = await loadingTask.promise;
        if (alive) setDocument(loadedDocument);
        else void loadedDocument.destroy();
      } catch {
        if (alive) setError(true);
      }
    };
    void load();
    return () => { alive = false; if (loadedDocument) void loadedDocument.destroy(); };
  }, [blob]);

  if (error) return <div role="alert" className="p-6 text-center text-sm text-rose-700">The PDF could not be displayed. Refresh the sample to try again.</div>;
  if (!document) return <div className="p-6 text-center text-sm text-slate-500">Loading PDF pages…</div>;
  return <div className="space-y-4 p-3" aria-label={`${title} server-rendered PDF sample`}>
    {Array.from({ length: document.numPages }, (_, index) => <PdfPreviewPage key={index + 1} document={document} pageNumber={index + 1} title={title} />)}
  </div>;
};

const PDF_COLOR_THEMES = [
  { name: 'Classic', primary: '#1e40af', accent: '#0f172a' },
  { name: 'Teal', primary: '#0f766e', accent: '#134e4a' },
  { name: 'Copper', primary: '#9a3412', accent: '#431407' },
  { name: 'Violet', primary: '#6d28d9', accent: '#312e81' },
  { name: 'Graphite', primary: '#334155', accent: '#0f172a' },
] as const;

const CategoryIcon: React.FC<{ category: DocumentTemplateCategory; active: boolean }> = ({ category, active }) => {
  const iconClass = `shrink-0 ${active ? 'text-blue-100' : 'text-slate-400 group-hover:text-blue-600 dark:group-hover:text-blue-400'}`;
  const iconProps = { size: 15, 'aria-hidden': true as const, className: iconClass };
  switch (category) {
    case 'quotes': return <FileText {...iconProps} />;
    case 'sales-orders': return <ClipboardList {...iconProps} />;
    case 'delivery-challans': return <Truck {...iconProps} />;
    case 'invoices': return <Receipt {...iconProps} />;
    case 'credit-notes':
    case 'vendor-credits': return <RotateCcw {...iconProps} />;
    case 'purchase-orders': return <Package {...iconProps} />;
    case 'payment-receipts':
    case 'vendor-payments': return <DollarSign {...iconProps} />;
    case 'customer-statements':
    case 'vendor-statements': return <FileSpreadsheet {...iconProps} />;
    case 'bills': return <FileCheck {...iconProps} />;
    case 'expenses': return <CreditCard {...iconProps} />;
    case 'journals': return <BookOpen {...iconProps} />;
  }
};

export const PdfTemplatesSettings: React.FC<PdfTemplatesSettingsProps> = ({
  onNavigateToBranding,
}) => {
  const { currentOrg, settings, updateSettings, refreshOrganizations } = useBooks();
  const activeOrganizationIdRef = useRef(currentOrg.id);
  activeOrganizationIdRef.current = currentOrg.id;
  const organizationGenerationRef = useRef(0);
  const previewSelectionRef = useRef(0);
  const generationOrganizationIdRef = useRef(currentOrg.id);
  if (generationOrganizationIdRef.current !== currentOrg.id) {
    generationOrganizationIdRef.current = currentOrg.id;
    organizationGenerationRef.current += 1;
  }
  const isActiveOrganizationRequest = (organizationId: string, generation: number) => activeOrganizationIdRef.current === organizationId && organizationGenerationRef.current === generation;

  const [activeCategory, setActiveCategory] = useState<DocumentTemplateCategory>('quotes');
  const [categorySearch, setCategorySearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'default' | 'custom'>('all');
  const [loading, setLoading] = useState(true);
  const [savingDefault, setSavingDefault] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Modal / Drawer state for customizing PDF options
  const [isOptionsOpen, setIsOptionsOpen] = useState(false);
  const [optionsActiveTab, setOptionsActiveTab] = useState<'properties' | 'fields' | 'footer'>('properties');
  const [selectedTemplateForCustomizing, setSelectedTemplateForCustomizing] = useState<string | null>(null);
  const [optionsDraft, setOptionsDraft] = useState<DocumentTemplateConfig>({});
  const [optionsOrganizationId, setOptionsOrganizationId] = useState<string | null>(null);
  const [savingOptions, setSavingOptions] = useState(false);
  const [templateModelsByCategory, setTemplateModelsByCategory] = useState<Record<string, Array<{ id: string; modelId?: string; configuration?: DocumentTemplateConfig }>>>({});

  // Full-Screen Preview Modal
  const [fullPreviewTemplate, setFullPreviewTemplate] = useState<CategoryTemplateItem | null>(null);
  const [fullPreviewOrganizationId, setFullPreviewOrganizationId] = useState<string | null>(null);
  const [liveDocuments, setLiveDocuments] = useState<Array<{ id: string; label: string; date: string; status: string }>>([]);
  const [selectedLiveDocumentId, setSelectedLiveDocumentId] = useState('');
  const [loadingLiveDocuments, setLoadingLiveDocuments] = useState(false);
  const [openingLivePdf, setOpeningLivePdf] = useState(false);
  const [openingSamplePdf, setOpeningSamplePdf] = useState(false);
  const [samplePdfBlob, setSamplePdfBlob] = useState<Blob | null>(null);
  const samplePreviewRequestRef = useRef(0);
  const [restoringDefault, setRestoringDefault] = useState(false);

  // Brand tokens from context
  const primaryColor = settings.branding?.primaryColor || '#1e40af';
  const accentColor = settings.branding?.accentColor || '#0f172a';
  const logoUrl = settings.branding?.logoUrl || '';

  const activeCategoryDef =
    DOCUMENT_CATEGORIES.find((c) => c.id === activeCategory) || DOCUMENT_CATEGORIES[0];

  const categoryTemplates = CATEGORY_TEMPLATES[activeCategory] || CATEGORY_TEMPLATES.quotes;

  // Document templates map from settings
  const docTemplatesMap: Record<string, DocumentTemplateConfig> = settings.documentTemplates || {};
  const currentCategoryConfig: DocumentTemplateConfig =
    docTemplatesMap[activeCategory] || {
      defaultTemplate: categoryTemplates[0]?.id || 'standard',
      templateTitle: activeCategoryDef.defaultTitle,
      exportFileNamePattern: `%{${activeCategoryDef.singular.replace(/\s+/g, '')}Number}_%{PartyName}`,
      showHsnSac: true,
      showDiscount: true,
      showTaxBreakdown: true,
      showBankDetails: true,
      showShippingAddress: true,
      showVehicleDetails: true,
      showEWayBill: true,
      showReceiverAck: true,
      showInvoicesSettled: true,
      showThreeTierSignatures: true,
      showRunningBalance: true,
      signatoryTitle: settings.branding?.authorizedSignatoryTitle || 'Authorized Signatory',
      termsAndConditions:
        settings.branding?.termsAndConditions ||
        'Payment is due within payment terms. Late payments subject to statutory interest.',
      footerNote:
        settings.branding?.footerNote ||
        'Thank you for your business. For questions, please reach out to our accounts team.',
    };

  const activeDefaultTemplateId =
    currentCategoryConfig.defaultTemplate || categoryTemplates[0]?.id || 'standard';

  const loadTemplateModels = useCallback(async (category: DocumentTemplateCategory) => {
    const organizationId = currentOrg.id;
    const generation = organizationGenerationRef.current;
    const result = await apiClient.get<{ templates?: Array<{ id: string; modelId?: string; configuration?: DocumentTemplateConfig }> }>(
      `/finance/documents/${category}/templates`,
      organizationId,
    );
    if (result.error) throw new Error(result.error);
    const templates = result.data?.templates || [];
    if (activeOrganizationIdRef.current === organizationId && organizationGenerationRef.current === generation) {
      setTemplateModelsByCategory((current) => ({ ...current, [category]: templates }));
    }
    return templates;
  }, [currentOrg.id]);

  useEffect(() => {
    let mounted = true;
    loadTemplateModels(activeCategory).catch((err: any) => {
      if (mounted) setErrorMsg(err?.message || 'Failed to load template configurations.');
    });
    return () => { mounted = false; };
  }, [activeCategory, loadTemplateModels]);

  useEffect(() => {
    setTemplateModelsByCategory({});
    setOptionsDraft({});
    setOptionsOrganizationId(null);
    setSelectedTemplateForCustomizing(null);
    setIsOptionsOpen(false);
    setFullPreviewTemplate(null);
    setFullPreviewOrganizationId(null);
    setSamplePdfBlob(null);
    setLiveDocuments([]);
    setSelectedLiveDocumentId('');
    setErrorMsg(null);
    setToastMsg(null);
    setSavingDefault(null);
    setSavingOptions(false);
    setRestoringDefault(false);
    setLoadingLiveDocuments(false);
    previewSelectionRef.current += 1;
    samplePreviewRequestRef.current += 1;
    setOpeningLivePdf(false);
    setOpeningSamplePdf(false);
    setLoading(true);
  }, [currentOrg.id]);
  // Load authoritative document templates from the active organization.
  useEffect(() => {
    let mounted = true;
    const organizationId = currentOrg.id;
    const generation = organizationGenerationRef.current;
    const isCurrent = () => mounted
      && activeOrganizationIdRef.current === organizationId
      && organizationGenerationRef.current === generation;
    const fetchOrgProfile = async () => {
      setLoading(true);
      try {
        const res = await apiClient.get<any>('/organizations/current', organizationId);
        if (!isCurrent()) return;
        const prof = res.data?.profile;
        if (prof) {
          let dt = prof.documentTemplates;
          if (typeof dt === 'string') {
            try { dt = JSON.parse(dt); } catch { dt = {}; }
          }
          if (dt && typeof dt === 'object') updateSettings({ documentTemplates: dt });
        }
      } catch (err: any) {
        if (isCurrent()) console.error('Failed to load document templates:', err);
      } finally {
        if (isCurrent()) setLoading(false);
      }
    };
    void fetchOrgProfile();
    return () => { mounted = false; };
  }, [currentOrg.id]);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 4000);
  };

  const handleOpenFullPreview = async (template: CategoryTemplateItem) => {
    const organizationId = currentOrg.id;
    const generation = organizationGenerationRef.current;
    const previewSelection = ++previewSelectionRef.current;
    const sampleRequest = ++samplePreviewRequestRef.current;
    setFullPreviewTemplate(template);
    setFullPreviewOrganizationId(organizationId);
    setLiveDocuments([]);
    setSelectedLiveDocumentId('');
    setLoadingLiveDocuments(true);
    setSamplePdfBlob(null);
    setOpeningSamplePdf(true);
    void Promise.resolve().then(() => apiClient.getBlob(
      `/finance/documents/${activeCategory}/preview/pdf?templateId=${encodeURIComponent(template.id)}`,
      organizationId,
    )).then((result) => {
      if (!isActiveOrganizationRequest(organizationId, generation) || previewSelection !== previewSelectionRef.current || sampleRequest !== samplePreviewRequestRef.current) return;
      if (result.error || !result.data) throw new Error(result.error || 'Could not generate sample preview PDF.');
      setSamplePdfBlob(result.data);
    }).catch((err: any) => {
      if (isActiveOrganizationRequest(organizationId, generation) && previewSelection === previewSelectionRef.current && sampleRequest === samplePreviewRequestRef.current) setErrorMsg(err?.message || 'Could not generate sample preview PDF.');
    }).finally(() => {
      if (isActiveOrganizationRequest(organizationId, generation) && previewSelection === previewSelectionRef.current && sampleRequest === samplePreviewRequestRef.current) setOpeningSamplePdf(false);
    });
    try {
      const result = await apiClient.get<{ documents?: Array<{ id: string; label: string; date: string; status: string }> }>(
        `/finance/documents/${activeCategory}/recent`, organizationId,
      );
      if (!isActiveOrganizationRequest(organizationId, generation) || previewSelection !== previewSelectionRef.current) return;
      if (result.error) throw new Error(result.error);
      const documents = result.data?.documents || [];
      setLiveDocuments(documents);
      setSelectedLiveDocumentId(documents[0]?.id || '');
    } catch (err: any) {
      if (isActiveOrganizationRequest(organizationId, generation) && previewSelection === previewSelectionRef.current) setErrorMsg(err?.message || 'Could not load recent documents for a live PDF preview.');
    } finally {
      if (isActiveOrganizationRequest(organizationId, generation) && previewSelection === previewSelectionRef.current) setLoadingLiveDocuments(false);
    }
  };

  const handleOpenLivePdf = async () => {
    if (!fullPreviewTemplate || !selectedLiveDocumentId) return;
    const organizationId = currentOrg.id;
    const generation = organizationGenerationRef.current;
    const previewSelection = previewSelectionRef.current;
    setOpeningLivePdf(true);
    try {
      const result = await apiClient.getBlob(
        `/finance/documents/${activeCategory}/${selectedLiveDocumentId}/pdf?preview=true&templateId=${encodeURIComponent(fullPreviewTemplate.id)}`,
        organizationId,
      );
      if (!isActiveOrganizationRequest(organizationId, generation) || previewSelection !== previewSelectionRef.current) return;
      if (result.error || !result.data) throw new Error(result.error || 'Could not generate the live PDF.');
      const url = URL.createObjectURL(result.data);
      window.open(url, '_blank', 'noopener,noreferrer');
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err: any) {
      if (isActiveOrganizationRequest(organizationId, generation) && previewSelection === previewSelectionRef.current) setErrorMsg(err?.message || 'Could not generate the live PDF.');
    } finally {
      if (isActiveOrganizationRequest(organizationId, generation) && previewSelection === previewSelectionRef.current) setOpeningLivePdf(false);
    }
  };

  const handleOpenSamplePdf = async () => {
    if (!fullPreviewTemplate) return;
    const organizationId = currentOrg.id;
    const generation = organizationGenerationRef.current;
    const sampleRequest = ++samplePreviewRequestRef.current;
    setOpeningSamplePdf(true);
    try {
      const result = await apiClient.getBlob(
        `/finance/documents/${activeCategory}/preview/pdf?templateId=${encodeURIComponent(fullPreviewTemplate.id)}`,
        organizationId,
      );
      if (!isActiveOrganizationRequest(organizationId, generation) || sampleRequest !== samplePreviewRequestRef.current) return;
      if (result.error || !result.data) throw new Error(result.error || 'Could not generate sample preview PDF.');
      setSamplePdfBlob(result.data);
    } catch (err: any) {
      if (isActiveOrganizationRequest(organizationId, generation) && sampleRequest === samplePreviewRequestRef.current) setErrorMsg(err?.message || 'Could not generate sample preview PDF.');
    } finally {
      if (isActiveOrganizationRequest(organizationId, generation) && sampleRequest === samplePreviewRequestRef.current) setOpeningSamplePdf(false);
    }
  };

  // Restore built-in default template and options
  const handleRestoreDefault = async () => {
    if (!window.confirm(`Restore built-in default template and configuration for ${activeCategoryDef.label}? Any custom overrides will be reset.`)) return;
    const organizationId = currentOrg.id;
    const generation = organizationGenerationRef.current;
    const category = activeCategory;
    setRestoringDefault(true);
    setErrorMsg(null);
    try {
      const res = await apiClient.post<any>(`/finance/documents/${category}/templates/restore-default`, undefined, organizationId);
      if (!isActiveOrganizationRequest(organizationId, generation)) return;
      if (res.error) throw new Error(res.error);
      const profRes = await apiClient.get<any>('/organizations/current', organizationId);
      if (!isActiveOrganizationRequest(organizationId, generation)) return;
      if (profRes.data?.profile?.documentTemplates) {
        let dt = profRes.data.profile.documentTemplates;
        if (typeof dt === 'string') {
          try { dt = JSON.parse(dt); } catch { dt = {}; }
        }
        updateSettings({ documentTemplates: dt });
      }
      setOptionsDraft({});
      setIsOptionsOpen(false);
      setFullPreviewTemplate(null);
      setFullPreviewOrganizationId(null);
      await loadTemplateModels(category);
      if (!isActiveOrganizationRequest(organizationId, generation)) return;
      await refreshOrganizations();
      if (isActiveOrganizationRequest(organizationId, generation)) showToast(`Restored built-in default template for ${activeCategoryDef.label}.`);
    } catch (err: any) {
      if (isActiveOrganizationRequest(organizationId, generation)) {
        console.error('Failed to restore default:', err);
        setErrorMsg(err.message || 'Failed to restore built-in default.');
      }
    } finally {
      if (isActiveOrganizationRequest(organizationId, generation)) setRestoringDefault(false);
    }
  };

  // Set a template as default in real-time
  const handleSetDefault = async (templateId: string) => {
    const organizationId = currentOrg.id;
    const generation = organizationGenerationRef.current;
    const category = activeCategory;
    setSavingDefault(templateId);
    setErrorMsg(null);
    try {
      const serverRes = await apiClient.patch<any>(`/finance/documents/${category}/templates/${encodeURIComponent(templateId)}/default`, undefined, organizationId);
      if (!isActiveOrganizationRequest(organizationId, generation)) return;
      if (serverRes.error) throw new Error(serverRes.error);
      const updatedCategoryConfig: DocumentTemplateConfig = { ...currentCategoryConfig, defaultTemplate: templateId };
      const updatedAllTemplates: Record<string, DocumentTemplateConfig> = { ...docTemplatesMap, [category]: updatedCategoryConfig };
      updateSettings({ documentTemplates: updatedAllTemplates });
      await refreshOrganizations();
      if (!isActiveOrganizationRequest(organizationId, generation)) return;
      const styleDef = categoryTemplates.find((t) => isTemplateMatching(templateId, t.id));
      showToast(`${styleDef?.name || templateId} is now the default PDF template for ${activeCategoryDef.label}.`);
    } catch (err: any) {
      if (isActiveOrganizationRequest(organizationId, generation)) {
        console.error('Failed to set default template:', err);
        setErrorMsg(err.message || 'Failed to update default template.');
      }
    } finally {
      if (isActiveOrganizationRequest(organizationId, generation)) setSavingDefault(null);
    }
  };
  // Open Options Modal for current category
  const handleOpenOptions = async (templateId?: string, tab: 'properties' | 'fields' | 'footer' = 'properties') => {
    const organizationId = currentOrg.id;
    const generation = organizationGenerationRef.current;
    const selectedTemplateId = templateId || activeDefaultTemplateId;
    let models = templateModelsByCategory[activeCategory];
    if (!models) {
      try {
        models = await loadTemplateModels(activeCategory);
      } catch (err: any) {
        if (isActiveOrganizationRequest(organizationId, generation)) setErrorMsg(err?.message || 'Failed to load template configuration.');
        return;
      }
    }
    if (!isActiveOrganizationRequest(organizationId, generation)) return;
    const selectedModel = models.find((model) => model.modelId === selectedTemplateId || model.id === selectedTemplateId);
    const selectedTemplateConfig = selectedModel?.configuration || currentCategoryConfig;
    setOptionsOrganizationId(organizationId);
    setSelectedTemplateForCustomizing(selectedTemplateId);
    setOptionsActiveTab(tab);
    setOptionsDraft({
      ...selectedTemplateConfig,
      templateTitle: selectedTemplateConfig.templateTitle || activeCategoryDef.defaultTitle,
      exportFileNamePattern: selectedTemplateConfig.exportFileNamePattern || `%{${activeCategoryDef.singular.replace(/\s+/g, '')}Number}_%{PartyName}`,
      showHsnSac: selectedTemplateConfig.showHsnSac ?? true,
      showDiscount: selectedTemplateConfig.showDiscount ?? true,
      showTaxBreakdown: selectedTemplateConfig.showTaxBreakdown ?? true,
      showBankDetails: selectedTemplateConfig.showBankDetails ?? true,
      showShippingAddress: selectedTemplateConfig.showShippingAddress ?? true,
      showVehicleDetails: selectedTemplateConfig.showVehicleDetails ?? true,
      showEWayBill: selectedTemplateConfig.showEWayBill ?? true,
      showReceiverAck: selectedTemplateConfig.showReceiverAck ?? true,
      showInvoicesSettled: selectedTemplateConfig.showInvoicesSettled ?? true,
      showThreeTierSignatures: selectedTemplateConfig.showThreeTierSignatures ?? true,
      showRunningBalance: selectedTemplateConfig.showRunningBalance ?? true,
      showExpiryDate: selectedTemplateConfig.showExpiryDate ?? true,
      showClientAcceptance: selectedTemplateConfig.showClientAcceptance ?? true,
      showScopeOfWork: selectedTemplateConfig.showScopeOfWork ?? true,
      showPoNumber: selectedTemplateConfig.showPoNumber ?? true,
      showDeliveryDate: selectedTemplateConfig.showDeliveryDate ?? true,
      showTransportDetails: selectedTemplateConfig.showTransportDetails ?? true,
      hideRatesInChallan: selectedTemplateConfig.hideRatesInChallan ?? false,
      showPackageDetails: selectedTemplateConfig.showPackageDetails ?? true,
      showOriginalInvoiceRef: selectedTemplateConfig.showOriginalInvoiceRef ?? true,
      showReturnReason: selectedTemplateConfig.showReturnReason ?? true,
      showVendorGstin: selectedTemplateConfig.showVendorGstin ?? true,
      showPaymentModeBadge: selectedTemplateConfig.showPaymentModeBadge ?? true,
      showUtrReference: selectedTemplateConfig.showUtrReference ?? true,
      showAmountInWords: selectedTemplateConfig.showAmountInWords ?? true,
      showPaidStamp: selectedTemplateConfig.showPaidStamp ?? true,
      showStatementPeriod: selectedTemplateConfig.showStatementPeriod ?? true,
      showOpeningBalance: selectedTemplateConfig.showOpeningBalance ?? true,
      showVendorInvoiceRef: selectedTemplateConfig.showVendorInvoiceRef ?? true,
      showItcTag: selectedTemplateConfig.showItcTag ?? true,
      showAccountAllocation: selectedTemplateConfig.showAccountAllocation ?? true,
      showExpenseCategory: selectedTemplateConfig.showExpenseCategory ?? true,
      showClaimantName: selectedTemplateConfig.showClaimantName ?? true,
      showReceiptsAttached: selectedTemplateConfig.showReceiptsAttached ?? true,
      showOriginalBillRef: selectedTemplateConfig.showOriginalBillRef ?? true,
      showDebitReason: selectedTemplateConfig.showDebitReason ?? true,
      showBillsSettled: selectedTemplateConfig.showBillsSettled ?? true,
      showTdsDeduction: selectedTemplateConfig.showTdsDeduction ?? true,
      showPayablesLedger: selectedTemplateConfig.showPayablesLedger ?? true,
      showDoubleEntry: selectedTemplateConfig.showDoubleEntry ?? true,
      showNarration: selectedTemplateConfig.showNarration ?? true,
      showDebitCreditTotals: selectedTemplateConfig.showDebitCreditTotals ?? true,
      signatoryTitle: selectedTemplateConfig.signatoryTitle || settings.branding?.authorizedSignatoryTitle || 'Authorized Signatory',
      termsAndConditions: selectedTemplateConfig.termsAndConditions || settings.branding?.termsAndConditions || 'Payment is due within payment terms.',
      footerNote: selectedTemplateConfig.footerNote || settings.branding?.footerNote || 'Thank you for your business.',
      watermarkText: selectedTemplateConfig.watermarkText || 'ORIGINAL FOR RECIPIENT',
      showWatermark: Boolean(selectedTemplateConfig.showWatermark),
    });
    setIsOptionsOpen(true);
  };

  // Save customized options for this document category
  const handleSaveOptions = async () => {
    const organizationId = currentOrg.id;
    const generation = organizationGenerationRef.current;
    const category = activeCategory;
    if (optionsOrganizationId !== organizationId) {
      setErrorMsg('The organization changed. Reopen this template before saving.');
      return;
    }
    setSavingOptions(true);
    setErrorMsg(null);
    try {
      const templateId = selectedTemplateForCustomizing || activeDefaultTemplateId;
      const configuration = { ...optionsDraft };
      delete configuration.showAgingBuckets;
      delete configuration.defaultTemplate;
      const res = await apiClient.patch<any>(
        `/finance/documents/${category}/templates/${encodeURIComponent(templateId)}/configuration`,
        { configuration },
        organizationId,
      );
      if (!isActiveOrganizationRequest(organizationId, generation)) return;
      if (res.error) throw new Error(res.error);
      const savedConfiguration = res.data?.template?.configuration;
      if (!savedConfiguration || typeof savedConfiguration !== 'object') {
        throw new Error('The server did not return the saved template configuration.');
      }
      if (isTemplateMatching(activeDefaultTemplateId, templateId)) {
        const updatedAllTemplates: Record<string, DocumentTemplateConfig> = {
          ...docTemplatesMap,
          [category]: {
            ...currentCategoryConfig,
            ...savedConfiguration,
            defaultTemplate: activeDefaultTemplateId,
          },
        };
        updateSettings({ documentTemplates: updatedAllTemplates });
      }
      setOptionsDraft(savedConfiguration);
      setTemplateModelsByCategory((current) => ({
        ...current,
        [category]: (current[category] || []).map((model) =>
          model.modelId === templateId || model.id === templateId
            ? { ...model, configuration: savedConfiguration }
            : model,
        ),
      }));
      setIsOptionsOpen(false);
      showToast(`Custom PDF options saved for ${activeCategoryDef.label} in real time!`);
    } catch (err: any) {
      if (isActiveOrganizationRequest(organizationId, generation)) {
        console.error('Failed to save options:', err);
        setErrorMsg(err.message || 'Failed to save document template options.');
      }
    } finally {
      if (isActiveOrganizationRequest(organizationId, generation)) setSavingOptions(false);
    }
  };

  // Filter templates
  const visibleTemplates = categoryTemplates.filter((style) => {
    const isDefault = isTemplateMatching(activeDefaultTemplateId, style.id);
    if (statusFilter === 'default') {
      return isDefault;
    }
    if (statusFilter === 'custom') {
      return !isDefault;
    }
    return true;
  });
  const visibleCategories = DOCUMENT_CATEGORIES.filter((category) =>
    `${category.label} ${category.singular} ${category.description}`.toLowerCase().includes(categorySearch.trim().toLowerCase()),
  );
  const fullPreviewSavedConfig = fullPreviewTemplate
    ? templateModelsByCategory[activeCategory]?.find((model) => model.modelId === fullPreviewTemplate.id || model.id === fullPreviewTemplate.id)?.configuration
    : undefined;
  const fullPreviewIsDefault = Boolean(fullPreviewTemplate && isTemplateMatching(activeDefaultTemplateId, fullPreviewTemplate.id));
  const fullPreviewConfig: DocumentTemplateConfig = fullPreviewSavedConfig || currentCategoryConfig;
  const fullPreviewTitle = fullPreviewSavedConfig?.templateTitle || (fullPreviewIsDefault ? currentCategoryConfig.templateTitle : undefined) || fullPreviewTemplate?.presetTitle;

  return (
    <div className="bg-slate-50/60 dark:bg-slate-950/40 min-h-screen">
      {/* Toast Alert */}
      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-50 p-4 bg-slate-900 text-white dark:bg-white dark:text-slate-900 rounded-2xl shadow-2xl flex items-center space-x-3 text-xs font-bold border border-slate-700 dark:border-slate-300 animate-in slide-in-from-bottom duration-200">
          <CheckCircle2 size={18} className="text-emerald-400 dark:text-emerald-600 shrink-0" />
          <span>{toastMsg}</span>
          <button type="button" onClick={() => setToastMsg(null)} className="ml-2 text-slate-400 hover:text-white dark:hover:text-slate-700 cursor-pointer">
            <X size={14} />
          </button>
        </div>
      )}

      {errorMsg && (
        <div className="fixed bottom-6 right-6 z-50 p-4 bg-rose-600 text-white rounded-2xl shadow-2xl flex items-center space-x-3 text-xs font-bold animate-in slide-in-from-bottom duration-200">
          <AlertCircle size={18} className="shrink-0" />
          <span>{errorMsg}</span>
          <button type="button" onClick={() => setErrorMsg(null)} className="ml-2 text-rose-200 hover:text-white cursor-pointer">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Main Layout Grid: Left inner navigation column, Right gallery */}
      <div className="flex flex-col md:flex-row border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden bg-white dark:bg-slate-900 shadow-xs min-h-[780px]">
        {/* ============================================================== */}
        {/* LEFT COLUMN: Document Categories Sub-Navigation                 */}
        {/* ============================================================== */}
        <aside className="w-full md:w-64 lg:w-72 border-r border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60 shrink-0 flex flex-col">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <h2 className="text-base font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
              Templates
            </h2>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-200/60 dark:bg-slate-800 px-2 py-0.5 rounded">
              PDF Engine
            </span>
          </div>

          <div className="px-3 pt-3 pb-2">
            <label htmlFor="pdf-category-search" className="sr-only">Find a document category</label>
            <input
              id="pdf-category-search"
              type="search"
              value={categorySearch}
              onChange={(event) => setCategorySearch(event.target.value)}
              placeholder="Find a document type…"
              className="w-full min-h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
            <p className="mt-2 px-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400" aria-live="polite">
              {visibleCategories.length} document {visibleCategories.length === 1 ? 'type' : 'types'}
            </p>
          </div>

          <nav className="p-2 flex gap-1.5 overflow-x-auto md:block md:space-y-0.5 md:overflow-x-hidden md:overflow-y-auto md:max-h-[calc(100vh-220px)] md:flex-1 text-xs">
            {visibleCategories.map((cat) => {
              const isActive = activeCategory === cat.id;
              const catTemplates = CATEGORY_TEMPLATES[cat.id] || [];
              const catDefaultId = docTemplatesMap[cat.id]?.defaultTemplate || catTemplates[0]?.id;
              const defaultStyle = catTemplates.find((t) => isTemplateMatching(catDefaultId, t.id)) || catTemplates[0];

              return (
                <button
                  type="button"
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`w-full min-w-[156px] md:min-w-0 shrink-0 text-left px-3.5 py-2.5 rounded-xl transition-all flex items-center justify-between cursor-pointer group ${
                    isActive
                      ? 'bg-blue-600 text-white font-bold shadow-xs'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800/60 font-medium'
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <CategoryIcon category={cat.id} active={isActive} />
                    <span className="truncate">{cat.label}</span>
                  </span>
                  {isActive ? (
                    <span className="text-[9px] uppercase tracking-wider bg-white/20 px-1.5 py-0.5 rounded font-mono">
                      {defaultStyle?.badgeText || 'Default'}
                    </span>
                  ) : (
                    <span className="text-[9px] text-slate-400 font-mono group-hover:text-slate-600 dark:group-hover:text-slate-300">
                      {defaultStyle?.badgeText || ''}
                    </span>
                  )}
                </button>
              );
            })}
            {visibleCategories.length === 0 && (
              <p className="px-3 py-4 text-xs text-slate-500" role="status">No document types match “{categorySearch}”.</p>
            )}
          </nav>

          {/* Quick link to Company Branding */}
          {onNavigateToBranding && (
            <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-slate-900/60">
              <button
                type="button"
                onClick={onNavigateToBranding}
                className="w-full inline-flex items-center justify-center space-x-1.5 py-2 px-3 text-xs font-bold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 rounded-xl transition-colors cursor-pointer"
              >
                <Palette size={14} />
                <span>Edit Logo & Brand Colors</span>
              </button>
            </div>
          )}
        </aside>

        {/* ============================================================== */}
        {/* RIGHT COLUMN: Active Document Templates Gallery & Controls    */}
        {/* ============================================================== */}
        <main className="flex-1 flex flex-col p-6 lg:p-8 space-y-6 overflow-y-auto">
          <header className="border-b border-slate-100 pb-5 dark:border-slate-800">
            <h1 className="text-xl font-extrabold text-slate-900 dark:text-slate-100">
              {activeCategoryDef.title}
            </h1>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {activeCategoryDef.description}
            </p>
          </header>

          <section aria-label="Template gallery controls" className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
            <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
              <span className="font-semibold">Show</span>
              <select
                aria-label={`Filter ${activeCategoryDef.label} templates`}
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="min-h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                <option value="all">All templates</option>
                <option value="default">Default only</option>
                <option value="custom">Non-default</option>
              </select>
            </label>

            <p className="text-xs text-slate-500 dark:text-slate-400" aria-live="polite">
              {visibleTemplates.length} {visibleTemplates.length === 1 ? 'template' : 'templates'}
              <span className="mx-1.5 text-slate-300 dark:text-slate-600">|</span>
              Default: <span className="font-semibold text-slate-800 dark:text-slate-200">
                {categoryTemplates.find((t) => isTemplateMatching(activeDefaultTemplateId, t.id))?.name || 'Not set'}
              </span>
            </p>
          </section>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">Gallery cards load a sample PDF for each layout. Select Preview to inspect the full document.</p>

          {/* Template Cards Grid: Authentic Zoho Books A4 Sheet Layout */}
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,18rem),1fr))] gap-6 pt-2">
            {visibleTemplates.map((style) => {
              const isDefault = isTemplateMatching(activeDefaultTemplateId, style.id);
              const isProcessing = savingDefault === style.id;
              const savedModelConfig = templateModelsByCategory[activeCategory]?.find((model) => model.modelId === style.id || model.id === style.id)?.configuration;
              const previewTemplateConfig: DocumentTemplateConfig = savedModelConfig || currentCategoryConfig;
              const previewTitle = savedModelConfig?.templateTitle || (isDefault ? currentCategoryConfig.templateTitle : undefined) || style.presetTitle;

              return (
                <article key={style.id} className="flex min-w-0 flex-col items-center">
                  <div
                    className={`relative w-full aspect-[1/1.38] overflow-hidden rounded-sm border bg-white dark:bg-slate-900 ${
                      isDefault
                        ? 'border-blue-500 shadow-lg ring-2 ring-blue-500/20'
                        : 'border-slate-200 shadow-md dark:border-slate-800'
                    }`}
                  >
                    <PdfGalleryThumbnail
                      key={`${currentOrg.id}:${activeCategory}:${style.id}:${JSON.stringify(previewTemplateConfig)}`}
                      organizationId={currentOrg.id}
                      category={activeCategory}
                      template={style}
                      modelKey={JSON.stringify(previewTemplateConfig)}
                      fallback={<CategorySpecializedThumbnail
                        category={activeCategory}
                        template={style}
                        templateConfig={previewTemplateConfig}
                        docTitle={previewTitle}
                        orgName={currentOrg.name}
                        primaryColor={previewTemplateConfig.primaryColor || primaryColor}
                        accentColor={previewTemplateConfig.accentColor || accentColor}
                        logoUrl={logoUrl}
                        currencySymbol={settings.currencySymbol || '₹'}
                      />}
                    />
                    {isDefault && (
                      <div className="absolute bottom-3 left-3 z-10">
                        <span className="inline-flex items-center gap-1 rounded-sm bg-amber-500 px-2 py-0.5 text-[9px] font-black uppercase text-white shadow-sm">
                          <Star size={10} className="fill-white" />
                          <span>Default</span>
                        </span>
                      </div>
                    )}
                  </div>

                  <h3 className="mt-2.5 text-center text-sm font-bold text-slate-800 dark:text-slate-200">
                    {style.name}
                  </h3>
                  <p className="mt-0.5 text-center text-[11px] text-slate-500 dark:text-slate-400">
                    {style.tagline}
                  </p>
                  {previewTitle && previewTitle.trim().toUpperCase() !== style.presetTitle.trim().toUpperCase() && (
                    <p className="mt-1 flex flex-wrap items-center justify-center gap-x-1 text-center text-[10px] text-amber-800 dark:text-amber-300">
                      <span>Saved title: {previewTitle}</span>
                      {isLegacyUnsupportedPresetTitle(activeCategory, style.id, previewTitle) && (
                        <span aria-label="Review legacy title" className="font-semibold">· Review title</span>
                      )}
                    </p>
                  )}

                  <div className="mt-3 grid w-full grid-cols-2 gap-2">
                    <button
                      type="button"
                      aria-label={`Preview ${style.name}`}
                      onClick={() => handleOpenFullPreview(style)}
                      className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                    >
                      <Eye size={14} />
                      <span>Preview</span>
                    </button>
                    <button
                      type="button"
                      aria-label={`Customize ${style.name}`}
                      onClick={() => handleOpenOptions(style.id)}
                      className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                    >
                      <SlidersHorizontal size={14} />
                      <span>Customize</span>
                    </button>
                    <button
                      type="button"
                      aria-label={isDefault ? `Default template: ${style.name}` : `Set ${style.name} as default`}
                      aria-pressed={isDefault}
                      disabled={isDefault || isProcessing}
                      onClick={() => handleSetDefault(style.id)}
                      className={`col-span-2 inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-default disabled:opacity-100 ${
                        isDefault
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300'
                          : 'border-blue-200 bg-blue-50 text-blue-800 hover:bg-blue-100 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200 dark:hover:bg-blue-950/70'
                      }`}
                    >
                      {isDefault ? <CheckCircle2 size={14} /> : <Star size={14} />}
                      <span>{isProcessing ? 'Updating…' : isDefault ? 'Default template' : 'Set as default'}</span>
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </main>
      </div>

      {/* ============================================================== */}
      {/* OPTIONS DRAWER / MODAL (Tailored Per Category)                 */}
      {/* ============================================================== */}
      {isOptionsOpen && optionsOrganizationId === currentOrg.id && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="font-black text-base text-slate-900 dark:text-slate-100">
                  PDF Options: {activeCategoryDef.singular}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Configure specialized fields, labels and layouts for exported {activeCategoryDef.label}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsOptionsOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Options Tabs */}
            <div className="flex border-b border-slate-100 dark:border-slate-800 px-6 bg-slate-50/50 dark:bg-slate-900/40 overflow-x-auto text-xs font-bold">
              <button
                type="button"
                onClick={() => setOptionsActiveTab('properties')}
                className={`py-3 px-4 min-w-max whitespace-nowrap border-b-2 cursor-pointer transition-colors ${
                  optionsActiveTab === 'properties'
                    ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                Template Properties & Titles
              </button>
              <button
                type="button"
                onClick={() => setOptionsActiveTab('fields')}
                className={`py-3 px-4 min-w-max whitespace-nowrap border-b-2 cursor-pointer transition-colors ${
                  optionsActiveTab === 'fields'
                    ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                {activeCategoryDef.label} Specialized Fields
              </button>
              <button
                type="button"
                onClick={() => setOptionsActiveTab('footer')}
                className={`py-3 px-4 min-w-max whitespace-nowrap border-b-2 cursor-pointer transition-colors ${
                  optionsActiveTab === 'footer'
                    ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                Signatures & Terms
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-6 text-xs flex-1">
              {/* TAB 1: PROPERTIES */}
              {optionsActiveTab === 'properties' && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="block font-bold text-slate-800 dark:text-slate-200">
                      Document Title
                    </label>
                    <input
                      type="text"
                      aria-label="Document Title"
                      value={optionsDraft.templateTitle || ''}
                      onChange={(e) => setOptionsDraft({ ...optionsDraft, templateTitle: e.target.value })}
                      placeholder={activeCategoryDef.defaultTitle}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 font-bold"
                    />
                    <p className="text-[11px] text-slate-400">
                      The primary heading printed at the top of the {activeCategoryDef.singular} PDF.
                    </p>
                  </div>

                  <fieldset className="space-y-3 border-t border-slate-100 pt-4 dark:border-slate-800">
                    <legend className="font-bold text-slate-900 dark:text-slate-100">Page setup</legend>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="space-y-1.5 font-semibold text-slate-700 dark:text-slate-300">
                        <span className="block">Paper size</span>
                        <select
                          aria-label="PDF paper size"
                          value={optionsDraft.paperSize || 'A4'}
                          onChange={(event) => setOptionsDraft({ ...optionsDraft, paperSize: event.target.value })}
                          className="min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                        >
                          <option value="A3">A3</option>
                          <option value="A4">A4</option>
                          <option value="A5">A5</option>
                          <option value="Letter">Letter</option>
                          <option value="Legal">Legal</option>
                        </select>
                      </label>
                      <label className="space-y-1.5 font-semibold text-slate-700 dark:text-slate-300">
                        <span className="block">Orientation</span>
                        <select
                          aria-label="PDF orientation"
                          value={optionsDraft.orientation || 'portrait'}
                          onChange={(event) => setOptionsDraft({ ...optionsDraft, orientation: event.target.value })}
                          className="min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                        >
                          <option value="portrait">Portrait</option>
                          <option value="landscape">Landscape</option>
                        </select>
                      </label>
                    </div>
                  </fieldset>

                  <fieldset className="space-y-3 border-t border-slate-100 pt-4 dark:border-slate-800">
                    <legend className="font-bold text-slate-900 dark:text-slate-100">Typography and color</legend>
                    <label className="block space-y-1.5 font-semibold text-slate-700 dark:text-slate-300">
                      <span className="block">PDF font</span>
                      <select
                        aria-label="PDF font"
                        value={optionsDraft.fontFamily || 'Helvetica'}
                        onChange={(event) => setOptionsDraft({ ...optionsDraft, fontFamily: event.target.value })}
                        className="min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                      >
                        <option value="Helvetica">Helvetica</option>
                        <option value="Times-Roman">Times</option>
                        <option value="Courier">Courier</option>
                      </select>
                    </label>
                    <div>
                      <p className="mb-2 font-semibold text-slate-700 dark:text-slate-300">Color themes</p>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                        {PDF_COLOR_THEMES.map((theme) => {
                          const selected = optionsDraft.primaryColor === theme.primary && optionsDraft.accentColor === theme.accent;
                          return (
                            <button
                              key={theme.name}
                              type="button"
                              aria-label={`${theme.name} PDF color theme`}
                              aria-pressed={selected}
                              onClick={() => setOptionsDraft({ ...optionsDraft, primaryColor: theme.primary, accentColor: theme.accent })}
                              className={`rounded-lg border p-2 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${selected ? 'border-blue-600 ring-1 ring-blue-600' : 'border-slate-200 dark:border-slate-700'}`}
                            >
                              <span className="mb-1.5 flex h-5 overflow-hidden rounded" aria-hidden="true">
                                <span className="w-2/3" style={{ backgroundColor: theme.primary }} />
                                <span className="w-1/3" style={{ backgroundColor: theme.accent }} />
                              </span>
                              <span className="font-semibold text-slate-700 dark:text-slate-200">{theme.name}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="flex items-center gap-2 font-semibold text-slate-700 dark:text-slate-300">
                        <input type="color" aria-label="Primary PDF color" value={optionsDraft.primaryColor || primaryColor} onChange={(event) => setOptionsDraft({ ...optionsDraft, primaryColor: event.target.value })} className="h-10 w-12 cursor-pointer rounded border border-slate-200 bg-white p-1 dark:border-slate-700" />
                        <span>Primary color</span>
                      </label>
                      <label className="flex items-center gap-2 font-semibold text-slate-700 dark:text-slate-300">
                        <input type="color" aria-label="Accent PDF color" value={optionsDraft.accentColor || accentColor} onChange={(event) => setOptionsDraft({ ...optionsDraft, accentColor: event.target.value })} className="h-10 w-12 cursor-pointer rounded border border-slate-200 bg-white p-1 dark:border-slate-700" />
                        <span>Accent color</span>
                      </label>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">These colors apply to this template after you save. Existing issued PDFs keep their original appearance.</p>
                  </fieldset>

                  <div className="space-y-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                    <label className="block font-bold text-slate-800 dark:text-slate-200">
                      Export PDF File Name Pattern
                    </label>
                    <div className="flex items-center space-x-2">
                      <input
                        type="text"
                        value={optionsDraft.exportFileNamePattern || ''}
                        onChange={(e) => setOptionsDraft({ ...optionsDraft, exportFileNamePattern: e.target.value })}
                        placeholder={`%{${activeCategoryDef.singular.replace(/\s+/g, '')}Number}_%{PartyName}`}
                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Tokens: <code className="bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded font-mono">%&#123;DocumentNumber&#125;</code>, <code className="bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded font-mono">%&#123;PartyName&#125;</code>, <code className="bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded font-mono">%&#123;Date&#125;</code>
                    </p>
                  </div>
                </div>
              )}

              {/* TAB 2: SPECIALIZED FIELDS */}
              {optionsActiveTab === 'fields' && (
                <div className="space-y-4">
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-slate-900 dark:text-slate-100 uppercase text-[11px] tracking-wider">
                      {activeCategoryDef.label} Specialized Data Toggles
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-200 font-bold">
                      Category Customization
                    </span>
                  </div>

                  {/* Quotes Specific Controls */}
                  {activeCategory === 'quotes' && (
                    <div className="grid grid-cols-2 gap-3 p-3.5 bg-blue-50/50 dark:bg-blue-950/30 rounded-xl border border-blue-100 dark:border-blue-900/50">
                      <label className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(optionsDraft.showExpiryDate)}
                          onChange={(e) => setOptionsDraft({ ...optionsDraft, showExpiryDate: e.target.checked })}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-slate-700 dark:text-slate-300 font-medium">Quote Expiry / Validity Date</span>
                      </label>
                      <label className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(optionsDraft.showClientAcceptance)}
                          onChange={(e) => setOptionsDraft({ ...optionsDraft, showClientAcceptance: e.target.checked })}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-slate-700 dark:text-slate-300 font-medium">Client Acceptance & Signature Block</span>
                      </label>
                      <label className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(optionsDraft.showScopeOfWork)}
                          onChange={(e) => setOptionsDraft({ ...optionsDraft, showScopeOfWork: e.target.checked })}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-slate-700 dark:text-slate-300 font-medium">Show Notes and Terms</span>
                      </label>
                      <label className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(optionsDraft.showDiscount)}
                          onChange={(e) => setOptionsDraft({ ...optionsDraft, showDiscount: e.target.checked })}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-slate-700 dark:text-slate-300 font-medium">Unit Rate & Discount %</span>
                      </label>
                    </div>
                  )}

                  {/* Sales Orders Specific Controls */}
                  {activeCategory === 'sales-orders' && (
                    <div className="grid grid-cols-2 gap-3 p-3.5 bg-blue-50/50 dark:bg-blue-950/30 rounded-xl border border-blue-100 dark:border-blue-900/50">
                      <label className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(optionsDraft.showPoNumber)}
                          onChange={(e) => setOptionsDraft({ ...optionsDraft, showPoNumber: e.target.checked })}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-slate-700 dark:text-slate-300 font-medium">Customer PO Reference #</span>
                      </label>
                      <label className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(optionsDraft.showDeliveryDate)}
                          onChange={(e) => setOptionsDraft({ ...optionsDraft, showDeliveryDate: e.target.checked })}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-slate-700 dark:text-slate-300 font-medium">Expected Shipment / Delivery Date</span>
                      </label>
                      <label className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(optionsDraft.showTransportDetails)}
                          onChange={(e) => setOptionsDraft({ ...optionsDraft, showTransportDetails: e.target.checked })}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-slate-700 dark:text-slate-300 font-medium">Delivery Method & Transporter</span>
                      </label>
                      <label className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(optionsDraft.showShippingAddress)}
                          onChange={(e) => setOptionsDraft({ ...optionsDraft, showShippingAddress: e.target.checked })}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-slate-700 dark:text-slate-300 font-medium">Shipping Destination Comparison</span>
                      </label>
                      <label className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(optionsDraft.showScopeOfWork)}
                          onChange={(e) => setOptionsDraft({ ...optionsDraft, showScopeOfWork: e.target.checked })}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-slate-700 dark:text-slate-300 font-medium">Show Notes and Terms</span>
                      </label>
                    </div>
                  )}

                  {/* Delivery Challans Specific Controls */}
                  {activeCategory === 'delivery-challans' && (
                    <div className="grid grid-cols-2 gap-3 p-3.5 bg-blue-50/50 dark:bg-blue-950/30 rounded-xl border border-blue-100 dark:border-blue-900/50">
                      <label className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(optionsDraft.showVehicleDetails)}
                          onChange={(e) => setOptionsDraft({ ...optionsDraft, showVehicleDetails: e.target.checked })}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-slate-700 dark:text-slate-300 font-medium">Vehicle Number (e.g. MH-02-CE-4482)</span>
                      </label>
                      <label className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(optionsDraft.showEWayBill)}
                          onChange={(e) => setOptionsDraft({ ...optionsDraft, showEWayBill: e.target.checked })}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-slate-700 dark:text-slate-300 font-medium">E-Way Bill Number</span>
                      </label>
                      <label className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(optionsDraft.hideRatesInChallan)}
                          onChange={(e) => setOptionsDraft({ ...optionsDraft, hideRatesInChallan: e.target.checked })}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-slate-700 dark:text-slate-300 font-medium">Hide Item Rates (Quantity Only Transit)</span>
                      </label>
                      <label className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(optionsDraft.showPackageDetails)}
                          onChange={(e) => setOptionsDraft({ ...optionsDraft, showPackageDetails: e.target.checked })}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-slate-700 dark:text-slate-300 font-medium">Package Details Column</span>
                      </label>                      <label className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(optionsDraft.showReceiverAck)}
                          onChange={(e) => setOptionsDraft({ ...optionsDraft, showReceiverAck: e.target.checked })}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-slate-700 dark:text-slate-300 font-medium">Goods Received Seal & Signature</span>
                      </label>
                    </div>
                  )}

                  {/* Invoices Specific Controls */}
                  {activeCategory === 'invoices' && (
                    <div className="grid grid-cols-2 gap-3 p-3.5 bg-blue-50/50 dark:bg-blue-950/30 rounded-xl border border-blue-100 dark:border-blue-900/50">
                      <label className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(optionsDraft.showHsnSac)}
                          onChange={(e) => setOptionsDraft({ ...optionsDraft, showHsnSac: e.target.checked })}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-slate-700 dark:text-slate-300 font-medium">HSN / SAC Code Column</span>
                      </label>
                      <label className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(optionsDraft.showTaxBreakdown)}
                          onChange={(e) => setOptionsDraft({ ...optionsDraft, showTaxBreakdown: e.target.checked })}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-slate-700 dark:text-slate-300 font-medium">CGST / SGST / IGST Tax Schedule</span>
                      </label>
                      <label className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(optionsDraft.showBankDetails)}
                          onChange={(e) => setOptionsDraft({ ...optionsDraft, showBankDetails: e.target.checked })}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-slate-700 dark:text-slate-300 font-medium">Bank Account & IFSC Details</span>
                      </label>
                      <label className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(optionsDraft.showPaidStamp)}
                          onChange={(e) => setOptionsDraft({ ...optionsDraft, showPaidStamp: e.target.checked })}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-slate-700 dark:text-slate-300 font-medium">Paid Stamp</span>
                      </label>
                    </div>
                  )}

                  {/* Credit Notes Specific Controls */}
                  {activeCategory === 'credit-notes' && (
                    <div className="grid grid-cols-2 gap-3 p-3.5 bg-blue-50/50 dark:bg-blue-950/30 rounded-xl border border-blue-100 dark:border-blue-900/50">
                      <label className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(optionsDraft.showReturnReason)}
                          onChange={(e) => setOptionsDraft({ ...optionsDraft, showReturnReason: e.target.checked })}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-slate-700 dark:text-slate-300 font-medium">Return / Credit Allowance Reason</span>
                      </label>
                    </div>
                  )}

                  {/* Purchase Orders Specific Controls */}
                  {activeCategory === 'purchase-orders' && (
                    <div className="grid grid-cols-2 gap-3 p-3.5 bg-blue-50/50 dark:bg-blue-950/30 rounded-xl border border-blue-100 dark:border-blue-900/50">
                      <label className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(optionsDraft.showVendorGstin)}
                          onChange={(e) => setOptionsDraft({ ...optionsDraft, showVendorGstin: e.target.checked })}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-slate-700 dark:text-slate-300 font-medium">Vendor GSTIN & Billing Details</span>
                      </label>
                      <label className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(optionsDraft.showShippingAddress)}
                          onChange={(e) => setOptionsDraft({ ...optionsDraft, showShippingAddress: e.target.checked })}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-slate-700 dark:text-slate-300 font-medium">Destination Warehouse Address</span>
                      </label>
                      <label className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(optionsDraft.showDeliveryDate)}
                          onChange={(e) => setOptionsDraft({ ...optionsDraft, showDeliveryDate: e.target.checked })}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-slate-700 dark:text-slate-300 font-medium">Expected Delivery Window / SLA</span>
                      </label>
                      <label className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(optionsDraft.showScopeOfWork)}
                          onChange={(e) => setOptionsDraft({ ...optionsDraft, showScopeOfWork: e.target.checked })}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-slate-700 dark:text-slate-300 font-medium">Show Notes and Terms</span>
                      </label>
                    </div>
                  )}

                  {/* Payment Receipts Specific Controls */}
                  {activeCategory === 'payment-receipts' && (
                    <div className="grid grid-cols-2 gap-3 p-3.5 bg-blue-50/50 dark:bg-blue-950/30 rounded-xl border border-blue-100 dark:border-blue-900/50">
                      <label className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(optionsDraft.showPaymentModeBadge)}
                          onChange={(e) => setOptionsDraft({ ...optionsDraft, showPaymentModeBadge: e.target.checked })}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-slate-700 dark:text-slate-300 font-medium">Payment Mode (NEFT/UPI/Cheque/Cash)</span>
                      </label>
                      <label className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(optionsDraft.showUtrReference)}
                          onChange={(e) => setOptionsDraft({ ...optionsDraft, showUtrReference: e.target.checked })}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-slate-700 dark:text-slate-300 font-medium">Transaction / UTR Reference Number</span>
                      </label>
                      <label className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(optionsDraft.showInvoicesSettled)}
                          onChange={(e) => setOptionsDraft({ ...optionsDraft, showInvoicesSettled: e.target.checked })}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-slate-700 dark:text-slate-300 font-medium">Invoices Settled Breakdown Table</span>
                      </label>
                      <label className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(optionsDraft.showAmountInWords)}
                          onChange={(e) => setOptionsDraft({ ...optionsDraft, showAmountInWords: e.target.checked })}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-slate-700 dark:text-slate-300 font-medium">Amount in Words</span>
                      </label>
                    </div>
                  )}

                  {/* Customer Statements Specific Controls */}
                  {activeCategory === 'customer-statements' && (
                    <div className="grid grid-cols-2 gap-3 p-3.5 bg-blue-50/50 dark:bg-blue-950/30 rounded-xl border border-blue-100 dark:border-blue-900/50">
                      <label className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(optionsDraft.showRunningBalance)}
                          onChange={(e) => setOptionsDraft({ ...optionsDraft, showRunningBalance: e.target.checked })}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-slate-700 dark:text-slate-300 font-medium">Running Balance Column</span>
                      </label>
                      <label className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(optionsDraft.showStatementPeriod)}
                          onChange={(e) => setOptionsDraft({ ...optionsDraft, showStatementPeriod: e.target.checked })}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-slate-700 dark:text-slate-300 font-medium">Statement Date Range</span>
                      </label>
                      <label className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(optionsDraft.showOpeningBalance)}
                          onChange={(e) => setOptionsDraft({ ...optionsDraft, showOpeningBalance: e.target.checked })}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-slate-700 dark:text-slate-300 font-medium">Opening Balance Line</span>
                      </label>
                    </div>
                  )}

                  {/* Bills Specific Controls */}
                  {activeCategory === 'bills' && (
                    <div className="grid grid-cols-2 gap-3 p-3.5 bg-blue-50/50 dark:bg-blue-950/30 rounded-xl border border-blue-100 dark:border-blue-900/50">
                      <label className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(optionsDraft.showVendorInvoiceRef)}
                          onChange={(e) => setOptionsDraft({ ...optionsDraft, showVendorInvoiceRef: e.target.checked })}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-slate-700 dark:text-slate-300 font-medium">Vendor Invoice Ref # & Bill Date</span>
                      </label>
                      <label className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(optionsDraft.showAccountAllocation)}
                          onChange={(e) => setOptionsDraft({ ...optionsDraft, showAccountAllocation: e.target.checked })}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-slate-700 dark:text-slate-300 font-medium">Expense Account Allocation</span>
                      </label>
                      <label className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(optionsDraft.showPoNumber)}
                          onChange={(e) => setOptionsDraft({ ...optionsDraft, showPoNumber: e.target.checked })}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-slate-700 dark:text-slate-300 font-medium">Linked Purchase Order Number</span>
                      </label>
                    </div>
                  )}

                  {/* Expenses Specific Controls */}
                  {activeCategory === 'expenses' && (
                    <div className="grid grid-cols-2 gap-3 p-3.5 bg-blue-50/50 dark:bg-blue-950/30 rounded-xl border border-blue-100 dark:border-blue-900/50">
                      <label className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(optionsDraft.showExpenseCategory)}
                          onChange={(e) => setOptionsDraft({ ...optionsDraft, showExpenseCategory: e.target.checked })}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-slate-700 dark:text-slate-300 font-medium">Expense Category Breakdown</span>
                      </label>
                      <label className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(optionsDraft.showTdsDeduction)}
                          onChange={(e) => setOptionsDraft({ ...optionsDraft, showTdsDeduction: e.target.checked })}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-slate-700 dark:text-slate-300 font-medium">TDS Deduction (Tax Withholding)</span>
                      </label>
                    </div>
                  )}

                  {/* Vendor Credits Specific Controls */}
                  {activeCategory === 'vendor-credits' && (
                    <div className="grid grid-cols-2 gap-3 p-3.5 bg-blue-50/50 dark:bg-blue-950/30 rounded-xl border border-blue-100 dark:border-blue-900/50">
                      <label className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(optionsDraft.showDebitReason)}
                          onChange={(e) => setOptionsDraft({ ...optionsDraft, showDebitReason: e.target.checked })}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-slate-700 dark:text-slate-300 font-medium">Debit Reason & Deduction Note</span>
                      </label>
                      <label className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(optionsDraft.showTransportDetails)}
                          onChange={(e) => setOptionsDraft({ ...optionsDraft, showTransportDetails: e.target.checked })}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-slate-700 dark:text-slate-300 font-medium">Transporter / RMA Gate Pass</span>
                      </label>
                      <label className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(optionsDraft.showPayablesLedger)}
                          onChange={(e) => setOptionsDraft({ ...optionsDraft, showPayablesLedger: e.target.checked })}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-slate-700 dark:text-slate-300 font-medium">Payables Balance Deduction Summary</span>
                      </label>
                    </div>
                  )}

                  {/* Vendor Payments Specific Controls */}
                  {activeCategory === 'vendor-payments' && (
                    <div className="grid grid-cols-2 gap-3 p-3.5 bg-blue-50/50 dark:bg-blue-950/30 rounded-xl border border-blue-100 dark:border-blue-900/50">
                      <label className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(optionsDraft.showUtrReference)}
                          onChange={(e) => setOptionsDraft({ ...optionsDraft, showUtrReference: e.target.checked })}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-slate-700 dark:text-slate-300 font-medium">Bank UTR / Cheque Reference #</span>
                      </label>
                      <label className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(optionsDraft.showBillsSettled)}
                          onChange={(e) => setOptionsDraft({ ...optionsDraft, showBillsSettled: e.target.checked })}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-slate-700 dark:text-slate-300 font-medium">Settled Bills & Vouchers Schedule</span>
                      </label>
                      <label className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(optionsDraft.showBankDetails)}
                          onChange={(e) => setOptionsDraft({ ...optionsDraft, showBankDetails: e.target.checked })}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-slate-700 dark:text-slate-300 font-medium">Remitting Bank Account & UTR Details</span>
                      </label>
                    </div>
                  )}

                  {/* Vendor Statements Specific Controls */}
                  {activeCategory === 'vendor-statements' && (
                    <div className="grid grid-cols-2 gap-3 p-3.5 bg-blue-50/50 dark:bg-blue-950/30 rounded-xl border border-blue-100 dark:border-blue-900/50">
                      <label className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(optionsDraft.showRunningBalance)}
                          onChange={(e) => setOptionsDraft({ ...optionsDraft, showRunningBalance: e.target.checked })}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-slate-700 dark:text-slate-300 font-medium">Payables Running Balance Column</span>
                      </label>
                      <label className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(optionsDraft.showStatementPeriod)}
                          onChange={(e) => setOptionsDraft({ ...optionsDraft, showStatementPeriod: e.target.checked })}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-slate-700 dark:text-slate-300 font-medium">Statement Date Range</span>
                      </label>
                      <label className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(optionsDraft.showOpeningBalance)}
                          onChange={(e) => setOptionsDraft({ ...optionsDraft, showOpeningBalance: e.target.checked })}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-slate-700 dark:text-slate-300 font-medium">Opening Payables Balance</span>
                      </label>
                    </div>
                  )}

                  {/* Journals Specific Controls */}
                  {activeCategory === 'journals' && (
                    <div className="grid grid-cols-2 gap-3 p-3.5 bg-blue-50/50 dark:bg-blue-950/30 rounded-xl border border-blue-100 dark:border-blue-900/50">
                      <label className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(optionsDraft.showThreeTierSignatures)}
                          onChange={(e) => setOptionsDraft({ ...optionsDraft, showThreeTierSignatures: e.target.checked })}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-slate-700 dark:text-slate-300 font-medium">3-Tier Signature Block (Prep/Check/Approve)</span>
                      </label>
                      <label className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(optionsDraft.showNarration)}
                          onChange={(e) => setOptionsDraft({ ...optionsDraft, showNarration: e.target.checked })}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-slate-700 dark:text-slate-300 font-medium">Line Item Narrations</span>
                      </label>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: SIGNATURES & TERMS */}
              {optionsActiveTab === 'footer' && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="block font-bold text-slate-800 dark:text-slate-200">
                      Authorized Signatory Designation
                    </label>
                    <input
                      type="text"
                      aria-label="Authorized Signatory Designation"
                      value={optionsDraft.signatoryTitle || ''}
                      onChange={(e) => setOptionsDraft({ ...optionsDraft, signatoryTitle: e.target.value })}
                      placeholder="Authorized Signatory, Managing Director, Partner"
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="block font-bold text-slate-800 dark:text-slate-200">
                      Terms & Conditions
                    </label>
                    <textarea
                      rows={2}
                      value={optionsDraft.termsAndConditions || ''}
                      onChange={(e) => setOptionsDraft({ ...optionsDraft, termsAndConditions: e.target.value })}
                      placeholder="Standard terms and conditions for this document type..."
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 font-sans"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="block font-bold text-slate-800 dark:text-slate-200">
                      Running Footer Note
                    </label>
                    <input
                      type="text"
                      value={optionsDraft.footerNote || ''}
                      onChange={(e) => setOptionsDraft({ ...optionsDraft, footerNote: e.target.value })}
                      placeholder="Thank you for your business. For questions, please contact finance@company.com"
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/60 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-[11px] text-slate-400 max-w-xs">
                Saved changes apply to future PDF renders. Issued PDFs keep their original appearance.
              </span>
              <div className="flex items-center justify-end space-x-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setIsOptionsOpen(false)}
                  className="px-3.5 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={savingOptions}
                  onClick={handleSaveOptions}
                  className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs transition-all cursor-pointer disabled:opacity-50 whitespace-nowrap"
                >
                  {savingOptions ? 'Saving…' : 'Save & Apply in Real Time'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* FULL PREVIEW MODAL                                             */}
      {/* ============================================================== */}
      {fullPreviewTemplate && fullPreviewOrganizationId === currentOrg.id && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div role="dialog" aria-label={`Full Preview: ${fullPreviewTemplate.name}`} className="bg-white dark:bg-slate-900 w-full max-w-4xl rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[92vh]">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <span className="font-bold text-sm text-slate-900 dark:text-slate-100">
                  Full Preview: {fullPreviewTemplate.name}
                </span>
                <span className="text-xs text-slate-400">({activeCategoryDef.singular})</span>
              </div>

              <div className="flex items-center space-x-2">
                {!isTemplateMatching(activeDefaultTemplateId, fullPreviewTemplate.id) && (
                  <button
                    type="button"
                    onClick={() => {
                      handleSetDefault(fullPreviewTemplate.id);
                      previewSelectionRef.current += 1;
                      samplePreviewRequestRef.current += 1;
                      setFullPreviewTemplate(null);
                      setSamplePdfBlob(null);
    setFullPreviewOrganizationId(null);
                    }}
                    className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer"
                  >
                    <Star size={12} className="fill-white" />
                    <span>Set as Default</span>
                  </button>
                )}
                <button
                  type="button"
                  aria-label="Close full preview"
                  onClick={() => { previewSelectionRef.current += 1; samplePreviewRequestRef.current += 1; setFullPreviewTemplate(null); setSamplePdfBlob(null); }}
                  className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="p-3 sm:p-6 overflow-auto bg-slate-100/60 dark:bg-slate-950/60 flex justify-center">
              <div className="w-full max-w-2xl min-w-0 space-y-3">
                <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-950 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-100">
                  <div className="font-bold">Layout sample only</div>
                  <p className="mt-0.5 text-blue-800 dark:text-blue-200">The server-rendered PDF appears below with a sample watermark. Choose a current record to inspect the same template with live data.</p>
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                    <select
                      aria-label="Choose a live document for PDF preview"
                      value={selectedLiveDocumentId}
                      onChange={(event) => setSelectedLiveDocumentId(event.target.value)}
                      disabled={loadingLiveDocuments || liveDocuments.length === 0}
                      className="min-w-0 flex-1 rounded-lg border border-blue-200 bg-white px-2.5 py-2 text-xs text-slate-800 dark:border-blue-800 dark:bg-slate-900 dark:text-slate-100"
                    >
                      {loadingLiveDocuments && <option>Loading current documents…</option>}
                      {!loadingLiveDocuments && liveDocuments.length === 0 && <option>No current {activeCategoryDef.label.toLowerCase()} found</option>}
                      {liveDocuments.map((document) => <option key={document.id} value={document.id}>{document.label} · {document.date} · {document.status}</option>)}
                    </select>
                    <button type="button" disabled={!selectedLiveDocumentId || openingLivePdf} onClick={handleOpenLivePdf} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">
                      {openingLivePdf ? 'Generating…' : 'Open live PDF'}
                    </button>
                    <button type="button" disabled={openingSamplePdf} onClick={handleOpenSamplePdf} className="rounded-lg border border-blue-300 bg-white px-3 py-2 text-xs font-bold text-blue-800 disabled:cursor-not-allowed disabled:opacity-50 dark:border-blue-700 dark:bg-slate-900 dark:text-blue-200">
                      {openingSamplePdf ? 'Generating…' : samplePdfBlob ? 'Refresh sample PDF' : 'Open sample PDF'}
                    </button>
                  </div>
                </div>
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-800 dark:bg-slate-900">
                  {samplePdfBlob ? (
                    <FullPdfPreview blob={samplePdfBlob} title={fullPreviewTemplate.name} />
                  ) : (
                    <div className="flex min-h-[360px] flex-col items-center justify-center gap-3 p-8 text-center text-sm text-slate-500" role="status">
                      <FileText size={30} className="text-slate-300" />
                      <span>{openingSamplePdf ? 'Preparing the server-rendered sample…' : 'The sample PDF could not be loaded. Use Refresh sample to try again.'}</span>
                    </div>
                  )}
                </div>
                <details className="rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                  <summary className="cursor-pointer font-semibold">Illustrative layout breakdown</summary>
                  <div className="mt-3">
                    <FullCategorySpecializedRenderer
                      category={activeCategory}
                      template={fullPreviewTemplate}
                      templateConfig={fullPreviewConfig}
                      docTitle={fullPreviewTitle || fullPreviewTemplate.presetTitle}
                      orgName={currentOrg.name}
                      primaryColor={fullPreviewConfig.primaryColor || primaryColor}
                      accentColor={fullPreviewConfig.accentColor || accentColor}
                      logoUrl={logoUrl}
                      currencySymbol={settings.currencySymbol || '₹'}
                      signatoryTitle={fullPreviewConfig.signatoryTitle || 'Authorized Signatory'}
                      terms={fullPreviewConfig.termsAndConditions || 'Terms & conditions apply.'}
                      footerNote={fullPreviewConfig.footerNote || 'Thank you for your business.'}
                    />
                  </div>
                </details>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// =========================================================================
// SPECIALIZED MINIATURE THUMBNAIL (Photorealistic Zoho Books A4 Sheet)
// =========================================================================
const StatementTemplatePreview: React.FC<{
  category: 'customer-statements' | 'vendor-statements';
  templateId: string;
  density: 'thumbnail' | 'page';
  currencySymbol: string;
}> = ({ category, templateId, density, currencySymbol }) => {
  const compact = density === 'thumbnail';
  const isCustomer = category === 'customer-statements';
  const isOverview = (isCustomer && templateId === 'open-summary') || (!isCustomer && templateId === 'reconciliation');
  const isActivity = (isCustomer && templateId === 'aging-statement') || (!isCustomer && templateId === 'payables-aging');
  const opening = isCustomer ? 25000 : 15000;
  const closing = isCustomer ? 53000 : 90000;
  const transactions = isCustomer ? 4 : 3;
  const activity = isCustomer
    ? [['Invoices', 'Debit', 203000], ['Customer refunds', 'Debit', 0], ['Payments received', 'Credit', 175000], ['Credit notes', 'Credit', 0], ['Write-offs', 'Credit', 0], ['Advances applied', 'Credit', 0]]
    : [['Vendor bills', 'Credit', 155000], ['Vendor refunds', 'Credit', 0], ['Payments made', 'Debit', 80000], ['Vendor credits / debit notes', 'Debit', 0], ['Write-offs', 'Debit', 0]];
  const ledger = isCustomer
    ? [['10 May 2026', 'Invoice INV-2026-0810', 118000, 0, 143000], ['25 May 2026', 'Payment REC-2026-0391', 0, 100000, 43000], ['12 Jul 2026', 'Invoice INV-2026-0940', 85000, 0, 128000], ['01 Aug 2026', 'Payment REC-2026-0480', 0, 75000, 53000]]
    : [['18 May 2026', 'Bill BILL-2026-0150', 0, 95000, 110000], ['02 Jun 2026', 'Payment VP-2026-0240', 80000, 0, 30000], ['14 Aug 2026', 'Bill BILL-2026-0220', 0, 60000, 90000]];
  const format = (value: number) => `${currencySymbol}${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const surface = compact ? 'space-y-1 text-[5px]' : 'space-y-4 text-xs';
  const cell = compact ? 'p-1' : 'p-2';

  return (
    <section className={surface}>
      <header className={`flex flex-wrap items-center justify-between gap-2 ${compact ? 'rounded bg-slate-100 p-1 font-bold' : 'rounded-md bg-slate-100 p-3 font-semibold dark:bg-slate-800'}`}>
        <span>{isCustomer ? 'Customer statement' : 'Vendor statement'} · 01 Apr–24 Sep 2026</span>
        {!isOverview && <span className="font-mono">Closing balance {format(closing)}</span>}
      </header>
      {isOverview ? (
        <div className="grid grid-cols-3 gap-2 text-center">
          {[["Opening balance", format(opening)], ['Transactions', String(transactions)], ['Closing balance', format(closing)]].map(([label, value]) => (
            <div key={label} className={`${compact ? 'rounded border p-1' : 'rounded-md border p-3'}`}>
              <div className="text-slate-500">{label}</div><div className="mt-1 font-mono font-bold">{value}</div>
            </div>
          ))}
        </div>
      ) : isActivity ? (
        <table className="w-full border-collapse text-left">
          <thead><tr className="border-b bg-slate-50 font-bold"><th className={cell}>Activity</th><th className={cell}>Side</th><th className={`${cell} text-right`}>Amount</th></tr></thead>
          <tbody>{activity.map(([label, side, value]) => <tr key={label} className="border-b"><td className={cell}>{label}</td><td className={cell}>{side}</td><td className={`${cell} text-right font-mono`}>{format(Number(value))}</td></tr>)}</tbody>
        </table>
      ) : (
        <table className="w-full border-collapse text-left">
          <thead><tr className="border-b bg-slate-50 font-bold"><th className={cell}>Date</th><th className={cell}>Transaction / reference</th><th className={`${cell} text-right`}>Debit</th><th className={`${cell} text-right`}>Credit</th><th className={`${cell} text-right`}>Balance</th></tr></thead>
          <tbody>{ledger.map(([date, reference, debit, credit, balance]) => <tr key={reference} className="border-b"><td className={cell}>{date}</td><td className={cell}>{reference}</td><td className={`${cell} text-right font-mono`}>{Number(debit) ? format(Number(debit)) : '-'}</td><td className={`${cell} text-right font-mono`}>{Number(credit) ? format(Number(credit)) : '-'}</td><td className={`${cell} text-right font-mono font-semibold`}>{format(Number(balance))}</td></tr>)}</tbody>
        </table>
      )}
    </section>
  );
};
interface CategorySpecializedThumbnailProps {
  category: DocumentTemplateCategory;
  template: CategoryTemplateItem;
  templateConfig: DocumentTemplateConfig;
  docTitle: string;
  orgName: string;
  primaryColor: string;
  accentColor: string;
  logoUrl?: string;
  currencySymbol: string;
}

const CategorySpecializedThumbnail: React.FC<CategorySpecializedThumbnailProps> = ({
  category,
  template,
  templateConfig,
  docTitle,
  orgName,
  primaryColor,
  accentColor,
  logoUrl,
  currencySymbol,
}) => {
  const isSpreadsheet = /ledger/i.test(template.tagline);
  const isCompact = /compact/i.test(template.tagline) || ['pos', 'cash-receipt', 'adjustment', 'open-summary', 'reconciliation', 'petty-cash', 'cheque-disbursement', 'adjustment-memo', 'adjustment-journal'].includes(template.id);
  const isStandard = !isSpreadsheet && !isCompact;

  return (
    <div aria-label="Illustrative layout with sample content, not live record data" className="relative w-full h-full bg-white text-slate-800 p-3 pt-6 flex flex-col justify-between text-[6px] leading-[1.25] font-sans select-none overflow-hidden">
      <span className="absolute left-2 right-2 top-1 z-20 rounded-sm bg-amber-100 px-1 py-0.5 text-center text-[5px] font-black uppercase tracking-wide text-amber-900">
        Illustrative layout · sample content
      </span>
      {/* 1. TOP HEADER: Logo & Company on Left, Document Title on Right (Exact Zoho Books Style) */}
      <div>
        <div className="flex items-start justify-between pb-1.5 border-b-2" style={{ borderColor: primaryColor }}>
          {/* Company Brand Block */}
          <div className="flex items-start space-x-1.5">
            {logoUrl ? (
              <img src={logoUrl} alt="" className="h-4 max-w-[36px] object-contain rounded-xs" />
            ) : (
              <div className="w-4 h-4 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-[7px] shadow-2xs">
                Z
              </div>
            )}
            <div>
              <span className="font-extrabold text-[7.5px] text-slate-900 block leading-tight truncate max-w-[85px]">{orgName}</span>
              <span className="text-[5px] text-slate-400 block leading-tight">24 Park Avenue, BKC • Mumbai, MH</span>
            </div>
          </div>

          {/* Document Type & Number */}
          <div className="text-right">
            <span className="font-black text-[8.5px] uppercase tracking-wider block text-slate-900">{docTitle}</span>
            <span className="ml-auto mt-0.5 block h-0.5 w-8" style={{ backgroundColor: accentColor }} aria-hidden="true" />
            <span className="font-mono text-[5.5px] text-slate-500 block"># {category === 'payment-receipts' ? 'REC-SAMPLE-0544' : '2026-0042'}</span>
            <span className="text-[5px] text-slate-400 block">{category === 'payment-receipts' ? '25 Sep 2026' : '21 Sep 2026'}</span>
          </div>
        </div>

        {/* 2. PARTY & METADATA SECTION */}
        <div className="grid grid-cols-2 gap-2 my-1 text-[5.5px] pb-1 border-b border-slate-100">
          {category === 'delivery-challans' ? (
            <>
              <div>
                <span className="text-slate-400 block uppercase font-bold text-[5px]">Consignee / Deliver To:</span>
                <span className="font-bold text-slate-800 block">Godrej Industrial Hub</span>
                <span className="text-slate-500 block">Plot 42, Vikhroli, Mumbai</span>
              </div>
              <div className="text-right">
                <span className="text-slate-400 block uppercase font-bold text-[5px]">Transit Compliances:</span>
                <span className="font-mono font-bold text-slate-800 block">VEHICLE: MH-02-CE-4482</span>
                <span className="font-mono text-slate-500 block">E-WAY: 2710 4918 2049</span>
              </div>
            </>
          ) : category === 'payment-receipts' ? (
            <>
              <div>
                <span className="text-slate-400 block uppercase font-bold text-[5px]">Received From:</span>
                <span className="font-bold text-slate-800 block">Nexus Global Software Solutions Ltd</span>
                <span className="text-slate-500 block">Customer ID: CUST-8819</span>
              </div>
              <div className="text-right">
                {template.id === 'cash-receipt' ? (
                  <>
                    <span className="text-slate-400 block uppercase font-bold text-[5px]">Receipt Reference:</span>
                    <span className="font-mono font-bold text-slate-800 block">REC-SAMPLE-0544</span>
                    <span className="text-slate-500 block">Received: 25 Sep 2026</span>
                  </>
                ) : (
                  <>
                    <span className="text-slate-400 block uppercase font-bold text-[5px]">Payment Method:</span>
                    <span className="font-bold text-blue-600 block">NEFT / RTGS Wire Transfer</span>
                    <span className="font-mono text-slate-500 block">UTR: CMS904481023812</span>
                  </>
                )}
              </div>
            </>
          ) : category === 'customer-statements' || category === 'vendor-statements' ? (
            <>
              <div>
                <span className="text-slate-400 block uppercase font-bold text-[5px]">{category === 'customer-statements' ? 'Statement Recipient:' : 'Vendor / Supplier:'}</span>
                <span className="font-bold text-slate-800 block">{category === 'customer-statements' ? 'Nexus Global Software Solutions Ltd Ltd' : 'Steel Foundry & Castings Ltd'}</span>
                <span className="text-slate-500 block">{category === 'customer-statements' ? 'A/c Ref: ACME-042' : 'Vendor Ref: VEND-042'}</span>
              </div>
              <div className="text-right">
                <span className="text-slate-400 block uppercase font-bold text-[5px]">Ledger Period:</span>
                <span className="font-mono font-bold text-slate-800 block">01 Apr – 21 Sep 2026</span>
                <span className="text-emerald-600 font-bold block">Status: Active Account</span>
              </div>
            </>
          ) : category === 'journals' ? (
            <>
              <div>
                <span className="text-slate-400 block uppercase font-bold text-[5px]">Journal Entry Record:</span>
                <span className="font-bold text-slate-800 block">General Adjusting Entry</span>
                <span className="text-slate-500 block">Accounting Period: Q2 FY27</span>
              </div>
              <div className="text-right">
                <span className="text-slate-400 block uppercase font-bold text-[5px]">Posting Authority:</span>
                <span className="font-bold text-slate-800 block">Approved for General Ledger</span>
                <span className="font-mono text-slate-500 block">Batch: BT-99120</span>
              </div>
            </>
          ) : category === 'purchase-orders' || category === 'bills' || category === 'vendor-credits' || category === 'vendor-payments' ? (
            <>
              <div>
                <span className="text-slate-400 block uppercase font-bold text-[5px]">Vendor / Supplier:</span>
                <span className="font-bold text-slate-800 block">Steel Foundry & Castings Ltd</span>
                <span className="text-slate-500 block">GSTIN: 27AABCS9912E1Z2</span>
              </div>
              <div className="text-right">
                <span className="text-slate-400 block uppercase font-bold text-[5px]">Reference & Terms:</span>
                <span className="font-mono font-bold text-slate-800 block">REF: PO-2026-0312</span>
                <span className="text-slate-500 block">Payment Terms: Net 30</span>
              </div>
            </>
          ) : (
            <>
              <div>
                <span className="text-slate-400 block uppercase font-bold text-[5px]">Bill To / Client:</span>
                <span className="font-bold text-slate-800 block">Nexus Global Software Solutions Ltd</span>
                <span className="text-slate-500 block">24 Park Green, Mumbai</span>
              </div>
              <div className="text-right">
                <span className="text-slate-400 block uppercase font-bold text-[5px]">Ship To / Location:</span>
                <span className="font-bold text-slate-800 block">Acme Terminal Hub</span>
                <span className="text-slate-500 block">Port Yard #12, JNPT</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* 3. MIDDLE TABLE: Category-Tailored Columns & Authentic Data */}
      <div className="my-1 flex-1 flex flex-col justify-start">
        {/* ========================================================= */}
        {/* QUOTES                                                    */}
        {/* ========================================================= */}
        {category === 'quotes' && (
          <div className="space-y-1">
            <table className={`w-full text-[5.2px] ${isSpreadsheet ? 'border border-slate-300' : ''}`}>
              <thead>
                <tr className={isStandard ? 'bg-slate-800 text-white font-bold' : isSpreadsheet ? 'bg-slate-100 font-bold border-b border-slate-300' : 'border-b font-bold'}>
                  <th className="p-0.5 text-left"># Item & Scope</th>
                  <th className="p-0.5 text-center">Qty</th>
                  <th className="p-0.5 text-right">Rate</th>
                  <th className="p-0.5 text-right">Disc</th>
                  <th className="p-0.5 text-right">Estimate (₹)</th>
                </tr>
              </thead>
              <tbody className={isSpreadsheet ? 'divide-y divide-slate-200' : 'divide-y divide-slate-100'}>
                <tr>
                  <td className="p-0.5 font-medium">Cloud Architecture Migration</td>
                  <td className="p-0.5 text-center">1</td>
                  <td className="p-0.5 text-right font-mono">60,000</td>
                  <td className="p-0.5 text-right text-slate-400">10%</td>
                  <td className="p-0.5 text-right font-mono font-bold">54,000</td>
                </tr>
                <tr>
                  <td className="p-0.5 font-medium">Security & Compliance Audit</td>
                  <td className="p-0.5 text-center">1</td>
                  <td className="p-0.5 text-right font-mono">25,000</td>
                  <td className="p-0.5 text-right text-slate-400">-</td>
                  <td className="p-0.5 text-right font-mono font-bold">25,000</td>
                </tr>
              </tbody>
            </table>
            <div className="flex justify-between items-center pt-1 border-t border-slate-200 text-[5px]">
              <span className="text-slate-400">Validity: 30 Days</span>
              <div className="text-right">
                <span className="text-slate-500">Total: </span>
                <span className="font-bold font-mono text-[6.5px]">₹79,000.00</span>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* SALES ORDERS                                              */}
        {/* ========================================================= */}
        {category === 'sales-orders' && (
          <div className="space-y-1">
            <table className="w-full text-[5.2px]">
              <thead>
                <tr className={isStandard ? 'bg-slate-800 text-white font-bold' : 'bg-slate-100 font-bold border-b'}>
                  <th className="p-0.5 text-left">SKU & Item Details</th>
                  <th className="p-0.5 text-center">Ordered</th>
                  <th className="p-0.5 text-center">Reserved</th>
                  <th className="p-0.5 text-right">Total (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <tr>
                  <td className="p-0.5 font-medium">Precision Motor Assembly #M2</td>
                  <td className="p-0.5 text-center font-mono">50 Pcs</td>
                  <td className="p-0.5 text-center font-mono text-emerald-600">50 Ready</td>
                  <td className="p-0.5 text-right font-mono font-bold">1,25,000</td>
                </tr>
                <tr>
                  <td className="p-0.5 font-medium">Heavy-Duty Conveyor Belts</td>
                  <td className="p-0.5 text-center font-mono">20 Sets</td>
                  <td className="p-0.5 text-center font-mono text-emerald-600">20 Ready</td>
                  <td className="p-0.5 text-right font-mono font-bold">24,000</td>
                </tr>
              </tbody>
            </table>
            <div className="flex justify-between items-center pt-1 border-t text-[5px]">
              <span className="text-slate-400">Carrier: Blue Dart Express</span>
              <span className="font-bold font-mono text-[6.5px]">Order: ₹1,49,000.00</span>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* DELIVERY CHALLANS                                         */}
        {/* ========================================================= */}
        {category === 'delivery-challans' && (
          <div className="space-y-1">
            <table className="w-full text-[5.2px]">
              <thead>
                <tr className={isStandard ? 'bg-slate-800 text-white font-bold' : 'bg-slate-100 font-bold border-b'}>
                  <th className="p-0.5 text-left">Dispatched Material Description</th>
                  <th className="p-0.5 text-left">Packaging / Crates</th>
                  <th className="p-0.5 text-right">Quantity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <tr>
                  <td className="p-0.5 font-medium">Industrial Flow Valves #42 (HSN 8481)</td>
                  <td className="p-0.5 text-slate-500">2 Wooden Crates (45 Kgs)</td>
                  <td className="p-0.5 text-right font-mono font-bold">25 Units</td>
                </tr>
                <tr>
                  <td className="p-0.5 font-medium">Hydraulic Pressure Gaskets (HSN 8484)</td>
                  <td className="p-0.5 text-slate-500">1 Corrugated Box (12 Kgs)</td>
                  <td className="p-0.5 text-right font-mono font-bold">50 Units</td>
                </tr>
              </tbody>
            </table>
            <div className="flex justify-between items-center pt-1 border-t text-[5px] text-slate-500">
              <span>Total Pkgs: 3 Units (57 Kgs)</span>
              <span className="font-bold text-slate-700">Consignee Goods Received Sign</span>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* INVOICES                                                  */}
        {/* ========================================================= */}
        {category === 'invoices' && (
          <div className="space-y-1">
            <table className={`w-full text-[5.2px] ${isSpreadsheet ? 'border border-slate-300' : ''}`}>
              <thead>
                <tr className={isStandard ? 'bg-slate-800 text-white font-bold' : isSpreadsheet ? 'bg-slate-100 font-bold border-b border-slate-300' : 'border-b font-bold'}>
                  <th className="p-0.5 text-left">HSN & Item Description</th>
                  <th className="p-0.5 text-center">Qty</th>
                  <th className="p-0.5 text-right">Rate</th>
                  <th className="p-0.5 text-right">Tax</th>
                  <th className="p-0.5 text-right">Total (₹)</th>
                </tr>
              </thead>
              <tbody className={isSpreadsheet ? 'divide-y divide-slate-200' : 'divide-y divide-slate-100'}>
                <tr>
                  <td className="p-0.5 font-medium">998314 Enterprise Cloud ERP</td>
                  <td className="p-0.5 text-center">1 Yr</td>
                  <td className="p-0.5 text-right font-mono">60,000</td>
                  <td className="p-0.5 text-right text-slate-400">18%</td>
                  <td className="p-0.5 text-right font-mono font-bold">70,800</td>
                </tr>
                <tr>
                  <td className="p-0.5 font-medium">998315 Setup & Implementation</td>
                  <td className="p-0.5 text-center">1 Lot</td>
                  <td className="p-0.5 text-right font-mono">20,000</td>
                  <td className="p-0.5 text-right text-slate-400">18%</td>
                  <td className="p-0.5 text-right font-mono font-bold">23,600</td>
                </tr>
              </tbody>
            </table>
            <div className="flex justify-between items-center pt-1 border-t text-[5px]">
              <span className="font-mono text-emerald-700 bg-emerald-50 px-1 py-0.2 rounded font-bold">UPI: books@hdfc</span>
              <div className="text-right">
                <span className="text-slate-500">Invoice Total: </span>
                <span className="font-bold font-mono text-[6.5px]">₹94,400.00</span>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* CREDIT NOTES                                              */}
        {/* ========================================================= */}
        {category === 'credit-notes' && (
          template.id === 'goods-return' ? (
            <div className="space-y-1.5 border-t-2 border-rose-700 pt-1.5 text-[5px]">
              <div className="flex justify-between font-bold text-rose-800"><span>SALES RETURN CREDIT</span><span>LEDGER</span></div>
              <div className="grid grid-cols-2 gap-1 bg-slate-50 p-1">
                <div><span className="block text-slate-400">NOTE TOTAL</span><b>₹11,800.00</b></div>
                <div className="text-right"><span className="block text-slate-400">REMAINING</span><b>₹6,800.00</b></div>
              </div>
              <table className="w-full text-[4.5px]"><thead><tr className="border-b text-slate-500"><th className="text-left">DATE</th><th className="text-left">INVOICE</th><th className="text-right">APPLIED</th></tr></thead><tbody><tr><td>12 Aug</td><td>INV-1042</td><td className="text-right">₹5,000.00</td></tr></tbody></table>
              {templateConfig.showReturnReason !== false && <div className="text-slate-500">Quality rejection / return</div>}
            </div>
          ) : template.id === 'adjustment' ? (
            <div className="border border-slate-300 text-[5px]">
              <div className="bg-slate-800 px-1.5 py-1 font-bold text-white">CREDIT ADJUSTMENT SLIP</div>
              <div className="flex min-h-12 items-stretch">
                <div className="flex-1 p-1.5">{templateConfig.showReturnReason !== false && <><span className="block text-slate-400">ADJUSTMENT REASON</span><span>Quality rejection / return</span></>}</div>
                <div className="flex w-20 flex-col justify-center bg-slate-100 px-1.5"><span className="text-slate-500">VALUE</span><b className="font-mono text-[7px] text-rose-700">₹11,800.00</b></div>
              </div>
              <div className="border-t px-1.5 py-1 text-right text-slate-500">Available credit <b className="text-slate-800">₹6,800.00</b></div>
            </div>
          ) : (
            <div className="border-l-2 border-rose-700 bg-rose-50 p-2 text-[5px]">
              <div className="font-bold text-rose-800">CREDIT NOTE DETAILS</div>
              {templateConfig.showReturnReason !== false && <div className="py-1.5 text-slate-600"><span className="block text-[4.5px] font-bold text-slate-400">CREDIT REASON</span>Quality rejection / return</div>}
              <div className="border-t border-rose-200 pt-1"><span className="block text-[4.5px] font-bold text-rose-700">CREDIT NOTE VALUE</span><b className="font-mono text-[8px] text-rose-800">₹11,800.00</b></div>
            </div>
          )
        )}

        {/* ========================================================= */}
        {/* PURCHASE ORDERS                                           */}
        {/* ========================================================= */}
        {category === 'purchase-orders' && (
          <div className="space-y-1">
            <table className="w-full text-[5.2px]">
              <thead>
                <tr className={isStandard ? 'bg-slate-800 text-white font-bold' : 'bg-slate-100 font-bold border-b'}>
                  <th className="p-0.5 text-left">Item Specification</th>
                  <th className="p-0.5 text-center">Req Qty</th>
                  <th className="p-0.5 text-right">Unit Rate</th>
                  <th className="p-0.5 text-right">PO Total (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <tr>
                  <td className="p-0.5 font-medium">Forged Steel Flanges Grade 316L</td>
                  <td className="p-0.5 text-center font-mono">200 Pcs</td>
                  <td className="p-0.5 text-right font-mono">450</td>
                  <td className="p-0.5 text-right font-mono font-bold">1,06,200</td>
                </tr>
                <tr>
                  <td className="p-0.5 font-medium">Structural High-Tensile Bolts M16</td>
                  <td className="p-0.5 text-center font-mono">500 Pcs</td>
                  <td className="p-0.5 text-right font-mono">35</td>
                  <td className="p-0.5 text-right font-mono font-bold">20,650</td>
                </tr>
              </tbody>
            </table>
            <div className="flex justify-between items-center pt-1 border-t text-[5px]">
              <span className="text-slate-400">Terms: FOB Factory (Net 30)</span>
              <span className="font-bold font-mono text-[6.5px]">PO Total: ₹1,26,850.00</span>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* PAYMENT RECEIPTS                                          */}
        {/* ========================================================= */}
        {category === 'payment-receipts' && (
          template.id === 'cash-receipt' ? (
            <div className="space-y-1">
              <div className="p-1.5 bg-emerald-50 rounded border border-emerald-200 text-center">
                <div className="text-[5px] font-bold uppercase tracking-wide text-emerald-800">AMOUNT RECEIVED</div>
                <div className="font-mono font-black text-emerald-700 text-[9px] py-0.5">{currencySymbol}1,25,000.00</div>
                <div className="text-[4.8px] text-slate-500">Nexus Global Software Solutions Ltd</div>
                <div className="text-[4.5px] text-slate-500">Payment Mode: NEFT / RTGS Wire Transfer</div>
                <div className="text-[4.5px] text-slate-500">UTR Reference: CMS904481023812</div>
              </div>
              <table className="w-full text-[4.8px] text-left">
                <thead><tr className="border-b border-slate-200 text-slate-500"><th className="py-0.5">Allocated Invoice</th><th className="py-0.5 text-right">Amount Settled</th></tr></thead>
                <tbody>
                  <tr className="border-b border-slate-100"><td className="py-0.5">INV-2026-1042</td><td className="py-0.5 text-right font-mono">{currencySymbol}80,000.00</td></tr>
                  <tr><td className="py-0.5">INV-2026-1049</td><td className="py-0.5 text-right font-mono">{currencySymbol}45,000.00</td></tr>
                </tbody>
              </table>
            </div>
          ) : (
            <div className="space-y-1 p-1 bg-slate-50 rounded border border-slate-200">
              <div className="text-[5px] text-slate-500">
                Received with thanks from <strong className="text-slate-900">Nexus Global Software Solutions Ltd</strong> the sum of:
              </div>
              <div className="font-mono font-black text-emerald-700 text-[8px] py-0.5">
                {currencySymbol}1,25,000.00
              </div>
              <div className="text-[5px] text-slate-400 italic">
                "Rupees One Lakh Twenty Five Thousand Only"
              </div>
              <div className="pt-1 border-t border-slate-200 flex justify-between text-[4.8px] text-slate-500">
                <span>Settling: INV-2026-1042 & INV-2026-1049</span>
                <span className="font-bold text-emerald-700">PAID & ENTERED</span>
              </div>
            </div>
          )
        )}

        {/* ========================================================= */}
        {/* CUSTOMER / VENDOR STATEMENTS */}
        {(category === 'customer-statements' || category === 'vendor-statements') && (
          <StatementTemplatePreview category={category} templateId={template.id} density="thumbnail" currencySymbol="₹" />
        )}
        {/* BILLS (VENDOR BILLS)                                      */}
        {/* ========================================================= */}
        {category === 'bills' && (
          <div className="space-y-1">
            <table className="w-full text-[5.2px]">
              <thead>
                <tr className="bg-slate-100 font-bold border-b">
                  <th className="p-0.5 text-left">Expense Account</th>
                  <th className="p-0.5 text-left">ITC Status</th>
                  <th className="p-0.5 text-right">Payable (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <tr>
                  <td className="p-0.5 font-medium">5100 Web Infrastructure & Cloud</td>
                  <td className="p-0.5 text-emerald-600 font-bold">GSTR-2B Verified</td>
                  <td className="p-0.5 text-right font-mono font-bold">49,560</td>
                </tr>
              </tbody>
            </table>
            <div className="flex justify-between items-center pt-1 border-t text-[5px]">
              <span className="text-slate-400">Due: 10 Oct 2026</span>
              <span className="font-bold font-mono text-[6.5px]">Total: ₹49,560.00</span>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* EXPENSES                                                  */}
        {/* ========================================================= */}
        {category === 'expenses' && (template.id === 'project-billable' ? (
          <div className="space-y-1 text-[5px]">
            <div className="p-1 bg-emerald-50 rounded border border-emerald-200">
              <div className="font-bold uppercase text-emerald-800">Project Recovery</div>
              <div className="font-bold text-slate-800 truncate">Year-End Controls Modernization</div>
              <div className="text-slate-600 truncate">Nexus Global Software Solutions Ltd</div>
              <div className="mt-0.5 flex justify-between text-slate-500"><span>Not yet invoiced</span><span>No invoice linked</span></div>
            </div>
            <div className="grid grid-cols-3 gap-1 border-t pt-1">
              <div><span className="block text-slate-400">EXPENSE</span><strong className="font-mono">{currencySymbol}24,500.00</strong></div>
              <div><span className="block text-slate-400">CLIENT CHARGE</span><strong className="font-mono">{currencySymbol}29,400.00</strong></div>
              <div><span className="block text-slate-400">STORED MARKUP</span><strong>20%</strong></div>
            </div>
          </div>
        ) : (
          <div className="space-y-1">
            <div className="flex justify-between text-[5px] p-0.5 bg-slate-50 rounded border border-slate-200">
              <span>Claimant: Rahul Sharma</span>
              <span className="text-emerald-600 font-bold">3 Receipts Scanned</span>
            </div>
            <table className="w-full text-[5.2px]">
              <thead>
                <tr className="bg-slate-100 font-bold border-b">
                  <th className="p-0.5 text-left">Category</th>
                  <th className="p-0.5 text-right">Claim Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <tr>
                  <td className="p-0.5 font-medium">Client Dinner & CXO Travel</td>
                  <td className="p-0.5 text-right font-mono font-bold">₹8,450.00</td>
                </tr>
              </tbody>
            </table>
            <div className="text-right font-bold font-mono text-[6.5px] pt-1 border-t">
              Reimbursement: ₹8,450.00
            </div>
          </div>
        ))}

        {/* ========================================================= */}
        {/* VENDOR CREDITS                                            */}
        {/* ========================================================= */}
        {category === 'vendor-credits' && (
          <div className="space-y-1">
            <div className="p-0.5 bg-amber-50 text-amber-800 rounded border border-amber-200 text-[5px] font-bold">
              ORIGINAL BILL: BILL-2026-0081 • DEBIT NOTE (RATE CORRECTION)
            </div>
            <table className="w-full text-[5.2px]">
              <thead>
                <tr className="bg-slate-100 font-bold border-b">
                  <th className="p-0.5 text-left">Adjustment Detail</th>
                  <th className="p-0.5 text-right">Debit Deduction</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <tr>
                  <td className="p-0.5 font-medium">Rejected Flange Batch #9 Adjustment</td>
                  <td className="p-0.5 text-right font-mono font-bold text-amber-700">-₹6,195.00</td>
                </tr>
              </tbody>
            </table>
            <div className="text-right font-bold font-mono text-amber-700 text-[6.5px] pt-1 border-t">
              Deduction: -₹6,195.00
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* VENDOR PAYMENTS                                           */}
        {/* ========================================================= */}
        {category === 'vendor-payments' && (
          <div className="space-y-1 p-1 bg-slate-50 rounded border border-slate-200">
            <div className="flex justify-between text-[5px]">
              <span>Remittance Advice</span>
              <span className="font-mono text-blue-600 font-bold">UTR: HDFCN0912401</span>
            </div>
            <div className="text-[5px] text-slate-500 py-0.5">
              Settling Bill BILL-0081 (Less TDS: -₹1,076.00)
            </div>
            <div className="flex justify-between font-bold text-[7px] text-emerald-600 pt-0.5 border-t">
              <span>Net Remitted:</span>
              <span className="font-mono font-black">₹52,729.00</span>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* JOURNALS                                                  */}
        {/* ========================================================= */}
        {category === 'journals' && (
          <div className="space-y-1">
            <table className="w-full text-[5px] border border-slate-200">
              <thead>
                <tr className="bg-slate-100 font-bold border-b">
                  <th className="p-0.5 text-left">Account Head</th>
                  <th className="p-0.5 text-right">Debit</th>
                  <th className="p-0.5 text-right">Credit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <tr>
                  <td className="p-0.5 font-medium">6100 Consulting Fees</td>
                  <td className="p-0.5 text-right font-mono font-bold">75,000</td>
                  <td className="p-0.5 text-right text-slate-400">-</td>
                </tr>
                <tr>
                  <td className="p-0.5 font-medium pl-2">To 2100 Accounts Payable</td>
                  <td className="p-0.5 text-right text-slate-400">-</td>
                  <td className="p-0.5 text-right font-mono font-bold">75,000</td>
                </tr>
              </tbody>
            </table>
            <div className="flex justify-between p-0.5 bg-slate-50 border border-slate-200 text-[4.8px] font-bold">
              <span>Balanced Voucher Totals:</span>
              <span className="font-mono">Dr ₹75k | Cr ₹75k</span>
            </div>
            <div className="flex justify-between text-[4.5px] text-slate-400 pt-0.5">
              <span>Prepared: Exec</span><span>Checked: Mgr</span><span>Approved: CFO</span>
            </div>
          </div>
        )}
      </div>

      {/* 4. FOOTER AREA: Terms & Authorized Signatory */}
      <div className="pt-1 border-t border-slate-200 flex items-end justify-between text-[5px] text-slate-500">
        <div>
          <span className="block font-bold uppercase text-[4.5px] text-slate-400">Terms & Conditions</span>
          <span className="block truncate max-w-[100px]">Payment due within agreed terms.</span>
        </div>
        <div className="text-right">
          <div className="w-16 border-b border-slate-300 ml-auto mb-0.5" />
          <span className="font-bold block text-slate-700">Authorized Signatory</span>
        </div>
      </div>
    </div>
  );
};

// =========================================================================
// FULL SPECIALIZED RENDERER (Full-Screen Modal)
// =========================================================================
interface FullCategorySpecializedRendererProps {
  category: DocumentTemplateCategory;
  template: CategoryTemplateItem;
  templateConfig: DocumentTemplateConfig;
  docTitle: string;
  orgName: string;
  primaryColor: string;
  accentColor: string;
  logoUrl?: string;
  currencySymbol: string;
  signatoryTitle: string;
  terms: string;
  footerNote: string;
}

const FullCategorySpecializedRenderer: React.FC<FullCategorySpecializedRendererProps> = ({
  category,
  template,
  templateConfig,
  docTitle,
  orgName,
  primaryColor,
  accentColor,
  logoUrl,
  currencySymbol,
  signatoryTitle,
  terms,
  footerNote,
}) => {
  return (
    <div className="space-y-6 text-slate-800 dark:text-slate-200">
      {/* Document Header Banner */}
      <div className="flex flex-col gap-4 sm:flex-row sm:justify-between items-start pb-6 border-b-2" style={{ borderColor: primaryColor }}>
        <div className="flex items-center space-x-3">
          {logoUrl ? (
            <img src={logoUrl} alt="Logo" className="h-10 max-w-[120px] object-contain" />
          ) : (
            <div
              className="w-10 h-10 rounded-xl text-white flex items-center justify-center font-bold text-base shadow-sm"
              style={{ backgroundColor: primaryColor }}
            >
              <Building2 size={20} />
            </div>
          )}
          <div>
            <h2 className="font-extrabold text-base text-slate-900 dark:text-slate-100">{orgName}</h2>
            <p className="text-xs text-slate-400">GSTIN: 27AABCT2381F1Z8 • Maharashtra, India</p>
          </div>
        </div>

        <div className="text-left sm:text-right min-w-0 max-w-full">
          <h1 className="text-xl sm:text-2xl font-black tracking-tight break-words" style={{ color: primaryColor }}>
            {docTitle}
          </h1>
          <p className="font-mono font-bold text-xs text-slate-500 mt-0.5">{category === 'payment-receipts' ? '# REC-SAMPLE-0544' : '# DOC-2026-0042'}</p>
          <p className="text-xs text-slate-400">{category === 'payment-receipts' ? 'Date: 25 Sep 2026' : 'Date: 21 Sep 2026'}</p>
        </div>
      </div>

      {/* Category Specific Detailed Bodies */}
      {category === 'quotes' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl border text-xs">
            <div>
              <span className="text-slate-400 font-bold uppercase text-[10px]">Client / Estimate For</span>
              <p className="font-bold text-slate-800 dark:text-slate-200 mt-1">Rob & Joe Traders</p>
              <p className="text-slate-500">24 Park Green, Kilpauk, Chennai, TN • GSTIN: 33AAAAA0000A1Z5</p>
            </div>
            <div className="text-right">
              <span className="text-slate-400 font-bold uppercase text-[10px]">Quote Validity</span>
              <p className="font-bold text-slate-800 dark:text-slate-200 mt-1">Valid Till: 21 Oct 2026 (30 Days)</p>
              <p className="text-slate-500">Delivery SLA: 14 Business Days from Approval</p>
            </div>
          </div>

                    <table className="w-full text-left text-xs border rounded-xl overflow-hidden">
            <thead className="bg-slate-100 dark:bg-slate-800 font-bold">
              <tr><th className="p-2.5">Allocated Invoice</th><th className="p-2.5 text-right">Amount Settled</th></tr>
            </thead>
            <tbody className="divide-y">
              <tr><td className="p-2.5 font-bold">INV-2026-1042</td><td className="p-2.5 text-right font-mono font-bold text-emerald-600">{currencySymbol}80,000.00</td></tr>
              <tr><td className="p-2.5 font-bold">INV-2026-1049</td><td className="p-2.5 text-right font-mono font-bold text-emerald-600">{currencySymbol}45,000.00</td></tr>
            </tbody>
          </table>
        </div>
      )}

      {category === 'sales-orders' && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4 p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl border text-xs">
            <div>
              <span className="text-slate-400 font-bold uppercase text-[10px]">Customer Order Details</span>
              <p className="font-bold text-slate-800 dark:text-slate-200 mt-1">Acme Global Enterprises</p>
              <p className="text-slate-500">Customer PO #: PO-2026-8819</p>
            </div>
            <div>
              <span className="text-slate-400 font-bold uppercase text-[10px]">Fulfillment & Logistics</span>
              <p className="font-bold text-slate-800 dark:text-slate-200 mt-1">Carrier: Blue Dart Express</p>
              <p className="text-slate-500">Expected Ship Date: 30 Sep 2026</p>
            </div>
            <div className="text-right">
              <span className="text-slate-400 font-bold uppercase text-[10px]">Shipping Destination</span>
              <p className="font-bold text-slate-800 dark:text-slate-200 mt-1">Acme Terminal Hub</p>
              <p className="text-slate-500">Port Yard #12, JNPT Mumbai</p>
            </div>
          </div>

          <table className="w-full text-left text-xs border rounded-xl overflow-hidden">
            <thead className="bg-slate-800 text-white font-bold">
              <tr>
                <th className="p-2.5">SKU & Item Description</th>
                <th className="p-2.5 text-center">Ordered</th>
                <th className="p-2.5 text-center">Allocated</th>
                <th className="p-2.5 text-right">Unit Rate</th>
                <th className="p-2.5 text-right">Total (₹)</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              <tr>
                <td className="p-2.5 font-bold">Precision Motor Assembly #M2 (SKU: MOT-042)</td>
                <td className="p-2.5 text-center font-mono">50 Pcs</td>
                <td className="p-2.5 text-center font-mono text-emerald-600 font-bold">50 Ready</td>
                <td className="p-2.5 text-right font-mono">₹2,500.00</td>
                <td className="p-2.5 text-right font-mono font-bold">₹1,25,000.00</td>
              </tr>
              <tr>
                <td className="p-2.5 font-bold">Heavy-Duty Conveyor Belts (SKU: BLT-812)</td>
                <td className="p-2.5 text-center font-mono">20 Sets</td>
                <td className="p-2.5 text-center font-mono text-emerald-600 font-bold">20 Ready</td>
                <td className="p-2.5 text-right font-mono">₹1,200.00</td>
                <td className="p-2.5 text-right font-mono font-bold">₹24,000.00</td>
              </tr>
            </tbody>
            <tfoot className="bg-slate-50 font-black border-t-2">
              <tr>
                <td colSpan={4} className="p-2.5 text-right">Sales Order Value:</td>
                <td className="p-2.5 text-right font-mono text-blue-600 text-sm">₹1,49,000.00</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {category === 'invoices' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl border text-xs">
            <div>
              <span className="text-slate-400 font-bold uppercase text-[10px]">Billed To (Client)</span>
              <p className="font-bold text-slate-800 dark:text-slate-200 mt-1">Nexus Global Software Solutions Ltd</p>
              <p className="text-slate-500">24 Park Green, Mumbai, MH • GSTIN: 27AAAAA1234A1Z5</p>
              <p className="text-slate-400 text-[10px] mt-0.5">Place of Supply: 27-Maharashtra</p>
            </div>
            <div className="text-right">
              <span className="text-slate-400 font-bold uppercase text-[10px]">Payment Terms & Due Date</span>
              <p className="font-bold text-slate-800 dark:text-slate-200 mt-1">Due Date: 21 Oct 2026 (Net 30)</p>
              <p className="text-slate-500">Invoice No: INV-2026-0042</p>
            </div>
          </div>

          <table className="w-full text-left text-xs border rounded-xl overflow-hidden">
            <thead className="bg-slate-800 text-white font-bold">
              <tr>
                <th className="p-2.5">HSN & Item Description</th>
                <th className="p-2.5 text-center">Qty</th>
                <th className="p-2.5 text-right">Unit Rate</th>
                <th className="p-2.5 text-right">Taxable</th>
                <th className="p-2.5 text-right">CGST (9%)</th>
                <th className="p-2.5 text-right">SGST (9%)</th>
                <th className="p-2.5 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              <tr>
                <td className="p-2.5">
                  <span className="font-bold block">Enterprise Cloud ERP Suite</span>
                  <span className="text-[10px] font-mono text-slate-400">HSN/SAC: 998314</span>
                </td>
                <td className="p-2.5 text-center font-mono">1 Yr</td>
                <td className="p-2.5 text-right font-mono">₹60,000.00</td>
                <td className="p-2.5 text-right font-mono">₹60,000.00</td>
                <td className="p-2.5 text-right font-mono">₹5,400.00</td>
                <td className="p-2.5 text-right font-mono">₹5,400.00</td>
                <td className="p-2.5 text-right font-mono font-bold">₹70,800.00</td>
              </tr>
              <tr>
                <td className="p-2.5">
                  <span className="font-bold block">Setup & Implementation Services</span>
                  <span className="text-[10px] font-mono text-slate-400">HSN/SAC: 998315</span>
                </td>
                <td className="p-2.5 text-center font-mono">1 Lot</td>
                <td className="p-2.5 text-right font-mono">₹20,000.00</td>
                <td className="p-2.5 text-right font-mono">₹20,000.00</td>
                <td className="p-2.5 text-right font-mono">₹1,800.00</td>
                <td className="p-2.5 text-right font-mono">₹1,800.00</td>
                <td className="p-2.5 text-right font-mono font-bold">₹23,600.00</td>
              </tr>
            </tbody>
            <tfoot className="bg-slate-50 font-bold border-t">
              <tr>
                <td colSpan={6} className="p-2.5 text-right text-slate-600">Total Taxable Amount:</td>
                <td className="p-2.5 text-right font-mono">₹80,000.00</td>
              </tr>
              <tr>
                <td colSpan={6} className="p-2.5 text-right text-slate-600">Total GST (CGST + SGST):</td>
                <td className="p-2.5 text-right font-mono">₹14,400.00</td>
              </tr>
              <tr className="border-t-2 font-black text-sm bg-slate-100">
                <td colSpan={6} className="p-2.5 text-right">Authoritative Invoice Total:</td>
                <td className="p-2.5 text-right font-mono text-emerald-600">₹94,400.00</td>
              </tr>
            </tfoot>
          </table>

          {/* Bank & Payment Settlement Strip */}
          <div className="grid grid-cols-2 gap-4 p-3.5 bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/60 rounded-xl text-xs">
            <div>
              <span className="text-[10px] font-bold uppercase text-emerald-800 dark:text-emerald-300">Bank Account for Electronic Transfer</span>
              <p className="font-bold text-slate-800 dark:text-slate-200 mt-1">Bank: HDFC Bank Ltd • Branch: BKC Mumbai</p>
              <p className="font-mono text-slate-600 dark:text-slate-400">A/C: 50200012345678 • IFSC: HDFC0000128</p>
            </div>
            <div className="text-right">
              <span className="text-[10px] font-bold uppercase text-emerald-800 dark:text-emerald-300">UPI Instant Settlement</span>
              <p className="font-mono font-bold text-emerald-700 dark:text-emerald-400 mt-1">VPA: books@hdfc</p>
              <span className="text-[10px] text-slate-400">Scan QR in printed PDF to pay instantly</span>
            </div>
          </div>
        </div>
      )}

      {category === 'credit-notes' && (
        template.id === 'goods-return' ? (
          <div className="max-w-4xl space-y-5 border-t-4 border-rose-700 pt-4">
            <div className="flex items-start justify-between"><div><div className="text-[10px] font-bold uppercase text-rose-700">Sales Return Memo</div><h2 className="mt-1 text-2xl font-black text-slate-900">CREDIT APPLICATION LEDGER</h2></div><div className="text-right text-xs"><div className="text-slate-500">Credit note total</div><b className="font-mono text-lg">₹11,800.00</b></div></div>
            <div className="grid grid-cols-2 border-y py-3 text-sm"><div><span className="block text-[10px] font-bold uppercase text-slate-500">Remaining credit</span><b className="font-mono">₹6,800.00</b></div>{templateConfig.showReturnReason !== false && <div className="text-right"><span className="block text-[10px] font-bold uppercase text-slate-500">Return reason</span><span>Quality rejection / return</span></div>}</div>
            <table className="w-full text-sm"><thead className="border-b bg-slate-100 text-left text-[10px] uppercase text-slate-600"><tr><th className="p-2">Application date</th><th className="p-2">Invoice</th><th className="p-2 text-right">Applied amount</th></tr></thead><tbody><tr className="border-b"><td className="p-2">12 Aug 2026</td><td className="p-2 font-mono">INV-1042</td><td className="p-2 text-right font-mono">₹5,000.00</td></tr></tbody></table>
          </div>
        ) : template.id === 'adjustment' ? (
          <div className="max-w-2xl border border-slate-300">
            <div className="flex items-center justify-between bg-slate-800 px-5 py-4 text-white"><div><div className="text-[10px] font-bold uppercase text-slate-300">Account adjustment</div><h2 className="mt-1 text-lg font-black">CREDIT ADJUSTMENT SLIP</h2></div><div className="text-right"><div className="text-[10px] font-bold uppercase text-slate-300">Adjustment value</div><div className="font-mono text-xl font-bold">₹11,800.00</div></div></div>
            <div className="grid grid-cols-[1fr_auto] items-center gap-4 px-5 py-4">{templateConfig.showReturnReason !== false && <div><div className="text-[10px] font-bold uppercase text-slate-500">Adjustment reason</div><p className="mt-1 text-sm">Quality rejection / return</p></div>}<div className="border-l pl-4 text-right"><div className="text-[10px] font-bold uppercase text-slate-500">Available credit</div><div className="font-mono text-sm font-bold">₹6,800.00</div></div></div>
          </div>
        ) : (
          <div className="max-w-3xl border-l-4 border-rose-700 bg-rose-50 px-7 py-6">
            <div className="text-[10px] font-bold uppercase text-rose-700">Credit Memo · Sample Preview</div>
            <h2 className="mt-1 text-xl font-black text-slate-900">CREDIT NOTE DETAILS</h2>
            {templateConfig.showReturnReason !== false && <div className="mt-5 border-t border-rose-200 pt-3"><div className="text-[10px] font-bold uppercase text-slate-500">Credit reason</div><p className="mt-1 text-sm text-slate-800">Quality rejection / return</p></div>}
            <div className="mt-5 border-t border-rose-200 pt-3"><div className="text-[10px] font-bold uppercase text-rose-700">Credit note value</div><div className="mt-1 font-mono text-2xl font-bold text-rose-800">₹11,800.00</div></div>
          </div>
        )
      )}

      {category === 'purchase-orders' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl border text-xs">
            <div>
              <span className="text-slate-400 font-bold uppercase text-[10px]">Vendor / Supplier</span>
              <p className="font-bold text-slate-800 dark:text-slate-200 mt-1">Steel Foundry & Castings Ltd</p>
              <p className="text-slate-500">Plot 18, MIDC Tarapur • GSTIN: 27AABCS9912E1Z2</p>
            </div>
            <div className="text-right">
              <span className="text-slate-400 font-bold uppercase text-[10px]">Procurement Terms</span>
              <p className="font-bold text-slate-800 dark:text-slate-200 mt-1">Payment: Net 30 Days (FOB Plant)</p>
              <p className="text-slate-500">Required Delivery Date: 10 Oct 2026</p>
            </div>
          </div>

          <table className="w-full text-left text-xs border rounded-xl overflow-hidden">
            <thead className="bg-slate-800 text-white font-bold">
              <tr>
                <th className="p-2.5">Item Specification</th>
                <th className="p-2.5 text-center">Required Qty</th>
                <th className="p-2.5 text-right">Unit Rate</th>
                <th className="p-2.5 text-right">Tax (18%)</th>
                <th className="p-2.5 text-right">PO Total</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              <tr>
                <td className="p-2.5">
                  <span className="font-bold block">Forged Steel Flanges Grade 316L</span>
                  <span className="text-[10px] text-slate-400">Class 150 Raised Face, Mill Test Certificate required</span>
                </td>
                <td className="p-2.5 text-center font-mono">200 Pcs</td>
                <td className="p-2.5 text-right font-mono">₹450.00</td>
                <td className="p-2.5 text-right font-mono">₹16,200.00</td>
                <td className="p-2.5 text-right font-mono font-bold">₹1,06,200.00</td>
              </tr>
              <tr>
                <td className="p-2.5">
                  <span className="font-bold block">Structural High-Tensile Bolts M16</span>
                  <span className="text-[10px] text-slate-400">Hot dip galvanized with matching nuts & washers</span>
                </td>
                <td className="p-2.5 text-center font-mono">500 Pcs</td>
                <td className="p-2.5 text-right font-mono">₹35.00</td>
                <td className="p-2.5 text-right font-mono">₹3,150.00</td>
                <td className="p-2.5 text-right font-mono font-bold">₹20,650.00</td>
              </tr>
            </tbody>
            <tfoot className="bg-slate-50 font-black border-t-2">
              <tr>
                <td colSpan={4} className="p-2.5 text-right">Total Purchase Order Value:</td>
                <td className="p-2.5 text-right font-mono text-blue-600 text-sm">₹1,26,850.00</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {category === 'bills' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl border text-xs">
            <div>
              <span className="text-slate-400 font-bold uppercase text-[10px]">Vendor Invoice & Account</span>
              <p className="font-bold text-slate-800 dark:text-slate-200 mt-1">Vendor: Apex Web Services Ltd</p>
              <p className="text-slate-500">Invoice #: VEND-8912 • Bill Date: 14 Sep 2026</p>
            </div>
            <div className="text-right">
              <span className="text-slate-400 font-bold uppercase text-[10px]">ITC & Compliance</span>
              <p className="font-bold text-emerald-600 mt-1">GSTR-2B Verified (100% ITC Eligible)</p>
              <p className="text-slate-500">Linked PO: PO-2026-0312</p>
            </div>
          </div>

          <table className="w-full text-left text-xs border rounded-xl overflow-hidden">
            <thead className="bg-slate-100 font-bold">
              <tr>
                <th className="p-2.5">General Ledger Account</th>
                <th className="p-2.5">Description</th>
                <th className="p-2.5 text-right">Taxable</th>
                <th className="p-2.5 text-right">Payable Total</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              <tr>
                <td className="p-2.5 font-bold">5100 Web Infrastructure & Cloud</td>
                <td className="p-2.5 text-slate-500">Monthly server hosting & load balancing fees</td>
                <td className="p-2.5 text-right font-mono">₹42,000.00</td>
                <td className="p-2.5 text-right font-mono font-bold">₹49,560.00</td>
              </tr>
            </tbody>
            <tfoot className="bg-slate-50 font-black border-t-2">
              <tr>
                <td colSpan={3} className="p-2.5 text-right">Total Accounts Payable:</td>
                <td className="p-2.5 text-right font-mono text-sm">₹49,560.00</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {category === 'expenses' && (template.id === 'project-billable' ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 p-4 bg-emerald-50 dark:bg-emerald-950/30 rounded border border-emerald-200 dark:border-emerald-800 text-xs">
            <div>
              <span className="text-emerald-700 dark:text-emerald-300 font-bold uppercase text-[10px]">Project</span>
              <p className="font-bold text-slate-800 dark:text-slate-100 mt-1">Year-End Controls Modernization</p>
              <p className="text-slate-600 dark:text-slate-300">Client: Nexus Global Software Solutions Ltd</p>
            </div>
            <div className="text-right">
              <span className="text-slate-500 dark:text-slate-400 font-bold uppercase text-[10px]">Billing Status</span>
              <p className="font-bold text-amber-700 dark:text-amber-300 mt-1">Not yet invoiced</p>
              <p className="text-slate-600 dark:text-slate-300">Invoice reference: Not invoiced</p>
            </div>
          </div>
          <table className="w-full text-left text-xs border rounded overflow-hidden">
            <thead className="bg-slate-100 dark:bg-slate-800 font-bold"><tr><th className="p-2.5">Expense</th><th className="p-2.5 text-right">Recorded Amount</th></tr></thead>
            <tbody><tr><td className="p-2.5">Project delivery expenses</td><td className="p-2.5 text-right font-mono font-bold">{currencySymbol}24,500.00</td></tr></tbody>
          </table>
          <div className="grid grid-cols-2 gap-4 border-t pt-4">
            <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded border"><span className="block text-slate-500 text-[10px] font-bold uppercase">Stored Client Charge</span><strong className="font-mono text-emerald-700 dark:text-emerald-300">{currencySymbol}29,400.00</strong></div>
            <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded border"><span className="block text-slate-500 text-[10px] font-bold uppercase">Stored Markup</span><strong>20%</strong></div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl border text-xs">
            <div>
              <span className="text-slate-400 font-bold uppercase text-[10px]">Claimant Details</span>
              <p className="font-bold text-slate-800 dark:text-slate-200 mt-1">Rahul Sharma (VP Engineering)</p>
              <p className="text-slate-500">Dept: Technology & Cloud Infrastructure</p>
            </div>
            <div className="text-right">
              <span className="text-slate-400 font-bold uppercase text-[10px]">Verification Audit</span>
              <p className="font-bold text-emerald-600 mt-1">3 Receipts Scanned & Reconciled</p>
              <p className="text-slate-500">Disbursement: Reimbursable via Payroll</p>
            </div>
          </div>

          <table className="w-full text-left text-xs border rounded-xl overflow-hidden">
            <thead className="bg-slate-100 font-bold">
              <tr>
                <th className="p-2.5">Expense Category</th>
                <th className="p-2.5">Description & Purpose</th>
                <th className="p-2.5 text-right">Claim Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              <tr>
                <td className="p-2.5 font-bold">Meals & Entertainment</td>
                <td className="p-2.5 text-slate-500">Client Dinner with Apex CXO Delegation</td>
                <td className="p-2.5 text-right font-mono font-bold">₹6,200.00</td>
              </tr>
              <tr>
                <td className="p-2.5 font-bold">Local Travel & Transit</td>
                <td className="p-2.5 text-slate-500">Airport transfer & client site commute</td>
                <td className="p-2.5 text-right font-mono font-bold">₹2,250.00</td>
              </tr>
            </tbody>
            <tfoot className="bg-slate-50 font-black border-t-2">
              <tr>
                <td colSpan={2} className="p-2.5 text-right">Approved Reimbursement Total:</td>
                <td className="p-2.5 text-right font-mono text-sm text-emerald-600">₹8,450.00</td>
              </tr>
            </tfoot>
          </table>
        </div>
      ))}

      {category === 'vendor-credits' && (
        <div className="space-y-4">
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex justify-between items-center text-xs">
            <div>
              <span className="font-bold text-amber-900">Vendor Debit Note</span>
              <p className="text-amber-700 mt-0.5">Original Bill: BILL-2026-0081 • Transporter RMA: GP-99201</p>
            </div>
            <div className="text-right">
              <span className="font-bold text-amber-800">Reason: Defective Flange Batch Rejection</span>
            </div>
          </div>

          <table className="w-full text-left text-xs border rounded-xl overflow-hidden">
            <thead className="bg-slate-100 font-bold">
              <tr>
                <th className="p-2.5">Adjustment Item</th>
                <th className="p-2.5">Discrepancy Note</th>
                <th className="p-2.5 text-right">Deduction (₹)</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              <tr>
                <td className="p-2.5 font-bold">Rejected Flange Batch #9 Adjustment</td>
                <td className="p-2.5 text-slate-500">Metallurgical porosity fail in incoming QA test</td>
                <td className="p-2.5 text-right font-mono font-bold text-amber-700">-₹6,195.00</td>
              </tr>
            </tbody>
            <tfoot className="bg-amber-50 font-black border-t-2 text-amber-800">
              <tr>
                <td colSpan={2} className="p-2.5 text-right">Deducted from Payables Balance:</td>
                <td className="p-2.5 text-right font-mono text-sm">-₹6,195.00</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {category === 'vendor-payments' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl border text-xs">
            <div>
              <span className="text-slate-400 font-bold uppercase text-[10px]">Vendor Payment Remittance</span>
              <p className="font-bold text-slate-800 dark:text-slate-200 mt-1">Beneficiary: Steel Foundry & Castings Ltd</p>
              <p className="font-mono text-slate-500">Bank UTR: HDFCN0912401 • Value Date: 21 Sep 2026</p>
            </div>
            <div className="text-right">
              <span className="text-slate-400 font-bold uppercase text-[10px]">Remitting Bank</span>
              <p className="font-bold text-slate-800 dark:text-slate-200 mt-1">HDFC Operating A/c (Ending 5678)</p>
              <p className="text-slate-500">Payment Mode: RTGS / Bank Wire</p>
            </div>
          </div>

          <table className="w-full text-left text-xs border rounded-xl overflow-hidden">
            <thead className="bg-slate-100 font-bold">
              <tr>
                <th className="p-2.5">Settled Bill #</th>
                <th className="p-2.5">Bill Date</th>
                <th className="p-2.5 text-right">Gross Amount</th>
                <th className="p-2.5 text-right">TDS (1%)</th>
                <th className="p-2.5 text-right">Net Remitted</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              <tr>
                <td className="p-2.5 font-bold">BILL-2026-0081</td>
                <td className="p-2.5">05 Sep 2026</td>
                <td className="p-2.5 text-right font-mono">₹53,805.00</td>
                <td className="p-2.5 text-right font-mono text-rose-600">-₹1,076.00</td>
                <td className="p-2.5 text-right font-mono font-bold text-emerald-600">₹52,729.00</td>
              </tr>
            </tbody>
            <tfoot className="bg-slate-50 font-black border-t-2">
              <tr>
                <td colSpan={4} className="p-2.5 text-right">Total Net Payment Remittance:</td>
                <td className="p-2.5 text-right font-mono text-sm text-emerald-600">₹52,729.00</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {category === 'vendor-statements' && (
        <StatementTemplatePreview category={category} templateId={template.id} density="page" currencySymbol={currencySymbol} />
      )}
      {category === 'delivery-challans' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl border text-xs">
            <div>
              <span className="text-slate-400 font-bold uppercase text-[10px]">Transit Logistics</span>
              <p className="font-bold text-slate-800 dark:text-slate-200 mt-1">Vehicle No: MH-02-CE-4482</p>
              <p className="text-slate-500">Transporter: SafeExpress Logistics Ltd (LR # SE-99214)</p>
            </div>
            <div>
              <span className="text-slate-400 font-bold uppercase text-[10px]">Statutory Compliances</span>
              <p className="font-mono font-bold text-slate-800 dark:text-slate-200 mt-1">E-Way Bill: 2710 4918 2049</p>
              <p className="text-slate-500">Nature of Movement: Supply for Inward Processing</p>
            </div>
          </div>

          <table className="w-full text-left text-xs border rounded-xl overflow-hidden">
            <thead className="bg-slate-100 dark:bg-slate-800 font-bold">
              <tr>
                <th className="p-2.5">Item & HSN</th>
                <th className="p-2.5">Package Details</th>
                <th className="p-2.5 text-right">Quantity</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              <tr>
                <td className="p-2.5 font-bold">Industrial Precision Valves #42 (HSN 8481)</td>
                <td className="p-2.5 text-slate-500">2 Wooden Crates • 45 Kgs</td>
                <td className="p-2.5 text-right font-mono font-bold">25 Units</td>
              </tr>
              <tr>
                <td className="p-2.5 font-bold">High-Pressure Hydraulic Gaskets (HSN 8484)</td>
                <td className="p-2.5 text-slate-500">1 Corrugated Box • 12 Kgs</td>
                <td className="p-2.5 text-right font-mono font-bold">50 Units</td>
              </tr>
            </tbody>
          </table>

          <div className="pt-4 border-t flex justify-between items-end text-xs">
            <div className="p-3 border rounded-xl w-64 text-center">
              <span className="text-[10px] text-slate-400 uppercase font-bold">Consignee Acknowledgment</span>
              <p className="text-[11px] text-slate-500 mt-3">Received goods in sound order</p>
              <div className="border-b border-slate-300 w-3/4 mx-auto my-3" />
              <span className="text-[10px] font-bold">Receiver's Seal & Signature</span>
            </div>
            <div className="text-right space-y-2">
              <div className="h-10 w-36 border-b border-slate-300 ml-auto" />
              <span className="block font-bold text-xs">{signatoryTitle}</span>
              <span className="text-[10px] text-slate-400">For {orgName}</span>
            </div>
          </div>
        </div>
      )}

      {category === 'payment-receipts' && (
        <div className="space-y-4">
          {template.id === 'cash-receipt' ? (
            <div className="p-5 bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/60 rounded-xl text-center">
              <div className="text-xs font-bold uppercase tracking-wide text-emerald-800 dark:text-emerald-300">AMOUNT RECEIVED</div>
              <div className="mt-1 font-mono text-3xl font-black text-emerald-700 dark:text-emerald-400">{currencySymbol}1,25,000.00</div>
              <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">
                Received from <strong className="text-slate-900 dark:text-slate-100">Nexus Global Software Solutions Ltd</strong>
              </p>
              <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">Payment Mode: NEFT / RTGS Wire Transfer</p>
              <p className="text-xs text-slate-600 dark:text-slate-300">UTR Reference: CMS904481023812</p>
              <p className="text-xs text-slate-600 dark:text-slate-300">Deposited To: Current Bank Account</p>
            </div>
          ) : (
            <div className="p-4 bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/60 rounded-xl space-y-2 text-xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
                Receipt Acknowledgment
              </span>
              <p className="text-slate-600 dark:text-slate-300">
                Received with thanks from <strong className="text-slate-900 dark:text-slate-100">Nexus Global Software Solutions Ltd</strong> a sum of
                <strong className="text-emerald-700 dark:text-emerald-400 font-bold font-mono"> {currencySymbol}1,25,000.00</strong> via
                <strong> NEFT / RTGS Wire Transfer (UTR: CMS904481023812)</strong>.
              </p>
            </div>
          )}

          <table className="w-full text-left text-xs border rounded-xl overflow-hidden">
            <thead className="bg-slate-100 dark:bg-slate-800 font-bold">
              <tr><th className="p-2.5">Allocated Invoice</th><th className="p-2.5 text-right">Amount Settled</th></tr>
            </thead>
            <tbody className="divide-y">
              <tr><td className="p-2.5 font-bold">INV-2026-1042</td><td className="p-2.5 text-right font-mono font-bold text-emerald-600">{currencySymbol}80,000.00</td></tr>
              <tr><td className="p-2.5 font-bold">INV-2026-1049</td><td className="p-2.5 text-right font-mono font-bold text-emerald-600">{currencySymbol}45,000.00</td></tr>
            </tbody>
          </table>
        </div>
      )}

      {category === 'customer-statements' && (
        <StatementTemplatePreview category={category} templateId={template.id} density="page" currencySymbol={currencySymbol} />
      )}
      {category === 'journals' && (
        <div className="space-y-4">
          <table className="w-full text-left text-xs border rounded-xl overflow-hidden">
            <thead className="bg-slate-100 dark:bg-slate-800 font-bold">
              <tr>
                <th className="p-2.5">Account Code & Title</th>
                <th className="p-2.5">Narration</th>
                <th className="p-2.5 text-right">Debit (₹)</th>
                <th className="p-2.5 text-right">Credit (₹)</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              <tr>
                <td className="p-2.5 font-bold">6100 Consulting & Professional Fees</td>
                <td className="p-2.5 text-slate-500">Advisory retainers for Q2 2026</td>
                <td className="p-2.5 text-right font-mono font-bold">75,000.00</td>
                <td className="p-2.5 text-right font-mono">-</td>
              </tr>
              <tr>
                <td className="p-2.5 font-bold pl-6">To 2100 Accounts Payable</td>
                <td className="p-2.5 text-slate-500">Payable to Apex Solutions</td>
                <td className="p-2.5 text-right font-mono">-</td>
                <td className="p-2.5 text-right font-mono font-bold">75,000.00</td>
              </tr>
            </tbody>
            <tfoot className="bg-slate-50 font-black border-t-2">
              <tr>
                <td colSpan={2} className="p-2.5 text-right">Balanced Voucher Totals:</td>
                <td className="p-2.5 text-right font-mono">₹75,000.00</td>
                <td className="p-2.5 text-right font-mono">₹75,000.00</td>
              </tr>
            </tfoot>
          </table>

          {/* 3-Tier Signatory Block */}
          <div className="grid grid-cols-3 gap-4 pt-6 border-t text-center text-xs">
            <div className="p-3 border rounded-xl space-y-4">
              <span className="text-[10px] text-slate-400 uppercase font-bold">Prepared By</span>
              <div className="border-b border-slate-300 w-3/4 mx-auto" />
              <span className="font-bold">Accounts Executive</span>
            </div>
            <div className="p-3 border rounded-xl space-y-4">
              <span className="text-[10px] text-slate-400 uppercase font-bold">Verified By</span>
              <div className="border-b border-slate-300 w-3/4 mx-auto" />
              <span className="font-bold">Finance Controller</span>
            </div>
            <div className="p-3 border rounded-xl space-y-4">
              <span className="text-[10px] text-slate-400 uppercase font-bold">Authorized By</span>
              <div className="border-b border-slate-300 w-3/4 mx-auto" />
              <span className="font-bold">Managing Partner / CFO</span>
            </div>
          </div>
        </div>
      )}

      {/* General Document Footer (Terms & Signatures) for invoices/quotes/bills/etc. */}
      {category !== 'delivery-challans' && category !== 'payment-receipts' && category !== 'journals' && (
        <div className="pt-6 border-t border-slate-200 flex justify-between items-end">
          <div className="max-w-md space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Terms & Conditions</span>
            <p className="text-[11px] text-slate-500 leading-relaxed">{terms}</p>
            <p className="text-[10px] text-slate-400 pt-1">{footerNote}</p>
          </div>
          <div className="text-right space-y-2">
            <div className="h-10 w-36 border-b border-slate-300 ml-auto" />
            <span className="block font-bold text-xs" style={{ color: accentColor }}>
              {signatoryTitle}
            </span>
            <span className="text-[10px] text-slate-400">For {orgName}</span>
          </div>
        </div>
      )}
    </div>
  );
};
