import React, { useState, useEffect } from 'react';
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
} from 'lucide-react';
import { useBooks } from '../../context/BooksContext';
import { apiClient } from '../../api/client';
import { formatCurrency } from '../../utils/formatters';
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
    description: 'Goods transit documents, dispatch notes & delivery receipts',
  },
  {
    id: 'invoices',
    label: 'Invoices',
    title: 'Invoice Templates',
    singular: 'Tax Invoice',
    defaultTitle: 'TAX INVOICE',
    description: 'Official tax invoices, commercial bills & export invoices',
  },
  {
    id: 'credit-notes',
    label: 'Credit Notes',
    title: 'Credit Note Templates',
    singular: 'Credit Note',
    defaultTitle: 'CREDIT NOTE',
    description: 'Sales return memoranda, credit allowances & rate adjustments',
  },
  {
    id: 'purchase-orders',
    label: 'Purchase Orders',
    title: 'Purchase Order Templates',
    singular: 'Purchase Order',
    defaultTitle: 'PURCHASE ORDER',
    description: 'Procurement orders issued to verified vendors and suppliers',
  },
  {
    id: 'payment-receipts',
    label: 'Payment Receipts',
    title: 'Payment Receipt Templates',
    singular: 'Payment Receipt',
    defaultTitle: 'PAYMENT RECEIPT',
    description: 'Formal cash & electronic receipt acknowledgments issued to customers',
  },
  {
    id: 'customer-statements',
    label: 'Customer Statements',
    title: 'Customer Statement Templates',
    singular: 'Customer Statement',
    defaultTitle: 'STATEMENT OF ACCOUNT',
    description: 'Periodic ledger statements, aging summaries & outstanding invoices',
  },
  {
    id: 'bills',
    label: 'Bills',
    title: 'Bill Templates',
    singular: 'Vendor Bill',
    defaultTitle: 'VENDOR BILL',
    description: 'Inward vendor bills, accounts payable records & debit vouchers',
  },
  {
    id: 'expenses',
    label: 'Expenses',
    title: 'Expense Templates',
    singular: 'Expense Voucher',
    defaultTitle: 'EXPENSE VOUCHER',
    description: 'Internal payment vouchers, employee reimbursements & petty cash',
  },
  {
    id: 'vendor-credits',
    label: 'Vendor Credits',
    title: 'Vendor Credit Templates',
    singular: 'Vendor Credit',
    defaultTitle: 'VENDOR CREDIT',
    description: 'Debit notes and return credits against vendor balances',
  },
  {
    id: 'vendor-payments',
    label: 'Vendor Payments',
    title: 'Vendor Payment Templates',
    singular: 'Payment Advice',
    defaultTitle: 'PAYMENT ADVICE',
    description: 'Remittance advice and electronic settlement vouchers',
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
    description: 'Double-entry accounting journal vouchers and adjusting entries',
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
    { id: 'spreadsheet', name: 'Spreadsheet Template', tagline: 'Classic Ledger Grid', description: 'Itemized formal estimate with spreadsheet grid, rate calculations & validity terms.', badgeText: 'Spreadsheet', presetTitle: 'COMMERCIAL QUOTATION' },
    { id: 'standard', name: 'Standard Template', tagline: 'Corporate Modern Proposal', description: 'Modern branded header, clean proposal scope & client approval signature.', badgeText: 'Standard', presetTitle: 'FORMAL ESTIMATE' },
    { id: 'modern', name: 'Modern Minimalist', tagline: 'Executive Minimalist', description: 'Minimalist layout with project milestones, payment schedule & acceptance block.', badgeText: 'Modern', presetTitle: 'PROPOSAL / BID' },
    { id: 'compact', name: 'Compact Slip Template', tagline: 'Dense Rate Slip', description: 'Compact single-page rate card & service quote with fast turn-around terms.', badgeText: 'Compact', presetTitle: 'QUOTATION' },
  ],
  'sales-orders': [
    { id: 'standard', name: 'Standard Sales Order', tagline: 'Order Confirmation', description: 'Comprehensive booking details, customer PO reference, delivery method & terms.', badgeText: 'Standard', presetTitle: 'SALES ORDER' },
    { id: 'spreadsheet', name: 'Commercial Order Ledger', tagline: 'Inventory Grid', description: 'Detailed itemized order breakdown with warehouse/bin location and quantity pending.', badgeText: 'Spreadsheet', presetTitle: 'ORDER CONFIRMATION' },
    { id: 'modern', name: 'Dispatch Booking Slip', tagline: 'Modern Booking', description: 'Clean shipping destination comparison, transporter details & delivery milestones.', badgeText: 'Modern', presetTitle: 'BOOKING SLIP' },
  ],
  'delivery-challans': [
    { id: 'standard', name: 'Standard Delivery Challan', tagline: 'Goods Transit Voucher', description: 'GST compliant delivery challan with E-Way Bill #, Vehicle #, Transporter details & goods received sign.', badgeText: 'Statutory', presetTitle: 'DELIVERY CHALLAN' },
    { id: 'dispatch', name: 'Packaging & Transit Slip', tagline: 'Logistics Manifest', description: 'Package count, gross weight, dispatch checklist and consignee acknowledgment.', badgeText: 'Logistics', presetTitle: 'DISPATCH NOTE' },
    { id: 'jobwork', name: 'Job Work Returnable Challan', tagline: 'Process Transit Note', description: 'Returnable material movement note with nature of processing & expected return date.', badgeText: 'Job Work', presetTitle: 'RETURNABLE CHALLAN' },
  ],
  invoices: [
    { id: 'standard', name: 'Standard Tax Invoice', tagline: 'Corporate GST Compliant', description: 'Official tax invoice with GSTIN, HSN/SAC, CGST/SGST/IGST breakdown, bank details & UPI QR.', badgeText: 'Tax Invoice', presetTitle: 'TAX INVOICE' },
    { id: 'spreadsheet', name: 'Spreadsheet Invoice', tagline: 'Accountant Ledger Grid', description: 'Crisp bordered grid cells, ledger lines, item discount column, tax schedule & accountant totals.', badgeText: 'Spreadsheet', presetTitle: 'TAX INVOICE' },
    { id: 'export', name: 'Export / SEZ Invoice', tagline: 'Cross-Border Commercial', description: 'Foreign currency invoice, LUT/Bond reference, Port of loading, IEC code & shipping bill details.', badgeText: 'Export', presetTitle: 'COMMERCIAL EXPORT INVOICE' },
    { id: 'pos', name: 'Retail / POS Slip', tagline: 'Compact Receipt Print', description: 'Compact thermal & counter receipt layout with barcode/QR code & instant payment stamp.', badgeText: 'POS Slip', presetTitle: 'RETAIL INVOICE' },
  ],
  'credit-notes': [
    { id: 'standard', name: 'Standard Credit Note', tagline: 'Statutory Credit Memo', description: 'Original invoice cross-reference, return reason, tax adjustment & customer balance credit.', badgeText: 'Credit Memo', presetTitle: 'CREDIT NOTE' },
    { id: 'spreadsheet', name: 'Sales Return Memo', tagline: 'Detailed Item Adjustment', description: 'Item-by-item rate difference, goods returned ledger & reverse tax calculation.', badgeText: 'Spreadsheet', presetTitle: 'SALES RETURN VOUCHER' },
    { id: 'adjustment', name: 'Adjustment Memorandum', tagline: 'Controlled Adjustment', description: 'Compact adjustment document with reason, approval reference and customer balance impact.', badgeText: 'Adjustment', presetTitle: 'CREDIT ADJUSTMENT MEMO' },
  ],
  'purchase-orders': [
    { id: 'standard', name: 'Standard Purchase Order', tagline: 'Procurement Order', description: 'Vendor address, shipping terms, delivery destination, item specs & purchasing manager signature.', badgeText: 'Procurement', presetTitle: 'PURCHASE ORDER' },
    { id: 'contract', name: 'Formal Procurement Contract', tagline: 'Contractual PO', description: 'Detailed purchase terms, quality inspection clauses, delivery SLA & payment schedule.', badgeText: 'Contract', presetTitle: 'PROCUREMENT CONTRACT' },
    { id: 'requisition', name: 'Material Requisition Slip', tagline: 'Stores Order', description: 'Department code, requisition voucher reference & stores receipt acknowledgment.', badgeText: 'Internal', presetTitle: 'MATERIAL REQUISITION' },
  ],
  'payment-receipts': [
    { id: 'standard', name: 'Standard Receipt Voucher', tagline: 'Official Payment Receipt', description: 'Received with thanks from customer, payment mode (NEFT/UPI/Cheque), invoices settled table & stamp.', badgeText: 'Receipt', presetTitle: 'PAYMENT RECEIPT' },
    { id: 'compact', name: 'Formal Cash Receipt', tagline: 'Counter Slip Voucher', description: 'Compact voucher with amount in words, payment reference number & cashier signature block.', badgeText: 'Cash Voucher', presetTitle: 'CASH RECEIPT SLIP' },
    { id: 'acknowledgment', name: 'Payment Acknowledgment', tagline: 'Settlement Certificate', description: 'Detailed remittance certificate with electronic clearing reference and balance remaining.', badgeText: 'Certificate', presetTitle: 'ACKNOWLEDGMENT VOUCHER' },
  ],
  'customer-statements': [
    { id: 'ledger', name: 'Detailed Transaction Ledger', tagline: 'Running Balance Statement', description: 'Opening balance, chronologically sorted debit invoices, credit receipts & running account balance.', badgeText: 'Ledger', presetTitle: 'STATEMENT OF ACCOUNT' },
    { id: 'aging', name: 'Outstanding Aging Statement', tagline: 'Aging Buckets Analysis', description: 'Summary of unpaid balances categorized into 0-30, 31-60, 61-90, and 90+ day aging intervals.', badgeText: 'Aging Summary', presetTitle: 'OUTSTANDING SUMMARY' },
    { id: 'summary', name: 'Account Summary', tagline: 'Executive Balance Note', description: 'Concise account period summary with opening, movements, closing balance and payment guidance.', badgeText: 'Summary', presetTitle: 'CUSTOMER ACCOUNT SUMMARY' },
  ],
  bills: [
    { id: 'standard', name: 'Vendor Bill Voucher', tagline: 'Payables Entry Slip', description: 'Vendor invoice record, expense account allocation, input tax credit (ITC) status & approval.', badgeText: 'Payables', presetTitle: 'VENDOR BILL VOUCHER' },
    { id: 'accrual', name: 'AP Accrual Voucher', tagline: 'Accrual Entry Slip', description: 'Accounts payable accrual note with purchase order reference and matching invoice log.', badgeText: 'Accrual', presetTitle: 'AP ACCRUAL VOUCHER' },
    { id: 'matching', name: 'Three-Way Match Voucher', tagline: 'Receiving Control', description: 'Payables voucher designed for purchase-order, receipt and vendor-invoice matching.', badgeText: 'Matching', presetTitle: 'THREE-WAY MATCH VOUCHER' },
  ],
  expenses: [
    { id: 'reimburse', name: 'Expense Reimbursement Voucher', tagline: 'Employee Claim Slip', description: 'Claimant details, expense category breakdown, receipts audit verification & manager sign-off.', badgeText: 'Claim', presetTitle: 'EXPENSE CLAIM VOUCHER' },
    { id: 'petty', name: 'Petty Cash Slip', tagline: 'Imprest Cash Voucher', description: 'Petty cash disbursement note, payee signature, cashier verification & balance on hand.', badgeText: 'Petty Cash', presetTitle: 'PETTY CASH VOUCHER' },
    { id: 'standard', name: 'Expense Payment Voucher', tagline: 'Ledger Payment Proof', description: 'General expense voucher with payment account, vendor reference and posted ledger lines.', badgeText: 'Voucher', presetTitle: 'EXPENSE PAYMENT VOUCHER' },
  ],
  'vendor-credits': [
    { id: 'standard', name: 'Vendor Credit / Debit Note', tagline: 'Payables Debit Memo', description: 'Debit memo issued to vendor, original bill reference, return item specs & credit deduction.', badgeText: 'Debit Note', presetTitle: 'DEBIT NOTE' },
    { id: 'return', name: 'Purchase Return Voucher', tagline: 'Return to Vendor Note', description: 'Defective/rejected material return memo with transporter reference & credit balance.', badgeText: 'Return', presetTitle: 'PURCHASE RETURN NOTE' },
    { id: 'adjustment', name: 'Vendor Adjustment Memo', tagline: 'Credit Control', description: 'Controlled vendor credit adjustment with reason, approval and payable balance impact.', badgeText: 'Adjustment', presetTitle: 'VENDOR CREDIT ADJUSTMENT' },
  ],
  'vendor-payments': [
    { id: 'advice', name: 'Payment Advice / Remittance Slip', tagline: 'Remittance Slip', description: 'Formal payment advice to vendor with UTR/NEFT transfer reference, list of settled bills & net amount.', badgeText: 'Remittance', presetTitle: 'PAYMENT ADVICE' },
    { id: 'cheque', name: 'Cheque Disbursement Voucher', tagline: 'Banking Voucher', description: 'Bank clearing voucher with cheque number, drawee bank, vendor acknowledgment & signature.', badgeText: 'Disbursement', presetTitle: 'DISBURSEMENT VOUCHER' },
    { id: 'settlement', name: 'Settlement Confirmation', tagline: 'Electronic Settlement', description: 'Formal settlement confirmation with paid bills, payment reference and remaining allocation.', badgeText: 'Settlement', presetTitle: 'VENDOR SETTLEMENT CONFIRMATION' },
  ],
  'vendor-statements': [
    { id: 'payables', name: 'Vendor Payables Statement', tagline: 'Vendor Account Ledger', description: 'Historical ledger of vendor bills received, payments remitted, debit notes & net payables balance.', badgeText: 'Statement', presetTitle: 'VENDOR STATEMENT OF ACCOUNT' },
    { id: 'aging', name: 'Vendor Aging Analysis', tagline: 'Payables Aging Schedule', description: 'Categorized aging of payables to assist cash management and vendor settlement schedules.', badgeText: 'Aging', presetTitle: 'PAYABLES AGING REPORT' },
    { id: 'ledger', name: 'Vendor Transaction Ledger', tagline: 'Running Payables Ledger', description: 'Chronological vendor ledger with bills, payments, credits and running payable balance.', badgeText: 'Ledger', presetTitle: 'VENDOR TRANSACTION LEDGER' },
  ],
  journals: [
    { id: 'standard', name: 'General Journal Voucher', tagline: 'Double-Entry Voucher', description: 'Standard accounting journal voucher with accounts debited & credited, line narration & balanced totals.', badgeText: 'Journal', presetTitle: 'JOURNAL VOUCHER' },
    { id: 'three-tier', name: 'Audit Certified Journal', tagline: '3-Tier Signatory Slip', description: 'Formal audit journal voucher with dedicated "Prepared By", "Checked By", and "Approved By" blocks.', badgeText: 'Audit Certified', presetTitle: 'ADJUSTING JOURNAL VOUCHER' },
    { id: 'ledger', name: 'Ledger Posting Voucher', tagline: 'Posting Register', description: 'Dense ledger format for account postings, debit-credit totals and audit reference.', badgeText: 'Ledger', presetTitle: 'LEDGER POSTING VOUCHER' },
  ],
};

