import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ImagePlus, Receipt, ShieldCheck, Trash2, X } from 'lucide-react';
import { useBooks } from '../../context/BooksContext';
import { Expense, ExpenseReceiptUpload } from '../../types';

interface ExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  expenseToEdit?: Expense | null;
  defaultProjectId?: string;
  defaultClientId?: string;
}

const today = () => new Date().toISOString().slice(0, 10);

const MAX_RECEIPT_IMAGES = 3;
const MAX_RECEIPT_BYTES = 900 * 1024;

async function compressReceiptImage(file: File): Promise<ExpenseReceiptUpload> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw new Error(`${file.name} is not a supported image. Use JPEG, PNG, or WebP.`);
  }
  const imageUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error(`Could not read ${file.name}.`));
      element.src = imageUrl;
    });
    const longestSide = Math.max(image.naturalWidth, image.naturalHeight);
    const scale = Math.min(1, 1600 / Math.max(1, longestSide));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Image compression is unavailable in this browser.');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    let quality = 0.88;
    let blob: Blob | null = null;
    while (quality >= 0.45) {
      blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
      if (blob && blob.size <= MAX_RECEIPT_BYTES) break;
      quality -= 0.1;
    }
    if (!blob || blob.size > MAX_RECEIPT_BYTES) throw new Error(`${file.name} is too detailed to compress under 900 KB.`);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return { name: file.name.replace(/\.[^.]+$/, '') + '.jpg', mimeType: 'image/jpeg', dataBase64: btoa(binary) };
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

