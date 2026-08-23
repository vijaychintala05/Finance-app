import React, { useEffect, useState } from 'react';
import { Copy, MailPlus, RefreshCw, Trash2 } from 'lucide-react';
import { apiClient } from '../../api/client';

type Role = 'Admin' | 'Accountant' | 'Sales' | 'Purchase' | 'Viewer';
interface Member { membershipId: string; fullName: string; email: string; role: Role | 'Owner'; status: string; joinedAt: string; }
interface Invitation { id: string; email: string; role: Role; status: string; expiresAt: string; token?: string; }

export const TeamAccessView: React.FC = () => {
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('Accountant');
  const [issuedToken, setIssuedToken] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [memberResponse, invitationResponse] = await Promise.all([
      apiClient.get<Member[]>('/access/members'),
      apiClient.get<Invitation[]>('/access/invitations'),
    ]);
    if (memberResponse.error || invitationResponse.error) setError(memberResponse.error || invitationResponse.error || 'Access data could not be loaded');
    else { setMembers(memberResponse.data || []); setInvitations(invitationResponse.data || []); setError(''); }
  };
  useEffect(() => { void load(); }, []);

  const invite = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    const response = await apiClient.post<Invitation>('/access/invitations', { email, role, expiresInHours: 72 });
    setBusy(false);
    if (response.error) { setError(response.error); return; }
    setIssuedToken(response.data?.token || ''); setEmail(''); await load();
  };
  const updateRole = async (member: Member, nextRole: Role) => {
    const response = await apiClient.patch<Member>(`/access/members/${member.membershipId}/role`, { role: nextRole });
    if (response.error) { setError(response.error); return; }
    await load();
  };
  const revokeMember = async (member: Member) => {
    const response = await apiClient.delete(`/access/members/${member.membershipId}`);
    if (response.error) setError(response.error); else await load();
  };
  const revokeInvite = async (invitation: Invitation) => {
    const response = await apiClient.delete(`/access/invitations/${invitation.id}`);
    if (response.error) setError(response.error); else await load();
  };

  return <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
    <header className="flex items-center justify-between border-b border-slate-200 pb-4 dark:border-slate-800"><div><h2 className="text-xl font-semibold">Team Access</h2><p className="mt-1 text-xs text-slate-500">Members, roles, and accountant invitations</p></div><button title="Refresh" onClick={() => void load()} className="grid h-9 w-9 place-items-center rounded-md border border-slate-300"><RefreshCw className="h-4 w-4" /></button></header>
    {error && <div className="border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
    <form onSubmit={invite} className="grid gap-3 border-b border-slate-200 pb-6 sm:grid-cols-[1fr_180px_auto] dark:border-slate-800"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="colleague@company.com" className="rounded-md border border-slate-300 p-2 text-sm dark:border-slate-700 dark:bg-slate-900" /><select value={role} onChange={(e) => setRole(e.target.value as Role)} className="rounded-md border border-slate-300 p-2 text-sm dark:border-slate-700 dark:bg-slate-900"><option>Accountant</option><option>Admin</option><option>Sales</option><option>Purchase</option><option>Viewer</option></select><button disabled={busy} className="inline-flex items-center justify-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-xs font-semibold text-white"><MailPlus className="h-4 w-4" />Invite</button></form>
    {issuedToken && <div className="flex items-center gap-3 border border-amber-200 bg-amber-50 p-3"><code className="min-w-0 flex-1 truncate text-xs">{issuedToken}</code><button title="Copy invitation token" onClick={() => void navigator.clipboard.writeText(issuedToken)} className="grid h-8 w-8 place-items-center rounded-md"><Copy className="h-4 w-4" /></button></div>}
    <section><h3 className="mb-3 text-sm font-semibold">Members</h3><div className="overflow-x-auto border border-slate-200 dark:border-slate-800"><table className="w-full min-w-[650px] text-left text-xs"><thead className="bg-slate-50 text-slate-500 dark:bg-slate-950"><tr><th className="p-3">Member</th><th className="p-3">Role</th><th className="p-3">Status</th><th className="p-3 text-right">Action</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{members.map(member => <tr key={member.membershipId}><td className="p-3"><div className="font-semibold">{member.fullName}</div><div className="text-slate-500">{member.email}</div></td><td className="p-3">{member.role === 'Owner' ? <span>Owner</span> : <select value={member.role} onChange={(e) => void updateRole(member, e.target.value as Role)} className="rounded-md border border-slate-300 p-1.5 dark:border-slate-700 dark:bg-slate-900"><option>Admin</option><option>Accountant</option><option>Sales</option><option>Purchase</option><option>Viewer</option></select>}</td><td className="p-3">{member.status}</td><td className="p-3 text-right">{member.role !== 'Owner' && <button title="Revoke access" onClick={() => void revokeMember(member)} className="grid h-8 w-8 place-items-center rounded-md text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>}</td></tr>)}</tbody></table></div></section>
    <section><h3 className="mb-3 text-sm font-semibold">Invitations</h3><div className="divide-y divide-slate-100 border border-slate-200 dark:divide-slate-800 dark:border-slate-800">{invitations.map(invite => <div key={invite.id} className="flex items-center gap-3 p-3 text-xs"><div className="min-w-0 flex-1"><div className="truncate font-semibold">{invite.email}</div><div className="text-slate-500">{invite.role} · {invite.status}</div></div>{invite.status === 'Pending' && <button title="Revoke invitation" onClick={() => void revokeInvite(invite)} className="grid h-8 w-8 place-items-center rounded-md text-red-600"><Trash2 className="h-4 w-4" /></button>}</div>)}{invitations.length === 0 && <div className="p-6 text-center text-sm text-slate-500">No invitations</div>}</div></section>
  </div>;
};
