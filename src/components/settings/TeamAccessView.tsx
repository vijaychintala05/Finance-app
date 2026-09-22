import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Copy, MailPlus, RefreshCw, ShieldAlert, Trash2, Users, X } from 'lucide-react';
import { apiClient, type ApiResponse } from '../../api/client';
import { OperationNoticeBanner } from '../common/OperationNoticeBanner';
import { committedButStaleNotice, mutationFailureNotice, type OperationNotice } from '../../utils/operationNotice';

type Role = 'Admin' | 'Finance Manager' | 'Accountant' | 'Sales' | 'Purchase' | 'Viewer' | 'Approver';
type InvitationStatus = 'Pending' | 'Accepted' | 'Revoked' | 'Expired';

interface Member {
  membershipId: string;
  fullName: string;
  email: string;
  role: Role | 'Owner';
  status: 'Active' | 'Revoked';
  joinedAt: string;
}

interface Invitation {
  id: string;
  email: string;
  role: Role;
  status: InvitationStatus;
  expiresAt: string;
  createdAt: string;
  token?: string;
}

type PendingAction =
  | { kind: 'role'; member: Member; nextRole: Role }
  | { kind: 'member'; member: Member }
  | { kind: 'invitation'; invitation: Invitation };

const ROLES: readonly Role[] = ['Admin', 'Finance Manager', 'Accountant', 'Approver', 'Sales', 'Purchase', 'Viewer'];

const formatDate = (value: string): string => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unknown' : date.toLocaleString();
};