export interface PdfTemplatesSettingsProps {
  onNavigateToBranding?: () => void;
}

export const PdfTemplatesSettings: React.FC<PdfTemplatesSettingsProps> = ({
  onNavigateToBranding,
}) => {
  const { currentOrg, settings, updateSettings, refreshOrganizations } = useBooks();

  const [activeCategory, setActiveCategory] = useState<DocumentTemplateCategory>('quotes');
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
  const [savingOptions, setSavingOptions] = useState(false);

  // Full-Screen Preview Modal
  const [fullPreviewTemplate, setFullPreviewTemplate] = useState<CategoryTemplateItem | null>(null);
  const [liveDocuments, setLiveDocuments] = useState<Array<{ id: string; label: string; date: string; status: string }>>([]);
  const [selectedLiveDocumentId, setSelectedLiveDocumentId] = useState('');
  const [loadingLiveDocuments, setLoadingLiveDocuments] = useState(false);
  const [openingLivePdf, setOpeningLivePdf] = useState(false);

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
      showUpiQr: true,
      showShippingAddress: true,
      showVehicleDetails: true,
      showEWayBill: true,
      showReceiverAck: true,
      showInvoicesSettled: true,
      showThreeTierSignatures: true,
      showAgingBuckets: true,
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

  // Load authoritative document templates from server
  useEffect(() => {
    let mounted = true;
    const fetchOrgProfile = async () => {
      setLoading(true);
      try {
        const res = await apiClient.get<any>('/organizations/current');
        if (!mounted) return;
        const prof = res.data?.profile;
        if (prof) {
          let dt = prof.documentTemplates;
          if (typeof dt === 'string') {
            try { dt = JSON.parse(dt); } catch { dt = {}; }
          }
          if (dt && typeof dt === 'object') {
            updateSettings({ documentTemplates: dt });
          }
        }
      } catch (err: any) {
        if (!mounted) return;
        console.error('Failed to load document templates:', err);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    fetchOrgProfile();
    return () => { mounted = false; };
  }, []);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 4000);
  };

  const handleOpenFullPreview = async (template: CategoryTemplateItem) => {
    setFullPreviewTemplate(template);
    setLiveDocuments([]);
    setSelectedLiveDocumentId('');
    setLoadingLiveDocuments(true);
    try {
      const result = await apiClient.get<{ documents?: Array<{ id: string; label: string; date: string; status: string }> }>(`/finance/documents/${activeCategory}/recent`);
      if (result.error) throw new Error(result.error);
      const documents = result.data?.documents || [];
      setLiveDocuments(documents);
      setSelectedLiveDocumentId(documents[0]?.id || '');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Could not load recent documents for a live PDF preview.');
    } finally {
      setLoadingLiveDocuments(false);
    }
  };

  const handleOpenLivePdf = async () => {
    if (!fullPreviewTemplate || !selectedLiveDocumentId) return;
    setOpeningLivePdf(true);
    try {
      const result = await apiClient.getBlob(`/finance/documents/${activeCategory}/${selectedLiveDocumentId}/pdf?templateId=${encodeURIComponent(fullPreviewTemplate.id)}`);
      if (result.error || !result.data) throw new Error(result.error || 'Could not generate the live PDF.');
      const url = URL.createObjectURL(result.data);
      window.open(url, '_blank', 'noopener,noreferrer');
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Could not generate the live PDF.');
    } finally {
      setOpeningLivePdf(false);
    }
  };

  // Set a template as default in real-time
  const handleSetDefault = async (templateId: string) => {
    setSavingDefault(templateId);
    setErrorMsg(null);
    try {
      const updatedCategoryConfig: DocumentTemplateConfig = {
        ...currentCategoryConfig,
        defaultTemplate: templateId,
      };

      const updatedAllTemplates: Record<string, DocumentTemplateConfig> = {
        ...docTemplatesMap,
        [activeCategory]: updatedCategoryConfig,
      };

      updateSettings({
        documentTemplates: updatedAllTemplates,
      });

      const res = await apiClient.patch<any>('/organizations/current', {
        documentTemplates: updatedAllTemplates,
      });
      if (res.error) throw new Error(res.error);

      await refreshOrganizations();

      const styleDef = categoryTemplates.find((t) => isTemplateMatching(templateId, t.id));
      showToast(`⭐ ${styleDef?.name || templateId} is now the default PDF template for ${activeCategoryDef.label}!`);
    } catch (err: any) {
      console.error('Failed to set default template:', err);
      setErrorMsg(err.message || 'Failed to update default template.');
    } finally {
      setSavingDefault(null);
    }
  };

  // Open Options Modal for current category
  const handleOpenOptions = (templateId?: string, tab: 'properties' | 'fields' | 'footer' = 'properties') => {
    setSelectedTemplateForCustomizing(templateId || activeDefaultTemplateId);
    setOptionsActiveTab(tab);
    setOptionsDraft({
      ...currentCategoryConfig,
      templateTitle: currentCategoryConfig.templateTitle || activeCategoryDef.defaultTitle,
      exportFileNamePattern: currentCategoryConfig.exportFileNamePattern || `%{${activeCategoryDef.singular.replace(/\s+/g, '')}Number}_%{PartyName}`,
      showHsnSac: currentCategoryConfig.showHsnSac ?? true,
      showDiscount: currentCategoryConfig.showDiscount ?? true,
      showTaxBreakdown: currentCategoryConfig.showTaxBreakdown ?? true,
      showBankDetails: currentCategoryConfig.showBankDetails ?? true,
      showUpiQr: currentCategoryConfig.showUpiQr ?? true,
      showShippingAddress: currentCategoryConfig.showShippingAddress ?? true,
      showVehicleDetails: currentCategoryConfig.showVehicleDetails ?? true,
      showEWayBill: currentCategoryConfig.showEWayBill ?? true,
      showReceiverAck: currentCategoryConfig.showReceiverAck ?? true,
      showInvoicesSettled: currentCategoryConfig.showInvoicesSettled ?? true,
      showThreeTierSignatures: currentCategoryConfig.showThreeTierSignatures ?? true,
      showAgingBuckets: currentCategoryConfig.showAgingBuckets ?? true,
      showRunningBalance: currentCategoryConfig.showRunningBalance ?? true,
      showExpiryDate: currentCategoryConfig.showExpiryDate ?? true,
      showClientAcceptance: currentCategoryConfig.showClientAcceptance ?? true,
      showScopeOfWork: currentCategoryConfig.showScopeOfWork ?? true,
      showPoNumber: currentCategoryConfig.showPoNumber ?? true,
      showDeliveryDate: currentCategoryConfig.showDeliveryDate ?? true,
      showTransportDetails: currentCategoryConfig.showTransportDetails ?? true,
      hideRatesInChallan: currentCategoryConfig.hideRatesInChallan ?? false,
      showPackageDetails: currentCategoryConfig.showPackageDetails ?? true,
      showOriginalInvoiceRef: currentCategoryConfig.showOriginalInvoiceRef ?? true,
      showReturnReason: currentCategoryConfig.showReturnReason ?? true,
      showVendorGstin: currentCategoryConfig.showVendorGstin ?? true,
      showPaymentModeBadge: currentCategoryConfig.showPaymentModeBadge ?? true,
      showUtrReference: currentCategoryConfig.showUtrReference ?? true,
      showAmountInWords: currentCategoryConfig.showAmountInWords ?? true,
      showPaidStamp: currentCategoryConfig.showPaidStamp ?? true,
      showStatementPeriod: currentCategoryConfig.showStatementPeriod ?? true,
      showOpeningBalance: currentCategoryConfig.showOpeningBalance ?? true,
      showVendorInvoiceRef: currentCategoryConfig.showVendorInvoiceRef ?? true,
      showItcTag: currentCategoryConfig.showItcTag ?? true,
      showAccountAllocation: currentCategoryConfig.showAccountAllocation ?? true,
      showExpenseCategory: currentCategoryConfig.showExpenseCategory ?? true,
      showClaimantName: currentCategoryConfig.showClaimantName ?? true,
      showReimbursementStatus: currentCategoryConfig.showReimbursementStatus ?? true,
      showReceiptsAttached: currentCategoryConfig.showReceiptsAttached ?? true,
      showOriginalBillRef: currentCategoryConfig.showOriginalBillRef ?? true,
      showDebitReason: currentCategoryConfig.showDebitReason ?? true,
      showBillsSettled: currentCategoryConfig.showBillsSettled ?? true,
      showTdsDeduction: currentCategoryConfig.showTdsDeduction ?? true,
      showPayablesLedger: currentCategoryConfig.showPayablesLedger ?? true,
      showDoubleEntry: currentCategoryConfig.showDoubleEntry ?? true,
      showNarration: currentCategoryConfig.showNarration ?? true,
      showDebitCreditTotals: currentCategoryConfig.showDebitCreditTotals ?? true,
      signatoryTitle: currentCategoryConfig.signatoryTitle || settings.branding?.authorizedSignatoryTitle || 'Authorized Signatory',
      termsAndConditions: currentCategoryConfig.termsAndConditions || settings.branding?.termsAndConditions || 'Payment is due within payment terms.',
      footerNote: currentCategoryConfig.footerNote || settings.branding?.footerNote || 'Thank you for your business.',
      watermarkText: currentCategoryConfig.watermarkText || 'ORIGINAL FOR RECIPIENT',
      showWatermark: Boolean(currentCategoryConfig.showWatermark),
    });
    setIsOptionsOpen(true);
  };

  // Save customized options for this document category
  const handleSaveOptions = async () => {
    setSavingOptions(true);
    setErrorMsg(null);
    try {
      const updatedCategoryConfig: DocumentTemplateConfig = {
        ...currentCategoryConfig,
        ...optionsDraft,
        defaultTemplate: selectedTemplateForCustomizing || activeDefaultTemplateId,
      };

      const updatedAllTemplates: Record<string, DocumentTemplateConfig> = {
        ...docTemplatesMap,
        [activeCategory]: updatedCategoryConfig,
      };

      updateSettings({
        documentTemplates: updatedAllTemplates,
      });

      const res = await apiClient.patch<any>('/organizations/current', {
        documentTemplates: updatedAllTemplates,
      });
      if (res.error) throw new Error(res.error);

      await refreshOrganizations();
      setIsOptionsOpen(false);
      showToast(`Custom PDF options saved for ${activeCategoryDef.label} in real time!`);
    } catch (err: any) {
      console.error('Failed to save options:', err);
      setErrorMsg(err.message || 'Failed to save document template options.');
    } finally {
      setSavingOptions(false);
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

          <nav className="p-2 space-y-0.5 overflow-y-auto max-h-[calc(100vh-220px)] flex-1 text-xs">
            {DOCUMENT_CATEGORIES.map((cat) => {
              const isActive = activeCategory === cat.id;
              const catTemplates = CATEGORY_TEMPLATES[cat.id] || [];
              const catDefaultId = docTemplatesMap[cat.id]?.defaultTemplate || catTemplates[0]?.id;
              const defaultStyle = catTemplates.find((t) => isTemplateMatching(catDefaultId, t.id)) || catTemplates[0];

              return (
                <button
                  type="button"
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  className={`w-full text-left px-3.5 py-2.5 rounded-xl transition-all flex items-center justify-between cursor-pointer group ${
                    isActive
                      ? 'bg-blue-600 text-white font-bold shadow-xs'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800/60 font-medium'
                  }`}
                >
                  <span className="truncate">{cat.label}</span>
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
          {/* Header Row: Document Title & Actions (Matching Zoho Screenshot) */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-5">
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
                  {activeCategoryDef.title}
                </h1>
                <span className="text-xs text-slate-400 font-medium hidden sm:inline">•</span>
                <span className="text-xs text-slate-500 font-medium hidden sm:inline">
                  {activeCategoryDef.description}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1 sm:hidden">
                {activeCategoryDef.description}
              </p>
            </div>

            <div className="flex items-center space-x-2.5">
              <button
                type="button"
                onClick={() => handleOpenOptions(undefined, 'properties')}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:bg-blue-50/50 dark:hover:bg-blue-950/30 rounded-lg transition-all cursor-pointer"
              >
                <Settings size={14} />
                <span>Configure Export File Name</span>
              </button>

              <button
                type="button"
                onClick={() => handleOpenOptions()}
                className="inline-flex items-center space-x-1.5 px-3.5 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700/70 transition-all cursor-pointer shadow-2xs"
              >
                <SlidersHorizontal size={14} className="text-slate-500" />
                <span>Configure PDF Options</span>
              </button>
            </div>
          </div>

          {/* Filter Bar: Status: All dropdown (Matching Zoho Screenshot) */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 text-xs">
              <span className="text-slate-500 font-medium">Status :</span>
              <select
                aria-label="Filter templates by status"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="px-2.5 py-1 text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
              >
                <option value="all">All</option>
                <option value="default">Default Only</option>
                <option value="custom">Non-Default</option>
              </select>
            </div>

            <div className="text-[11px] text-slate-400 font-medium">
              Showing {visibleTemplates.length} specialized templates • Default:{' '}
              <span className="font-bold text-slate-700 dark:text-slate-300">
                {categoryTemplates.find((t) => isTemplateMatching(activeDefaultTemplateId, t.id))?.badgeText || 'Default'}
              </span>
            </div>
          </div>

          {/* Template Cards Grid: Authentic Zoho Books A4 Sheet Layout */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pt-2">
            {visibleTemplates.map((style) => {
              const isDefault = isTemplateMatching(activeDefaultTemplateId, style.id);
              const isProcessing = savingDefault === style.id;

              return (
                <div key={style.id} className="flex flex-col items-center">
                  {/* Miniature A4 Sheet (Pure Paper White Canvas with Shadow) */}
                  <div
                    className={`w-full aspect-[1/1.38] rounded-xs transition-all duration-300 relative group overflow-hidden bg-white dark:bg-slate-900 border ${
                      isDefault
                        ? 'border-blue-500 shadow-lg ring-2 ring-blue-500/20'
                        : 'border-slate-200 dark:border-slate-800 shadow-md hover:shadow-xl hover:border-slate-300'
                    }`}
                  >
                    {/* Specialized Category Miniature Renderer */}
                    <CategorySpecializedThumbnail
                      category={activeCategory}
                      template={style}
                      docTitle={currentCategoryConfig.templateTitle || style.presetTitle}
                      orgName={currentOrg.name}
                      primaryColor={primaryColor}
                      accentColor={accentColor}
                      logoUrl={logoUrl}
                    />

                    {/* ⭐ DEFAULT BADGE (Bottom left inside sheet, exact match to Zoho screenshot) */}
                    {isDefault && (
                      <div className="absolute bottom-3 left-3 z-10">
                        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-sm bg-amber-500 text-white font-black text-[9.5px] tracking-wider uppercase shadow-xs">
                          <Star size={10} className="fill-white" />
                          <span>DEFAULT</span>
                        </span>
                      </div>
                    )}

                    {/* Hover Action Overlay */}
                    <div className="absolute inset-0 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col items-center justify-center p-4 space-y-2.5 z-20">
                      {!isDefault && (
                        <button
                          type="button"
                          disabled={isProcessing}
                          onClick={() => handleSetDefault(style.id)}
                          className="w-full max-w-[170px] py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-lg transition-transform active:scale-95 flex items-center justify-center space-x-1.5 cursor-pointer disabled:opacity-50"
                        >
                          <Star size={13} className="fill-white" />
                          <span>{isProcessing ? 'Updating…' : 'Set as Default'}</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => handleOpenOptions(style.id)}
                        className="w-full max-w-[170px] py-2 px-3 bg-white text-slate-800 hover:bg-slate-100 text-xs font-bold rounded-xl shadow-md transition-transform active:scale-95 flex items-center justify-center space-x-1.5 cursor-pointer"
                      >
                        <SlidersHorizontal size={13} />
                        <span>Customize Options</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleOpenFullPreview(style)}
                        className="w-full max-w-[170px] py-2 px-3 bg-slate-800/80 hover:bg-slate-800 text-white text-xs font-medium rounded-xl border border-slate-700 transition-transform active:scale-95 flex items-center justify-center space-x-1.5 cursor-pointer"
                      >
                        <Eye size={13} />
                        <span>Full Preview</span>
                      </button>
                    </div>
                  </div>

                  {/* Template Title Beneath Sheet (Matching Zoho screenshot) */}
                  <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200 mt-2.5 text-center">
                    {style.name}
                  </h3>
                </div>
              );
            })}

            {/* DEDICATED "NEW TEMPLATE" DASHED CARD (Exact Match to Zoho Screenshot) */}
            <div className="flex flex-col items-center">
              <div className="w-full aspect-[1/1.38] rounded-lg border-2 border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 p-6 flex flex-col justify-center items-start shadow-xs">
                <h3 className="font-bold text-base text-slate-900 dark:text-slate-100">
                  New Template
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed my-3">
                  Click to add a template from our gallery. You can customize the template title, columns, and headers in line item table.
                </p>
                <button
                  type="button"
                  onClick={() => handleOpenOptions()}
                  className="inline-flex items-center space-x-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg shadow-sm transition-all cursor-pointer"
                >
                  <Plus size={14} />
                  <span>+ New</span>
                </button>
              </div>
              <span className="text-xs text-slate-400 mt-2.5 font-medium">Add Template</span>
            </div>
          </div>
        </main>
      </div>

      {/* ============================================================== */}
      {/* OPTIONS DRAWER / MODAL (Tailored Per Category)                 */}
      {/* ============================================================== */}
      {isOptionsOpen && (
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
            <div className="flex border-b border-slate-100 dark:border-slate-800 px-6 bg-slate-50/50 dark:bg-slate-900/40 text-xs font-bold">
              <button
                type="button"
                onClick={() => setOptionsActiveTab('properties')}
                className={`py-3 px-4 border-b-2 cursor-pointer transition-colors ${
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
                className={`py-3 px-4 border-b-2 cursor-pointer transition-colors ${
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
                className={`py-3 px-4 border-b-2 cursor-pointer transition-colors ${
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
                        <span className="text-slate-700 dark:text-slate-300 font-medium">Project Milestones / Scope of Work</span>
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
                        <span className="text-slate-700 dark:text-slate-300 font-medium">E-Way Bill Number & Barcode</span>
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
                          checked={Boolean(optionsDraft.showUpiQr)}
                          onChange={(e) => setOptionsDraft({ ...optionsDraft, showUpiQr: e.target.checked })}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-slate-700 dark:text-slate-300 font-medium">Dynamic UPI Payment QR Code</span>
                      </label>
                    </div>
                  )}

                  {/* Credit Notes Specific Controls */}
                  {activeCategory === 'credit-notes' && (
                    <div className="grid grid-cols-2 gap-3 p-3.5 bg-blue-50/50 dark:bg-blue-950/30 rounded-xl border border-blue-100 dark:border-blue-900/50">
                      <label className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(optionsDraft.showOriginalInvoiceRef)}
                          onChange={(e) => setOptionsDraft({ ...optionsDraft, showOriginalInvoiceRef: e.target.checked })}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-slate-700 dark:text-slate-300 font-medium">Original Invoice Reference # & Date</span>
                      </label>
                      <label className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(optionsDraft.showReturnReason)}
                          onChange={(e) => setOptionsDraft({ ...optionsDraft, showReturnReason: e.target.checked })}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-slate-700 dark:text-slate-300 font-medium">Return / Credit Allowance Reason</span>
                      </label>
                      <label className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(optionsDraft.showTaxBreakdown)}
                          onChange={(e) => setOptionsDraft({ ...optionsDraft, showTaxBreakdown: e.target.checked })}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-slate-700 dark:text-slate-300 font-medium">Reverse CGST / SGST Tax Schedule</span>
                      </label>
                      <label className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(optionsDraft.showAmountInWords)}
                          onChange={(e) => setOptionsDraft({ ...optionsDraft, showAmountInWords: e.target.checked })}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-slate-700 dark:text-slate-300 font-medium">Net Credit Amount in Words</span>
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
                        <span className="text-slate-700 dark:text-slate-300 font-medium">Quality Inspection & SLA Terms</span>
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
                          checked={Boolean(optionsDraft.showAgingBuckets)}
                          onChange={(e) => setOptionsDraft({ ...optionsDraft, showAgingBuckets: e.target.checked })}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-slate-700 dark:text-slate-300 font-medium">Aging Buckets (0-30, 31-60, 90+ days)</span>
                      </label>
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
                          checked={Boolean(optionsDraft.showItcTag)}
                          onChange={(e) => setOptionsDraft({ ...optionsDraft, showItcTag: e.target.checked })}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-slate-700 dark:text-slate-300 font-medium">Input Tax Credit (ITC / GSTR-2B) Status</span>
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
                          checked={Boolean(optionsDraft.showClaimantName)}
                          onChange={(e) => setOptionsDraft({ ...optionsDraft, showClaimantName: e.target.checked })}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-slate-700 dark:text-slate-300 font-medium">Claimant / Employee Name</span>
                      </label>
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
                          checked={Boolean(optionsDraft.showReceiptsAttached)}
                          onChange={(e) => setOptionsDraft({ ...optionsDraft, showReceiptsAttached: e.target.checked })}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-slate-700 dark:text-slate-300 font-medium">Scanned Receipts Audit Tag</span>
                      </label>
                      <label className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(optionsDraft.showReimbursementStatus)}
                          onChange={(e) => setOptionsDraft({ ...optionsDraft, showReimbursementStatus: e.target.checked })}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-slate-700 dark:text-slate-300 font-medium">Reimbursement Bank / Status</span>
                      </label>
                    </div>
                  )}

                  {/* Vendor Credits Specific Controls */}
                  {activeCategory === 'vendor-credits' && (
                    <div className="grid grid-cols-2 gap-3 p-3.5 bg-blue-50/50 dark:bg-blue-950/30 rounded-xl border border-blue-100 dark:border-blue-900/50">
                      <label className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(optionsDraft.showOriginalBillRef)}
                          onChange={(e) => setOptionsDraft({ ...optionsDraft, showOriginalBillRef: e.target.checked })}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-slate-700 dark:text-slate-300 font-medium">Original Vendor Bill Ref #</span>
                      </label>
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
                          checked={Boolean(optionsDraft.showTdsDeduction)}
                          onChange={(e) => setOptionsDraft({ ...optionsDraft, showTdsDeduction: e.target.checked })}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-slate-700 dark:text-slate-300 font-medium">TDS Deduction (Tax Withholding)</span>
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
                          checked={Boolean(optionsDraft.showAgingBuckets)}
                          onChange={(e) => setOptionsDraft({ ...optionsDraft, showAgingBuckets: e.target.checked })}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-slate-700 dark:text-slate-300 font-medium">Payables Aging Buckets (0-30, 31-60, 90+)</span>
                      </label>
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
            <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/60 flex items-center justify-between">
              <span className="text-[11px] text-slate-400">
                Changes apply instantly across all new document exports.
              </span>
              <div className="flex items-center space-x-2">
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
                  className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs transition-all cursor-pointer disabled:opacity-50"
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
      {fullPreviewTemplate && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 w-full max-w-4xl rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[92vh]">
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
                      setFullPreviewTemplate(null);
                    }}
                    className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer"
                  >
                    <Star size={12} className="fill-white" />
                    <span>Set as Default</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setFullPreviewTemplate(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto bg-slate-100/60 dark:bg-slate-950/60 flex justify-center">
              <div className="w-full max-w-2xl space-y-3">
                <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-950 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-100">
                  <div className="font-bold">Layout sample only</div>
                  <p className="mt-0.5 text-blue-800 dark:text-blue-200">Use a current record below to open the server-rendered PDF with your organization’s real data.</p>
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
                  </div>
                </div>
                <div className="bg-white dark:bg-slate-900 p-8 rounded-xl shadow-lg border border-slate-200 dark:border-slate-800">
                <FullCategorySpecializedRenderer
                  category={activeCategory}
                  template={fullPreviewTemplate}
                  docTitle={currentCategoryConfig.templateTitle || fullPreviewTemplate.presetTitle}
                  orgName={currentOrg.name}
                  primaryColor={primaryColor}
                  accentColor={accentColor}
                  logoUrl={logoUrl}
                  currencySymbol={settings.currencySymbol || '₹'}
                  signatoryTitle={currentCategoryConfig.signatoryTitle || 'Authorized Signatory'}
                  terms={currentCategoryConfig.termsAndConditions || 'Terms & conditions apply.'}
                  footerNote={currentCategoryConfig.footerNote || 'Thank you for your business.'}
                />
                </div>
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
interface CategorySpecializedThumbnailProps {
  category: DocumentTemplateCategory;
  template: CategoryTemplateItem;
  docTitle: string;
  orgName: string;
  primaryColor: string;
  accentColor: string;
  logoUrl?: string;
}

const CategorySpecializedThumbnail: React.FC<CategorySpecializedThumbnailProps> = ({
  category,
  template,
  docTitle,
  orgName,
  primaryColor,
  accentColor,
  logoUrl,
}) => {
  const isSpreadsheet = template.id.includes('spreadsheet') || template.name.toLowerCase().includes('spreadsheet') || template.name.toLowerCase().includes('ledger');
  const isModern = template.id.includes('modern') || template.name.toLowerCase().includes('modern') || template.name.toLowerCase().includes('minimalist');
  const isCompact = template.id.includes('compact') || template.id.includes('pos') || template.name.toLowerCase().includes('compact');
  const isStandard = !isSpreadsheet && !isModern && !isCompact;

  return (
    <div className="w-full h-full bg-white text-slate-800 p-3 flex flex-col justify-between text-[6px] leading-[1.25] font-sans select-none overflow-hidden">
      {/* 1. TOP HEADER: Logo & Company on Left, Document Title on Right (Exact Zoho Books Style) */}
      <div>
        <div className="flex items-start justify-between pb-1.5 border-b border-slate-200">
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
            <span className="font-mono text-[5.5px] text-slate-500 block"># 2026-0042</span>
            <span className="text-[5px] text-slate-400 block">21 Sep 2026</span>
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
                <span className="font-bold text-slate-800 block">Acme Global Enterprises</span>
                <span className="text-slate-500 block">Customer ID: CUST-8819</span>
              </div>
              <div className="text-right">
                <span className="text-slate-400 block uppercase font-bold text-[5px]">Payment Method:</span>
                <span className="font-bold text-blue-600 block">NEFT / Online Wire</span>
                <span className="font-mono text-slate-500 block">UTR: AXISN0029419</span>
              </div>
            </>
          ) : category === 'customer-statements' || category === 'vendor-statements' ? (
            <>
              <div>
                <span className="text-slate-400 block uppercase font-bold text-[5px]">Statement Recipient:</span>
                <span className="font-bold text-slate-800 block">Acme Global Enterprises Ltd</span>
                <span className="text-slate-500 block">A/c Ref: ACME-042</span>
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
                <span className="font-bold text-slate-800 block">Acme Global Enterprises</span>
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
          <div className="space-y-1">
            <div className="p-0.5 bg-rose-50 text-rose-800 rounded border border-rose-200 text-[5px] font-bold">
              REF INVOICE: # INV-2026-0038 • REASON: Quality Rejection / Return
            </div>
            <table className="w-full text-[5.2px]">
              <thead>
                <tr className="bg-slate-100 font-bold border-b">
                  <th className="p-0.5 text-left">Returned Item</th>
                  <th className="p-0.5 text-center">Qty</th>
                  <th className="p-0.5 text-right">Rate</th>
                  <th className="p-0.5 text-right">Credit (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <tr>
                  <td className="p-0.5 font-medium">Hydraulic Pressure Gaskets #G4</td>
                  <td className="p-0.5 text-center font-mono">10</td>
                  <td className="p-0.5 text-right font-mono">1,000</td>
                  <td className="p-0.5 text-right font-mono font-bold text-rose-600">-11,800</td>
                </tr>
              </tbody>
            </table>
            <div className="text-right font-bold font-mono text-rose-600 text-[6.5px] pt-1 border-t">
              Net Credit: -₹11,800.00
            </div>
          </div>
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
          <div className="space-y-1 p-1 bg-slate-50 rounded border border-slate-200">
            <div className="text-[5px] text-slate-500">
              Received with thanks from <strong className="text-slate-900">Acme Global Enterprises</strong> the sum of:
            </div>
            <div className="font-mono font-black text-emerald-700 text-[8px] py-0.5">
              ₹82,400.00
            </div>
            <div className="text-[5px] text-slate-400 italic">
              "Eighty-Two Thousand Four Hundred Indian Rupees Only"
            </div>
            <div className="pt-1 border-t border-slate-200 flex justify-between text-[4.8px] text-slate-500">
              <span>Settling: INV-0042 & INV-0044</span>
              <span className="font-bold text-emerald-700">PAID & ENTERED</span>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* CUSTOMER / VENDOR STATEMENTS                              */}
        {/* ========================================================= */}
        {(category === 'customer-statements' || category === 'vendor-statements') && (
          <div className="space-y-1">
            <div className="flex justify-between p-0.5 bg-slate-100 rounded text-[5px] font-bold">
              <span>Opening Balance: ₹0.00</span>
              <span className="font-mono text-blue-600">Net Due: ₹82,400.00</span>
            </div>
            <table className="w-full text-[5px]">
              <thead>
                <tr className="border-b font-bold">
                  <th className="p-0.5 text-left">Date</th>
                  <th className="p-0.5 text-left">Ref Doc #</th>
                  <th className="p-0.5 text-right">Debit</th>
                  <th className="p-0.5 text-right">Credit</th>
                  <th className="p-0.5 text-right">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <tr>
                  <td className="p-0.5">02 May</td>
                  <td className="p-0.5">INV-0042</td>
                  <td className="p-0.5 text-right font-mono">1,00,000</td>
                  <td className="p-0.5 text-right text-slate-400">-</td>
                  <td className="p-0.5 text-right font-mono font-bold">1,00,000</td>
                </tr>
                <tr>
                  <td className="p-0.5">15 Jun</td>
                  <td className="p-0.5">REC-0012</td>
                  <td className="p-0.5 text-right text-slate-400">-</td>
                  <td className="p-0.5 text-right font-mono text-emerald-600">17,600</td>
                  <td className="p-0.5 text-right font-mono font-bold">82,400</td>
                </tr>
              </tbody>
            </table>
            <div className="flex justify-between p-0.5 bg-amber-50 text-amber-800 rounded font-bold text-[4.8px]">
              <span>0-30: ₹32.4k</span><span>31-60: ₹50.0k</span><span>61-90: ₹0</span><span>90+: ₹0</span>
            </div>
          </div>
        )}

        {/* ========================================================= */}
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
        {category === 'expenses' && (
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
        )}

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
      <div className="flex justify-between items-start pb-6 border-b-2" style={{ borderColor: primaryColor }}>
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

        <div className="text-right">
          <h1 className="text-2xl font-black tracking-tight" style={{ color: primaryColor }}>
            {docTitle}
          </h1>
          <p className="font-mono font-bold text-xs text-slate-500 mt-0.5"># DOC-2026-0042</p>
          <p className="text-xs text-slate-400">Date: 21 Sep 2026</p>
        </div>
      </div>

      {/* Category Specific Detailed Bodies */}
      {category === 'quotes' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl border text-xs">
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
            <thead className="bg-slate-800 text-white font-bold">
              <tr>
                <th className="p-2.5"># Scope & Deliverables</th>
                <th className="p-2.5 text-center">Qty</th>
                <th className="p-2.5 text-right">Unit Rate</th>
                <th className="p-2.5 text-right">Discount</th>
                <th className="p-2.5 text-right">Estimate Total</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              <tr>
                <td className="p-2.5">
                  <span className="font-bold block">Cloud Architecture Migration</span>
                  <span className="text-[11px] text-slate-400">Kubernetes cluster setup, zero-downtime database cutover</span>
                </td>
                <td className="p-2.5 text-center font-mono">1 Lot</td>
                <td className="p-2.5 text-right font-mono">₹60,000.00</td>
                <td className="p-2.5 text-right text-emerald-600">10% (-₹6,000)</td>
                <td className="p-2.5 text-right font-mono font-bold">₹54,000.00</td>
              </tr>
              <tr>
                <td className="p-2.5">
                  <span className="font-bold block">Security & Compliance Audit</span>
                  <span className="text-[11px] text-slate-400">SOC-2 Type II readiness audit and automated policy guardrails</span>
                </td>
                <td className="p-2.5 text-center font-mono">1 Lot</td>
                <td className="p-2.5 text-right font-mono">₹25,000.00</td>
                <td className="p-2.5 text-right text-slate-400">-</td>
                <td className="p-2.5 text-right font-mono font-bold">₹25,000.00</td>
              </tr>
            </tbody>
            <tfoot className="bg-slate-50 font-bold border-t">
              <tr>
                <td colSpan={4} className="p-2.5 text-right text-slate-600">Sub Total:</td>
                <td className="p-2.5 text-right font-mono">₹79,000.00</td>
              </tr>
              <tr>
                <td colSpan={4} className="p-2.5 text-right text-slate-600">Estimated GST (18%):</td>
                <td className="p-2.5 text-right font-mono">₹14,220.00</td>
              </tr>
              <tr className="border-t-2 font-black text-sm bg-slate-100">
                <td colSpan={4} className="p-2.5 text-right">Estimated Proposal Total:</td>
                <td className="p-2.5 text-right font-mono text-blue-600">₹93,220.00</td>
              </tr>
            </tfoot>
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
              <p className="font-bold text-slate-800 dark:text-slate-200 mt-1">Acme Global Enterprises Ltd</p>
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
        <div className="space-y-4">
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex justify-between items-center text-xs">
            <div>
              <span className="font-bold text-rose-800">Statutory Credit Memo</span>
              <p className="text-rose-600 mt-0.5">Original Invoice Ref: # INV-2026-0038 dated 10 Aug 2026</p>
            </div>
            <div className="text-right">
              <span className="text-rose-700 font-bold">Reason: Quality Rejection / Return</span>
            </div>
          </div>

          <table className="w-full text-left text-xs border rounded-xl overflow-hidden">
            <thead className="bg-slate-100 font-bold">
              <tr>
                <th className="p-2.5">Item Description</th>
                <th className="p-2.5 text-center">Returned Qty</th>
                <th className="p-2.5 text-right">Unit Rate</th>
                <th className="p-2.5 text-right">Reverse GST (18%)</th>
                <th className="p-2.5 text-right">Net Credit</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              <tr>
                <td className="p-2.5 font-bold">Hydraulic Pressure Gaskets #G4</td>
                <td className="p-2.5 text-center font-mono">10 Units</td>
                <td className="p-2.5 text-right font-mono">₹1,000.00</td>
                <td className="p-2.5 text-right font-mono text-rose-600">-₹1,800.00</td>
                <td className="p-2.5 text-right font-mono font-bold text-rose-600">-₹11,800.00</td>
              </tr>
            </tbody>
            <tfoot className="bg-rose-50 font-black border-t-2 text-rose-700">
              <tr>
                <td colSpan={4} className="p-2.5 text-right">Total Net Credit to Customer Balance:</td>
                <td className="p-2.5 text-right font-mono text-sm">-₹11,800.00</td>
              </tr>
            </tfoot>
          </table>
        </div>
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

      {category === 'expenses' && (
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
      )}

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
        <div className="space-y-4">
          <div className="p-3 bg-slate-100 dark:bg-slate-800 rounded-xl flex justify-between items-center text-xs font-bold">
            <span>Vendor Payables Period: 01 Apr 2026 – 21 Sep 2026</span>
            <span className="font-mono text-blue-600">Net Payables Due: ₹50,000.00</span>
          </div>

          <table className="w-full text-left text-xs border rounded-xl overflow-hidden">
            <thead className="bg-slate-100 dark:bg-slate-800 font-bold">
              <tr>
                <th className="p-2">Date</th>
                <th className="p-2">Transaction Detail</th>
                <th className="p-2 text-right">Bills (Cr)</th>
                <th className="p-2 text-right">Payments (Dr)</th>
                <th className="p-2 text-right">Balance Due</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              <tr>
                <td className="p-2">10 May 2026</td>
                <td className="p-2">Vendor Bill # BILL-2026-0042</td>
                <td className="p-2 text-right font-mono">₹1,25,000.00</td>
                <td className="p-2 text-right font-mono">-</td>
                <td className="p-2 text-right font-mono font-bold">₹1,25,000.00</td>
              </tr>
              <tr>
                <td className="p-2">28 Jun 2026</td>
                <td className="p-2">Payment Remittance # VP-2026-0019</td>
                <td className="p-2 text-right font-mono">-</td>
                <td className="p-2 text-right font-mono text-emerald-600">₹75,000.00</td>
                <td className="p-2.5 text-right font-mono font-bold">₹50,000.00</td>
              </tr>
            </tbody>
          </table>

          <div className="grid grid-cols-4 gap-2 text-center text-xs font-bold pt-2">
            <div className="p-2 bg-emerald-50 rounded border border-emerald-200">Current<br/>₹0.00</div>
            <div className="p-2 bg-amber-50 rounded border border-amber-200">1-30 Days<br/>₹50,000.00</div>
            <div className="p-2 bg-orange-50 rounded border border-orange-200">31-60 Days<br/>₹0.00</div>
            <div className="p-2 bg-rose-50 rounded border border-rose-200">90+ Days<br/>₹0.00</div>
          </div>
        </div>
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
          <div className="p-4 bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/60 rounded-xl space-y-2 text-xs">
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
              Receipt Acknowledgment
            </span>
            <p className="text-slate-600 dark:text-slate-300">
              Received with thanks from <strong className="text-slate-900 dark:text-slate-100">Acme Global Enterprises Ltd</strong> a sum of
              <strong className="text-emerald-700 dark:text-emerald-400 font-bold font-mono"> ₹82,400.00</strong> via
              <strong> NEFT / Online Banking Transfer (UTR: AXISN0029419)</strong>.
            </p>
          </div>

          <table className="w-full text-left text-xs border rounded-xl overflow-hidden">
            <thead className="bg-slate-100 dark:bg-slate-800 font-bold">
              <tr>
                <th className="p-2.5">Settled Invoice #</th>
                <th className="p-2.5">Invoice Date</th>
                <th className="p-2.5 text-right">Invoice Amount</th>
                <th className="p-2.5 text-right">Settled Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              <tr>
                <td className="p-2.5 font-bold">INV-2026-0042</td>
                <td className="p-2.5">02 May 2026</td>
                <td className="p-2.5 text-right font-mono">₹50,000.00</td>
                <td className="p-2.5 text-right font-mono font-bold text-emerald-600">₹50,000.00</td>
              </tr>
              <tr>
                <td className="p-2.5 font-bold">INV-2026-0044</td>
                <td className="p-2.5">15 Jun 2026</td>
                <td className="p-2.5 text-right font-mono">₹32,400.00</td>
                <td className="p-2.5 text-right font-mono font-bold text-emerald-600">₹32,400.00</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {category === 'customer-statements' && (
        <div className="space-y-4">
          <div className="p-3 bg-slate-100 dark:bg-slate-800 rounded-xl flex justify-between items-center text-xs font-bold">
            <span>Statement Period: 01 Apr 2026 – 21 Sep 2026</span>
            <span className="font-mono text-blue-600">Net Due: ₹82,400.00</span>
          </div>

          <table className="w-full text-left text-xs border rounded-xl overflow-hidden">
            <thead className="bg-slate-100 dark:bg-slate-800 font-bold">
              <tr>
                <th className="p-2">Date</th>
                <th className="p-2">Transaction Detail</th>
                <th className="p-2 text-right">Debits (₹)</th>
                <th className="p-2 text-right">Credits (₹)</th>
                <th className="p-2 text-right">Balance (₹)</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              <tr>
                <td className="p-2">02 May 2026</td>
                <td className="p-2">Tax Invoice # INV-2026-0042</td>
                <td className="p-2 text-right font-mono">₹1,00,000.00</td>
                <td className="p-2 text-right font-mono">-</td>
                <td className="p-2 text-right font-mono font-bold">₹1,00,000.00</td>
              </tr>
              <tr>
                <td className="p-2">15 Jun 2026</td>
                <td className="p-2">Payment Receipt # REC-2026-0012</td>
                <td className="p-2 text-right font-mono">-</td>
                <td className="p-2 text-right font-mono text-emerald-600">₹17,600.00</td>
                <td className="p-2 text-right font-mono font-bold">₹82,400.00</td>
              </tr>
            </tbody>
          </table>

          <div className="grid grid-cols-4 gap-2 text-center text-xs font-bold pt-2">
            <div className="p-2 bg-emerald-50 rounded border border-emerald-200">Current<br/>₹0.00</div>
            <div className="p-2 bg-amber-50 rounded border border-amber-200">1-30 Days<br/>₹32,400.00</div>
            <div className="p-2 bg-orange-50 rounded border border-orange-200">31-60 Days<br/>₹50,000.00</div>
            <div className="p-2 bg-rose-50 rounded border border-rose-200">90+ Days<br/>₹0.00</div>
          </div>
        </div>
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
