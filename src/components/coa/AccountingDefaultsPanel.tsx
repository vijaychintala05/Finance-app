import React, { useEffect, useMemo, useState } from 'react';
import { RefreshCw, ShieldCheck } from 'lucide-react';
import { apiClient } from '../../api/client';
import { Account } from '../../types';

interface DefaultMapping extends Account {
  systemRole: string;
}

const ROLE_LABELS: Record<string, string> = {
  BANK_OPERATING: 'Operating bank',
  AR_CONTROL: 'Accounts receivable',
  AP_CONTROL: 'Accounts payable',
  CUSTOMER_ADVANCE: 'Customer advances',
  VENDOR_ADVANCE: 'Vendor advances',
  PAYMENT_CLEARING: 'Payment clearing',
  GST_INPUT: 'Input GST',
  GST_OUTPUT: 'Output GST',
  TDS_RECEIVABLE: 'TDS receivable',
  TDS_PAYABLE: 'TDS payable',
  SALES_REVENUE: 'Sales revenue',
  DIRECT_COSTS: 'Direct project costs',
  OPERATING_EXPENSE: 'Operating expense',
  BAD_DEBT: 'Bad debt',
  ROUNDING_GAIN: 'Rounding gain',
  ROUNDING_LOSS: 'Rounding loss',
  OWNER_CAPITAL: 'Owner capital',
  RETAINED_EARNINGS: 'Retained earnings',
  OPENING_BALANCE: 'Opening balance equity',
};

const roleAllowedTypes: Record<string, Account['type'][]> = {
  BANK_OPERATING: ['Asset'], AR_CONTROL: ['Asset'], GST_INPUT: ['Asset'], TDS_RECEIVABLE: ['Asset'], VENDOR_ADVANCE: ['Asset'], PAYMENT_CLEARING: ['Asset'],
  AP_CONTROL: ['Liability'], CUSTOMER_ADVANCE: ['Liability'], GST_OUTPUT: ['Liability'], TDS_PAYABLE: ['Liability'],
  OWNER_CAPITAL: ['Equity'], RETAINED_EARNINGS: ['Equity'], OPENING_BALANCE: ['Equity'],
  SALES_REVENUE: ['Income', 'Revenue', 'Other Income'], ROUNDING_GAIN: ['Income', 'Revenue', 'Other Income'],
  DIRECT_COSTS: ['Expense', 'Cost of Goods Sold'], BAD_DEBT: ['Expense', 'Cost of Goods Sold'], ROUNDING_LOSS: ['Expense', 'Cost of Goods Sold'], OPERATING_EXPENSE: ['Expense', 'Cost of Goods Sold'],
};

interface AccountingDefaultsPanelProps {
  accounts: Account[];
}

export const AccountingDefaultsPanel: React.FC<AccountingDefaultsPanelProps> = ({ accounts }) => {
  const [mappings, setMappings] = useState<DefaultMapping[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [savingRole, setSavingRole] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = async () => {
    setIsLoading(true);
    const response = await apiClient.get<DefaultMapping[]>('/finance/accounting-defaults');
    setIsLoading(false);
    if (response.error) {
      setError(response.error);
      return;
    }
    setError('');
    setMappings((response.data || []).map((mapping: any) => ({
      ...mapping,
      systemRole: mapping.systemRole || mapping.system_role,
      allowDirectPosting: mapping.allowDirectPosting ?? mapping.allow_direct_posting,
    })));
  };

  useEffect(() => { void load(); }, []);

  const eligibleAccounts = useMemo(() => accounts.filter((account) => account.status === 'Active' && account.allowDirectPosting !== false), [accounts]);

  const update = async (systemRole: string, accountId: string) => {
    setSavingRole(systemRole);
    const response = await apiClient.patch(`/finance/accounting-defaults/${systemRole}`, { accountId });
    setSavingRole(null);
    if (response.error) {
      setError(response.error);
      return;
    }
    await load();
  };

  if (isLoading) return null;

  return (
    <section className="border-y border-slate-200 bg-slate-50/70 py-4 dark:border-slate-800 dark:bg-slate-900/40">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white"><ShieldCheck className="h-4 w-4 text-violet-600" />Posting defaults</div>
        <button type="button" onClick={() => void load()} className="rounded-md p-1 text-slate-500 hover:bg-white hover:text-slate-900" title="Refresh posting defaults" aria-label="Refresh posting defaults"><RefreshCw className="h-4 w-4" /></button>
      </div>
      {error && <p role="alert" className="mt-2 text-xs font-semibold text-rose-700">{error}</p>}
      <div className="mt-3 grid gap-x-5 gap-y-3 sm:grid-cols-2 xl:grid-cols-3">
        {mappings.map((mapping) => {
          const allowedTypes = roleAllowedTypes[mapping.systemRole] || [];
          const candidates = eligibleAccounts.filter((account) => allowedTypes.includes(account.type));
          return (
            <label key={mapping.systemRole} className="min-w-0 space-y-1 text-xs font-semibold text-slate-700 dark:text-slate-300">
              <span>{ROLE_LABELS[mapping.systemRole] || mapping.systemRole}</span>
              <select value={mapping.id} disabled={savingRole === mapping.systemRole} onChange={(event) => void update(mapping.systemRole, event.target.value)} className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs font-medium text-slate-800 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-white">
                {candidates.map((account) => <option key={account.id} value={account.id}>{account.code} - {account.name}</option>)}
              </select>
            </label>
          );
        })}
      </div>
    </section>
  );
};
