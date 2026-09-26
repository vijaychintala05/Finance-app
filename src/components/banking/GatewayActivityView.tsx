import React, { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { BankingService } from '../../services/bankingService';

type GatewayEvent = Awaited<ReturnType<typeof BankingService.getGatewayActivity>>['events'][number];

function label(value: string): string {
  return value.toLowerCase().split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}

function money(amount: number | null, currency: string | null): string {
  if (amount == null) return 'Amount unavailable';
  if (!currency) return `${amount.toFixed(2)} · currency unavailable`;
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

export const GatewayActivityView: React.FC = () => {
  const [events, setEvents] = useState<GatewayEvent[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [gateway, setGateway] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const load = async (cursor?: string, append = false) => {
    const currentRequest = ++requestId.current;
    setLoading(true);
    setError(null);
    if (!append) { setEvents([]); setNextCursor(null); }
    try {
      const result = await BankingService.getGatewayActivity({ limit: 50, cursor, gateway: gateway || undefined, status: status || undefined });
      if (currentRequest !== requestId.current) return;
      setEvents((previous) => append ? [...previous, ...result.events] : result.events);
      setNextCursor(result.nextCursor);
    } catch (e) {
      if (currentRequest === requestId.current) setError(e instanceof Error ? e.message : 'Gateway activity could not be loaded.');
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [gateway, status]);

  return (
    <section className="space-y-5" aria-label="Gateway activity">
      <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-100">
        A payout journal proves a posting to the bank ledger. The provider’s receipt composition is not linked here; bank statement matches shown here are recorded matches; they do not establish payout completeness or mark individual receipts as settled.
      </div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Gateway activity</h2>
          <p className="mt-1 text-sm text-slate-500">Webhook events and their linked accounting evidence.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Provider
            <select value={gateway} onChange={(e) => setGateway(e.target.value)} className="mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900">
              <option value="">All providers</option><option value="stripe">Stripe</option><option value="razorpay">Razorpay</option>
            </select>
          </label>
          <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Event status
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900">
              <option value="">All statuses</option><option value="RECEIVED">Received</option><option value="PROCESSING">Processing</option><option value="PROCESSED">Processed</option><option value="FAILED">Failed</option><option value="REVERSED">Reversed</option><option value="IGNORED">Ignored</option>
            </select>
          </label>
          <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium disabled:opacity-50 dark:border-slate-700">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200">{error}</div>}
      {!loading && !error && events.length === 0 && <div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500 dark:border-slate-700">No gateway events found for these filters.</div>}
      <div className="space-y-3">
        {events.map((event) => <GatewayEventCard key={event.eventId} event={event} />)}
      </div>
      {nextCursor && <div className="flex justify-center"><button type="button" onClick={() => void load(nextCursor, true)} disabled={loading} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-50 dark:border-slate-700">{loading ? 'Loading…' : 'Load more'}</button></div>}
      {loading && events.length === 0 && <p role="status" className="text-sm text-slate-500">Loading gateway activity…</p>}
    </section>
  );
};

const GatewayEventCard: React.FC<{ event: GatewayEvent }> = ({ event }) => (
  <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="font-semibold text-slate-900 dark:text-white">{event.eventType}</div>
        <div className="mt-1 text-xs text-slate-500">{event.gateway} · {new Date(event.occurredAt).toLocaleString()}</div>
      </div>
      <div className="text-right">
        <div className="text-sm font-semibold text-slate-900 dark:text-white">{money(event.amount, event.currency)}</div>
        <div className="mt-1 text-xs text-slate-600 dark:text-slate-300">{label(event.evidenceStatus)}</div>
      </div>
    </div>
    <dl className="mt-4 grid gap-x-5 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
      <Evidence label="Event status" value={label(event.status)} />
      {event.paymentNumber && <Evidence label="Receipt" value={event.paymentNumber} />}
      {event.invoiceNumber && <Evidence label="Invoice" value={event.invoiceNumber} />}
      {event.settlementReference && <Evidence label="Provider reference" value={event.settlementReference} />}
      {event.journalNumber && <Evidence label="Journal" value={event.journalNumber} />}
      {event.feeJournalNumber && <Evidence label="Fee journal" value={event.feeJournalNumber} />}
      {(event.reversalJournalNumber || event.reversalJournalId) && <Evidence label="Reversal journal" value={event.reversalJournalNumber || event.reversalJournalId!} />}
      {event.payoutBankMatchCount != null && <Evidence label="Recorded payout statement matches" value={`${event.payoutBankMatchCount} exact journal match${event.payoutBankMatchCount === 1 ? '' : 'es'}`} />}
    </dl>
  </article>
);

const Evidence: React.FC<{ label: string; value: string }> = ({ label: title, value }) => (
  <div><dt className="text-xs text-slate-500">{title}</dt><dd className="mt-0.5 break-words font-medium text-slate-800 dark:text-slate-200">{value}</dd></div>
);
