import React, { useEffect, useState, useCallback } from 'react';
import {
  Clock,
  User,
  AlertCircle,
  CheckCircle2,
  FileEdit,
  RotateCcw,
  GitCommit,
  RefreshCw,
  Loader2,
  ChevronDown,
  ChevronRight,
  Info,
  ShieldCheck,
} from 'lucide-react';
import { historyApi, TransactionHistoryEvent } from '../../services/historyApi';

interface TransactionHistoryTabProps {
  entityType: string;
  entityId: string;
  entity?: any;
  title?: string;
}

const FIELD_LABELS: Record<string, string> = {
  amount: 'Amount',
  totalAmount: 'Total Amount',
  total_amount: 'Total Amount',
  subtotal: 'Subtotal',
  taxAmount: 'Tax Amount',
  tax_amount: 'Tax Amount',
  taxRate: 'Tax Rate',
  tax_rate: 'Tax Rate',
  status: 'Status',
  date: 'Date',
  issueDate: 'Issue Date',
  issue_date: 'Issue Date',
  dueDate: 'Due Date',
  due_date: 'Due Date',
  referenceNumber: 'Reference Number',
  reference_number: 'Reference Number',
  reference: 'Reference',
  invoiceNumber: 'Invoice Number',
  invoice_number: 'Invoice Number',
  vendorInvoiceNumber: 'Vendor Invoice #',
  vendor_invoice_number: 'Vendor Invoice #',
  expenseAccountId: 'Expense Account',
  expense_account_id: 'Expense Account',
  expenseAccountName: 'Expense Account',
  paidThroughAccountId: 'Paid Through Account',
  paid_through_account_id: 'Paid Through Account',
  paidThroughAccountName: 'Paid Through Account',
  paymentMode: 'Payment Mode',
  payment_mode: 'Payment Mode',
  vendorId: 'Vendor',
  vendor_id: 'Vendor',
  vendorName: 'Vendor Name',
  vendor_name: 'Vendor Name',
  customerId: 'Customer',
  customer_id: 'Customer',
  customerName: 'Customer Name',
  customer_name: 'Customer Name',
  projectId: 'Project',
  project_id: 'Project',
  projectName: 'Project Name',
  project_name: 'Project Name',
  notes: 'Notes',
  description: 'Description',
  reason: 'Reason',
  reversalReason: 'Reversal Reason',
  reversal_reason: 'Reversal Reason',
  isItemized: 'Itemized Expense',
  is_itemized: 'Itemized Expense',
  taxTreatment: 'Tax Treatment',
  tax_treatment: 'Tax Treatment',
  gstTreatment: 'GST Treatment',
  gst_treatment: 'GST Treatment',
  sourceOfSupply: 'Source of Supply',
  source_of_supply: 'Source of Supply',
  destinationOfSupply: 'Destination of Supply',
  destination_of_supply: 'Destination of Supply',
  hsnCode: 'HSN / SAC Code',
  hsn_code: 'HSN / SAC Code',
  tdsSection: 'TDS Section',
  tds_section: 'TDS Section',
  tdsRate: 'TDS Rate',
  tds_rate: 'TDS Rate',
  currency: 'Currency',
  revisionNumber: 'Revision Number',
  revision_number: 'Revision Number',
  billable: 'Billable',
  isBillable: 'Billable',
  is_billable: 'Billable',
  billedStatus: 'Billed Status',
  billed_status: 'Billed Status',
  lineItems: 'Line Items',
  items: 'Items',
  exchangeRate: 'Exchange Rate',
  termsAndConditions: 'Terms & Conditions',
};

const IGNORED_DIFF_FIELDS = new Set([
  'id',
  'organizationId',
  'organization_id',
  'tenantId',
  'tenant_id',
  'createdAt',
  'created_at',
  'updatedAt',
  'updated_at',
  '_version',
  '__v',
  'reversal_of_journal_id',
  'reversed_by_journal_id',
  'journal_entry_id',
  'journalEntryId',
  'search_vector',
]);

