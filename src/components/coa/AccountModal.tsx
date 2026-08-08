import React, { useEffect, useState } from 'react';
import { X, HelpCircle, Layers, FolderTree, Info } from 'lucide-react';
import { Account, AccountSubType, AccountType } from '../../types';
import { useBooks } from '../../context/BooksContext';

interface AccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialParentId?: string;
  initialSubCategory?: string;
  accountToEdit?: Account | null;
}

export const ACCOUNT_TYPE_CATALOG: {
  category: AccountType;
  subType: AccountSubType;
  description: string;
}[] = [
  // Assets
  { category: 'Asset', subType: 'Bank', description: 'Track checking, savings, or money market bank accounts.' },
  { category: 'Asset', subType: 'Cash', description: 'Track petty cash reserves and physical cash on hand.' },
  { category: 'Asset', subType: 'Accounts Receivable', description: 'Track unpaid customer invoices and receivables due to your business.' },
  { category: 'Asset', subType: 'Inventory', description: 'Track raw materials, plywood stock, and finished goods available for sale.' },
  { category: 'Asset', subType: 'Fixed Assets', description: 'Track long-term tangible assets like machinery, equipment, vehicles, and property.' },
  { category: 'Asset', subType: 'Other Current Assets', description: 'Track short-term assets like prepaid rent, insurance, and security deposits.' },
  { category: 'Asset', subType: 'Other Assets', description: 'Track special assets like goodwill, patents, trademarks, and long-term reserves.' },

  // Liabilities
  { category: 'Liability', subType: 'Accounts Payable', description: 'Track unpaid bills owed to vendors and suppliers.' },
  { category: 'Liability', subType: 'Credit Cards', description: 'Track revolving corporate credit card balances and expenses.' },
  { category: 'Liability', subType: 'Taxes Payable', description: 'Track accrued sales tax, VAT, and corporate taxes owed to tax authorities.' },
  { category: 'Liability', subType: 'Payroll Liabilities', description: 'Track employee withholdings, health insurance premiums, and tax deductions.' },
  { category: 'Liability', subType: 'Loans', description: 'Track long-term bank term loans, mortgages, and notes payable.' },
  { category: 'Liability', subType: 'Other Liabilities', description: 'Track unearned client retainers and short-term debt obligations.' },

  // Equity
  { category: 'Equity', subType: 'Capital', description: 'Track partner capital contributions and paid-in owner equity.' },
  { category: 'Equity', subType: 'Retained Earnings', description: 'Track cumulative net earnings retained in the business over time.' },
  { category: 'Equity', subType: 'Drawings', description: 'Track owner dividends and personal capital withdrawals.' },
  { category: 'Equity', subType: 'Other Equity', description: 'Track stock reserves and other equity adjustments.' },

  // Income
  { category: 'Income', subType: 'Sales', description: 'Track gross revenue from direct product software licenses and sales.' },
  { category: 'Income', subType: 'Services', description: 'Track revenue from professional services, consulting, and technical retainers.' },
  { category: 'Income', subType: 'Other Operating Income', description: 'Track late payment charges, ancillary service fees, and commissions.' },

  // Cost of Goods Sold
  { category: 'Cost of Goods Sold', subType: 'Materials', description: 'Track raw materials, plywood sheets stock, and direct job supplies.' },
  { category: 'Cost of Goods Sold', subType: 'Direct Labor', description: 'Track billable project wages and assembly labor costs.' },
  { category: 'Cost of Goods Sold', subType: 'Subcontractors', description: 'Track direct billable third-party contractors, engineers, and specialists.' },
  { category: 'Cost of Goods Sold', subType: 'Other Direct Costs', description: 'Track server infrastructure hosting allocated to client projects.' },

  // Expenses
  { category: 'Expense', subType: 'Payroll', description: 'Track staff salaries, health benefits, and executive payroll expenses.' },
  { category: 'Expense', subType: 'Office & Administrative', description: 'Track office rent, facility leases, stationery, and supplies.' },
  { category: 'Expense', subType: 'Sales & Marketing', description: 'Track digital ad campaigns, Google Ads, sponsorships, and branding.' },
  { category: 'Expense', subType: 'Travel & Vehicle', description: 'Track flights, lodging, fuel, meals, and client entertainment.' },
  { category: 'Expense', subType: 'Utilities & Communication', description: 'Track fiber internet connection, phone lines, and utilities.' },
  { category: 'Expense', subType: 'Professional Services', description: 'Track legal retainers, accounting fees, and tax advisory.' },
  { category: 'Expense', subType: 'Software & Subscriptions', description: 'Track SaaS tooling like Figma, GitHub, Slack, and software licenses.' },
  { category: 'Expense', subType: 'Repairs & Maintenance', description: 'Track IT repairs, equipment servicing, and workstation maintenance.' },
  { category: 'Expense', subType: 'Financial Expenses', description: 'Track Stripe transaction fees, merchant processing, and bank charges.' },
  { category: 'Expense', subType: 'Depreciation & Amortization', description: 'Track scheduled annual depreciation on office assets.' },
  { category: 'Expense', subType: 'Miscellaneous Expenses', description: 'Track minor, unclassified operational expenses.' },

  // Other Income / Expense
  { category: 'Other Income', subType: 'Interest Income', description: 'Track interest earned from high-yield bank savings and deposit accounts.' },
  { category: 'Other Income', subType: 'Asset Gains', description: 'Track profit generated from selling old equipment or investments.' },
  { category: 'Other Income', subType: 'Other Income', description: 'Track non-operating subsidies and miscellaneous earnings.' },
  { category: 'Other Expense', subType: 'Interest Expense', description: 'Track interest paid on bank term loans and credit facilities.' },
  { category: 'Other Expense', subType: 'Asset Losses', description: 'Track losses from retired, scrapped, or damaged assets.' },
  { category: 'Other Expense', subType: 'Other Expenses', description: 'Track extraordinary non-operating expenses.' },
];

