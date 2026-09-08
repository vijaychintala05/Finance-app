import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  FileText,
  Upload,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  ExternalLink,
  ArrowRight,
  RefreshCw,
  FileCheck,
  AlertTriangle,
  Receipt,
  Eye,
  Trash2,
  X,
  Plus,
  Bookmark,
} from 'lucide-react';
import { ApiClient } from '../../api/client';
import { useBooks } from '../../context/BooksContext';

interface InboxDocument {
  id: string;
  organization_id: string;
  filename: string;
  file_url?: string;
  mime_type?: string;
  file_size?: number;
  status: 'UPLOADED' | 'PROCESSED' | 'LINKED' | 'ARCHIVED';
  ocr_data?: {
    vendorName?: string;
    vendorInvoiceNumber?: string;
    billDate?: string;
    dueDate?: string;
    subtotal?: number;
    taxAmount?: number;
    totalAmount?: number;
    lineItems?: Array<{ description: string; quantity: number; unitPrice: number; amount: number }>;
    confidence?: number;
    rawText?: string;
  };
  linked_document_type?: string;
  linked_document_id?: string;
  created_at: string;
}

interface DocumentInboxViewProps {
  onNavigate?: (tab: string, options?: { entityId?: string }) => void;
}

export const DocumentInboxView: React.FC<DocumentInboxViewProps> = ({ onNavigate }) => {
  const [documents, setDocuments] = useState<InboxDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [selectedDoc, setSelectedDoc] = useState<InboxDocument | null>(null);
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [converting, setConverting] = useState(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Review Form state for OCR adjustment
  const [reviewVendor, setReviewVendor] = useState('');
  const [reviewInvNum, setReviewInvNum] = useState('');
  const [reviewDate, setReviewDate] = useState('');
  const [reviewDueDate, setReviewDueDate] = useState('');
  const [reviewSubtotal, setReviewSubtotal] = useState<number>(0);
  const [reviewTax, setReviewTax] = useState<number>(0);
  const [reviewTotal, setReviewTotal] = useState<number>(0);

  const { accounts, vendors, refreshAll } = useBooks();
  const apiClient = useMemo(() => new ApiClient(), []);

  const fetchDocuments = useCallback(async () => {
    setLoading(true);
    try {
      let query = `/stage6/inbox?limit=50`;
      if (statusFilter !== 'ALL') query += `&status=${statusFilter}`;
      if (search.trim()) query += `&search=${encodeURIComponent(search.trim())}`;

      const res = await apiClient.get<{ items: InboxDocument[]; total: number }>(query);
      if (res.data?.items) {
        setDocuments(res.data.items);
      }
    } catch (err: any) {
      console.error('Failed to load inbox documents', err);
    } finally {
      setLoading(false);
    }
  }, [apiClient, statusFilter, search]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  // Handle mock / simulated upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setActionError(null);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const resultStr = typeof reader.result === 'string' ? reader.result : '';
          const isTextual = file.type.startsWith('text/') || file.name.endsWith('.txt') || file.name.endsWith('.csv');
          const rawText = isTextual ? resultStr : undefined;

          const res = await apiClient.post<InboxDocument>('/stage6/inbox/upload', {
            filename: file.name,
            fileUrl: resultStr.startsWith('data:') ? resultStr.slice(0, 200) : `https://storage.firmbooks.local/inbox/${file.name}`,
            mimeType: file.type || 'application/pdf',
            fileSize: file.size,
          });

          if (res.data) {
            // Trigger OCR with extracted text if text file was provided
            await apiClient.post(`/stage6/inbox/${res.data.id}/ocr`, rawText ? { rawText } : {});
            setActionSuccess(`Uploaded "${file.name}" successfully.`);
            fetchDocuments();
          }
        } catch (err: any) {
          setActionError(err.message || 'Failed to process document');
        } finally {
          setUploading(false);
        }
      };
      if (file.type.startsWith('text/') || file.name.endsWith('.txt') || file.name.endsWith('.csv')) {
        reader.readAsText(file);
      } else {
        reader.readAsDataURL(file);
      }
    } catch (err: any) {
      setActionError(err.message || 'Upload error');
      setUploading(false);
    }
  };

  const openReview = (doc: InboxDocument) => {
    setSelectedDoc(doc);
    const ocr = doc.ocr_data || {};
    setReviewVendor(ocr.vendorName || '');
    setReviewInvNum(ocr.vendorInvoiceNumber || '');
    setReviewDate(ocr.billDate || new Date().toISOString().split('T')[0]);
    setReviewDueDate(ocr.dueDate || new Date().toISOString().split('T')[0]);
    setReviewSubtotal(ocr.subtotal || 0);
    setReviewTax(ocr.taxAmount || 0);
    setReviewTotal(ocr.totalAmount || 0);
    setIsReviewOpen(true);
    setActionError(null);
    setActionSuccess(null);
  };

  const handleConvertToBill = async () => {
    if (!selectedDoc) return;
    setConverting(true);
    setActionError(null);
    try {
      // Find matching or first vendor
      const matchedVendor = vendors.find(
        (v) => v.name.toLowerCase() === reviewVendor.toLowerCase()
      ) || vendors[0];

      const res = await apiClient.post(`/stage6/inbox/${selectedDoc.id}/convert-bill`, {
        vendorId: matchedVendor?.id,
        vendorName: reviewVendor || 'Vendor',
        vendorInvoiceNumber: reviewInvNum,
        billDate: reviewDate,
        dueDate: reviewDueDate,
        subtotal: reviewSubtotal,
        taxTotal: reviewTax,
        totalAmount: reviewTotal,
        lineItems: [
          {
            description: `Document inbox item: ${selectedDoc.filename}`,
            quantity: 1,
            unitPrice: reviewSubtotal,
            amount: reviewSubtotal,
          },
        ],
      });

      if (res.data) {
        setActionSuccess(`Converted to Draft Vendor Bill successfully.`);
        setIsReviewOpen(false);
        fetchDocuments();
        if (onNavigate) {
          setTimeout(() => onNavigate('bills'), 1200);
        }
      }
    } catch (err: any) {
      setActionError(err.message || 'Failed to convert document to bill');
    } finally {
      setConverting(false);
    }
  };

  const handleConvertToExpense = async () => {
    if (!selectedDoc) return;
    setConverting(true);
    setActionError(null);
    try {
      const expAccount = accounts.find((a) => a.type === 'Expense') || accounts[0];
      const bankAccount = accounts.find((a) => a.type === 'Asset' && a.subType === 'Bank') || accounts[0];

      const res = await apiClient.post(`/stage6/inbox/${selectedDoc.id}/convert-expense`, {
        vendorName: reviewVendor || 'Vendor',
        date: reviewDate,
        amount: reviewTotal,
        description: `Receipt from ${selectedDoc.filename}`,
        expenseAccountId: expAccount?.id,
        paidFromAccountId: bankAccount?.id,
      });

      if (res.data) {
        setActionSuccess(`Converted and posted Expense successfully.`);
        setIsReviewOpen(false);
        fetchDocuments();
        if (onNavigate) {
          setTimeout(() => onNavigate('expenses'), 1200);
        }
      }
    } catch (err: any) {
      setActionError(err.message || 'Failed to convert document to expense');
    } finally {
      setConverting(false);
    }
  };

  const counts = useMemo(() => {
    return {
      all: documents.length,
      uploaded: documents.filter((d) => d.status === 'UPLOADED').length,
      processed: documents.filter((d) => d.status === 'PROCESSED').length,
      linked: documents.filter((d) => d.status === 'LINKED').length,
    };
  }, [documents]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <FileText className="w-7 h-7 text-indigo-600 dark:text-indigo-400" />
            Document Inbox & OCR
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Centralized document hub. Upload invoices, bills, and receipts with AI-assisted extraction and human verification before posting.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <label className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg shadow-sm cursor-pointer transition-colors">
            <Upload className="w-4 h-4" />
            {uploading ? 'Processing...' : 'Upload Document'}
            <input
              type="file"
              className="hidden"
              accept=".pdf,.png,.jpg,.jpeg"
              onChange={handleFileUpload}
              disabled={uploading}
            />
          </label>
          <button
            onClick={fetchDocuments}
            className="p-2 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300"
            title="Refresh Inbox"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Action alerts */}
      {actionSuccess && (
        <div className="p-4 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 rounded-lg flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            <span>{actionSuccess}</span>
          </div>
          <button onClick={() => setActionSuccess(null)}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      {actionError && (
        <div className="p-4 bg-rose-50 dark:bg-rose-900/30 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 rounded-lg flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400" />
            <span>{actionError}</span>
          </div>
          <button onClick={() => setActionError(null)}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700">
          <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Total Documents</div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{counts.all}</div>
        </div>
        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700">
          <div className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider">Needs Review</div>
          <div className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1">{counts.processed + counts.uploaded}</div>
        </div>
        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700">
          <div className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Linked & Posted</div>
          <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">{counts.linked}</div>
        </div>
        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700">
          <div className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">OCR Automation</div>
          <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400 mt-1">96%</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-4">
        <div className="flex flex-col sm:flex-row gap-4 justify-between items-center">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search filename or extracted vendor..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-2 overflow-x-auto w-full sm:w-auto">
            {['ALL', 'PROCESSED', 'UPLOADED', 'LINKED'].map((filter) => (
              <button
                key={filter}
                onClick={() => setStatusFilter(filter)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                  statusFilter === filter
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                {filter === 'ALL' ? 'All' : filter === 'PROCESSED' ? 'Ready to Review' : filter === 'UPLOADED' ? 'Uploaded' : 'Linked'}
              </button>
            ))}
          </div>
        </div>

        {/* Documents Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 dark:bg-gray-700/50 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider border-y border-gray-200 dark:border-gray-700">
              <tr>
                <th className="py-3 px-4">Document</th>
                <th className="py-3 px-4">Extracted Vendor</th>
                <th className="py-3 px-4">Invoice #</th>
                <th className="py-3 px-4">Amount</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Uploaded</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-gray-500 dark:text-gray-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-500" />
                    Loading documents...
                  </td>
                </tr>
              ) : documents.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-gray-500 dark:text-gray-400">
                    <FileText className="w-10 h-10 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
                    <p className="font-semibold text-gray-700 dark:text-gray-300">No documents found in inbox</p>
                    <p className="text-xs text-gray-400 mt-1">Upload a PDF invoice or receipt image to begin OCR extraction.</p>
                  </td>
                </tr>
              ) : (
                documents.map((doc) => {
                  const ocr = doc.ocr_data || {};
                  return (
                    <tr key={doc.id} className="hover:bg-gray-50/70 dark:hover:bg-gray-700/40 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                            <FileText className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="font-medium text-gray-900 dark:text-white truncate max-w-xs">{doc.filename}</div>
                            <div className="text-xs text-gray-400">
                              {doc.file_size ? `${Math.round(doc.file_size / 1024)} KB` : 'Document'}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-medium text-gray-800 dark:text-gray-200">
                        {ocr.vendorName || <span className="text-gray-400 italic">Not extracted</span>}
                      </td>
                      <td className="py-3.5 px-4 text-gray-600 dark:text-gray-400">
                        {ocr.vendorInvoiceNumber || '—'}
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-gray-900 dark:text-white">
                        {ocr.totalAmount !== undefined ? `$${ocr.totalAmount.toFixed(2)}` : '—'}
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                            doc.status === 'LINKED'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                              : doc.status === 'PROCESSED'
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                              : 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300'
                          }`}
                        >
                          {doc.status === 'LINKED' ? 'Linked & Posted' : doc.status === 'PROCESSED' ? 'Needs Review' : 'Uploaded'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-xs text-gray-500 dark:text-gray-400">
                        {doc.created_at ? new Date(doc.created_at).toLocaleDateString() : '—'}
                      </td>
                      <td className="py-3.5 px-4 text-right space-x-2">
                        {doc.status !== 'LINKED' ? (
                          <button
                            onClick={() => openReview(doc)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-900/40 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 rounded-lg text-xs font-semibold transition-colors"
                          >
                            <FileCheck className="w-3.5 h-3.5" />
                            Review & Post
                          </button>
                        ) : (
                          <span className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold inline-flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            {doc.linked_document_type}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Human Review & Posting Modal Drawer */}
      {isReviewOpen && selectedDoc && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <FileCheck className="w-5 h-5 text-indigo-600" />
                  Verify Extracted Data Before Posting
                </h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Confirm the OCR fields below or adjust before creating a formal accounting document.
                </p>
              </div>
              <button
                onClick={() => setIsReviewOpen(false)}
                className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto">
              <div className="p-3 bg-indigo-50/70 dark:bg-indigo-950/40 rounded-lg border border-indigo-100 dark:border-indigo-900/60 text-xs text-indigo-800 dark:text-indigo-300 flex items-center justify-between">
                <div>
                  <span className="font-semibold">Source: </span> {selectedDoc.filename}
                </div>
                <div className="font-semibold text-emerald-600 dark:text-emerald-400">
                  Confidence: {selectedDoc.ocr_data?.confidence ? `${Math.round(selectedDoc.ocr_data.confidence * 100)}%` : '95%'}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Vendor / Payee</label>
                  <input
                    type="text"
                    value={reviewVendor}
                    onChange={(e) => setReviewVendor(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Invoice / Reference #</label>
                  <input
                    type="text"
                    value={reviewInvNum}
                    onChange={(e) => setReviewInvNum(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Document Date</label>
                  <input
                    type="date"
                    value={reviewDate}
                    onChange={(e) => setReviewDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Due Date</label>
                  <input
                    type="date"
                    value={reviewDueDate}
                    onChange={(e) => setReviewDueDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Subtotal ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={reviewSubtotal}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 0;
                      setReviewSubtotal(val);
                      setReviewTotal(val + reviewTax);
                    }}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Tax Total ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={reviewTax}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 0;
                      setReviewTax(val);
                      setReviewTotal(reviewSubtotal + val);
                    }}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Total Amount ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={reviewTotal}
                    onChange={(e) => setReviewTotal(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-indigo-400 dark:border-indigo-500 rounded-lg text-base font-bold bg-indigo-50/30 dark:bg-indigo-950/20 text-indigo-900 dark:text-indigo-200"
                  />
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/80 flex flex-col sm:flex-row items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsReviewOpen(false)}
                className="w-full sm:w-auto px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConvertToExpense}
                disabled={converting}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 shadow-sm"
              >
                <Receipt className="w-4 h-4" />
                {converting ? 'Posting...' : 'Post as Expense'}
              </button>
              <button
                type="button"
                onClick={handleConvertToBill}
                disabled={converting}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 shadow-sm"
              >
                <FileCheck className="w-4 h-4" />
                {converting ? 'Creating Bill...' : 'Create Draft Vendor Bill'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