function formatFieldName(key: string): string {
  if (FIELD_LABELS[key]) return FIELD_LABELS[key];
  if (FIELD_LABELS[key.toLowerCase()]) return FIELD_LABELS[key.toLowerCase()];

  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatFieldValue(key: string, val: any): string {
  if (val === null || val === undefined || val === '') {
    return '—';
  }
  if (typeof val === 'boolean') {
    return val ? 'Yes' : 'No';
  }
  if (typeof val === 'number') {
    const lowerKey = key.toLowerCase();
    if (
      lowerKey.includes('amount') ||
      lowerKey.includes('total') ||
      lowerKey.includes('subtotal') ||
      lowerKey.includes('price') ||
      lowerKey.includes('balance') ||
      lowerKey.includes('debit') ||
      lowerKey.includes('credit')
    ) {
      return `₹${val.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    if (lowerKey.includes('rate') || lowerKey.includes('percent')) {
      return `${val}%`;
    }
    return String(val);
  }
  if (typeof val === 'string') {
    if (/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?)?Z?$/.test(val)) {
      try {
        const d = new Date(val);
        if (!isNaN(d.getTime())) {
          return d.toLocaleDateString('en-IN', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
          });
        }
      } catch {
        // fallback
      }
    }
    return val;
  }
  if (Array.isArray(val)) {
    if (val.length === 0) return 'None';
    if (val.every((item) => typeof item === 'string' || typeof item === 'number')) {
      return val.join(', ');
    }
    return `${val.length} item${val.length > 1 ? 's' : ''}`;
  }
  if (typeof val === 'object') {
    const entries = Object.entries(val).filter(([k]) => !IGNORED_DIFF_FIELDS.has(k));
    if (entries.length === 0) return '—';
    if (entries.length <= 2) {
      return entries.map(([k, v]) => `${formatFieldName(k)}: ${formatFieldValue(k, v)}`).join(', ');
    }
    return `${entries.length} fields`;
  }
  return String(val);
}

function parseState(val: any): any {
  if (!val) return null;
  if (typeof val === 'string') {
    try {
      const trimmed = val.trim();
      if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
        return JSON.parse(trimmed);
      }
    } catch {
      return val;
    }
  }
  return val;
}

interface FieldDiff {
  field: string;
  label: string;
  oldVal: string;
  newVal: string;
}

function getChangedFields(before: any, after: any): FieldDiff[] {
  if (!before || !after || typeof before !== 'object' || typeof after !== 'object') {
    return [];
  }

  const allKeys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));
  const diffs: FieldDiff[] = [];

  for (const key of allKeys) {
    if (IGNORED_DIFF_FIELDS.has(key)) continue;

    const valBefore = before[key];
    const valAfter = after[key];

    const strBefore = JSON.stringify(valBefore ?? null);
    const strAfter = JSON.stringify(valAfter ?? null);

    if (strBefore !== strAfter) {
      diffs.push({
        field: key,
        label: formatFieldName(key),
        oldVal: valBefore !== undefined && valBefore !== null ? formatFieldValue(key, valBefore) : '(Not set)',
        newVal: valAfter !== undefined && valAfter !== null ? formatFieldValue(key, valAfter) : '(Removed)',
      });
    }
  }

  return diffs;
}

interface RenderStateViewProps {
  title: string;
  titleColor: string;
  bgColor: string;
  borderColor: string;
  state: any;
}

const RenderStateView: React.FC<RenderStateViewProps> = ({
  title,
  titleColor,
  bgColor,
  borderColor,
  state,
}) => {
  if (!state) return null;

  if (typeof state !== 'object' || state === null) {
    return (
      <div>
        <p className={`font-semibold ${titleColor} mb-1.5`}>{title}</p>
        <div className={`${bgColor} p-3 rounded-lg border ${borderColor} text-xs text-slate-800`}>
          <p>{String(state)}</p>
        </div>
      </div>
    );
  }

  const entries = Object.entries(state).filter(
    ([key]) => !IGNORED_DIFF_FIELDS.has(key)
  );

  if (entries.length === 0) return null;

  return (
    <div>
      <p className={`font-semibold ${titleColor} mb-1.5`}>{title}</p>
      <div className={`${bgColor} p-3 rounded-lg border ${borderColor} text-xs text-slate-800`}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {entries.map(([key, val]) => {
            if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'object') {
              return (
                <div key={key} className="col-span-full bg-white/90 p-2.5 rounded-lg border border-slate-200/80 shadow-2xs">
                  <span className="font-semibold text-slate-700 block mb-1">
                    {formatFieldName(key)} ({val.length}):
                  </span>
                  <div className="space-y-1.5 pl-2 border-l-2 border-indigo-300">
                    {val.map((item, i) => (
                      <div key={i} className="text-2xs text-slate-700 bg-slate-50/80 p-1.5 rounded">
                        {Object.entries(item)
                          .filter(([subK]) => !IGNORED_DIFF_FIELDS.has(subK))
                          .map(([subK, subV]) => `${formatFieldName(subK)}: ${formatFieldValue(subK, subV)}`)
                          .join('  •  ')}
                      </div>
                    ))}
                  </div>
                </div>
              );
            }

            return (
              <div
                key={key}
                className="flex items-center justify-between p-2 rounded-lg bg-white/90 border border-slate-200/80 shadow-2xs gap-3"
              >
                <span className="text-slate-600 font-medium">{formatFieldName(key)}</span>
                <span className="text-slate-900 font-semibold text-right">{formatFieldValue(key, val)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export const TransactionHistoryTab: React.FC<TransactionHistoryTabProps> = ({
  entityType,
  entityId,
  entity,
  title,
}) => {
  const [events, setEvents] = useState<TransactionHistoryEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedEvents, setExpandedEvents] = useState<Record<string, boolean>>({});

  const fetchHistory = useCallback(async () => {
    if (!entityId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await historyApi.getEntityHistory(entityType, entityId);
      // If no events came back from server, but we have entity metadata, construct baseline
      if (data.length === 0 && entity) {
        const fallbackCreated: TransactionHistoryEvent = {
          id: `local-init-${entityId}`,
          action: `${entityType.toUpperCase()}_CREATED`,
          actionLabel: `${entityType} Created`,
          entityType,
          entityId,
          timestamp: entity.createdAt || entity.created_at || entity.date || entity.issueDate || new Date().toISOString(),
          userName: entity.createdByName || entity.userName || 'System',
          summary: `${entityType} initial record created`,
          details: {
            amount: entity.amount || entity.totalAmount || entity.total_amount,
            status: entity.status,
            date: entity.date || entity.issueDate,
          },
        };
        setEvents([fallbackCreated]);
      } else {
        setEvents(data);
      }
    } catch (err: any) {
      console.error('Failed to fetch transaction history:', err);
      setError(err.message || 'Unable to load transaction history');
    } finally {
      setLoading(false);
    }
  }, [entityType, entityId, entity]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const toggleExpand = (id: string) => {
    setExpandedEvents((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const getActionBadge = (action: string) => {
    const act = (action || '').toUpperCase();
    if (act.includes('CREATED') || act.includes('POSTED') || act.includes('DRAFT_CREATED')) {
      return {
        bg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        icon: <CheckCircle2 className="w-4 h-4 text-emerald-600" />,
        label: 'Created / Posted',
      };
    }
    if (act.includes('REVERSED') || act.includes('VOID') || act.includes('CANCEL')) {
      return {
        bg: 'bg-rose-50 text-rose-700 border-rose-200',
        icon: <RotateCcw className="w-4 h-4 text-rose-600" />,
        label: 'Reversed / Voided',
      };
    }
    if (act.includes('CORRECT') || act.includes('UPDATE') || act.includes('REVISE') || act.includes('EDIT')) {
      return {
        bg: 'bg-amber-50 text-amber-800 border-amber-200',
        icon: <FileEdit className="w-4 h-4 text-amber-600" />,
        label: 'Modified / Corrected',
      };
    }
    if (act.includes('CONVERT') || act.includes('APPROV')) {
      return {
        bg: 'bg-indigo-50 text-indigo-700 border-indigo-200',
        icon: <GitCommit className="w-4 h-4 text-indigo-600" />,
        label: 'Lifecycle Event',
      };
    }
    return {
      bg: 'bg-slate-50 text-slate-700 border-slate-200',
      icon: <Clock className="w-4 h-4 text-slate-500" />,
      label: 'Audit Event',
    };
  };

  const formatTimestamp = (ts: string) => {
    if (!ts) return 'Unknown timestamp';
    try {
      const d = new Date(ts);
      if (isNaN(d.getTime())) return ts;
      return d.toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return ts;
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50/50 p-4 sm:p-6 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-indigo-600" />
            <h3 className="text-sm font-bold text-slate-900">
              {title || `${entityType} History & Audit Trail`}
            </h3>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Immutable timeline of creation, revisions, corrections, and user actions with documented reasons.
          </p>
        </div>
        <button
          onClick={fetchHistory}
          disabled={loading}
          className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-200 rounded-md transition-colors flex items-center gap-1.5 text-xs font-medium cursor-pointer"
          title="Refresh History"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">Refresh</span>
        </button>
      </div>

      {/* Loading state */}
      {loading && events.length === 0 && (
        <div className="py-12 flex flex-col items-center justify-center text-slate-500">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-500 mb-2" />
          <p className="text-xs font-medium">Retrieving audit timeline from server...</p>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="mb-4 p-3.5 bg-rose-50 border border-rose-200 rounded-lg flex items-center justify-between text-xs text-rose-800">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={fetchHistory}
            className="px-2 py-1 bg-rose-100 hover:bg-rose-200 rounded font-medium text-rose-900 transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* Empty State */}
      {!loading && events.length === 0 && !error && (
        <div className="py-12 text-center bg-white rounded-xl border border-slate-200 p-8">
          <ShieldCheck className="w-10 h-10 text-slate-300 mx-auto mb-2" />
          <p className="text-sm font-semibold text-slate-700">No History Records Found</p>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            There are no documented edits or logs for this {entityType.toLowerCase()} yet.
          </p>
        </div>
      )}

      {/* Timeline */}
      {events.length > 0 && (
        <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-3 before:bottom-3 before:w-0.5 before:bg-slate-200">
          {events.map((evt, idx) => {
            const badge = getActionBadge(evt.action);
            const isExpanded = !!expandedEvents[evt.id];
            const parsedBefore = parseState(evt.beforeState);
            const parsedAfter = parseState(evt.afterState);
            const parsedDetails = parseState(evt.details);
            const diffs = getChangedFields(parsedBefore, parsedAfter);
            const hasExtra =
              Boolean(parsedDetails) ||
              Boolean(parsedBefore) ||
              Boolean(parsedAfter) ||
              (evt.metadata && Object.keys(evt.metadata).length > 0);

            return (
              <div key={evt.id || idx} className="relative group">
                {/* Dot */}
                <div
                  className={`absolute -left-6 top-1.5 w-5 h-5 rounded-full border-2 bg-white flex items-center justify-center shadow-xs transition-transform group-hover:scale-110 ${
                    badge.bg.includes('emerald')
                      ? 'border-emerald-500 text-emerald-600'
                      : badge.bg.includes('rose')
                      ? 'border-rose-500 text-rose-600'
                      : badge.bg.includes('amber')
                      ? 'border-amber-500 text-amber-600'
                      : badge.bg.includes('indigo')
                      ? 'border-indigo-500 text-indigo-600'
                      : 'border-slate-400 text-slate-500'
                  }`}
                >
                  <div className="w-2 h-2 rounded-full bg-current" />
                </div>

                {/* Card */}
                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs hover:shadow-xs transition-shadow">
                  {/* Top row: Label, Badge, Timestamp */}
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-slate-900">
                        {evt.actionLabel || evt.action.replace(/_/g, ' ')}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs font-semibold border ${badge.bg}`}
                      >
                        {badge.icon}
                        {badge.label}
                      </span>
                    </div>
                    <span className="text-xs text-slate-500 flex items-center gap-1 font-mono">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      {formatTimestamp(evt.timestamp)}
                    </span>
                  </div>

                  {/* Summary / Description */}
                  {evt.summary && (
                    <p className="text-xs text-slate-700 mb-2 leading-relaxed">
                      {evt.summary}
                    </p>
                  )}

                  {/* Prominent REASON box if present */}
                  {evt.reason && (
                    <div className="my-2.5 p-3 bg-amber-50/80 border-l-4 border-amber-500 rounded-r-lg text-xs">
                      <div className="flex items-center gap-1.5 text-amber-900 font-semibold mb-1">
                        <Info className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                        <span>Reason for Modification</span>
                      </div>
                      <p className="text-amber-950 italic pl-5">
                        "{evt.reason}"
                      </p>
                    </div>
                  )}

                  {/* User row */}
                  <div className="flex items-center justify-between text-2xs text-slate-500 pt-2 border-t border-slate-100 mt-2">
                    <div className="flex items-center gap-1.5">
                      <div className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-bold border border-slate-200">
                        <User className="w-3 h-3 text-slate-500" />
                      </div>
                      <span className="font-medium text-slate-700">
                        {evt.userName || 'System / Automated'}
                      </span>
                      {evt.userEmail && (
                        <span className="text-slate-400">({evt.userEmail})</span>
                      )}
                    </div>

                    {/* Expand details button if extra data exists */}
                    {hasExtra && (
                      <button
                        onClick={() => toggleExpand(evt.id)}
                        className="text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1 cursor-pointer"
                      >
                        <span>{isExpanded ? 'Hide Details' : 'View Changes'}</span>
                        {isExpanded ? (
                          <ChevronDown className="w-3 h-3" />
                        ) : (
                          <ChevronRight className="w-3 h-3" />
                        )}
                      </button>
                    )}
                  </div>

                  {/* Expandable Changes / Details in clean normal text */}
                  {isExpanded && hasExtra && (
                    <div className="mt-3 pt-3 border-t border-slate-100 text-2xs space-y-3">
                      {/* Changes summary highlighting field diffs in normal text */}
                      {diffs.length > 0 && (
                        <div className="p-3 bg-amber-50/70 border border-amber-200/80 rounded-lg text-xs space-y-2">
                          <div className="flex items-center gap-1.5 font-bold text-amber-900">
                            <FileEdit className="w-3.5 h-3.5 text-amber-600" />
                            <span>Changes Summary ({diffs.length} {diffs.length === 1 ? 'field' : 'fields'} updated):</span>
                          </div>
                          <div className="grid grid-cols-1 gap-1.5">
                            {diffs.map((d) => (
                              <div
                                key={d.field}
                                className="flex flex-col sm:flex-row sm:items-center justify-between py-1.5 px-3 bg-white rounded-md border border-amber-200/60 shadow-2xs gap-1 sm:gap-2 text-xs"
                              >
                                <span className="font-semibold text-slate-700">{d.label}</span>
                                <div className="flex items-center gap-2 text-slate-800">
                                  <span className="line-through text-rose-600 bg-rose-50 px-2 py-0.5 rounded text-2xs font-medium">
                                    {d.oldVal}
                                  </span>
                                  <span className="text-slate-400 font-bold text-xs">→</span>
                                  <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded text-2xs font-semibold">
                                    {d.newVal}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Before State in normal text */}
                      {parsedBefore && (
                        <RenderStateView
                          title="Before State:"
                          titleColor="text-rose-700"
                          bgColor="bg-rose-50/40"
                          borderColor="border-rose-200/80"
                          state={parsedBefore}
                        />
                      )}

                      {/* After State in normal text */}
                      {parsedAfter && (
                        <RenderStateView
                          title="After State:"
                          titleColor="text-emerald-700"
                          bgColor="bg-emerald-50/40"
                          borderColor="border-emerald-200/80"
                          state={parsedAfter}
                        />
                      )}

                      {/* Event Details in normal text */}
                      {parsedDetails &&
                        (!parsedBefore || !parsedAfter ||
                          (JSON.stringify(parsedDetails) !== JSON.stringify(parsedBefore) &&
                           JSON.stringify(parsedDetails) !== JSON.stringify(parsedAfter))) && (
                        <RenderStateView
                          title="Event Details:"
                          titleColor="text-slate-700"
                          bgColor="bg-slate-50"
                          borderColor="border-slate-200"
                          state={parsedDetails}
                        />
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
export default TransactionHistoryTab;
