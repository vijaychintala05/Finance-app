import React from 'react';
import { ShieldAlert } from 'lucide-react';

export const MfaSettings: React.FC = () => (
  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-950">
    <div className="flex items-start gap-3">
      <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
      <div>
        <h3 className="font-bold">Multi-factor authentication is not enabled yet</h3>
        <p className="mt-2 leading-6">
          This screen no longer generates simulated secrets or recovery codes in the browser. MFA will be available only after server-side TOTP/passkey enrollment, encrypted secret storage, one-time recovery codes, and recovery auditing are implemented.
        </p>
      </div>
    </div>
  </div>
);
