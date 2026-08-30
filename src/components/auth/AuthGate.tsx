import React, { FormEvent, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { ShieldCheck, ArrowLeft, KeyRound } from 'lucide-react';

export function AuthGate({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [busy, setBusy] = useState(false);
  const [mfaCode, setMfaCode] = useState('');
  const [form, setForm] = useState({
    email: '',
    password: '',
    fullName: '',
    organizationName: '',
    country: '',
    baseCurrency: '',
  });

  if (auth.loading) {
    return <div className="min-h-screen grid place-items-center text-slate-600">Loading secure workspace…</div>;
  }
  if (auth.user) {
    return <>{children}</>;
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      if (mode === 'login') {
        await auth.login(form.email, form.password);
      } else {
        await auth.register(form);
      }
    } finally {
      setBusy(false);
    }
  };

  const submitMfa = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      await auth.verifyMfa(mfaCode.trim());
    } finally {
      setBusy(false);
    }
  };

  // MFA Challenge Screen
  if (auth.mfaRequired) {
    return (
      <main className="min-h-screen bg-slate-950 grid place-items-center p-6">
        <form onSubmit={submitMfa} className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl space-y-6">
          <div className="flex items-center space-x-3">
            <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-semibold text-indigo-600">FirmBooks Identity Fortress</p>
              <h1 className="text-2xl font-bold text-slate-900">Two-Factor Challenge</h1>
            </div>
          </div>

          <p className="text-sm text-slate-600">
            Enter the 6-digit verification code from your authenticator app or an emergency recovery code.
          </p>

          <div className="space-y-2">
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
              Authentication Code
            </label>
            <div className="relative">
              <KeyRound className="w-5 h-5 absolute left-3 top-3.5 text-slate-400" />
              <input
                required
                autoFocus
                placeholder="123456 or ABCD-EFGH"
                className="w-full rounded-lg border border-slate-300 pl-10 pr-3 py-3 text-lg font-mono tracking-widest text-slate-900 focus:border-indigo-600 focus:outline-none"
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value)}
              />
            </div>
          </div>

          {auth.error && (
            <p role="alert" className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">
              {auth.error}
            </p>
          )}

          <button
            disabled={busy || !mfaCode.trim()}
            className="w-full rounded-lg bg-indigo-600 py-3 font-semibold text-white hover:bg-indigo-700 transition disabled:opacity-50"
          >
            {busy ? 'Verifying Code…' : 'Authenticate Device'}
          </button>

          <button
            type="button"
            className="w-full flex items-center justify-center space-x-2 text-sm text-slate-600 hover:text-slate-900 pt-2"
            onClick={() => {
              setMfaCode('');
              auth.cancelMfa();
            }}
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Cancel and return to sign in</span>
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 grid place-items-center p-6">
      <form onSubmit={submit} className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl space-y-5">
        <div>
          <p className="text-sm font-semibold text-indigo-600">FirmBooks</p>
          <h1 className="text-2xl font-bold text-slate-900">{mode === 'login' ? 'Sign in' : 'Create your firm'}</h1>
        </div>
        {mode === 'register' && (
          <>
            <input
              required
              maxLength={255}
              placeholder="Full name"
              className="w-full rounded-lg border p-3"
              value={form.fullName}
              onChange={(e) => setForm({ ...form, fullName: e.target.value })}
            />
            <input
              required
              maxLength={255}
              placeholder="Organization name"
              className="w-full rounded-lg border p-3"
              value={form.organizationName}
              onChange={(e) => setForm({ ...form, organizationName: e.target.value })}
            />
            <input
              required
              minLength={2}
              maxLength={100}
              placeholder="Country of registration"
              className="w-full rounded-lg border p-3"
              value={form.country}
              onChange={(e) => setForm({ ...form, country: e.target.value })}
            />
            <select
              required
              className="w-full rounded-lg border p-3"
              value={form.baseCurrency}
              onChange={(e) => setForm({ ...form, baseCurrency: e.target.value })}
            >
              <option value="" disabled>Select permanent base currency</option>
              {['INR', 'USD', 'EUR', 'GBP', 'AED', 'CAD', 'AUD', 'SGD'].map((currency) => (
                <option key={currency} value={currency}>{currency}</option>
              ))}
            </select>
            <p className="text-xs text-amber-700">
              Country and base currency affect financial interpretation. Verify both before creating the firm.
            </p>
          </>
        )}
        <input
          required
          type="email"
          autoComplete="email"
          placeholder="Email"
          className="w-full rounded-lg border p-3"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
        <input
          required
          minLength={12}
          type="password"
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          placeholder="Password"
          className="w-full rounded-lg border p-3"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
        />
        {auth.error && <p role="alert" className="text-sm text-red-600">{auth.error}</p>}
        <button
          disabled={busy}
          className="w-full rounded-lg bg-indigo-600 py-3 font-semibold text-white disabled:opacity-50"
        >
          {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
        </button>
        <button
          type="button"
          className="w-full text-sm text-indigo-700"
          onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
        >
          {mode === 'login' ? 'Create a new firm' : 'Use an existing account'}
        </button>
      </form>
    </main>
  );
}
