import React from 'react';
import { ShieldAlert } from 'lucide-react';
import type { FinanceCapability } from '../../capabilities/useFinanceCapabilities';

interface CapabilityUnavailableProps {
  capability?: FinanceCapability;
  loading?: boolean;
}

export const CapabilityUnavailable: React.FC<CapabilityUnavailableProps> = ({ capability, loading }) => (
  <div className="mx-auto flex min-h-[60vh] max-w-3xl items-center justify-center p-6">
    <section className="w-full border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <ShieldAlert className="mx-auto h-8 w-8 text-amber-600" aria-hidden="true" />
      <h2 className="mt-4 text-base font-semibold text-slate-900 dark:text-white">
        {loading ? 'Checking availability' : `${capability?.label || 'This workspace'} is unavailable`}
      </h2>
      {!loading && (
        <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-600 dark:text-slate-300">
          {capability?.reason || 'This workflow is not enabled for the current deployment.'}
        </p>
      )}
    </section>
  </div>
);
