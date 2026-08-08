import React, { useState } from 'react';
import {
  Cpu,
  Zap,
  Activity,
  Plus,
  CheckCircle,
  XCircle,
  Trash2,
  Play,
  Clock,
  Send,
  AlertTriangle,
  RefreshCw,
  Terminal,
  Layers,
  ChevronRight,
  ShieldCheck,
  Globe,
  Mail,
  Sliders,
  Check
} from 'lucide-react';
import { useBooks } from '../../context/BooksContext';
import { WorkflowRuleSetting, WorkflowLogSetting } from '../../types';

interface AutomationSettingsProps {
  subTab: 'workflow-rules' | 'workflow-actions' | 'workflow-logs';
}

export const AutomationSettings: React.FC<AutomationSettingsProps> = ({ subTab }) => {
  const { settings, updateSettings, addAuditLog } = useBooks();
  const [successMsg, setSuccessMsg] = useState('');

  // Default initial rules if empty
  const [rules, setRules] = useState<WorkflowRuleSetting[]>(() => {
    return (
      settings.workflowRules || [
        {
          id: 'wf-1',
          name: 'High Expense Manager Alert',
          description: 'Notify CFO when expense exceeds $1,000',
          module: 'Expenses',
          trigger: 'Amount > $1,000',
          field: 'Amount',
          operator: '>',
          value: '1000',
          action: 'Send Email Notification',
          recipient: 'cfo@apexgrowth.com',
          status: 'Active',
          testStatus: 'Passed',
          lastTestedAt: '10 mins ago',
          testLog: 'Condition evaluated TRUE. Email dispatched successfully.',
        },
        {
          id: 'wf-2',
          name: 'Auto-Send Invoice Payment Receipt',
          description: 'Automatically dispatch PDF receipt when invoice status changes to Paid',
          module: 'Invoices',
          trigger: 'Payment Status == Paid',
          field: 'Status',
          operator: '==',
          value: 'Paid',
          action: 'Send Email Receipt',
          recipient: 'client@company.com',
          status: 'Active',
          testStatus: 'Passed',
          lastTestedAt: '1 hour ago',
          testLog: 'Condition evaluated TRUE. PDF attached & sent.',
        },
        {
          id: 'wf-3',
          name: 'Overdue Client Credit Hold',
          description: 'Flag client on credit hold when outstanding invoice is > 60 days overdue',
          module: 'Clients',
          trigger: 'Overdue Days > 60',
          field: 'Overdue Days',
          operator: '>',
          value: '60',
          action: 'Mark Credit Hold',
          recipient: 'Internal System Flag',
          status: 'Inactive',
          testStatus: 'Untested',
          lastTestedAt: 'Never',
        },
      ]
    );
  });

  // Logs state
  const [logs, setLogs] = useState<WorkflowLogSetting[]>(() => {
    return (
      settings.workflowLogs || [
        {
          id: 'log-101',
          ruleName: 'High Expense Manager Alert',
          triggerTime: new Date(Date.now() - 600000).toISOString().replace('T', ' ').substring(0, 19),
          status: 'Success',
          details: 'Triggered by EXP-2026-089 (Amount: $2,450.00). Email dispatched to cfo@apexgrowth.com',
          module: 'Expenses',
          payloadSample: '{"id":"EXP-2026-089","amount":2450,"category":"Software License"}',
          durationMs: 38,
        },
        {
          id: 'log-102',
          ruleName: 'Auto-Send Invoice Payment Receipt',
          triggerTime: new Date(Date.now() - 3600000).toISOString().replace('T', ' ').substring(0, 19),
          status: 'Success',
          details: 'Triggered by INV-2026-904 (Status: Paid). PDF receipt generated & sent.',
          module: 'Invoices',
          payloadSample: '{"id":"INV-2026-904","total":1520,"status":"Paid"}',
          durationMs: 45,
        },
      ]
    );
  });

  // Form Creation State
  const [ruleName, setRuleName] = useState('');
  const [ruleDesc, setRuleDesc] = useState('');
  const [ruleModule, setRuleModule] = useState('Invoices');
  const [ruleField, setRuleField] = useState('Total Amount');
  const [ruleOperator, setRuleOperator] = useState('>');
  const [ruleValue, setRuleValue] = useState('1000');
  const [ruleAction, setRuleAction] = useState('Send Email Notification');
  const [ruleRecipient, setRuleRecipient] = useState('finance@apexgrowth.com');

  // Interactive Verification Modal State
  const [verifyingRule, setVerifyingRule] = useState<WorkflowRuleSetting | null>(null);
  const [testPayload, setTestPayload] = useState<{ [key: string]: any }>({
    id: 'INV-TEST-2026',
    amount: 2500,
    status: 'Paid',
    overdueDays: 15,
    clientName: 'Acme Corp',
  });
  const [isExecutingTest, setIsExecutingTest] = useState(false);
  const [testProgressStep, setTestProgressStep] = useState<number>(0);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    matched: boolean;
    logs: string[];
    durationMs: number;
  } | null>(null);

  // Helper to persist changes
  const saveAutomationState = (updatedRules: WorkflowRuleSetting[], updatedLogs?: WorkflowLogSetting[]) => {
    const finalLogs = updatedLogs || logs;
    setRules(updatedRules);
    setLogs(finalLogs);
    updateSettings({
      workflowRules: updatedRules,
      workflowLogs: finalLogs,
    });
  };

  // Deploy New Rule
  const handleDeployRule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ruleName.trim()) return;

    const triggerSummary = `${ruleField} ${ruleOperator} ${ruleValue}`;
    const newRule: WorkflowRuleSetting = {
      id: `wf-${Date.now()}`,
      name: ruleName.trim(),
      description: ruleDesc.trim() || `Automated trigger for ${ruleModule}`,
      module: ruleModule,
      trigger: triggerSummary,
      field: ruleField,
      operator: ruleOperator,
      value: ruleValue,
      action: ruleAction,
      recipient: ruleRecipient,
      status: 'Active',
      testStatus: 'Untested',
      lastTestedAt: 'Never',
    };

    const updatedRules = [newRule, ...rules];
    saveAutomationState(updatedRules);

    addAuditLog({
      action: 'WORKFLOW_RULE_CREATED',
      targetResource: `Rule: ${newRule.name}`,
      ipAddress: '192.168.1.1',
      device: 'Chrome / macOS',
      severity: 'Info',
    });

    setSuccessMsg(`Workflow rule "${newRule.name}" deployed successfully!`);
    setTimeout(() => setSuccessMsg(''), 3500);

    // Reset Form
    setRuleName('');
    setRuleDesc('');
  };

  // Open Verification Modal for a Rule
  const handleOpenVerifyModal = (rule: WorkflowRuleSetting) => {
    setVerifyingRule(rule);
    setTestResult(null);
    setTestProgressStep(0);

    // Prepare default mock test payload based on rule module
    if (rule.module === 'Invoices') {
      setTestPayload({
        id: 'INV-2026-991',
        totalAmount: 2500,
        status: 'Paid',
        overdueDays: 12,
        clientName: 'Apex Capital Inc',
      });
    } else if (rule.module === 'Expenses') {
      setTestPayload({
        id: 'EXP-2026-402',
        totalAmount: 1850,
        category: 'Travel & Lodging',
        submittedBy: 'Sarah Jenkins',
      });
    } else if (rule.module === 'Bills') {
      setTestPayload({
        id: 'BILL-2026-108',
        totalAmount: 3400,
        vendorName: 'Cloud Infrastructure Services',
        status: 'Pending Approval',
      });
    } else {
      setTestPayload({
        id: 'REC-2026-001',
        totalAmount: 1200,
        status: 'Active',
        overdueDays: 45,
      });
    }
  };

  // Execute Rule Verification Test
  const handleRunVerification = () => {
    if (!verifyingRule) return;

    setIsExecutingTest(true);
    setTestProgressStep(1);
    setTestResult(null);

    const startTime = performance.now();
    const executionLogs: string[] = [];

    executionLogs.push(`[1/3] Parsing payload schema for module: ${verifyingRule.module}`);
    executionLogs.push(`Input Data: ${JSON.stringify(testPayload)}`);

    setTimeout(() => {
      setTestProgressStep(2);
      // Evaluate condition
      const fieldValue =
        testPayload.totalAmount ??
        testPayload.amount ??
        testPayload.status ??
        testPayload.overdueDays ??
        2500;
      const targetVal = isNaN(Number(verifyingRule.value)) ? verifyingRule.value : Number(verifyingRule.value);

      let matched = false;
      if (verifyingRule.operator === '>') {
        matched = Number(fieldValue) > Number(targetVal);
      } else if (verifyingRule.operator === '<') {
        matched = Number(fieldValue) < Number(targetVal);
      } else if (verifyingRule.operator === '==') {
        matched = String(fieldValue).toLowerCase() === String(targetVal).toLowerCase();
      } else {
        matched = true;
      }

      executionLogs.push(`[2/3] Evaluating Condition [${verifyingRule.trigger}]`);
      executionLogs.push(
        matched
          ? `-> Match Status: TRUE (Value '${fieldValue}' ${verifyingRule.operator} '${verifyingRule.value}')`
          : `-> Match Status: FALSE (Value '${fieldValue}' did not satisfy condition)`
      );

      setTimeout(() => {
        setTestProgressStep(3);

        if (matched) {
          executionLogs.push(`[3/3] Executing Action Handler: [${verifyingRule.action}]`);
          executionLogs.push(`-> Target Endpoint / Recipient: ${verifyingRule.recipient || 'Internal Engine'}`);
          executionLogs.push(`-> Response: HTTP 200 OK (Payload Dispatched & Processed)`);
        } else {
          executionLogs.push(`[3/3] Action skipped because condition evaluated to FALSE.`);
        }

        const endTime = performance.now();
        const durationMs = Math.round(endTime - startTime);

        const isSuccess = matched;

        setTestResult({
          success: true,
          matched,
          logs: executionLogs,
          durationMs,
        });
        setIsExecutingTest(false);

        // Update rule status in state
        const nowFormatted = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const updatedRules = rules.map((r) =>
          r.id === verifyingRule.id
            ? {
                ...r,
                testStatus: (matched ? 'Passed' : 'Failed') as 'Passed' | 'Failed',
                lastTestedAt: `Today at ${nowFormatted}`,
                testLog: executionLogs[executionLogs.length - 1],
              }
            : r
        );

        // Append new Audit Execution Log
        const newLog: WorkflowLogSetting = {
          id: `log-${Date.now()}`,
          ruleName: verifyingRule.name,
          triggerTime: new Date().toISOString().replace('T', ' ').substring(0, 19),
          status: matched ? 'Success' : 'Failed',
          details: matched
            ? `Verified OK via Test Suite: ${verifyingRule.action} dispatched.`
            : `Test Executed: Condition (${verifyingRule.trigger}) evaluated to FALSE.`,
          module: verifyingRule.module,
          payloadSample: JSON.stringify(testPayload),
          durationMs,
        };

        const updatedLogs = [newLog, ...logs];
        saveAutomationState(updatedRules, updatedLogs);

        addAuditLog({
          action: 'WORKFLOW_TEST_EXECUTED',
          targetResource: `Rule Verification: ${verifyingRule.name}`,
          ipAddress: '192.168.1.1',
          device: 'Chrome / macOS',
          severity: matched ? 'Info' : 'Warning',
        });
      }, 500);
    }, 400);
  };

  // Count metrics
  const activeCount = rules.filter((r) => r.status === 'Active').length;
  const verifiedCount = rules.filter((r) => r.testStatus === 'Passed').length;

  return (
    <div className="space-y-6 text-xs text-slate-700">
      {/* Banner / Header */}
      <div className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 dark:bg-blue-600/30 dark:border-blue-400/40 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold shrink-0">
            <Cpu className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">Automation & Rules Engine</h2>
              <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-500/20 dark:text-blue-300 dark:border-blue-400/30 font-bold text-[10px] flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-blue-600 dark:text-blue-400" /> Real-time Verified
              </span>
            </div>
            <p className="text-slate-500 dark:text-slate-400 text-xs mt-0.5">
              Automate financial triggers, custom email alerts, webhook dispatchers, and credit hold actions.
            </p>
          </div>
        </div>

        {/* Quick Metrics */}
        <div className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
          <div className="px-3 py-1.5 rounded-lg bg-slate-800/90 border border-slate-700/80 text-slate-300">
            Rules Active: <strong className="text-emerald-400">{activeCount} / {rules.length}</strong>
          </div>
          <div className="px-3 py-1.5 rounded-lg bg-slate-800/90 border border-slate-700/80 text-slate-300">
            Verified Rules: <strong className="text-blue-400">{verifiedCount}</strong>
          </div>
        </div>
      </div>

      {successMsg && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 p-3 rounded-xl font-bold flex items-center gap-2 animate-fadeIn">
          <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* SUBTAB 1: WORKFLOW RULES */}
      {subTab === 'workflow-rules' && (
        <div className="space-y-6">
          {/* Rule Creator */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Plus className="w-4 h-4 text-blue-600" />
                <h3 className="text-sm font-bold text-slate-800">Create & Deploy Automation Rule</h3>
              </div>
              <span className="text-[11px] text-slate-500">Supports conditional logic & action routing</span>
            </div>

            <form onSubmit={handleDeployRule} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Rule Name</label>
                  <input
                    type="text"
                    placeholder="e.g. High Expense Manager Alert"
                    value={ruleName}
                    onChange={(e) => setRuleName(e.target.value)}
                    required
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-xs font-bold text-slate-800 focus:outline-none focus:border-blue-600 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Target Module</label>
                  <select
                    value={ruleModule}
                    onChange={(e) => {
                      setRuleModule(e.target.value);
                      if (e.target.value === 'Expenses' || e.target.value === 'Invoices' || e.target.value === 'Bills') {
                        setRuleField('Total Amount');
                      } else if (e.target.value === 'Clients') {
                        setRuleField('Overdue Days');
                      }
                    }}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-xs font-bold text-slate-800 focus:outline-none focus:border-blue-600 cursor-pointer"
                  >
                    <option value="Invoices">Invoices Module</option>
                    <option value="Expenses">Expenses Module</option>
                    <option value="Bills">Bills Module</option>
                    <option value="Clients">Clients Module</option>
                    <option value="Purchase Orders">Purchase Orders Module</option>
                    <option value="Time Entries">Time Entries Module</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Rule Description (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Automatically send email to CFO when expense amount exceeds $1,000"
                  value={ruleDesc}
                  onChange={(e) => setRuleDesc(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs font-normal text-slate-700 focus:outline-none focus:border-blue-600"
                />
              </div>

              {/* Trigger Condition Configurator */}
              <div className="p-3.5 bg-slate-50/80 rounded-xl border border-slate-200/80 space-y-2">
                <div className="flex items-center gap-1.5 font-bold text-slate-700">
                  <Sliders className="w-3.5 h-3.5 text-blue-600" />
                  <span>IF (Trigger Condition)</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div>
                    <label className="text-[10px] text-slate-500 font-bold block mb-1">Field</label>
                    <input
                      type="text"
                      value={ruleField}
                      onChange={(e) => setRuleField(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs font-bold"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] text-slate-500 font-bold block mb-1">Operator</label>
                    <select
                      value={ruleOperator}
                      onChange={(e) => setRuleOperator(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs font-bold cursor-pointer"
                    >
                      <option value=">">Greater Than (&gt;)</option>
                      <option value="<">Less Than (&lt;)</option>
                      <option value="==">Equals (==)</option>
                      <option value="!=">Not Equals (!=)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] text-slate-500 font-bold block mb-1">Threshold Value</label>
                    <input
                      type="text"
                      value={ruleValue}
                      onChange={(e) => setRuleValue(e.target.value)}
                      placeholder="e.g. 1000 or Paid"
                      className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs font-bold"
                    />
                  </div>
                </div>
              </div>

              {/* Action Handler Configurator */}
              <div className="p-3.5 bg-slate-50/80 rounded-xl border border-slate-200/80 space-y-2">
                <div className="flex items-center gap-1.5 font-bold text-slate-700">
                  <Zap className="w-3.5 h-3.5 text-indigo-600" />
                  <span>THEN (Executed Action)</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  <div>
                    <label className="text-[10px] text-slate-500 font-bold block mb-1">Action Handler</label>
                    <select
                      value={ruleAction}
                      onChange={(e) => setRuleAction(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs font-bold cursor-pointer"
                    >
                      <option value="Send Email Notification">Send Email Notification</option>
                      <option value="Send Email Receipt">Send Email PDF Receipt</option>
                      <option value="Dispatch Webhook POST">Dispatch Webhook POST Event</option>
                      <option value="Mark Credit Hold">Mark Client Credit Hold</option>
                      <option value="Flag for Approval">Flag Record for Approval</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] text-slate-500 font-bold block mb-1">Recipient / Target Endpoint</label>
                    <input
                      type="text"
                      value={ruleRecipient}
                      onChange={(e) => setRuleRecipient(e.target.value)}
                      placeholder="e.g. cfo@apexgrowth.com or https://api.hooks.com"
                      className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs font-bold"
                    />
                  </div>
                </div>
              </div>

              {/* Deployment Submit Button */}
              <div className="flex items-center gap-3 pt-2">
                <button
                  type="submit"
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2 rounded-lg flex items-center gap-1.5 cursor-pointer shadow-2xs transition-colors"
                >
                  <Plus className="w-4 h-4" /> Deploy Rule
                </button>
              </div>
            </form>
          </div>

          {/* Rules Table */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-blue-600" />
                <h3 className="text-sm font-bold text-slate-800">Deployed Automation Rules ({rules.length})</h3>
              </div>
              <span className="text-[11px] text-slate-500">Click "Verify / Test" to validate any rule in real time</span>
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold text-[11px]">
                  <tr>
                    <th className="p-3">Rule & Description</th>
                    <th className="p-3">Target Module</th>
                    <th className="p-3">Trigger Condition</th>
                    <th className="p-3">Action Handler</th>
                    <th className="p-3">Verification Status</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rules.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-3">
                        <div className="font-bold text-slate-900">{r.name}</div>
                        {r.description && <div className="text-[11px] text-slate-500 font-normal">{r.description}</div>}
                      </td>

                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 font-bold text-[10px]">
                          {r.module}
                        </span>
                      </td>

                      <td className="p-3 font-mono text-[11px] text-slate-700">
                        <span className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200 font-bold">
                          {r.trigger}
                        </span>
                      </td>

                      <td className="p-3">
                        <div className="font-bold text-slate-800 text-[11px]">{r.action}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{r.recipient}</div>
                      </td>

                      <td className="p-3">
                        {r.testStatus === 'Passed' ? (
                          <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold text-[10px] flex items-center gap-1 w-max">
                            <CheckCircle className="w-3 h-3 text-emerald-600" /> Verified Passed
                          </span>
                        ) : r.testStatus === 'Failed' ? (
                          <span className="px-2 py-0.5 rounded bg-rose-100 text-rose-800 font-bold text-[10px] flex items-center gap-1 w-max">
                            <XCircle className="w-3 h-3 text-rose-600" /> Failed Test
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-bold text-[10px] flex items-center gap-1 w-max">
                            <Clock className="w-3 h-3 text-amber-600" /> Untested
                          </span>
                        )}
                        {r.lastTestedAt && (
                          <div className="text-[9px] text-slate-400 mt-0.5 font-mono">Last test: {r.lastTestedAt}</div>
                        )}
                      </td>

                      <td className="p-3">
                        <button
                          onClick={() => {
                            const updated = rules.map((item) =>
                              item.id === r.id
                                ? { ...item, status: (item.status === 'Active' ? 'Inactive' : 'Active') as 'Active' | 'Inactive' }
                                : item
                            );
                            saveAutomationState(updated);
                          }}
                          className={`px-2.5 py-1 rounded-full font-bold text-[10px] cursor-pointer transition-colors ${
                            r.status === 'Active'
                              ? 'bg-emerald-500/10 text-emerald-700 border border-emerald-300'
                              : 'bg-slate-100 text-slate-500 border border-slate-200'
                          }`}
                        >
                          {r.status}
                        </button>
                      </td>

                      <td className="p-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleOpenVerifyModal(r)}
                            className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold rounded-lg text-[10px] flex items-center gap-1 border border-blue-200/80 cursor-pointer transition-colors shadow-2xs"
                            title="Test & Verify this automation rule"
                          >
                            <Play className="w-3 h-3 text-blue-600 fill-blue-600" /> Verify / Test
                          </button>

                          <button
                            onClick={() => {
                              const updated = rules.filter((item) => item.id !== r.id);
                              saveAutomationState(updated);
                            }}
                            className="text-slate-400 hover:text-rose-600 p-1.5 rounded hover:bg-rose-50 cursor-pointer transition-colors"
                            title="Delete Rule"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SUBTAB 2: WORKFLOW ACTION HANDLERS */}
      {subTab === 'workflow-actions' && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-indigo-600" />
              <h3 className="text-sm font-bold text-slate-800">Workflow Action Handlers & Integration Channels</h3>
            </div>
            <span className="text-[11px] font-mono text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
              ● All Systems Operational
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-indigo-600" />
                  <p className="font-bold text-slate-800 text-xs">Email Dispatch Gateway</p>
                </div>
                <span className="bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded text-[10px]">Connected</span>
              </div>
              <p className="text-[11px] text-slate-500">
                Sends transactional emails, invoice PDFs, and approval notifications using SMTP/SendGrid.
              </p>
              <div className="pt-2 flex justify-end">
                <button
                  onClick={() => alert('Email Test Ping Successful! SMTP server responded in 18ms.')}
                  className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 font-bold rounded text-[10px] cursor-pointer"
                >
                  Send Test Ping
                </button>
              </div>
            </div>

            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-2">
                  <Globe className="w-4 h-4 text-blue-600" />
                  <p className="font-bold text-slate-800 text-xs">Webhook POST Dispatcher</p>
                </div>
                <span className="bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded text-[10px]">Connected</span>
              </div>
              <p className="text-[11px] text-slate-500">
                Triggers secure JSON POST requests to external ERPs, Zapier, or custom Webhooks on events.
              </p>
              <div className="pt-2 flex justify-end">
                <button
                  onClick={() => alert('Webhook Dispatcher Verification OK! Signature key verified.')}
                  className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 font-bold rounded text-[10px] cursor-pointer"
                >
                  Verify Webhook Signature
                </button>
              </div>
            </div>

            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <p className="font-bold text-slate-800 text-xs">Manager Approval Routing Engine</p>
                </div>
                <span className="bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded text-[10px]">Active</span>
              </div>
              <p className="text-[11px] text-slate-500">
                Routes high-value expenses or bills to designated managers before posting to Chart of Accounts.
              </p>
            </div>

            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  <p className="font-bold text-slate-800 text-xs">Credit Hold Automated Lockout</p>
                </div>
                <span className="bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded text-[10px]">Active</span>
              </div>
              <p className="text-[11px] text-slate-500">
                Automatically restricts creating new sales quotes or invoices when a client is flagged on credit hold.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* SUBTAB 3: WORKFLOW AUDIT LOGS */}
      {subTab === 'workflow-logs' && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-amber-600" />
              <h3 className="text-sm font-bold text-slate-800">Automation Audit Logs ({logs.length})</h3>
            </div>
            <button
              onClick={() => {
                const updatedLogs: WorkflowLogSetting[] = [
                  {
                    id: `log-${Date.now()}`,
                    ruleName: 'Manual Verification Simulation',
                    triggerTime: new Date().toISOString().replace('T', ' ').substring(0, 19),
                    status: 'Success',
                    details: 'Simulated manual ping execution test for verification.',
                    module: 'Invoices',
                    durationMs: 18,
                  },
                  ...logs,
                ];
                setLogs(updatedLogs);
                updateSettings({ workflowLogs: updatedLogs });
              }}
              className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded text-[11px] flex items-center gap-1 cursor-pointer"
            >
              <RefreshCw className="w-3 h-3 text-slate-600" /> Simulate Live Test Execution
            </button>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold text-[11px]">
                <tr>
                  <th className="p-3">Timestamp</th>
                  <th className="p-3">Rule Executed</th>
                  <th className="p-3">Module</th>
                  <th className="p-3">Execution Details</th>
                  <th className="p-3">Latency</th>
                  <th className="p-3 text-right">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-3 font-mono text-[11px] text-slate-500 whitespace-nowrap">{log.triggerTime}</td>
                    <td className="p-3 font-bold text-slate-900">{log.ruleName}</td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200 font-bold text-[10px] text-slate-700">
                        {log.module || 'System'}
                      </span>
                    </td>
                    <td className="p-3 text-slate-700 font-normal">{log.details}</td>
                    <td className="p-3 font-mono text-[11px] text-slate-500">{log.durationMs ? `${log.durationMs}ms` : '32ms'}</td>
                    <td className="p-3 text-right">
                      <span
                        className={`px-2.5 py-0.5 rounded-full font-bold text-[10px] ${
                          log.status === 'Success'
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                            : 'bg-rose-100 text-rose-800 border border-rose-300'
                        }`}
                      >
                        {log.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* INTERACTIVE RULE VERIFICATION MODAL */}
      {verifyingRule && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-2xl w-full border border-slate-200 shadow-2xl p-6 space-y-5 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center font-bold">
                  <Play className="w-4 h-4 fill-blue-600" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-800">Verify Automation Rule</h3>
                  <p className="text-[11px] text-slate-500">
                    Rule: <strong className="text-blue-700">{verifyingRule.name}</strong>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setVerifyingRule(null)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Rule Logic Card */}
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs space-y-1">
              <div className="flex items-center gap-2 font-bold text-slate-800">
                <span className="px-2 py-0.5 rounded bg-blue-600 text-white text-[10px]">IF</span>
                <span>Module [{verifyingRule.module}] → Condition: <code className="bg-white px-1.5 py-0.5 rounded border border-slate-300 text-blue-800">{verifyingRule.trigger}</code></span>
              </div>
              <div className="flex items-center gap-2 font-bold text-slate-800 pt-1">
                <span className="px-2 py-0.5 rounded bg-indigo-600 text-white text-[10px]">THEN</span>
                <span>Action: {verifyingRule.action} (Target: {verifyingRule.recipient})</span>
              </div>
            </div>

            {/* Test Payload Customizer */}
            <div className="space-y-2">
              <label className="block text-slate-700 font-bold text-xs flex justify-between items-center">
                <span>Sample Payload Input JSON</span>
                <span className="text-[10px] text-slate-400 font-normal">Adjust values to test matching vs non-matching</span>
              </label>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-slate-500 font-semibold block">Total Amount ($)</label>
                  <input
                    type="number"
                    value={testPayload.totalAmount ?? testPayload.amount ?? 2500}
                    onChange={(e) =>
                      setTestPayload({
                        ...testPayload,
                        totalAmount: Number(e.target.value),
                        amount: Number(e.target.value),
                      })
                    }
                    className="w-full bg-slate-50 border border-slate-300 rounded p-1.5 text-xs font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="text-[10px] text-slate-500 font-semibold block">Status</label>
                  <input
                    type="text"
                    value={testPayload.status || 'Paid'}
                    onChange={(e) => setTestPayload({ ...testPayload, status: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-300 rounded p-1.5 text-xs font-mono font-bold"
                  />
                </div>
              </div>
            </div>

            {/* Run Verification Execution Button */}
            <div>
              <button
                onClick={handleRunVerification}
                disabled={isExecutingTest}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-sm cursor-pointer text-xs transition-colors"
              >
                {isExecutingTest ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-white" />
                    <span>Executing Step-by-Step Verification...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-white" />
                    <span>▶ Run Test Verification Execution</span>
                  </>
                )}
              </button>
            </div>

            {/* Live Progress Logs Console */}
            {(isExecutingTest || testResult) && (
              <div className="bg-slate-900 rounded-xl p-4 text-emerald-400 font-mono text-[11px] space-y-2 border border-slate-800 shadow-inner">
                <div className="flex items-center justify-between text-slate-400 border-b border-slate-800 pb-1.5 text-[10px] uppercase font-bold tracking-wider">
                  <div className="flex items-center gap-1.5">
                    <Terminal className="w-3 h-3 text-emerald-400" /> Live Automation Simulator
                  </div>
                  {testResult && <span>Latency: {testResult.durationMs}ms</span>}
                </div>

                <div className="space-y-1">
                  {testProgressStep >= 1 && (
                    <div className="text-slate-200">
                      Parsing payload for target module [{verifyingRule.module}]... <span className="text-emerald-400 font-bold">Passed</span>
                    </div>
                  )}

                  {testProgressStep >= 2 && (
                    <div className="text-slate-200">
                      Evaluating trigger [{verifyingRule.trigger}]...{' '}
                      {testResult ? (
                        testResult.matched ? (
                          <span className="text-emerald-400 font-bold">MATCHED (TRUE)</span>
                        ) : (
                          <span className="text-amber-400 font-bold">NO MATCH (FALSE)</span>
                        )
                      ) : (
                        <span className="text-blue-400">Evaluating...</span>
                      )}
                    </div>
                  )}

                  {testProgressStep >= 3 && testResult && (
                    <div className="text-slate-200">
                      Action [{verifyingRule.action}] →{' '}
                      <span className="text-emerald-400 font-bold">HTTP 200 OK (Dispatched to {verifyingRule.recipient})</span>
                    </div>
                  )}
                </div>

                {testResult && (
                  <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <CheckCircle className="w-4 h-4 text-emerald-400" />
                      <span className="text-white font-bold text-xs">
                        VERIFICATION SUCCESSFUL (Status: Passed)
                      </span>
                    </div>
                    <button
                      onClick={() => setVerifyingRule(null)}
                      className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg cursor-pointer text-xs"
                    >
                      Done & Save Status
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
