import React, { useEffect, useState } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  Smartphone,
  KeyRound,
  CheckCircle2,
  AlertTriangle,
  Lock,
  RefreshCw,
} from 'lucide-react';
import { apiClient } from '../../api/client';
import { MfaEnrollmentModal } from '../security/MfaEnrollmentModal';

interface MfaStatus {
  isEnrolled: boolean;
  isVerified: boolean;
  isEnforced: boolean;
}

export const MfaSettings: React.FC = () => {
  const [status, setStatus] = useState<MfaStatus>({
    isEnrolled: false,
    isVerified: false,
    isEnforced: false,
  });
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<MfaStatus>('/identity/mfa/status');
      if (res.data) {
        setStatus(res.data);
      } else if (res.error) {
        setError(res.error);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to check MFA status');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  return (
    <div className="space-y-6 text-xs text-slate-700">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl p-6 shadow-md border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-indigo-600/30 border border-indigo-400/30 flex items-center justify-center text-indigo-400 text-xl font-bold shadow-inner">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold">Two-Factor Authentication (2FA / MFA)</h2>
              <span
                className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border flex items-center gap-1 ${
                  status.isVerified
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/30'
                    : 'bg-amber-500/20 text-amber-300 border-amber-400/30'
                }`}
              >
                {status.isVerified ? <CheckCircle2 className="w-3 h-3 text-emerald-400" /> : <AlertTriangle className="w-3 h-3 text-amber-400" />}
                {status.isVerified ? 'Active & Enforced' : 'Not Configured'}
              </span>
            </div>
            <p className="text-slate-300 text-xs mt-1">
              Add a second layer of security to protect your finance workspace with RFC 6238 TOTP authentication codes.
            </p>
          </div>
        </div>

        <div>
          <button
            type="button"
            onClick={() => setShowModal(true)}
            className={`px-4 py-2.5 rounded-xl font-bold transition shadow-sm flex items-center space-x-2 cursor-pointer ${
              status.isVerified
                ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-600/20'
            }`}
          >
            <Smartphone className="w-4 h-4" />
            <span>{status.isVerified ? 'Re-configure 2FA' : 'Enable Two-Factor Auth'}</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl border border-red-200 bg-red-50 text-red-800 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {/* Main Content Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Status & Authenticator Details */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Smartphone className="w-4 h-4 text-indigo-600" />
            <h3 className="text-sm font-bold text-slate-900">Authenticator App (TOTP)</h3>
          </div>

          <p className="text-slate-600 leading-relaxed">
            Use any standard mobile authenticator application (such as Google Authenticator, Microsoft Authenticator, Apple Passwords, Authy, or 1Password) to generate single-use 6-digit verification codes.
          </p>

          <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-600">Protocol Standard</span>
              <span className="font-mono font-bold text-slate-800">RFC 6238 (TOTP)</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-600">Secret Encryption</span>
              <span className="font-mono font-bold text-slate-800">AES-256-GCM at rest</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-600">Time Interval</span>
              <span className="font-mono font-bold text-slate-800">30 seconds</span>
            </div>
          </div>

          <div className="pt-2">
            <button
              type="button"
              onClick={() => setShowModal(true)}
              className="w-full py-2.5 px-4 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold border border-indigo-200 transition flex items-center justify-center space-x-2"
            >
              <KeyRound className="w-4 h-4" />
              <span>{status.isVerified ? 'View Configuration / New Device' : 'Set Up Authenticator App'}</span>
            </button>
          </div>
        </div>

        {/* Emergency Recovery Codes */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <KeyRound className="w-4 h-4 text-indigo-600" />
            <h3 className="text-sm font-bold text-slate-900">Emergency Recovery Codes</h3>
          </div>

          <p className="text-slate-600 leading-relaxed">
            Emergency recovery codes allow you to regain access to your account if you lose, replace, or reset your mobile device.
          </p>

          <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 space-y-2">
            <div className="flex items-center gap-2 text-slate-800 font-semibold">
              <Lock className="w-4 h-4 text-emerald-600" />
              <span>Single-use, bcrypt-hashed recovery codes</span>
            </div>
            <p className="text-[11px] text-slate-500">
              Recovery codes are generated during MFA enrollment. Each code can only be used once to complete login.
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-[11px] leading-relaxed flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <span>
              Store your recovery codes in a secure password manager or offline safe. Administrators cannot read your recovery codes.
            </span>
          </div>
        </div>
      </div>

      {/* MFA Enrollment Modal */}
      <MfaEnrollmentModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onSuccess={() => {
          fetchStatus();
        }}
      />
    </div>
  );
};
