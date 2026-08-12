import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { Client } from '../../types';
import { useBooks } from '../../context/BooksContext';

interface ClientModalProps {
  isOpen: boolean;
  onClose: () => void;
  clientToEdit?: Client | null;
}

export const ClientModal: React.FC<ClientModalProps> = ({
  isOpen,
  onClose,
  clientToEdit,
}) => {
  const { settings, addClient, updateClient } = useBooks();

  const [name, setName] = useState(clientToEdit?.name || '');
  const [companyName, setCompanyName] = useState(clientToEdit?.companyName || '');
  const [email, setEmail] = useState(clientToEdit?.email || '');
  const [phone, setPhone] = useState(clientToEdit?.phone || '');
  const [billingAddress, setBillingAddress] = useState(clientToEdit?.billingAddress || '');
  const [taxId, setTaxId] = useState(clientToEdit?.taxId || '');
  const [currency, setCurrency] = useState(clientToEdit?.currency || '');
  const [paymentTerms, setPaymentTerms] = useState(clientToEdit?.paymentTerms || 'Net 30');
  const [notes, setNotes] = useState(clientToEdit?.notes || '');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setName(clientToEdit?.name || '');
    setCompanyName(clientToEdit?.companyName || '');
    setEmail(clientToEdit?.email || '');
    setPhone(clientToEdit?.phone || '');
    setBillingAddress(clientToEdit?.billingAddress || '');
    setTaxId(clientToEdit?.taxId || '');
    setCurrency(clientToEdit?.currency || '');
    setPaymentTerms(clientToEdit?.paymentTerms || 'Net 30');
    setNotes(clientToEdit?.notes || '');
    setIsSubmitting(false);
  }, [clientToEdit, isOpen]);

  useEffect(() => {
    if (isOpen && !clientToEdit && !currency && settings.currencyCode) {
      setCurrency(settings.currencyCode);
    }
  }, [clientToEdit, currency, isOpen, settings.currencyCode]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || isSubmitting) return;

    const submittedCurrency = settings.currencyCode.toUpperCase();
    if (!/^[A-Z]{3}$/.test(submittedCurrency)) {
      window.alert('The organization base currency is not configured. Reload the page before creating a client.');
      return;
    }

    if (clientToEdit) {
      updateClient(clientToEdit.id, {
        name,
        companyName,
        email,
        phone,
        billingAddress,
        taxId,
        currency,
        paymentTerms,
        notes,
      });
      return;
    } else {
      setIsSubmitting(true);
      try {
        await addClient({
          name: name.trim(),
          companyName: companyName.trim() || name.trim(),
          email: email.trim(),
          phone: phone.trim(),
          billingAddress: billingAddress.trim(),
          taxId: taxId.trim(),
          currency: submittedCurrency,
          paymentTerms,
          notes: notes.trim(),
        });
      } catch (error: any) {
        window.alert(error.message || 'Client could not be created');
        return;
      } finally {
        setIsSubmitting(false);
      }
    }

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 w-full max-w-lg overflow-hidden shadow-xl">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
          <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm">
            {clientToEdit ? 'Edit Client Record' : 'Add New Client'}
          </h3>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-600 dark:text-slate-300 font-medium mb-1">
                Contact Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. John Smith"
                required
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-slate-800 dark:text-slate-200"
              />
            </div>
            <div>
              <label className="block text-slate-600 dark:text-slate-300 font-medium mb-1">
                Company Name
              </label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="e.g. AcroTech Solutions Inc."
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-slate-800 dark:text-slate-200"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-600 dark:text-slate-300 font-medium mb-1">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="billing@company.com"
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-slate-800 dark:text-slate-200"
              />
            </div>
            <div>
              <label className="block text-slate-600 dark:text-slate-300 font-medium mb-1">
                Phone Number
              </label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+1 (555) 000-0000"
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-slate-800 dark:text-slate-200"
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-600 dark:text-slate-300 font-medium mb-1">
              Billing Address
            </label>
            <textarea
              value={billingAddress}
              onChange={(e) => setBillingAddress(e.target.value)}
              rows={2}
              placeholder="Full street address, city, state, ZIP..."
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-slate-800 dark:text-slate-200"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-slate-600 dark:text-slate-300 font-medium mb-1">
                Tax ID / VAT
              </label>
              <input
                type="text"
                value={taxId}
                onChange={(e) => setTaxId(e.target.value)}
                placeholder="US-99-00000"
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-slate-800 dark:text-slate-200"
              />
            </div>
            <div>
              <label className="block text-slate-600 dark:text-slate-300 font-medium mb-1">
                Currency
              </label>
              <select
                value={settings.currencyCode || currency}
                onChange={(e) => setCurrency(e.target.value)}
                disabled
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-slate-800 dark:text-slate-200 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <option value="">Loading organization currency…</option>
                {settings.currencyCode ? (
                  <option value={settings.currencyCode}>{settings.currencyCode} ({settings.currencySymbol})</option>
                ) : (
                  (settings.currencies && settings.currencies.length > 0
                    ? settings.currencies
                    : [
                        { code: 'INR', symbol: '₹' },
                        { code: 'USD', symbol: '$' },
                        { code: 'EUR', symbol: '€' },
                        { code: 'GBP', symbol: '£' },
                      ]
                  ).map((curr) => (
                    <option key={curr.code} value={curr.code}>
                      {curr.code} ({curr.symbol})
                    </option>
                  ))
                )}
              </select>
            </div>
            <div>
              <label className="block text-slate-600 dark:text-slate-300 font-medium mb-1">
                Payment Terms
              </label>
              <select
                value={paymentTerms}
                onChange={(e) => setPaymentTerms(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-slate-800 dark:text-slate-200"
              >
                <option value="Due on Receipt">Due on Receipt</option>
                <option value="Net 15">Net 15</option>
                <option value="Net 30">Net 30</option>
                <option value="Net 60">Net 60</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-slate-600 dark:text-slate-300 font-medium mb-1">
              Internal Client Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Special billing instructions, payment contacts..."
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-slate-800 dark:text-slate-200"
            />
          </div>

          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-end space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-semibold shadow-sm cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? 'Saving…' : 'Save Client'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