export const ExpenseModal: React.FC<ExpenseModalProps> = ({
  isOpen,
  onClose,
  expenseToEdit,
  defaultProjectId,
  defaultClientId,
}) => {
  const { accounts, vendors, projects, addExpense, settings } = useBooks();
  const expenseAccounts = useMemo(
    () => accounts.filter((account) => account.type === 'Expense' && account.status !== 'Inactive'),
    [accounts]
  );
  const paymentAccounts = useMemo(
    () =>
      accounts.filter(
        (account) =>
          account.type === 'Asset' &&
          account.status !== 'Inactive' &&
          (account.code === '1000' ||
            ['Bank', 'Cash', 'Cash & Bank', 'Digital Wallet'].includes(account.subType))
      ),
    [accounts]
  );

  const [date, setDate] = useState(today());
  const [expenseAccountId, setExpenseAccountId] = useState('');
  const [paidFromAccountId, setPaidFromAccountId] = useState('');
  const [vendorId, setVendorId] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [projectId, setProjectId] = useState(defaultProjectId || '');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [receiptFiles, setReceiptFiles] = useState<File[]>([]);
  const receiptInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setDate(today());
    setExpenseAccountId(expenseAccounts[0]?.id || '');
    setPaidFromAccountId(paymentAccounts[0]?.id || '');
    setVendorId('');
    setAmount('');
    setDescription('');
    setProjectId(defaultProjectId || '');
    setError('');
    setIsSubmitting(false);
    setReceiptFiles([]);
  }, [isOpen, expenseAccounts, paymentAccounts]);

  if (!isOpen) return null;

  const postingUnavailable = expenseAccounts.length === 0 || paymentAccounts.length === 0;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    if (expenseToEdit) {
      setError('Posted expenses cannot be edited. Use an audited reversing entry and post a correction.');
      return;
    }

    const parsedAmount = Number(amount);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setError('Enter a valid posting date.');
      return;
    }
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0 || Math.round(parsedAmount * 100) !== parsedAmount * 100) {
      setError('Amount must be positive and contain no more than two decimal places.');
      return;
    }
    const expenseAccount = expenseAccounts.find((account) => account.id === expenseAccountId);
    const paymentAccount = paymentAccounts.find((account) => account.id === paidFromAccountId);
    if (!expenseAccount || !paymentAccount) {
      setError('Select an active expense account and an active bank, cash, or wallet account.');
      return;
    }

    const vendor = vendors.find((candidate) => candidate.id === vendorId);
    setIsSubmitting(true);
    try {
      const receiptImages = await Promise.all(receiptFiles.map(compressReceiptImage));
      await addExpense({
        vendorId: vendor?.id,
        vendorName: vendor?.companyName || vendor?.name,
        accountId: expenseAccount.id,
        accountName: expenseAccount.name,
        paidFromAccountId: paymentAccount.id,
        paidFromAccountName: paymentAccount.name,
        date,
        currency: settings.currencyCode,
        amount: parsedAmount,
        taxAmount: 0,
        projectId: projectId || undefined,
        clientId: projects.find((project) => project.id === projectId)?.clientId || defaultClientId,
        isBillable: false,
        receiptImages,
        paymentStatus: 'Paid',
        description: description.trim() || `Expense paid${vendor ? ` to ${vendor.companyName || vendor.name}` : ''}`,
      });
      onClose();
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : 'Expense could not be posted. No financial data was changed.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-slate-200 px-6 py-5 dark:border-slate-700">
          <div className="flex gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
              <Receipt className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Post paid expense</h2>
              <p className="mt-0.5 text-sm text-slate-500">
                Creates the expense and balanced journal entry in one database transaction.
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="space-y-5 p-6">
            <div className="flex gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                The server assigns the expense number, validates account ownership and roles, checks period locks, and posts both ledger legs atomically.
              </p>
            </div>

            {expenseToEdit && (
              <div className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  Posted expense editing is unavailable. Financial corrections require an audited reversal.
                </p>
              </div>
            )}

            {error && (
              <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
                {error}
              </div>
            )}

            {postingUnavailable && (
              <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
                Posting is unavailable until this organization has an active expense account and an active bank, cash, or wallet account.
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200">
                <span>Posting date</span>
                <input
                  type="date"
                  required
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 font-normal text-slate-900 outline-hidden focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </label>
              <label className="space-y-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200">
                <span>Amount ({settings.currencyCode})</span>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  inputMode="decimal"
                  required
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  placeholder="0.00"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 font-normal text-slate-900 outline-hidden focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </label>
              <label className="space-y-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200">
                <span>Expense account</span>
                <select
                  required
                  value={expenseAccountId}
                  onChange={(event) => setExpenseAccountId(event.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 font-normal text-slate-900 outline-hidden focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                >
                  <option value="">Select expense account</option>
                  {expenseAccounts.map((account) => (
                    <option key={account.id} value={account.id}>{account.code} — {account.name}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200">
                <span>Paid from</span>
                <select
                  required
                  value={paidFromAccountId}
                  onChange={(event) => setPaidFromAccountId(event.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 font-normal text-slate-900 outline-hidden focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                >
                  <option value="">Select payment account</option>
                  {paymentAccounts.map((account) => (
                    <option key={account.id} value={account.id}>{account.code} — {account.name}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200 sm:col-span-2">
                <span>Vendor (optional)</span>
                <select
                  value={vendorId}
                  onChange={(event) => setVendorId(event.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 font-normal text-slate-900 outline-hidden focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                >
                  <option value="">No vendor selected</option>
                  {vendors.map((vendor) => (
                    <option key={vendor.id} value={vendor.id}>{vendor.companyName || vendor.name}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200 sm:col-span-2">
                <span>Project (optional)</span>
                <select
                  value={projectId}
                  onChange={(event) => setProjectId(event.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 font-normal text-slate-900 outline-hidden focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                >
                  <option value="">No project selected</option>
                  {projects.filter((project) => project.status !== 'Cancelled').map((project) => (
                    <option key={project.id} value={project.id}>{project.code} — {project.name}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200 sm:col-span-2">
                <span>Description</span>
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  rows={3}
                  maxLength={500}
                  placeholder="Business purpose of this expense"
                  className="w-full resize-none rounded-xl border border-slate-300 bg-white px-3 py-2.5 font-normal text-slate-900 outline-hidden focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </label>
              <div className="space-y-2 sm:col-span-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Receipt images (optional)</span>
                  <button
                    type="button"
                    onClick={() => receiptInputRef.current?.click()}
                    disabled={receiptFiles.length >= MAX_RECEIPT_IMAGES || isSubmitting}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  >
                    <ImagePlus className="h-4 w-4" /> Add images
                  </button>
                  <input
                    ref={receiptInputRef}
                    className="sr-only"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    capture="environment"
                    multiple
                    onChange={(event) => {
                      const incoming = Array.from(event.target.files || []);
                      const next = [...receiptFiles, ...incoming].slice(0, MAX_RECEIPT_IMAGES);
                      if (incoming.length + receiptFiles.length > MAX_RECEIPT_IMAGES) setError('Attach up to three receipt images.');
                      setReceiptFiles(next);
                      event.target.value = '';
                    }}
                  />
                </div>
                {receiptFiles.length > 0 && (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {receiptFiles.map((file, index) => (
                      <div key={`${file.name}-${file.lastModified}-${index}`} className="flex min-w-0 items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-800">
                        <span className="truncate text-slate-700 dark:text-slate-200">{file.name}</span>
                        <button type="button" title={`Remove ${file.name}`} onClick={() => setReceiptFiles((files) => files.filter((_, currentIndex) => currentIndex !== index))} className="text-slate-400 hover:text-rose-600">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-6 py-4 dark:border-slate-700 dark:bg-slate-800/60">
            <p className="text-xs text-slate-500">Receipt images are stored with this expense. Tax, FX, and itemization remain unavailable.</p>
            <div className="flex shrink-0 gap-2">
              <button type="button" onClick={onClose} disabled={isSubmitting} className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                Cancel
              </button>
              <button
                type="submit"
                disabled={postingUnavailable || Boolean(expenseToEdit) || isSubmitting}
                className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSubmitting ? 'Posting…' : 'Post expense'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
