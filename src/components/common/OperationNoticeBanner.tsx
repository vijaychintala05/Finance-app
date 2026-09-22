import React from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { OperationNotice } from '../../utils/operationNotice';

export const OperationNoticeBanner: React.FC<{ notice: OperationNotice }> = ({ notice }) => (
  <section
    role={notice.tone === 'error' ? 'alert' : 'status'}
    aria-live={notice.tone === 'error' ? 'assertive' : 'polite'}
    className={`rounded-xl border p-4 text-sm ${
      notice.tone === 'success'
        ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
        : notice.tone === 'warning'
          ? 'border-amber-200 bg-amber-50 text-amber-900'
          : 'border-rose-200 bg-rose-50 text-rose-900'
    }`}
  >
    <div className="flex items-center gap-2 font-semibold">
      {notice.tone === 'success' ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
      {notice.title}
    </div>
    <p className="mt-1">{notice.message}</p>
    {notice.recovery && <p className="mt-2 font-semibold">Next step: {notice.recovery}</p>}
    {(notice.errorCode || notice.requestId) && (
      <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 border-t border-current/15 pt-2 font-mono text-[11px]">
        {notice.errorCode && <div className="flex gap-1"><dt>Error</dt><dd>{notice.errorCode}</dd></div>}
        {notice.requestId && <div className="flex gap-1"><dt>Request ID</dt><dd>{notice.requestId}</dd></div>}
      </dl>
    )}
  </section>
);
