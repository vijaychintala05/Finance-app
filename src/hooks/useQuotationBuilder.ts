import { useState, useMemo, useEffect } from 'react';
import { createBrowserId } from '../utils/browserIds';

export interface BuilderLineItem {
  id: string;
  itemId?: string;
  name: string;
  description?: string;
  hsnSac?: string;
  quantity: number;
  unit: string;
  rate: number;
  discountPercent: number;
  discountAmount: number;
  taxRate: number;
}

export interface QuotationBuilderData {
  id?: string;
  estimateNumber?: string;
  customerId: string;
  customerName: string;
  projectId?: string;
  issueDate: string;
  expiryDate: string;
  items: BuilderLineItem[];
  overallDiscount: number;
  isGstInclusive: boolean;
  notes: string;
  terms: string;
  status: string;
}

export function useQuotationBuilder(initialData?: Partial<QuotationBuilderData>) {
  const [estimateNumber, setEstimateNumber] = useState(initialData?.estimateNumber || '');
  const [customerId, setCustomerId] = useState(initialData?.customerId || '');
  const [customerName, setCustomerName] = useState(initialData?.customerName || '');
  const [projectId, setProjectId] = useState(initialData?.projectId || '');
  const [issueDate, setIssueDate] = useState(
    initialData?.issueDate || new Date().toISOString().split('T')[0]
  );
  const [expiryDate, setExpiryDate] = useState(
    initialData?.expiryDate || new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]
  );
  const [isGstInclusive, setIsGstInclusive] = useState(Boolean(initialData?.isGstInclusive));
  const [overallDiscount, setOverallDiscount] = useState<number>(initialData?.overallDiscount || 0);
  const [notes, setNotes] = useState(initialData?.notes || 'Quotation valid for 30 days.');
  const [terms, setTerms] = useState(initialData?.terms || 'Payment within 30 days of invoice issuance.');
  const [status, setStatus] = useState(initialData?.status || 'DRAFT');

  const [items, setItems] = useState<BuilderLineItem[]>(() => {
    if (initialData?.items && initialData.items.length > 0) {
      return initialData.items;
    }
    return [
      {
        id: `line-${Date.now()}-1`,
        name: '',
        description: '',
        hsnSac: '',
        quantity: 1,
        unit: 'Pcs',
        rate: 0,
        discountPercent: 0,
        discountAmount: 0,
        taxRate: 18,
      },
    ];
  });

  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    if (initialData) {
      if (initialData.estimateNumber !== undefined) setEstimateNumber(initialData.estimateNumber);
      if (initialData.customerId !== undefined) setCustomerId(initialData.customerId);
      if (initialData.customerName !== undefined) setCustomerName(initialData.customerName);
      if (initialData.projectId !== undefined) setProjectId(initialData.projectId);
      if (initialData.issueDate !== undefined) setIssueDate(initialData.issueDate);
      if (initialData.expiryDate !== undefined) setExpiryDate(initialData.expiryDate);
      if (initialData.isGstInclusive !== undefined) setIsGstInclusive(Boolean(initialData.isGstInclusive));
      if (initialData.overallDiscount !== undefined) setOverallDiscount(initialData.overallDiscount);
      if (initialData.notes !== undefined) setNotes(initialData.notes);
      if (initialData.terms !== undefined) setTerms(initialData.terms);
      if (initialData.status !== undefined) setStatus(initialData.status);
      if (initialData.items && initialData.items.length > 0) setItems(initialData.items);
    }
  }, [initialData]);

  // Add Item Master saved item
  const addSavedItem = (savedItem: {
    id: string;
    name: string;
    description?: string;
    hsnSac?: string;
    unit?: string;
    salesRate?: number;
    gstRate?: number;
  }) => {
    setItems((prev) => [
      ...prev,
      {
        id: `line-${Date.now()}-${prev.length + 1}`,
        itemId: savedItem.id,
        name: savedItem.name,
        description: savedItem.description || '',
        hsnSac: savedItem.hsnSac || '',
        quantity: 1,
        unit: savedItem.unit || 'Pcs',
        rate: Number(savedItem.salesRate || 0),
        discountPercent: 0,
        discountAmount: 0,
        taxRate: Number(savedItem.gstRate || 0),
      },
    ]);
    setIsDirty(true);
  };

  // Add Custom Line Item
  const addCustomLine = () => {
    setItems((prev) => [
      ...prev,
      {
        id: `line-${Date.now()}-${prev.length + 1}`,
        name: '',
        description: '',
        hsnSac: '',
        quantity: 1,
        unit: 'Pcs',
        rate: 0,
        discountPercent: 0,
        discountAmount: 0,
        taxRate: 18,
      },
    ]);
    setIsDirty(true);
  };

  // Remove Line Item
  const removeLine = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
    setIsDirty(true);
  };

  // Duplicate Line Item
  const duplicateLine = (id: string) => {
    setItems((prev) => {
      const idx = prev.findIndex((item) => item.id === id);
      if (idx === -1) return prev;
      const original = prev[idx];
      const clone: BuilderLineItem = {
        ...original,
        id: createBrowserId('line'),
      };
      const next = [...prev];
      next.splice(idx + 1, 0, clone);
      return next;
    });
    setIsDirty(true);
  };

  // Update Line Item
  const updateLine = (id: string, updates: Partial<BuilderLineItem>) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        return { ...item, ...updates };
      })
    );
    setIsDirty(true);
  };

  // Calculate live preview totals
  const totals = useMemo(() => {
    let rawSubtotal = 0;
    let totalLineDiscounts = 0;

    const processedLines = items.map((line) => {
      const qty = Math.max(0, Number(line.quantity) || 0);
      const rate = Math.max(0, Number(line.rate) || 0);
      const gross = qty * rate;

      let discAmt = Math.max(0, Number(line.discountAmount) || 0);
      if (discAmt === 0 && line.discountPercent && line.discountPercent > 0) {
        discAmt = Math.round(gross * (Number(line.discountPercent) / 100) * 100) / 100;
      }
      if (discAmt > gross) discAmt = gross;

      const netLine = gross - discAmt;
      rawSubtotal += gross;
      totalLineDiscounts += discAmt;

      return {
        ...line,
        gross,
        discAmt,
        netLine,
      };
    });

    const subtotalPreDocDisc = rawSubtotal - totalLineDiscounts;
    const safeOvDisc = Math.min(Math.max(0, Number(overallDiscount) || 0), subtotalPreDocDisc);

    let taxTotal = 0;
    let taxableTotal = 0;

    processedLines.forEach((line) => {
      const lineTaxRate = Math.max(0, Math.min(100, Number(line.taxRate) || 0));
      const linePropDisc = subtotalPreDocDisc > 0 ? (line.netLine / subtotalPreDocDisc) * safeOvDisc : 0;
      const netLineTaxableBase = Math.max(0, line.netLine - linePropDisc);

      let lineTaxable = netLineTaxableBase;
      let lineTax = 0;

      if (isGstInclusive && lineTaxRate > 0) {
        lineTaxable = Math.round((netLineTaxableBase / (1 + lineTaxRate / 100)) * 100) / 100;
        lineTax = Math.round((netLineTaxableBase - lineTaxable) * 100) / 100;
      } else {
        lineTax = Math.round(lineTaxable * (lineTaxRate / 100) * 100) / 100;
      }

      taxableTotal += lineTaxable;
      taxTotal += lineTax;
    });

    taxableTotal = Math.round(taxableTotal * 100) / 100;
    taxTotal = Math.round(taxTotal * 100) / 100;
    const finalTotal = isGstInclusive
      ? Math.round((subtotalPreDocDisc - safeOvDisc) * 100) / 100
      : Math.round((taxableTotal + taxTotal) * 100) / 100;

    return {
      subtotal: rawSubtotal,
      lineDiscounts: totalLineDiscounts,
      subtotalAfterLineDiscounts: subtotalPreDocDisc,
      overallDiscount: safeOvDisc,
      taxableTotal,
      taxTotal,
      grandTotal: finalTotal,
    };
  }, [items, overallDiscount, isGstInclusive]);

  return {
    estimateNumber,
    setEstimateNumber,
    customerId,
    setCustomerId,
    customerName,
    setCustomerName,
    projectId,
    setProjectId,
    issueDate,
    setIssueDate,
    expiryDate,
    setExpiryDate,
    isGstInclusive,
    setIsGstInclusive,
    overallDiscount,
    setOverallDiscount,
    notes,
    setNotes,
    terms,
    setTerms,
    status,
    setStatus,
    items,
    setItems,
    addSavedItem,
    addCustomLine,
    removeLine,
    duplicateLine,
    updateLine,
    totals,
    isDirty,
    setIsDirty,
  };
}
