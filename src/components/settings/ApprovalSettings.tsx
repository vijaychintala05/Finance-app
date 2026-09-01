import React, { useState, useEffect } from 'react';
import { CheckCircle2, ShieldCheck, AlertCircle, Save, Sliders } from 'lucide-react';
import { apiClient } from '../../api/client';

interface ApprovalRuleData {
  id: string;
  entityType: string;
  isRequired: boolean;
  thresholdAmount?: number;
  approverRole: string;
  allowSelfApproval?: boolean;
}

const ENTITY_LABELS: Record<string, { title: string; description: string; defaultRole: string }> = {
  PURCHASE_ORDER: {
    title: 'Purchase Orders',
    description: 'Require supervisor authorization before confirming purchase orders.',
    defaultRole: 'Finance Manager',
  },
  VENDOR_BILL: {
    title: 'Vendor Bills',
    description: 'Require authorization before vendor bills are posted to general ledger accounts payable.',
    defaultRole: 'Finance Manager',
  },
  PAYMENT: {
    title: 'Vendor Payments & Disbursements',
    description: 'Require dual approval for bank disbursements exceeding the threshold.',
    defaultRole: 'Finance Manager',
  },
  EXPENSE: {
    title: 'Operating Expenses',
    description: 'Require manager approval for employee direct expenses and reimbursements.',
    defaultRole: 'Finance Manager',
  },
  MANUAL_JOURNAL: {
    title: 'Manual Journal Entries',
    description: 'Require secondary review before manual GL adjustment journals are posted.',
    defaultRole: 'Finance Manager',
  },
  CREDIT_NOTE: {
    title: 'Credit Notes & Sales Returns',
    description: 'Require authorization before issuing sales return credits to customers.',
    defaultRole: 'Finance Manager',
  },
  PERIOD_REOPENING: {
    title: 'Accounting Period Reopening',
    description: 'Reopening closed fiscal periods requires explicit authorization (Owner only).',
    defaultRole: 'Owner',
  },
};

export const ApprovalSettings: React.FC = () => {
  const [rules, setRules] = useState<ApprovalRuleData[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadApprovalRules();
  }, []);

  const loadApprovalRules = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get<{ rules: ApprovalRuleData[] }>('/security/approvals/rules');
      if (res.error || !res.data) {
        setStatusMessage({
          type: 'error',
          text: res.error || 'Failed to load approval rules.',
        });
        return;
      }
      if (res.data?.rules) {
        setRules(res.data.rules);
      }
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: err.message || 'Failed to load approval rules.',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRuleChange = (
    entityType: string,
    field: keyof ApprovalRuleData,
    value: any
  ) => {
    setRules((prev) =>
      prev.map((rule) => (rule.entityType === entityType ? { ...rule, [field]: value } : rule))
    );
  };

  const handleSaveRule = async (rule: ApprovalRuleData) => {
    setSaving(true);
    setStatusMessage(null);
    try {
      const res = await apiClient.post('/security/approvals/rules', {
        entityType: rule.entityType,
        isRequired: rule.isRequired,
        thresholdAmount: rule.thresholdAmount || undefined,
        approverRole: rule.approverRole,
        allowSelfApproval: rule.allowSelfApproval ?? false,
      });

      if (res.error || !res.data) {
        setStatusMessage({
          type: 'error',
          text: res.error || 'Failed to save approval rule.',
        });
        return;
      }

      setStatusMessage({
        type: 'success',
        text: `Approval rule for '${ENTITY_LABELS[rule.entityType]?.title || rule.entityType}' updated successfully.`,
      });
      // Re-fetch persisted rule from server to confirm persistence
      const freshRules = await apiClient.get<{ rules: ApprovalRuleData[] }>('/security/approvals/rules');
      if (freshRules.data?.rules) {
        setRules(freshRules.data.rules);
      }
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: err.response?.data?.error || err.message || 'Failed to save approval rule.',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-indigo-600" />
          Approval Workflows & Multi-Tier Authorization
        </h2>
        <p className="text-xs text-slate-500">
          Configure financial thresholds, approver roles, and self-approval prevention policies for key operations.
        </p>
      </div>

      {statusMessage && (
        <div
          className={`p-3 rounded-lg text-xs font-semibold flex items-center gap-2 ${
            statusMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}
        >
          {statusMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {statusMessage.text}
        </div>
      )}

      <div className="space-y-4">
        {rules.map((rule) => {
          const meta = ENTITY_LABELS[rule.entityType] || {
            title: rule.entityType,
            description: 'Require authorization for this transaction type.',
            defaultRole: 'Admin',
          };

          return (
            <div
              key={rule.entityType}
              className={`bg-white dark:bg-slate-900 rounded-xl border p-5 transition-all ${
                rule.isRequired
                  ? 'border-indigo-200 dark:border-indigo-900/60 shadow-sm'
                  : 'border-slate-200 dark:border-slate-800 opacity-90'
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">{meta.title}</h3>
                    {rule.isRequired ? (
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-emerald-100 text-emerald-800 uppercase">
                        Enabled
                      </span>
                    ) : (
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-slate-100 text-slate-600 uppercase">
                        Disabled
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500">{meta.description}</p>
                </div>

                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={rule.isRequired}
                    onChange={(e) => handleRuleChange(rule.entityType, 'isRequired', e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                </label>
              </div>

              {rule.isRequired && (
                <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                  <div>
                    <label className="font-bold text-slate-700 dark:text-slate-300">
                      Threshold Amount (₹)
                      <input
                        type="number"
                        min="0"
                        step="1000"
                        value={rule.thresholdAmount ?? ''}
                        onChange={(e) =>
                          handleRuleChange(
                            rule.entityType,
                            'thresholdAmount',
                            e.target.value ? Number(e.target.value) : undefined
                          )
                        }
                        placeholder="Any amount (0 for all)"
                        className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2 font-normal"
                      />
                    </label>
                    <p className="text-[10px] text-slate-400 mt-0.5">Transactions at or above this amount require approval.</p>
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 dark:text-slate-300">
                      Required Approver Role
                      <select
                        value={rule.approverRole}
                        onChange={(e) => handleRuleChange(rule.entityType, 'approverRole', e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2 font-normal"
                      >
                        <option value="Owner">Owner</option>
                        <option value="Admin">Admin</option>
                        <option value="Finance Manager">Finance Manager</option>
                        <option value="Approver">Approver</option>
                      </select>
                    </label>
                  </div>

                  <div className="flex flex-col justify-between">
                    <label className="flex items-center gap-2 cursor-pointer pt-2">
                      <input
                        type="checkbox"
                        checked={rule.allowSelfApproval ?? false}
                        onChange={(e) => handleRuleChange(rule.entityType, 'allowSelfApproval', e.target.checked)}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="font-semibold text-slate-700 dark:text-slate-300">Allow Self-Approval</span>
                    </label>
                    <p className="text-[10px] text-slate-400">If unchecked, initiator cannot approve their own submission.</p>

                    <div className="pt-2 flex justify-end">
                      <button
                        type="button"
                        onClick={() => handleSaveRule(rule)}
                        disabled={saving}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-sm"
                      >
                        <Save className="w-3.5 h-3.5" />
                        Save Rule
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
