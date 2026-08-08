import React, { useEffect, useState } from 'react';
import {
  Building2,
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

export const QuickAddAccountModal: React.FC<QuickAddAccountModalProps> = ({
  isOpen,
  onClose,
  defaultCategory = 'Bank',
  onAccountCreated,
}) => {
  const { addAccount } = useBooks();

  const [categoryPreset, setCategoryPreset] = useState<QuickAccountCategory>(
    defaultCategory as QuickAccountCategory
  );

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [openingBalance, setOpeningBalance] = useState('0');

  useEffect(() => {
    if (isOpen) {
      let cat: QuickAccountCategory = (defaultCategory as QuickAccountCategory) || 'Bank';
      if (cat === ('Credit Cards' as any)) cat = 'Credit Card';
      setCategoryPreset(cat);
      generateCode(cat);
      setName('');
      setDescription('');
      setOpeningBalance('0');
    }
  }, [isOpen, defaultCategory]);

  const generateCode = (cat: QuickAccountCategory) => {
    let prefix = '10';
    if (cat === 'Bank') prefix = '10';
    else if (cat === 'Cash') prefix = '10';
    else if (cat === 'Credit Card' || cat === 'Credit Cards') prefix = '21';
    else if (cat === 'Digital Wallet') prefix = '11';
    else if (cat === 'Undeposited Funds') prefix = '12';
    else if (cat === 'Loan/Credit') prefix = '25';

    const randomSuffix = Math.floor(20 + Math.random() * 70);
    setCode(`${prefix}${randomSuffix}`);
  };

  const handleSelectPreset = (cat: QuickAccountCategory) => {
    setCategoryPreset(cat);
    generateCode(cat);
  };

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

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

    const newAcc = addAccount({
      code: code || `10${Math.floor(10 + Math.random() * 80)}`,
      name: name.trim(),
      type,
      subType,
      description: description.trim() || undefined,
      balance: parseFloat(openingBalance) || 0,
    });

    if (onAccountCreated) {
      onAccountCreated(newAcc);
    }

    setName('');
    setDescription('');
    setOpeningBalance('0');
    onClose();
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
      placeholder: 'e.g. Main Cash Drawer / Petty Cash Vault',
    },
    {
      id: 'Credit Card',
      label: 'Credit Card',
      icon: <CreditCard className="w-4 h-4" />,
      activeColor: 'bg-purple-50 border-purple-600 text-purple-700 ring-1 ring-purple-600 shadow-2xs',
      placeholder: 'e.g. Corporate Amex / Executive Mastercard',
    },
    {
      id: 'Digital Wallet',
      label: 'Digital Wallet',
      icon: <Smartphone className="w-4 h-4" />,
      activeColor: 'bg-cyan-50 border-cyan-600 text-cyan-700 ring-1 ring-cyan-600 shadow-2xs',
      placeholder: 'e.g. PayPal Business, Stripe Balance, Paytm',
    },
    {
      id: 'Undeposited Funds',
      label: 'Undeposited Funds',
      icon: <Receipt className="w-4 h-4" />,
      activeColor: 'bg-amber-50 border-amber-600 text-amber-800 ring-1 ring-amber-600 shadow-2xs',
      placeholder: 'e.g. Undeposited Customer Payments & Cash Receipts',
    },
    {
      id: 'Loan/Credit',
      label: 'Loan / Credit',
      icon: <Building2 className="w-4 h-4" />,
      activeColor: 'bg-rose-50 border-rose-600 text-rose-700 ring-1 ring-rose-600 shadow-2xs',
      placeholder: 'e.g. Working Capital Line of Credit / Term Loan',
    },
  ];

  const currentConfig =
    categoriesConfig.find(
      (c) => c.id === categoryPreset || (c.id === 'Credit Card' && categoryPreset === 'Credit Cards')
    ) || categoriesConfig[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full overflow-hidden border border-slate-100 transform transition-all">
        {/* Header */}
        <div className="bg-slate-900 text-white p-5 flex justify-between items-center">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold">
              <Landmark className="w-4.5 h-4.5" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm tracking-tight text-white">Add New Account</h3>
              <p className="text-[11px] text-slate-400 font-medium">
                Select category: Bank, Cash, Credit Card, Digital Wallet, Undeposited Funds, or Loan/Credit
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 text-xs">
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
              <label className="block text-slate-700 font-bold mb-1">Account Code</label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="e.g. 1010"
                className="w-full bg-slate-50 border border-slate-200 focus:border-blue-600 text-slate-900 font-bold px-3 py-2 rounded-xl text-xs focus:outline-none"
              />
            </div>

            {/* Opening Balance */}
            <div>
              <label className="block text-slate-700 font-bold mb-1">Initial Opening Balance</label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-slate-400 font-bold">$</span>
                <input
                  type="number"
                  step="0.01"
                  value={openingBalance}
                  onChange={(e) => setOpeningBalance(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-slate-50 border border-slate-200 focus:border-blue-600 text-slate-900 font-bold pl-7 pr-3 py-2 rounded-xl text-xs focus:outline-none"
                />
              </div>
            </div>
          </div>

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
              className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-bold transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-5 py-2 rounded-xl flex items-center space-x-1.5 shadow-sm transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Save Account</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
