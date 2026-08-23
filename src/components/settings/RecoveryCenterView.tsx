import React, { useCallback, useEffect, useState } from 'react';
import { Archive, CheckCircle2, Download, RefreshCw, RotateCcw, ShieldAlert, X } from 'lucide-react';
import { apiClient } from '../../api/client';

interface Artifact {
  id: string;
  status: string;
  createdAt: string;
  envelope: { manifest: { schemaVersion: string; tables: { name: string; rowCount: number }[] } };
}

interface RecoveryJob {
  id: string;
  artifactId: string;
  targetOrganizationId: string;
  status: 'STAGING' | 'VALIDATED' | 'PROMOTED' | 'FAILED';
  reconciliation: { name: string; passed: boolean }[];
  createdAt: string;
  promotedAt?: string;
}

interface ListResponse<T> { success: boolean; data: T; }

export const RecoveryCenterView: React.FC = () => {
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [jobs, setJobs] = useState<RecoveryJob[]>([]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [promoting, setPromoting] = useState<RecoveryJob | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [password, setPassword] = useState('');

  const load = useCallback(async () => {
    setError('');
    const [artifactResponse, jobResponse] = await Promise.all([
      apiClient.get<ListResponse<Artifact[]>>('/recovery/artifacts'),
      apiClient.get<ListResponse<RecoveryJob[]>>('/recovery/jobs'),
    ]);
    if (artifactResponse.error || jobResponse.error) {
      setError(artifactResponse.error || jobResponse.error || 'Recovery records could not be loaded.');
      return;
    }
    setArtifacts(artifactResponse.data?.data || []);
    setJobs(jobResponse.data?.data || []);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const createArtifact = async () => {
    setBusy('create'); setError('');
    const response = await apiClient.post('/recovery/artifacts');
    setBusy('');
    if (response.error) return setError(response.error);
    await load();
  };

  const stageArtifact = async (artifactId: string) => {
    setBusy(`stage:${artifactId}`); setError('');
    const response = await apiClient.post(`/recovery/artifacts/${artifactId}/stage`);
    setBusy('');
    if (response.error) return setError(response.error);
    await load();
  };

  const downloadArtifact = async (artifact: Artifact) => {
    setBusy(`download:${artifact.id}`); setError('');
    const response = await apiClient.get<Artifact>(`/recovery/artifacts/${artifact.id}/download`);
    setBusy('');
    if (response.error || !response.data) return setError(response.error || 'Artifact could not be downloaded.');
    const url = URL.createObjectURL(new Blob([JSON.stringify(response.data, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `firmbooks-${artifact.id}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const promote = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!promoting) return;
    setBusy(`promote:${promoting.id}`); setError('');
    const response = await apiClient.post(`/recovery/jobs/${promoting.id}/promote`, { confirmation, password });
    setBusy('');
    if (response.error) return setError(response.error);
    setPromoting(null); setConfirmation(''); setPassword('');
    await load();
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-center dark:border-slate-800">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold text-slate-900 dark:text-white"><Archive className="h-6 w-6 text-cyan-700" />Recovery Center</h2>
          <p className="mt-1 text-xs text-slate-500">Encrypted organization exports and staged, owner-approved recovery.</p>
        </div>
        <div className="flex gap-2">
          <button title="Refresh recovery records" onClick={() => void load()} className="rounded-lg border border-slate-300 p-2 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300"><RefreshCw className="h-4 w-4" /></button>
          <button onClick={createArtifact} disabled={Boolean(busy)} className="flex items-center gap-2 rounded-lg bg-cyan-700 px-4 py-2 text-xs font-bold text-white hover:bg-cyan-800 disabled:opacity-50"><Archive className="h-4 w-4" />{busy === 'create' ? 'Creating export...' : 'Create encrypted export'}</button>
        </div>
      </div>

      {error && <div role="alert" className="border-l-4 border-rose-500 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800 dark:bg-rose-950/30 dark:text-rose-200">{error}</div>}

      <section className="space-y-3">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white">Recovery artifacts</h3>
        <div className="overflow-x-auto border-y border-slate-200 dark:border-slate-800">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-[10px] font-bold uppercase text-slate-500 dark:bg-slate-900"><tr><th className="p-3">Artifact</th><th className="p-3">Created</th><th className="p-3">Schema</th><th className="p-3 text-right">Rows</th><th className="p-3 text-right">Actions</th></tr></thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {artifacts.length === 0 ? <tr><td colSpan={5} className="p-8 text-center text-slate-500">No encrypted exports have been created.</td></tr> : artifacts.map((artifact) => (
                <tr key={artifact.id}><td className="p-3 font-mono font-bold text-cyan-700">{artifact.id}</td><td className="p-3 text-slate-600 dark:text-slate-300">{new Date(artifact.createdAt).toLocaleString()}</td><td className="p-3 font-mono text-slate-500">{artifact.envelope.manifest.schemaVersion}</td><td className="p-3 text-right font-mono">{artifact.envelope.manifest.tables.reduce((sum, table) => sum + table.rowCount, 0)}</td><td className="p-3"><div className="flex justify-end gap-2"><button title="Download encrypted export" onClick={() => void downloadArtifact(artifact)} disabled={Boolean(busy)} className="rounded-lg border border-slate-300 p-2 text-slate-600 hover:bg-slate-100 dark:border-slate-700"><Download className="h-4 w-4" /></button><button onClick={() => void stageArtifact(artifact.id)} disabled={Boolean(busy)} className="rounded-lg border border-cyan-300 px-3 py-2 font-bold text-cyan-800 hover:bg-cyan-50 disabled:opacity-50 dark:border-cyan-800 dark:text-cyan-300">{busy === `stage:${artifact.id}` ? 'Validating...' : 'Stage and validate'}</button></div></td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white">Restore jobs</h3>
        <div className="space-y-2">{jobs.length === 0 ? <p className="border-y border-slate-200 p-8 text-center text-sm text-slate-500 dark:border-slate-800">No restore validation jobs.</p> : jobs.map((job) => (
          <div key={job.id} className="grid gap-3 border-b border-slate-200 py-3 sm:grid-cols-[1fr_auto_auto] sm:items-center dark:border-slate-800">
            <div><div className="font-mono text-xs font-bold text-slate-800 dark:text-slate-200">{job.id}</div><div className="mt-1 text-xs text-slate-500">Artifact {job.artifactId} · {new Date(job.createdAt).toLocaleString()}</div></div>
            <div className={`flex items-center gap-1.5 text-xs font-bold ${job.status === 'VALIDATED' || job.status === 'PROMOTED' ? 'text-emerald-700' : job.status === 'FAILED' ? 'text-rose-700' : 'text-amber-700'}`}>{job.status === 'VALIDATED' || job.status === 'PROMOTED' ? <CheckCircle2 className="h-4 w-4" /> : <ShieldAlert className="h-4 w-4" />}{job.status}</div>
            {job.status === 'VALIDATED' ? <button onClick={() => { setPromoting(job); setConfirmation(''); setPassword(''); }} className="flex items-center justify-center gap-2 rounded-lg bg-rose-700 px-3 py-2 text-xs font-bold text-white hover:bg-rose-800"><RotateCcw className="h-4 w-4" />Promote restore</button> : <span className="w-32" />}
          </div>
        ))}</div>
      </section>

      {promoting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4" onClick={() => !busy && setPromoting(null)}>
          <div className="w-full max-w-lg space-y-4 rounded-lg bg-white p-6 shadow-xl dark:bg-slate-900" onClick={(event) => event.stopPropagation()}>
            <div className="flex justify-between"><div><h3 className="text-base font-bold text-slate-900 dark:text-white">Promote validated recovery</h3><p className="mt-1 text-xs text-slate-500">This atomically replaces the organization data with the validated artifact.</p></div><button title="Close" onClick={() => setPromoting(null)} className="p-1 text-slate-400"><X className="h-4 w-4" /></button></div>
            <form onSubmit={promote} className="space-y-3">
              <label className="block space-y-1 text-xs font-bold text-slate-700 dark:text-slate-300"><span>Current owner password</span><input type="password" required value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" className="w-full rounded-lg border border-slate-300 bg-white p-2.5 dark:border-slate-700 dark:bg-slate-800" /></label>
              <label className="block space-y-1 text-xs font-bold text-slate-700 dark:text-slate-300"><span>Type this confirmation exactly</span><code className="block select-all break-all rounded bg-slate-100 p-2 text-[11px] dark:bg-slate-800">PROMOTE RECOVERY {promoting.id} TO {promoting.targetOrganizationId}</code><input required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="w-full rounded-lg border border-slate-300 bg-white p-2.5 font-mono text-xs dark:border-slate-700 dark:bg-slate-800" /></label>
              <div className="flex justify-end gap-2 pt-2"><button type="button" onClick={() => setPromoting(null)} className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-bold">Cancel</button><button type="submit" disabled={Boolean(busy)} className="rounded-lg bg-rose-700 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{busy ? 'Promoting...' : 'Promote recovery'}</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