export const TeamAccessView: React.FC = () => {
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('Accountant');
  const [expiresInHours, setExpiresInHours] = useState(72);
  const [issuedToken, setIssuedToken] = useState('');
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState<OperationNotice | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  const load = async (): Promise<boolean> => {
    setLoading(true);
    const [memberResponse, invitationResponse] = await Promise.all([
      apiClient.get<Member[]>('/access/members'),
      apiClient.get<Invitation[]>('/access/invitations'),
    ]);
    setLoading(false);
    if (memberResponse.error || invitationResponse.error) {
      setLoadError(memberResponse.error || invitationResponse.error || 'Access data could not be loaded.');
      return false;
    }
    setMembers(memberResponse.data || []);
    setInvitations(invitationResponse.data || []);
    setLoadError('');
    return true;
  };

  useEffect(() => { void load(); }, []);

  useEffect(() => {
    if (!pendingAction) return;
    confirmButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || busy) return;
      setPendingAction(null);
      window.setTimeout(() => returnFocusRef.current?.focus(), 0);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [pendingAction, busy]);

  const pendingInvitations = useMemo(
    () => invitations.filter((invitation) => invitation.status === 'Pending'),
    [invitations]
  );
  const activeMembers = useMemo(
    () => members.filter((member) => member.status === 'Active'),
    [members]
  );

  const refreshAfterCommit = async (success: OperationNotice, requestId?: string): Promise<void> => {
    const refreshed = await load();
    setNotice(refreshed ? { ...success, requestId } : committedButStaleNotice(
      `${success.title}, but the roster is stale`,
      `${success.message} The server committed the change, but the refreshed roster could not be loaded. Do not repeat the action.`,
      requestId
    ));
  };

  const invite = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setNotice(null);
    const normalizedEmail = email.trim().toLowerCase();
    const response = await apiClient.post<Invitation>('/access/invitations', {
      email: normalizedEmail,
      role,
      expiresInHours,
    });
    setBusy(false);
    if (response.error || !response.data) {
      setNotice(mutationFailureNotice(response, {
        action: 'Invitation',
        uncertainRecovery: 'Refresh the roster before retrying so the invitation is not created twice.',
        failureRecovery: 'Review the email, role, and expiry before trying again.',
      }));
      return;
    }
    setIssuedToken(response.data.token || '');
    setEmail('');
    await refreshAfterCommit({
      tone: 'success',
      title: 'Invitation created',
      message: `${normalizedEmail} can join as ${role} until ${formatDate(response.data.expiresAt)}.`,
    }, response.requestId);
  };

  const openConfirmation = (action: PendingAction, trigger: HTMLElement) => {
    returnFocusRef.current = trigger;
    setNotice(null);
    setPendingAction(action);
  };

  const closeConfirmation = () => {
    if (busy) return;
    setPendingAction(null);
    window.setTimeout(() => returnFocusRef.current?.focus(), 0);
  };

  const confirmAction = async () => {
    if (!pendingAction || busy) return;
    setBusy(true);
    const action = pendingAction;
    let response: ApiResponse<unknown>;
    let success: OperationNotice;

    if (action.kind === 'role') {
      response = await apiClient.patch(`/access/members/${action.member.membershipId}/role`, { role: action.nextRole });
      success = {
        tone: 'success',
        title: 'Member role changed',
        message: `${action.member.fullName || action.member.email} is now ${action.nextRole}. Existing sessions were invalidated.`,
      };
    } else if (action.kind === 'member') {
      response = await apiClient.delete(`/access/members/${action.member.membershipId}`);
      success = {
        tone: 'success',
        title: 'Member access revoked',
        message: `${action.member.fullName || action.member.email} can no longer access this organization. Existing sessions were invalidated.`,
      };
    } else {
      response = await apiClient.delete(`/access/invitations/${action.invitation.id}`);
      success = {
        tone: 'success',
        title: 'Invitation revoked',
        message: `${action.invitation.email} can no longer use this invitation.`,
      };
    }

    setBusy(false);
    setPendingAction(null);
    window.setTimeout(() => returnFocusRef.current?.focus(), 0);
    if (response.error) {
      setNotice(mutationFailureNotice(response, {
        action: action.kind === 'role' ? 'Role change' : 'Revocation',
        uncertainRecovery: 'Refresh the roster before retrying so the access change is not repeated unnecessarily.',
        failureRecovery: 'Review the current roster and your access permissions before trying again.',
      }));
      return;
    }
    await refreshAfterCommit(success, response.requestId);
  };

  const copyToken = async () => {
    try {
      await navigator.clipboard.writeText(issuedToken);
      setNotice({ tone: 'success', title: 'Invitation token copied', message: 'Share it only with the intended recipient through a secure channel.' });
    } catch {
      setNotice({ tone: 'error', title: 'Token was not copied', message: 'Select the token and copy it manually.' });
    }
  };

  const confirmationCopy = pendingAction?.kind === 'role'
    ? {
        title: `Change ${pendingAction.member.fullName || pendingAction.member.email}'s role?`,
        body: `Access will change from ${pendingAction.member.role} to ${pendingAction.nextRole}. Existing sessions will be invalidated and the member must sign in again.`,
        button: 'Change role',
      }
    : pendingAction?.kind === 'member'
      ? {
          title: `Revoke ${pendingAction.member.fullName || pendingAction.member.email}'s access?`,
          body: 'The membership will be revoked and existing sessions invalidated. Financial records and audit history remain intact.',
          button: 'Revoke access',
        }
      : pendingAction?.kind === 'invitation'
        ? {
            title: `Revoke invitation for ${pendingAction.invitation.email}?`,
            body: 'The invitation token will stop working. You can create a new invitation later if access is still required.',
            button: 'Revoke invitation',
          }
        : null;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-4 dark:border-slate-800">
        <div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Team Access</h2>
          <p className="mt-1 text-sm text-slate-500">Invite colleagues, assign least-privilege roles, and review access lifecycle state.</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading || busy} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-900">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800"><div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Active members</div><div className="mt-2 text-2xl font-bold">{activeMembers.length}</div></div>
        <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800"><div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Pending invitations</div><div className="mt-2 text-2xl font-bold">{pendingInvitations.length}</div></div>
        <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800"><div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Audit policy</div><div className="mt-2 text-sm font-semibold">Every access change recorded</div></div>
      </div>

      {notice && <OperationNoticeBanner notice={notice} />}

      {loadError && (
        <section role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-900">
          <div><div className="font-semibold">Team access could not be loaded</div><div className="mt-1 text-sm">{loadError}</div></div>
          <button type="button" onClick={() => void load()} className="rounded-lg border border-rose-300 px-3 py-2 text-sm font-semibold">Try again</button>
        </section>
      )}

      <section className="rounded-xl border border-slate-200 p-4 dark:border-slate-800 sm:p-5">
        <div className="mb-4 flex items-center gap-2"><MailPlus className="h-5 w-5 text-blue-600" /><h3 className="font-semibold">Invite a team member</h3></div>
        <form onSubmit={invite} className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_190px_150px_auto]">
          <label className="grid gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300">Email address<input aria-label="Email address" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required placeholder="colleague@company.com" className="min-h-10 rounded-lg border border-slate-300 px-3 text-sm dark:border-slate-700 dark:bg-slate-900" /></label>
          <label className="grid gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300">Role<select aria-label="Role" value={role} onChange={(event) => setRole(event.target.value as Role)} className="min-h-10 rounded-lg border border-slate-300 px-3 text-sm dark:border-slate-700 dark:bg-slate-900">{ROLES.map((entry) => <option key={entry}>{entry}</option>)}</select></label>
          <label className="grid gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300">Expires<select aria-label="Invitation expiry" value={expiresInHours} onChange={(event) => setExpiresInHours(Number(event.target.value))} className="min-h-10 rounded-lg border border-slate-300 px-3 text-sm dark:border-slate-700 dark:bg-slate-900"><option value={24}>24 hours</option><option value={72}>3 days</option><option value={168}>7 days</option></select></label>
          <button disabled={busy || !email.trim()} className="mt-auto inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"><MailPlus className="h-4 w-4" />{busy ? 'Working…' : 'Create invitation'}</button>
        </form>
        <p className="mt-3 text-xs leading-5 text-slate-500">Invitations are single-use, organization-scoped, time-limited, and recorded in the audit trail.</p>
      </section>

      {issuedToken && (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
          <div className="font-semibold">One-time invitation token</div><p className="mt-1 text-xs">Copy this now. Treat it like a password and share it only with the intended recipient.</p>
          <div className="mt-3 flex items-center gap-2"><code className="min-w-0 flex-1 select-all overflow-hidden text-ellipsis rounded-lg bg-white/70 p-2 text-xs">{issuedToken}</code><button type="button" aria-label="Copy invitation token" onClick={() => void copyToken()} className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-amber-300"><Copy className="h-4 w-4" /></button><button type="button" onClick={() => setIssuedToken('')} className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-amber-300" aria-label="Dismiss invitation token"><X className="h-4 w-4" /></button></div>
        </section>
      )}

      <section className="space-y-3">
        <div className="flex items-center gap-2"><Users className="h-5 w-5 text-blue-600" /><h3 className="font-semibold">Members</h3></div>
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
          <table className="mobile-record-table w-full min-w-[720px] text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500 dark:bg-slate-950"><tr><th className="p-3">Member</th><th className="p-3">Role</th><th className="p-3">Joined</th><th className="p-3">Status</th><th className="p-3 text-right">Action</th></tr></thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {members.map((member) => (
                <tr key={member.membershipId} className={member.status !== 'Active' ? 'text-slate-400' : ''}>
                  <td data-label="Member" className="p-3"><div className="font-semibold">{member.fullName || 'Unnamed member'}</div><div className="text-xs text-slate-500">{member.email}</div></td>
                  <td data-label="Role" className="p-3">{member.role === 'Owner' || member.status !== 'Active' ? <span>{member.role}</span> : <select aria-label={`Role for ${member.fullName || member.email}`} value={member.role} onChange={(event) => openConfirmation({ kind: 'role', member, nextRole: event.target.value as Role }, event.currentTarget)} disabled={busy} className="min-h-9 rounded-lg border border-slate-300 px-2 dark:border-slate-700 dark:bg-slate-900">{ROLES.map((entry) => <option key={entry}>{entry}</option>)}</select>}</td>
                  <td data-label="Joined" className="p-3 text-xs">{formatDate(member.joinedAt)}</td>
                  <td data-label="Status" className="p-3"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${member.status === 'Active' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>{member.status}</span></td>
                  <td data-label="Action" className="p-3 text-right">{member.role !== 'Owner' && member.status === 'Active' && <button type="button" aria-label={`Revoke access for ${member.fullName || member.email}`} onClick={(event) => openConfirmation({ kind: 'member', member }, event.currentTarget)} disabled={busy} className="inline-grid h-9 w-9 place-items-center rounded-lg text-rose-600 hover:bg-rose-50 disabled:opacity-50"><Trash2 className="h-4 w-4" /></button>}</td>
                </tr>
              ))}
              {!loading && members.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-slate-500">No members were returned for this organization.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="font-semibold">Invitation history</h3>
        <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
          {invitations.map((invitation) => (
            <div key={invitation.id} className="flex flex-wrap items-center gap-3 p-4 text-sm">
              <div className="min-w-0 flex-1"><div className="truncate font-semibold">{invitation.email}</div><div className="mt-1 text-xs text-slate-500">{invitation.role} · created {formatDate(invitation.createdAt)} · expires {formatDate(invitation.expiresAt)}</div></div>
              <span className={`rounded-full px-2 py-1 text-xs font-semibold ${invitation.status === 'Pending' ? 'bg-amber-100 text-amber-800' : invitation.status === 'Accepted' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>{invitation.status}</span>
              {invitation.status === 'Pending' && <button type="button" aria-label={`Revoke invitation for ${invitation.email}`} onClick={(event) => openConfirmation({ kind: 'invitation', invitation }, event.currentTarget)} disabled={busy} className="inline-grid h-9 w-9 place-items-center rounded-lg text-rose-600 hover:bg-rose-50 disabled:opacity-50"><Trash2 className="h-4 w-4" /></button>}
            </div>
          ))}
          {!loading && invitations.length === 0 && <div className="p-8 text-center text-sm text-slate-500">No invitations have been created.</div>}
        </div>
      </section>

      {pendingAction && confirmationCopy && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4" role="presentation">
          <section role="dialog" aria-modal="true" aria-labelledby="team-access-confirm-title" aria-describedby="team-access-confirm-description" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900">
            <ShieldAlert className="h-7 w-7 text-amber-600" aria-hidden="true" />
            <h3 id="team-access-confirm-title" className="mt-3 text-lg font-semibold">{confirmationCopy.title}</h3>
            <p id="team-access-confirm-description" className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{confirmationCopy.body}</p>
            <div className="mt-6 flex justify-end gap-2"><button type="button" onClick={closeConfirmation} disabled={busy} className="min-h-10 rounded-lg border border-slate-300 px-4 text-sm font-semibold dark:border-slate-700">Cancel</button><button ref={confirmButtonRef} type="button" onClick={() => void confirmAction()} disabled={busy} className="min-h-10 rounded-lg bg-rose-600 px-4 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Working…' : confirmationCopy.button}</button></div>
          </section>
        </div>
      )}
    </div>
  );
};
