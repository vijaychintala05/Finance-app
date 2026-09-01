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
  const [filePreviews, setFilePreviews] = useState<Array<{ file: File; url: string }>>([]);
  const [isReceiptDragActive, setIsReceiptDragActive] = useState(false);
  const receiptInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const previews = receiptFiles.map((file) => ({
      file,
      url: URL.createObjectURL(file),
    }));
    setFilePreviews(previews);

    return () => {
      previews.forEach((p) => URL.revokeObjectURL(p.url));
    };
  }, [receiptFiles]);

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

  const appendReceiptFiles = (incoming: File[]) => {
    if (incoming.length === 0) return;
    const next = [...receiptFiles, ...incoming].slice(0, MAX_RECEIPT_IMAGES);
    if (incoming.length + receiptFiles.length > MAX_RECEIPT_IMAGES) {
      setError('Attach up to three receipt images.');
    } else {
      setError('');
    }
    setReceiptFiles(next);
  };

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
        className="flex max-h-[calc(100vh-2rem)] w-full max-w-6xl flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 sm:px-7 dark:border-slate-700">
          <div className="flex gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
              <Receipt className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Record Expense</h2>
              <p className="mt-0.5 text-xs text-slate-500">Record a paid business expense and attach its receipt.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800" aria-label="Close record expense">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-7">
            {expenseToEdit && (
              <div className="mb-5 flex gap-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  Posted expense editing is unavailable. Financial corrections require an audited reversal.
                </p>
              </div>
            )}

            {error && (
              <div role="alert" className="mb-5 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
                {error}
              </div>
            )}

            {postingUnavailable && (
              <div role="alert" className="mb-5 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
                Posting is unavailable until this organization has an active expense account and an active bank, cash, or wallet account.
              </div>
            )}

            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
              <section className="min-w-0 border border-slate-200 p-5 dark:border-slate-700 sm:p-6">
                <div className="mb-5 flex items-start gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-md bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300"><Receipt className="h-4 w-4" /></span>
                  <div><h3 className="text-base font-bold text-slate-900 dark:text-white">Expense details</h3><p className="mt-0.5 text-xs text-slate-500">Add the payment and accounting information.</p></div>
                </div>
                <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2">
              <label className="space-y-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200">
                <span>Posting date <span className="text-rose-600">*</span></span>
                <input
                  type="date"
                  required
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                  className="h-11 w-full rounded-md border border-slate-300 bg-white px-3 font-normal text-slate-900 outline-hidden focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </label>
              <label className="space-y-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200">
                <span>Expense account <span className="text-rose-600">*</span></span>
                <select
                  required
                  value={expenseAccountId}
                  onChange={(event) => setExpenseAccountId(event.target.value)}
                  className="h-11 w-full rounded-md border border-slate-300 bg-white px-3 font-normal text-slate-900 outline-hidden focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                >
                  <option value="">Select expense account</option>
                  {expenseAccounts.map((account) => <option key={account.id} value={account.id}>{account.code} — {account.name}</option>)}
                </select>
              </label>
              <label className="space-y-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200">
                <span>Amount <span className="text-rose-600">*</span></span>
                <div className="flex h-11 overflow-hidden rounded-md border border-slate-300 bg-white focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100 dark:border-slate-700 dark:bg-slate-800">
                  <span className="flex items-center border-r border-slate-200 px-3 text-sm font-medium text-slate-600 dark:border-slate-700 dark:text-slate-300">{settings.currencyCode}</span>
                  <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  inputMode="decimal"
                  required
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  placeholder="0.00"
                  className="min-w-0 flex-1 bg-transparent px-3 font-normal text-slate-900 outline-hidden dark:text-white"
                />
                </div>
              </label>
              <label className="space-y-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200">
                <span>Paid through <span className="text-rose-600">*</span></span>
                <select
                  required
                  value={paidFromAccountId}
                  onChange={(event) => setPaidFromAccountId(event.target.value)}
                  className="h-11 w-full rounded-md border border-slate-300 bg-white px-3 font-normal text-slate-900 outline-hidden focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                >
                  <option value="">Select payment account</option>
                  {paymentAccounts.map((account) => <option key={account.id} value={account.id}>{account.code} — {account.name}</option>)}
                </select>
              </label>
              <label className="space-y-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200">
                <span>Vendor</span>
                <select
                  value={vendorId}
                  onChange={(event) => setVendorId(event.target.value)}
                  className="h-11 w-full rounded-md border border-slate-300 bg-white px-3 font-normal text-slate-900 outline-hidden focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                >
                  <option value="">No vendor selected</option>
                  {vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.companyName || vendor.name}</option>)}
                </select>
              </label>
              <label className="space-y-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200 sm:col-span-2">
                <span>Project</span>
                <select
                  value={projectId}
                  onChange={(event) => setProjectId(event.target.value)}
                  className="h-11 w-full rounded-md border border-slate-300 bg-white px-3 font-normal text-slate-900 outline-hidden focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                >
                  <option value="">No project selected</option>
                  {projects.filter((project) => project.status !== 'Cancelled').map((project) => <option key={project.id} value={project.id}>{project.code} — {project.name}</option>)}
                </select>
              </label>
              <label className="space-y-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200 sm:col-span-2">
                <div className="flex items-center justify-between"><span>Notes</span><span className="text-xs font-normal text-slate-400">{description.length}/500</span></div>
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  rows={4}
                  maxLength={500}
                  placeholder="Add a note about this expense"
                  className="w-full resize-none rounded-md border border-slate-300 bg-white px-3 py-2.5 font-normal text-slate-900 outline-hidden focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </label>
                </div>
              </section>

              <section className="min-w-0 border border-slate-200 p-4 dark:border-slate-700 sm:p-5">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Receipt images (optional)</h3>
                <p className="mt-1 text-xs text-slate-500">Attach up to three JPG, PNG, or WebP receipt images.</p>
                <div
                  className={`mt-4 flex min-h-72 flex-col items-center justify-center border-2 border-dashed px-5 py-8 text-center transition-colors ${isReceiptDragActive ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30' : 'border-blue-200 bg-slate-50/50 dark:border-blue-900 dark:bg-slate-800/30'}`}
                  onDragEnter={(event) => { event.preventDefault(); setIsReceiptDragActive(true); }}
                  onDragOver={(event) => event.preventDefault()}
                  onDragLeave={(event) => { event.preventDefault(); setIsReceiptDragActive(false); }}
                  onDrop={(event) => { event.preventDefault(); setIsReceiptDragActive(false); appendReceiptFiles(Array.from(event.dataTransfer.files)); }}
                >
                  <span className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-50 text-blue-600 dark:bg-blue-950"><ImagePlus className="h-7 w-7" /></span>
                  <p className="mt-4 text-sm font-bold text-slate-800 dark:text-white">Drag and drop receipt images</p>
                  <p className="mt-1 text-xs text-slate-500">or choose images from this device</p>
                  <button
                    type="button"
                    onClick={() => receiptInputRef.current?.click()}
                    disabled={receiptFiles.length >= MAX_RECEIPT_IMAGES || isSubmitting}
                    className="mt-5 inline-flex items-center gap-1.5 rounded-md border border-blue-300 bg-white px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-blue-800 dark:bg-slate-900 dark:text-blue-300"
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
                      appendReceiptFiles(Array.from(event.target.files || []));
                      event.target.value = '';
                    }}
                  />
                </div>
                {filePreviews.length > 0 && (
                  <div className="mt-4 grid grid-cols-3 gap-2.5">
                    {filePreviews.map((item, index) => (
                      <div
                        key={`${item.file.name}-${item.file.lastModified}-${index}`}
                        className="group relative flex min-w-0 flex-col overflow-hidden rounded-md border border-slate-200 bg-white p-1.5 text-xs dark:border-slate-700 dark:bg-slate-800"
                      >
                        <div className="relative aspect-square w-full overflow-hidden rounded bg-slate-200 dark:bg-slate-700">
                          <img
                            src={item.url}
                            alt={item.file.name}
                            className="h-full w-full object-cover"
                          />
                          <button
                            type="button"
                            title={`Remove ${item.file.name}`}
                            onClick={() => setReceiptFiles((files) => files.filter((_, currentIndex) => currentIndex !== index))}
                            className="absolute right-1 top-1 rounded-md bg-rose-600/90 p-1 text-white opacity-90 shadow-sm transition hover:bg-rose-700 hover:opacity-100 cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <div className="mt-1.5 flex items-center justify-between gap-1 px-0.5">
                          <span className="truncate font-medium text-slate-700 dark:text-slate-200" title={item.file.name}>
                            {item.file.name}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <p className="mt-4 text-xs text-slate-400">Images are compressed before storage to keep your backup size reasonable.</p>
              </section>
            </div>
          </div>

          <div className="flex flex-col-reverse gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7 dark:border-slate-700 dark:bg-slate-800/60">
            <p className="flex items-center gap-1.5 text-xs text-slate-500"><ShieldCheck className="h-3.5 w-3.5 text-emerald-600" /> The expense and balanced journal entry are posted together.</p>
            <div className="flex shrink-0 gap-2">
              <button type="button" onClick={onClose} disabled={isSubmitting} className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                Cancel
              </button>
              <button
                type="submit"
                disabled={postingUnavailable || Boolean(expenseToEdit) || isSubmitting}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSubmitting ? 'Recording…' : 'Record expense'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
