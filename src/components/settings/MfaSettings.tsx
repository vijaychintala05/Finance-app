import React, { useState } from 'react';
import { ShieldCheck, QrCode, Mail, KeyRound, Copy, RefreshCw, CheckCircle, Smartphone, Lock, AlertCircle } from 'lucide-react';
import { useBooks } from '../../context/BooksContext';

export const MfaSettings: React.FC = () => {
  const { currentUser, updateCurrentUser, currentOrg, updateOrganization, addAuditLog } = useBooks();

  const [mfaType, setMfaType] = useState<'Authenticator App' | 'Email OTP' | 'Passkey'>(
    currentUser.mfaType || 'Authenticator App'
  );
  const [copiedCode, setCopiedCode] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleToggleMfa = () => {
    if (currentUser.mfaEnabled) {
      updateCurrentUser({ mfaEnabled: false });
      addAuditLog('mfa.disabled', currentUser.userId, 'Warning');
      setMsg({ type: 'success', text: 'Multi-Factor Authentication has been disabled for your identity.' });
    } else {
      setShowQrModal(true);
    }
  };

  const handleConfirmMfaSetup = (e: React.FormEvent) => {
    e.preventDefault();
    if (verificationCode.length !== 6) {
      setMsg({ type: 'error', text: 'Please enter a valid 6-digit code.' });
      return;
    }

    updateCurrentUser({
      mfaEnabled: true,
      mfaType,
      mfaSecret: 'JBSWY3DPEHPK3PXP',
    });

    addAuditLog('mfa.enabled', currentUser.userId, 'Info');
    setShowQrModal(false);
    setVerificationCode('');
    setMsg({ type: 'success', text: 'Multi-Factor Authentication successfully configured!' });
  };

  const handleRegenerateCodes = () => {
    const newCodes = Array.from({ length: 6 }, () =>
      Math.floor(1000 + Math.random() * 9000) + '-' + Math.floor(1000 + Math.random() * 9000)
    );
    updateCurrentUser({ recoveryCodes: newCodes });
    addAuditLog('mfa.recovery_codes_regenerated', currentUser.userId, 'Warning');
    setMsg({ type: 'success', text: 'New 8-digit recovery codes generated.' });
    setTimeout(() => setMsg(null), 3500);
  };

  const handleToggleOwnerMfaEnforcement = () => {
    const nextVal = !currentOrg.enforceMfaForOwner;
    updateOrganization(currentOrg.id, { enforceMfaForOwner: nextVal });
    addAuditLog(
      nextVal ? 'mfa.owner_enforcement_enabled' : 'mfa.owner_enforcement_disabled',
      currentOrg.publicOrgId,
      'Warning'
    );
    setMsg({
      type: 'success',
      text: nextVal
        ? 'Owner MFA enforcement enabled for this organization.'
        : 'Owner MFA enforcement disabled.',
    });
    setTimeout(() => setMsg(null), 3500);
  };

  return (
    <div className="space-y-6 text-xs text-slate-700">
      {/* Header */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-indigo-600" />
            <h3 className="text-sm font-bold text-slate-800">Multi-Factor Authentication (MFA)</h3>
          </div>
          <p className="text-slate-500 text-xs mt-1">
            Add an extra layer of security to your Platform Identity using Authenticator Apps, Email OTP, or Passkeys.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleToggleMfa}
            className={`px-4 py-2 rounded-lg font-bold flex items-center gap-2 cursor-pointer transition-colors text-xs ${
              currentUser.mfaEnabled
                ? 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200'
                : 'bg-indigo-600 text-white hover:bg-indigo-700'
            }`}
          >
            {currentUser.mfaEnabled ? 'Disable MFA' : 'Enable MFA Protection'}
          </button>
        </div>
      </div>

      {msg && (
        <div
          className={`p-3 rounded-xl border font-bold flex items-center gap-2 ${
            msg.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-rose-50 text-rose-800 border-rose-200'
          }`}
        >
          {msg.type === 'success' ? <CheckCircle className="w-4 h-4 text-emerald-600" /> : <AlertCircle className="w-4 h-4 text-rose-600" />}
          <span>{msg.text}</span>
        </div>
      )}

      {/* MFA Methods Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div
          onClick={() => setMfaType('Authenticator App')}
          className={`p-4 rounded-xl border cursor-pointer transition-all space-y-3 ${
            mfaType === 'Authenticator App' ? 'bg-indigo-50/60 border-indigo-500 ring-2 ring-indigo-200' : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="p-2 bg-indigo-100 text-indigo-700 rounded-lg">
              <QrCode className="w-5 h-5" />
            </div>
            {mfaType === 'Authenticator App' && currentUser.mfaEnabled && (
              <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 font-bold rounded text-[10px]">Active</span>
            )}
          </div>
          <div>
            <h4 className="font-bold text-slate-800">Authenticator App (TOTP)</h4>
            <p className="text-[11px] text-slate-500 mt-0.5">Google Authenticator, 1Password, Authy or Bitwarden.</p>
          </div>
        </div>

        <div
          onClick={() => setMfaType('Email OTP')}
          className={`p-4 rounded-xl border cursor-pointer transition-all space-y-3 ${
            mfaType === 'Email OTP' ? 'bg-indigo-50/60 border-indigo-500 ring-2 ring-indigo-200' : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="p-2 bg-sky-100 text-sky-700 rounded-lg">
              <Mail className="w-5 h-5" />
            </div>
            {mfaType === 'Email OTP' && currentUser.mfaEnabled && (
              <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 font-bold rounded text-[10px]">Active</span>
            )}
          </div>
          <div>
            <h4 className="font-bold text-slate-800">Email OTP Code</h4>
            <p className="text-[11px] text-slate-500 mt-0.5">Receive 6-digit verification codes sent to verified email.</p>
          </div>
        </div>

        <div
          onClick={() => setMfaType('Passkey')}
          className={`p-4 rounded-xl border cursor-pointer transition-all space-y-3 ${
            mfaType === 'Passkey' ? 'bg-indigo-50/60 border-indigo-500 ring-2 ring-indigo-200' : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="p-2 bg-purple-100 text-purple-700 rounded-lg">
              <KeyRound className="w-5 h-5" />
            </div>
            {mfaType === 'Passkey' && currentUser.mfaEnabled && (
              <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 font-bold rounded text-[10px]">Active</span>
            )}
          </div>
          <div>
            <h4 className="font-bold text-slate-800">Passkeys / Hardware Key</h4>
            <p className="text-[11px] text-slate-500 mt-0.5">FIDO2, TouchID, FaceID, or YubiKey hardware tokens.</p>
          </div>
        </div>
      </div>

      {/* Recovery Codes & Governance */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Recovery Codes Card */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-amber-600" />
              <h3 className="text-sm font-bold text-slate-800">8-Digit Recovery Backup Codes</h3>
            </div>
            <button
              onClick={handleRegenerateCodes}
              className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[11px] font-bold flex items-center gap-1 cursor-pointer"
            >
              <RefreshCw className="w-3 h-3" /> Regenerate
            </button>
          </div>

          <p className="text-[11px] text-slate-500">
            Keep these emergency codes safe. Each code can be used once if you lose access to your primary MFA device.
          </p>

          <div className="grid grid-cols-2 gap-2 bg-slate-50 dark:bg-slate-900 p-3 rounded-xl font-mono text-amber-700 dark:text-amber-300 text-xs border border-slate-200 dark:border-slate-800">
            {currentUser.recoveryCodes.map((code, idx) => (
              <div key={idx} className="p-1.5 bg-white dark:bg-slate-800/80 rounded-lg border border-slate-200 dark:border-slate-700 text-center font-bold text-slate-800 dark:text-slate-100">
                {code}
              </div>
            ))}
          </div>
        </div>

        {/* Owner MFA Policy Enforcement */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-indigo-600" />
              <h3 className="text-sm font-bold text-slate-800">Organization Owner Policy</h3>
            </div>
            <span className="px-2 py-0.5 bg-amber-100 text-amber-800 font-bold rounded text-[10px]">Governance</span>
          </div>

          <p className="text-[11px] text-slate-500">
            Enforce mandatory MFA for Organization Owners and Admins to comply with enterprise security benchmarks.
          </p>

          <div className="flex items-center justify-between p-3.5 bg-slate-50 rounded-xl border border-slate-200">
            <div>
              <span className="font-bold text-slate-800 block text-xs">Mandatory Owner MFA</span>
              <span className="text-[10px] text-slate-500">Require MFA for all actions under Org {currentOrg.publicOrgId}</span>
            </div>

            <button
              onClick={handleToggleOwnerMfaEnforcement}
              className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
                currentOrg.enforceMfaForOwner ? 'bg-indigo-600' : 'bg-slate-300'
              }`}
            >
              <span
                className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-transform ${
                  currentOrg.enforceMfaForOwner ? 'left-6' : 'left-1'
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      {/* QR Code Setup Modal */}
      {showQrModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-5 shadow-2xl border border-slate-200 text-slate-800">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-800">Setup {mfaType}</h3>
              <button
                onClick={() => setShowQrModal(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="flex flex-col items-center text-center space-y-3">
              <div className="p-4 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
                <QrCode className="w-32 h-32 text-indigo-600 dark:text-indigo-400" />
              </div>

              <span className="text-xs text-slate-500">Scan this code using Google Authenticator or 1Password</span>
              <code className="bg-slate-100 px-3 py-1.5 rounded font-mono text-xs font-bold text-indigo-700">
                JBSWY3DPEHPK3PXP
              </code>
            </div>

            <form onSubmit={handleConfirmMfaSetup} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Enter 6-Digit Code</label>
                <input
                  type="text"
                  maxLength={6}
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value)}
                  placeholder="123456"
                  className="w-full text-center text-lg font-mono font-bold letter-spacing-2 bg-slate-50 border border-slate-300 rounded-xl p-2.5 focus:outline-none focus:border-indigo-600"
                  required
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowQrModal(false)}
                  className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold cursor-pointer"
                >
                  Verify & Activate
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
