import React, { useState } from 'react';
import { Users, Shield, UserCheck, Plus, CheckCircle, Trash2, Mail, Lock, Settings } from 'lucide-react';
import { useBooks } from '../../context/BooksContext';
import { RoleSetting, UserSetting } from '../../types';

interface UsersRolesSettingsProps {
  subTab: 'users' | 'roles' | 'preferences';
}

export const UsersRolesSettings: React.FC<UsersRolesSettingsProps> = ({ subTab }) => {
  const { settings, updateSettings, memberships, currentOrg, inviteMember, revokeMembership } = useBooks();
  const [successMsg, setSuccessMsg] = useState('');

  const triggerSave = (newValues: Partial<typeof settings>) => {
    updateSettings(newValues);
    setSuccessMsg('Settings updated successfully!');
    setTimeout(() => setSuccessMsg(''), 3000);
  };

  const orgMemberships = memberships.filter((m) => m.orgUuid === currentOrg.uuid);

  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserRole, setNewUserRole] = useState<'Owner' | 'Admin' | 'Accountant' | 'Auditor' | 'Member'>('Accountant');

  // State for Roles
  const [rolesList, setRolesList] = useState<RoleSetting[]>(
    settings.roles || [
      { id: 'rol-1', name: 'Super Admin', description: 'Full system control & settings', permissionsCount: 42 },
      { id: 'rol-2', name: 'Senior Accountant', description: 'Post entries, invoices, bills, & reports', permissionsCount: 35 },
      { id: 'rol-3', name: 'Project Manager', description: 'Assigned projects and time tracking', permissionsCount: 18 },
      { id: 'rol-4', name: 'Auditor', description: 'Read-only access to records and tax reports', permissionsCount: 12 },
    ]
  );
  const [selectedRoleForEdit, setSelectedRoleForEdit] = useState<RoleSetting | null>(null);

  // State for Preferences
  const [theme, setTheme] = useState<'Light' | 'Dark' | 'System'>(settings.userPreferences?.theme || 'Light');
  const [language, setLanguage] = useState(settings.userPreferences?.language || 'English (US)');
  const [dateFormat, setDateFormat] = useState(settings.userPreferences?.dateFormat || 'YYYY-MM-DD');
  const [timezone, setTimezone] = useState(settings.userPreferences?.timezone || 'America/Los_Angeles (PST)');

  const handleInviteUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserName || !newUserEmail) return;
    inviteMember({
      orgUuid: currentOrg.uuid,
      userEmail: newUserEmail,
      userName: newUserName,
      role: newUserRole,
    });
    setSuccessMsg(`Invitation dispatched to ${newUserEmail} for organization ${currentOrg.publicOrgId}`);
    setTimeout(() => setSuccessMsg(''), 4000);
    setNewUserName('');
    setNewUserEmail('');
  };

  const handleRevoke = (membershipId: string) => {
    revokeMembership(membershipId);
    setSuccessMsg('User membership revoked.');
    setTimeout(() => setSuccessMsg(''), 3000);
  };

  return (
    <div className="space-y-6 text-xs text-slate-700">
      {successMsg && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 p-3 rounded-xl font-bold flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-emerald-600" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Users Tab */}
      {subTab === 'users' && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-600" />
              <h3 className="text-sm font-bold text-slate-800">
                Organization Memberships ({currentOrg.name})
              </h3>
            </div>
            <span className="font-mono text-xs font-bold text-amber-800 bg-amber-50 px-2.5 py-1 rounded border border-amber-200">
              {currentOrg.publicOrgId}
            </span>
          </div>

          <form onSubmit={handleInviteUser} className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-3">
            <h4 className="font-bold text-slate-800 text-xs">Invite Member to Workspace</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <input
                type="text"
                placeholder="Full Name"
                value={newUserName}
                onChange={(e) => setNewUserName(e.target.value)}
                required
                className="bg-white border border-slate-300 rounded-lg p-2 text-xs focus:outline-none focus:border-indigo-600"
              />
              <input
                type="email"
                placeholder="Work Email"
                value={newUserEmail}
                onChange={(e) => setNewUserEmail(e.target.value)}
                required
                className="bg-white border border-slate-300 rounded-lg p-2 text-xs focus:outline-none focus:border-indigo-600"
              />
              <select
                value={newUserRole}
                onChange={(e) => setNewUserRole(e.target.value as any)}
                className="bg-white border border-slate-300 rounded-lg p-2 text-xs focus:outline-none focus:border-indigo-600"
              >
                <option value="Admin">Admin</option>
                <option value="Accountant">Accountant</option>
                <option value="Auditor">Auditor</option>
                <option value="Member">Member</option>
              </select>
            </div>
            <button
              type="submit"
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 cursor-pointer text-xs shadow-2xs"
            >
              <Plus className="w-3.5 h-3.5" /> Send Invitation
            </button>
          </form>

          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                <tr>
                  <th className="p-3">User</th>
                  <th className="p-3">Email</th>
                  <th className="p-3">Role</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Invited / Active</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-sans">
                {orgMemberships.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50">
                    <td className="p-3 font-bold text-slate-800">{m.userName}</td>
                    <td className="p-3 text-slate-600 font-mono text-[11px]">{m.userEmail}</td>
                    <td className="p-3">
                      <span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded border border-indigo-200 font-bold text-[10px]">
                        {m.role}
                      </span>
                    </td>
                    <td className="p-3">
                      <span
                        className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                          m.status === 'Active' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {m.status}
                      </span>
                    </td>
                    <td className="p-3 text-slate-500 font-mono text-[11px]">{m.invitedAt || 'Active'}</td>
                    <td className="p-3 text-right">
                      {m.role !== 'Owner' && (
                        <button
                          onClick={() => handleRevoke(m.id)}
                          className="text-rose-500 hover:text-rose-700 p-1 cursor-pointer font-bold"
                          title="Revoke Membership"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Roles Tab */}
      {subTab === 'roles' && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Shield className="w-5 h-5 text-indigo-600" />
            <h3 className="text-sm font-bold text-slate-800">Role & Access Control Matrix</h3>
          </div>

          <div className="space-y-3">
            {rolesList.map((role) => (
              <div key={role.id} className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex justify-between items-center">
                <div>
                  <h4 className="font-bold text-slate-800 text-xs flex items-center gap-2">
                    <span>{role.name}</span>
                    <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded text-[10px] font-mono font-bold">
                      {role.permissionsCount} Permissions Active
                    </span>
                  </h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">{role.description}</p>
                </div>
                <button
                  onClick={() => setSelectedRoleForEdit(role)}
                  className="bg-white hover:bg-slate-100 border border-slate-300 font-bold px-3 py-1.5 rounded text-xs cursor-pointer text-slate-800 transition-colors shadow-2xs"
                >
                  Edit Permissions
                </button>
              </div>
            ))}
          </div>

          {/* Role Permissions Modal */}
          {selectedRoleForEdit && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-fade-in">
              <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-100">
                <div className="bg-slate-900 text-white p-5 flex justify-between items-center">
                  <div>
                    <h3 className="font-extrabold text-base text-white">Permissions: {selectedRoleForEdit.name}</h3>
                    <p className="text-xs text-slate-400 font-medium">{selectedRoleForEdit.description}</p>
                  </div>
                  <button
                    onClick={() => setSelectedRoleForEdit(null)}
                    className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    ✕
                  </button>
                </div>

                <div className="p-6 space-y-3 max-h-[60vh] overflow-y-auto">
                  <p className="text-xs font-bold text-slate-700">Configure Access Rights for {selectedRoleForEdit.name}:</p>

                  {[
                    { id: 'p1', label: 'Create & Post Invoices / Credit Notes', defaultChecked: true },
                    { id: 'p2', label: 'Approve & Record Expenses / Vendor Bills', defaultChecked: true },
                    { id: 'p3', label: 'Create & Post Manual Journal Entries', defaultChecked: selectedRoleForEdit.name !== 'Auditor' },
                    { id: 'p4', label: 'Manage Chart of Accounts (COA)', defaultChecked: selectedRoleForEdit.name.includes('Admin') || selectedRoleForEdit.name.includes('Senior') },
                    { id: 'p5', label: 'Access Banking & Cash Drawer Ledgers', defaultChecked: true },
                    { id: 'p6', label: 'View Financial Statements & Tax Compliance Reports', defaultChecked: true },
                    { id: 'p7', label: 'Modify Firm Organization & Tax Settings', defaultChecked: selectedRoleForEdit.name.includes('Admin') },
                    { id: 'p8', label: 'Export Data & Audit Trail Logs', defaultChecked: true },
                  ].map((perm) => (
                    <label key={perm.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer hover:bg-slate-100/60 transition-colors">
                      <span className="text-xs font-semibold text-slate-800">{perm.label}</span>
                      <input
                        type="checkbox"
                        defaultChecked={perm.defaultChecked}
                        className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                      />
                    </label>
                  ))}
                </div>

                <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
                  <button
                    onClick={() => setSelectedRoleForEdit(null)}
                    className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold rounded-xl text-xs transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      triggerSave({ roles: rolesList });
                      setSelectedRoleForEdit(null);
                    }}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer shadow-xs"
                  >
                    Save Permissions
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Preferences Tab */}
      {subTab === 'preferences' && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <UserCheck className="w-5 h-5 text-emerald-600" />
            <h3 className="text-sm font-bold text-slate-800">User Preferences & Localization</h3>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-slate-600 font-bold mb-1">Theme Mode</label>
                <select
                  value={theme}
                  onChange={(e) => setTheme(e.target.value as any)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-slate-800 font-bold"
                >
                  <option value="Light">Light Mode</option>
                  <option value="Dark">Dark Mode</option>
                  <option value="System">System Default</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-600 font-bold mb-1">Display Language</label>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-slate-800"
                >
                  <option value="English (US)">English (US)</option>
                  <option value="English (UK)">English (UK)</option>
                  <option value="Spanish">Spanish</option>
                  <option value="German">German</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-slate-600 font-bold mb-1">Date Display Format</label>
                <select
                  value={dateFormat}
                  onChange={(e) => setDateFormat(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-slate-800 font-mono"
                >
                  <option value="YYYY-MM-DD">YYYY-MM-DD (2026-07-26)</option>
                  <option value="DD/MM/YYYY">DD/MM/YYYY (26/07/2026)</option>
                  <option value="MM/DD/YYYY">MM/DD/YYYY (07/26/2026)</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-600 font-bold mb-1">Organization Timezone</label>
                <input
                  type="text"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-slate-800"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex justify-end">
              <button
                onClick={() =>
                  triggerSave({
                    userPreferences: { theme, language, dateFormat, timezone, currencyFormat: '$1,234,567.89' },
                  })
                }
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-5 rounded-lg transition-colors cursor-pointer"
              >
                Save Preferences
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
