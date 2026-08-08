import React, { useState } from 'react';
import { X, UserPlus, Building2 } from 'lucide-react';
import { useBooks } from '../../context/BooksContext';
import { Client } from '../../types';

interface QuickAddClientModalProps {
  isOpen: boolean;
  onClose: () => void;
  onClientCreated: (client: Client) => void;
}

export const QuickAddClientModal: React.FC<QuickAddClientModalProps> = ({
  isOpen,
  onClose,
  onClientCreated,
}) => {
  const { addClient, settings } = useBooks();

  const [companyName, setCompanyName] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() && !companyName.trim()) return;

    const finalCompany = companyName.trim() || name.trim();
    const finalName = name.trim() || companyName.trim();

    const created = addClient({
      companyName: finalCompany,
      name: finalName,
      email: email.trim(),
      phone: phone.trim(),
      billingAddress: '',
      currency: settings.currencyCode || 'USD',
      paymentTerms: 'Net 30',
    });

    onClientCreated(created);
    setCompanyName('');
    setName('');
    setEmail('');
    setPhone('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50">
          <div className="flex items-center space-x-2">
            <UserPlus className="w-4 h-4 text-emerald-600" />
            <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm">
              Quick Add Client
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          <div>
            <label className="block text-slate-600 dark:text-slate-300 font-medium mb-1">
              Company / Business Name *
            </label>
            <div className="relative">
              <Building2 className="w-4 h-4 absolute left-2.5 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="e.g. Acme Corporation"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                required
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg pl-9 pr-3 py-2 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-600 dark:text-slate-300 font-medium mb-1">
              Primary Contact Person Name *
            </label>
            <input
              type="text"
              placeholder="e.g. John Doe"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-600 dark:text-slate-300 font-medium mb-1">
                Email Address
              </label>
              <input
                type="email"
                placeholder="john@acme.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="block text-slate-600 dark:text-slate-300 font-medium mb-1">
                Phone Number
              </label>
              <input
                type="text"
                placeholder="+1 (555) 019-2834"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          <div className="pt-3 flex justify-end space-x-2 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-xl font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold shadow-xs transition-colors cursor-pointer"
            >
              Save & Select Client
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