export const AccountModal: React.FC<AccountModalProps> = ({
  isOpen,
  onClose,
  initialParentId = '',
  initialSubCategory = '',
  accountToEdit = null,
}) => {
  const { accounts, addAccount, updateAccount } = useBooks();

  const [selectedSubType, setSelectedSubType] = useState<AccountSubType>('Other Assets');
  const [name, setName] = useState('');
  const [code, setCode] = useState('1550');
  const [description, setDescription] = useState('');
  const [balance, setBalance] = useState('0');
  const [addToWatchlist, setAddToWatchlist] = useState(false);

  // Sub-account states
  const [isSubAccount, setIsSubAccount] = useState<boolean>(false);
  const [parentId, setParentId] = useState<string>('');
  const [subCategory, setSubCategory] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      if (accountToEdit) {
        setName(accountToEdit.name);
        setCode(accountToEdit.code);
        setDescription(accountToEdit.description || '');
        setBalance(String(accountToEdit.balance || 0));
        setSelectedSubType(accountToEdit.subType);
        setIsSubAccount(!!accountToEdit.parentId || !!accountToEdit.subCategory);
        setParentId(accountToEdit.parentId || '');
        setSubCategory(accountToEdit.subCategory || '');
      } else if (initialParentId) {
        setName('');
        setCode('1550');
        setDescription('');
        setBalance('0');
        setIsSubAccount(true);
        setParentId(initialParentId);
        const parentAcc = accounts.find((a) => a.id === initialParentId);
        if (parentAcc) {
          setSelectedSubType(parentAcc.subType);
          setSubCategory(initialSubCategory || parentAcc.subCategory || parentAcc.name);
        }
      } else if (initialSubCategory) {
        setName('');
        setCode('1550');
        setDescription('');
        setBalance('0');
        setIsSubAccount(true);
        setSubCategory(initialSubCategory);
        setParentId('');
      } else {
        setName('');
        setCode('1550');
        setDescription('');
        setBalance('0');
        setIsSubAccount(false);
        setParentId('');
        setSubCategory('');
      }
    }
  }, [isOpen, accountToEdit, initialParentId, initialSubCategory, accounts]);

  if (!isOpen) return null;

  const currentTypeInfo =
    ACCOUNT_TYPE_CATALOG.find((item) => item.subType === selectedSubType) ||
    ACCOUNT_TYPE_CATALOG[0];

  const handleSubTypeChange = (newSub: AccountSubType) => {
    setSelectedSubType(newSub);
  };

  const handleParentChange = (pId: string) => {
    setParentId(pId);
    if (pId) {
      const parentAcc = accounts.find((a) => a.id === pId);
      if (parentAcc) {
        setSelectedSubType(parentAcc.subType);
        if (parentAcc.subCategory) {
          setSubCategory(parentAcc.subCategory);
        }
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) return;

    const parentAcc = accounts.find((a) => a.id === parentId);

    const accountData = {
      code: code || '5000',
      name,
      type: currentTypeInfo.category,
      subType: currentTypeInfo.subType,
      description,
      balance: Number(balance) || 0,
      parentId: isSubAccount && parentId ? parentId : undefined,
      parentName: isSubAccount && parentAcc ? parentAcc.name : undefined,
      subCategory: isSubAccount && subCategory ? subCategory.trim() : undefined,
    };

    if (accountToEdit) {
      updateAccount(accountToEdit.id, accountData);
    } else {
      addAccount(accountData);
    }

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 w-full max-w-lg overflow-hidden shadow-2xl relative">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-white dark:bg-slate-900">
          <h3 className="font-semibold text-slate-800 dark:text-white text-base">
            {accountToEdit ? 'Edit Account' : 'Create Account'}
          </h3>
          <button
            onClick={onClose}
            className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs text-slate-700">
          {/* Account Type Selector */}
          <div>
            <label className="block text-red-600 font-semibold mb-1">
              Account Type<span className="text-red-500">*</span>
            </label>
            <select
              value={selectedSubType}
              onChange={(e) => handleSubTypeChange(e.target.value as AccountSubType)}
              required
              className="w-full bg-white border border-slate-300 rounded-md px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 border-slate-300 shadow-2xs"
            >
              <optgroup label="Assets">
                <option value="Bank">Bank</option>
                <option value="Cash">Cash</option>
                <option value="Accounts Receivable">Accounts Receivable</option>
                <option value="Inventory">Inventory</option>
                <option value="Fixed Assets">Fixed Assets</option>
                <option value="Other Current Assets">Other Current Assets</option>
                <option value="Other Assets">Other Asset</option>
              </optgroup>

              <optgroup label="Liabilities">
                <option value="Accounts Payable">Accounts Payable</option>
                <option value="Credit Cards">Credit Card</option>
                <option value="Taxes Payable">Taxes Payable</option>
                <option value="Payroll Liabilities">Payroll Liabilities</option>
                <option value="Loans">Loans</option>
                <option value="Other Liabilities">Other Liabilities</option>
              </optgroup>

              <optgroup label="Equity">
                <option value="Capital">Capital</option>
                <option value="Retained Earnings">Retained Earnings</option>
                <option value="Drawings">Drawings</option>
                <option value="Other Equity">Other Equity</option>
              </optgroup>

              <optgroup label="Income">
                <option value="Sales">Sales</option>
                <option value="Services">Services</option>
                <option value="Other Operating Income">Other Operating Income</option>
              </optgroup>

              <optgroup label="Cost of Goods Sold">
                <option value="Materials">COGS - Materials</option>
                <option value="Direct Labor">COGS - Direct Labor</option>
                <option value="Subcontractors">COGS - Subcontractors</option>
                <option value="Other Direct Costs">COGS - Other Direct Costs</option>
              </optgroup>

              <optgroup label="Expenses">
                <option value="Payroll">Payroll</option>
                <option value="Office & Administrative">Office & Administrative</option>
                <option value="Sales & Marketing">Sales & Marketing</option>
                <option value="Travel & Vehicle">Travel & Vehicle</option>
                <option value="Utilities & Communication">Utilities & Communication</option>
                <option value="Professional Services">Professional Services</option>
                <option value="Software & Subscriptions">Software & Subscriptions</option>
                <option value="Repairs & Maintenance">Repairs & Maintenance</option>
                <option value="Financial Expenses">Financial Expenses</option>
                <option value="Depreciation & Amortization">Depreciation & Amortization</option>
                <option value="Miscellaneous Expenses">Miscellaneous Expenses</option>
              </optgroup>

              <optgroup label="Other Income & Expenses">
                <option value="Interest Income">Interest Income</option>
                <option value="Asset Gains">Asset Gains</option>
                <option value="Other Income">Other Income</option>
                <option value="Interest Expense">Interest Expense</option>
                <option value="Asset Losses">Asset Losses</option>
                <option value="Other Expenses">Other Expenses</option>
              </optgroup>
            </select>
          </div>

          {/* Account Name */}
          <div>
            <label className="block text-red-600 font-semibold mb-1">
              Account Name<span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Goodwill, 18mm Ply, Software License"
              required
              className="w-full bg-white border border-slate-300 rounded-md px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-2xs"
            />
          </div>

          {/* Make it a sub-account check */}
          <div className="pt-1 space-y-2">
            <label className="inline-flex items-center gap-2 text-slate-700 font-medium cursor-pointer">
              <input
                type="checkbox"
                checked={isSubAccount}
                onChange={(e) => setIsSubAccount(e.target.checked)}
                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300"
              />
              <span>Make it a sub-account or group item</span>
            </label>

            {isSubAccount && (
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2.5">
                <div>
                  <label className="block text-slate-600 font-bold text-[11px] mb-1">
                    Select Parent Account:
                  </label>
                  <select
                    value={parentId}
                    onChange={(e) => handleParentChange(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded p-1.5 text-xs text-slate-800 font-medium"
                  >
                    <option value="">-- No Parent Account --</option>
                    {accounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        [{acc.code}] {acc.name} ({acc.type})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-600 font-bold text-[11px] mb-1">
                    Sub-Category Group Name (e.g. Ply):
                  </label>
                  <input
                    type="text"
                    value={subCategory}
                    onChange={(e) => setSubCategory(e.target.value)}
                    placeholder="e.g. Ply, Hardware, Laminates..."
                    className="w-full bg-white border border-slate-300 rounded p-1.5 text-xs font-bold text-slate-800"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Account Code & Opening Balance in 2 cols */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-600 font-medium mb-1 inline-block border-b border-dotted border-slate-400">
                Account Code
              </label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="e.g. 1500"
                className="w-full bg-white border border-slate-300 rounded-md px-3 py-2 font-mono text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-2xs"
              />
            </div>

            <div>
              <label className="block text-slate-600 font-medium mb-1">
                Opening Balance ($)
              </label>
              <input
                type="number"
                value={balance}
                onChange={(e) => setBalance(e.target.value)}
                placeholder="0.00"
                className="w-full bg-white border border-slate-300 rounded-md px-3 py-2 font-mono text-xs font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-2xs"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-slate-600 font-medium mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="Max. 500 characters"
              className="w-full bg-white border border-slate-300 rounded-md px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-2xs resize-none"
            />
          </div>

          {/* Watchlist Checkbox */}
          <div>
            <label className="inline-flex items-center gap-2 text-slate-600 font-medium cursor-pointer">
              <input
                type="checkbox"
                checked={addToWatchlist}
                onChange={(e) => setAddToWatchlist(e.target.checked)}
                className="w-4 h-4 rounded text-blue-600 border-slate-300 focus:ring-blue-500"
              />
              <span>Add to the watchlist on my dashboard</span>
            </label>
          </div>

          {/* Action Buttons Footer */}
          <div className="pt-4 border-t border-slate-200 flex items-center gap-2">
            <button
              type="submit"
              className="bg-blue-500 hover:bg-blue-600 text-white font-medium px-5 py-2 rounded-md shadow-xs transition-colors cursor-pointer text-xs"
            >
              {accountToEdit ? 'Save Changes' : 'Save'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium px-5 py-2 rounded-md border border-slate-200 transition-colors cursor-pointer text-xs"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

