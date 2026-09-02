import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  CreditCard,
  Landmark,
  Plus,
  Receipt,
  Smartphone,
  Wallet,
  X,
} from 'lucide-react';
import { Account, AccountSubType, AccountType } from '../../types';
import { useBooks } from '../../context/BooksContext';
import { BankingService } from '../../services/bankingService';
import { RESERVED_CODES } from '../coa/AccountModal';

export type QuickAccountCategory =
  | 'Bank'
  | 'Cash'
  | 'Credit Card'
  | 'Credit Cards'
  | 'Digital Wallet'
  | 'Undeposited Funds'
  | 'Loan/Credit';

interface QuickAddAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultCategory?: QuickAccountCategory;
  onAccountCreated?: (newAccount: Account) => void;
}

const getNextQuickCode = (categoryPreset: QuickAccountCategory, existingAccounts: Account[]): string => {
  const existingCodes = new Set(existingAccounts.map((a) => (a.code || '').trim()));
  let base = 1000;
  if (categoryPreset === 'Credit Card' || categoryPreset === 'Credit Cards' || categoryPreset === 'Loan/Credit') {
    base = 2000;
  }
  for (let c = base + 10; c < base + 990; c += 10) {
    const codeStr = String(c);
    if (!existingCodes.has(codeStr) && !RESERVED_CODES.has(codeStr)) {
      return codeStr;
    }
  }
  return String(base + 1);
};

export const QuickAddAccountModal: React.FC<QuickAddAccountModalProps> = ({
  isOpen,
  onClose,
  defaultCategory = 'Bank',
  onAccountCreated,
}) => {
  const { accounts = [], addAccount, settings } = useBooks();

  const [categoryPreset, setCategoryPreset] = useState<QuickAccountCategory>(
    defaultCategory as QuickAccountCategory
  );

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      let cat: QuickAccountCategory = (defaultCategory as QuickAccountCategory) || 'Bank';
      if (cat === ('Credit Cards' as any)) cat = 'Credit Card';
      setCategoryPreset(cat);
      setName('');
      setCode(getNextQuickCode(cat, accounts));
      setDescription('');
      setBankName('');
      setAccountNumber('');
      setError('');
      setIsSubmitting(false);
    }
  }, [isOpen, defaultCategory]);

  const handleSelectPreset = (cat: QuickAccountCategory) => {
    setCategoryPreset(cat);
    setCode(getNextQuickCode(cat, accounts));
  };

  // Pre-flight duplicate check
  const codeConflict = useMemo(() => {
    const trimmed = code.trim();
    if (!trimmed) return null;
    if (RESERVED_CODES.has(trimmed)) {
      return { isReserved: true, message: `Code ${trimmed} is reserved for a core system account.` };
    }
    const match = accounts.find((a) => a.code.toLowerCase() === trimmed.toLowerCase());
    if (match) {
      return {
        isArchived: match.status === 'Archived',
        message:
          match.status === 'Archived'
            ? `Code ${trimmed} belongs to archived account "${match.name}". Choose another code or restore it.`
            : `Code ${trimmed} is already in use by "${match.name}". Please pick another code.`,
      };
    }
    return null;
  }, [code, accounts]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const normalizedCode = code.trim();
    if (!name.trim() || !normalizedCode) return;

    if (codeConflict) {
      setError(codeConflict.message);
      return;
    }

    let type: AccountType = 'Asset';
    let subType: AccountSubType = 'Bank';

    if (categoryPreset === 'Bank') {
      type = 'Asset';
      subType = 'Bank';
    } else if (categoryPreset === 'Cash') {
      type = 'Asset';
      subType = 'Cash';
    } else if (categoryPreset === 'Credit Card' || categoryPreset === 'Credit Cards') {
      type = 'Liability';
      subType = 'Credit Cards';
    } else if (categoryPreset === 'Digital Wallet') {
      type = 'Asset';
      subType = 'Digital Wallet';
    } else if (categoryPreset === 'Undeposited Funds') {
      type = 'Asset';
      subType = 'Undeposited Funds';
    } else if (categoryPreset === 'Loan/Credit') {
      type = 'Liability';
      subType = 'Loan/Credit';
    }

    setIsSubmitting(true);
    try {
      const newAcc = await addAccount({
        code: normalizedCode,
        name: name.trim(),
        type,
        subType,
        description: description.trim() || undefined,
        balance: 0,
      });
      if (categoryPreset === 'Bank') {
        await BankingService.createAccount({
          ledgerAccountId: newAcc.id,
          accountName: newAcc.name,
          accountNumber: accountNumber.trim(),
          bankName: bankName.trim(),
          currency: settings.currencyCode,
          openingBalanceDate: new Date().toISOString().slice(0, 10),
          currentBalance: 0,
        });
      }
      if (onAccountCreated) onAccountCreated(newAcc);
      setName('');
      setDescription('');
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Account could not be created');
    } finally {
      setIsSubmitting(false);
    }
  };

  const categoriesConfig: {
    id: QuickAccountCategory;
    label: string;
    icon: React.ReactNode;
    activeColor: string;
    placeholder: string;
  }[] = [
    {
      id: 'Bank',
      label: 'Bank',
      icon: <Landmark className="w-4 h-4" />,
      activeColor: 'bg-blue-50 border-blue-600 text-blue-700 ring-1 ring-blue-600 shadow-2xs',
      placeholder: 'e.g. HDFC Operating Checking Account',
    },
    {
      id: 'Cash',
      label: 'Cash',
      icon: <Wallet className="w-4 h-4" />,
      activeColor: 'bg-emerald-50 border-emerald-600 text-emerald-700 ring-1 ring-emerald-600 shadow-2xs',
      placeholder: 'e.g. Office Petty Cash Drawer',
    },
    {
      id: 'Credit Card',
      label: 'Credit Card',
      icon: <CreditCard className="w-4 h-4" />,
      activeColor: 'bg-purple-50 border-purple-600 text-purple-700 ring-1 ring-purple-600 shadow-2xs',
      placeholder: 'e.g. Corporate Amex Gold #8812',
    },
    {
      id: 'Digital Wallet',
      label: 'Digital Wallet',
      icon: <Smartphone className="w-4 h-4" />,
      activeColor: 'bg-cyan-50 border-cyan-600 text-cyan-700 ring-1 ring-cyan-600 shadow-2xs',
      placeholder: 'e.g. PayPal / Stripe Clearing',
    },
    {
      id: 'Undeposited Funds',
      label: 'Undeposited Funds',
      icon: <Receipt className="w-4 h-4" />,
      activeColor: 'bg-amber-50 border-amber-600 text-amber-700 ring-1 ring-amber-600 shadow-2xs',
      placeholder: 'e.g. Customer Cheques Held For Deposit',
    },
    {
      id: 'Loan/Credit',
      label: 'Loan / Credit',
      icon: <Building2 className="w-4 h-4" />,
      activeColor: 'bg-rose-50 border-rose-600 text-rose-700 ring-1 ring-rose-600 shadow-2xs',
      placeholder: 'e.g. Working Capital Line of Credit',
    },
  ];

  const currentConfig =
    categoriesConfig.find((c) => c.id === categoryPreset) || categoriesConfig[0];

  return (
    <div
      className="fixed inset-0 bg-slate-950/50 backdrop-blur-xs flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-slate-900 px-6 py-4 flex justify-between items-center border-b border-slate-800">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-blue-600/20 text-blue-400 rounded-lg">
              <Landmark className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm tracking-tight text-white">Add New Account</h3>
              <p className="text-[11px] text-slate-400 font-medium">
                Select category: Bank, Cash, Credit Card, Digital Wallet, Undeposited Funds, or Loan/Credit
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 text-xs">
          {error && (
            <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-rose-800">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-600" />
              <span className="font-medium text-xs leading-relaxed">{error}</span>
            </div>
          )}

          {/* Account Category Selector */}
          <div>
            <label className="block text-slate-700 font-bold mb-2 uppercase tracking-wider text-[10px]">
              Required Category <span className="text-rose-500">*</span>
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {categoriesConfig.map((cat) => {
                const isSelected =
                  categoryPreset === cat.id || (cat.id === 'Credit Card' && categoryPreset === 'Credit Cards');
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => handleSelectPreset(cat.id)}
                    className={`p-2.5 rounded-xl border text-center flex items-center space-x-2 transition-all cursor-pointer ${
                      isSelected
                        ? cat.activeColor
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <div className="shrink-0">{cat.icon}</div>
                    <span className="font-extrabold text-[11px] truncate">{cat.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Account Name */}
          <div>
            <label className="block text-slate-700 font-bold mb-1">
              Account Name <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              placeholder={currentConfig.placeholder}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 text-slate-900 font-semibold px-3 py-2 rounded-xl text-xs focus:outline-none transition-all"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Account Code */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-slate-700 font-bold">Account Code <span className="text-rose-500">*</span></label>
                <button
                  type="button"
                  onClick={() => setCode(getNextQuickCode(categoryPreset, accounts))}
                  className="text-[10px] font-semibold text-blue-600 hover:text-blue-700 cursor-pointer"
                >
                  Auto-suggest
                </button>
              </div>
              <input
                type="text"
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="e.g. 1010"
                className={`w-full bg-slate-50 border text-slate-900 font-mono font-bold px-3 py-2 rounded-xl text-xs focus:outline-none transition-all ${
                  codeConflict
                    ? 'border-rose-400 bg-rose-50/50 text-rose-900'
                    : 'border-slate-200 focus:border-blue-600'
                }`}
              />
              {codeConflict ? (
                <p className="mt-1 text-[11px] text-rose-600 font-medium leading-tight">
                  ⚠ {codeConflict.message}
                </p>
              ) : code.trim() ? (
                <p className="mt-1 text-[11px] text-emerald-600 flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" /> Code available
                </p>
              ) : null}
            </div>

            <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-[11px] leading-relaxed text-blue-800">
              New accounts start at zero. Record any opening balance with a balanced opening journal so the trial balance remains trustworthy.
            </div>
          </div>

          {categoryPreset === 'Bank' && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-slate-700 font-bold mb-1">Bank name <span className="text-rose-500">*</span></label>
                <input required value={bankName} onChange={(event) => setBankName(event.target.value)} placeholder="e.g. HDFC Bank" className="w-full bg-slate-50 border border-slate-200 focus:border-blue-600 text-slate-900 font-semibold px-3 py-2 rounded-xl text-xs focus:outline-none" />
              </div>
              <div>
                <label className="block text-slate-700 font-bold mb-1">Account number <span className="text-rose-500">*</span></label>
                <input required minLength={4} maxLength={34} value={accountNumber} onChange={(event) => setAccountNumber(event.target.value)} placeholder="4–34 letters or digits" className="w-full bg-slate-50 border border-slate-200 focus:border-blue-600 text-slate-900 font-mono font-semibold px-3 py-2 rounded-xl text-xs focus:outline-none" />
              </div>
            </div>
          )}

          {/* Description */}
          <div>
            <label className="block text-slate-700 font-bold mb-1">Notes / Account # (Optional)</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Account ending in #4910 - Main Branch"
              className="w-full bg-slate-50 border border-slate-200 focus:border-blue-600 text-slate-800 font-medium px-3 py-2 rounded-xl text-xs focus:outline-none"
            />
          </div>

          {/* Footer Buttons */}
          <div className="flex justify-end items-center space-x-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-bold transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || Boolean(codeConflict)}
              className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-5 py-2 rounded-xl flex items-center space-x-1.5 shadow-sm transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus className="w-4 h-4" />
              <span>{isSubmitting ? 'Saving...' : 'Save Account'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
