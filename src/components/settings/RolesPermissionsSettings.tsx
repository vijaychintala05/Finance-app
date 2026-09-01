import React, { useState, useEffect } from 'react';
import { Shield, Plus, Copy, Trash2, Edit3, AlertTriangle, CheckCircle, X, Search, Check } from 'lucide-react';
import { apiClient } from '../../api/client';
import { detectSodConflicts, type PermissionMetadata, type SodConflict } from '../../types/permissions';

interface RoleData {
  id: string;
  name: string;
  description?: string;
  isSystemRole: boolean;
  permissions: string[];
  assignedUsersCount?: number;
}

export const RolesPermissionsSettings: React.FC = () => {
  const [roles, setRoles] = useState<RoleData[]>([]);
  const [allPermissions, setAllPermissions] = useState<PermissionMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRole, setSelectedRole] = useState<RoleData | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isCloning, setIsCloning] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formPermissions, setFormPermissions] = useState<string[]>([]);
  const [permSearch, setPermSearch] = useState('');
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadRolesAndPermissions();
  }, []);

  const loadRolesAndPermissions = async () => {
    setLoading(true);
    try {
      const [rolesRes, permsRes] = await Promise.all([
        apiClient.get<{ roles: RoleData[] }>('/security/roles'),
        apiClient.get<{ permissions: PermissionMetadata[] }>('/security/permissions'),
      ]);

      if (rolesRes.data?.roles) {
        setRoles(rolesRes.data.roles);
        if (!selectedRole && rolesRes.data.roles.length > 0) {
          setSelectedRole(rolesRes.data.roles[0]);
        }
      }
      if (permsRes.data?.permissions) {
        setAllPermissions(permsRes.data.permissions);
      }
    } catch {
      // Fallback
    } finally {
      setLoading(false);
    }
  };

  const handleStartCreate = () => {
    setIsCreating(true);
    setIsCloning(false);
    setIsEditing(true);
    setFormName('');
    setFormDescription('');
    setFormPermissions([]);
    setStatusMessage(null);
  };

  const handleStartClone = (sourceRole: RoleData) => {
    setIsCreating(false);
    setIsCloning(true);
    setIsEditing(true);
    setFormName(`${sourceRole.name} (Custom)`);
    setFormDescription(`Cloned from ${sourceRole.name}`);
    setFormPermissions([...sourceRole.permissions]);
    setStatusMessage(null);
  };

  const handleStartEdit = (role: RoleData) => {
    if (role.isSystemRole) return;
    setIsCreating(false);
    setIsCloning(false);
    setIsEditing(true);
    setFormName(role.name);
    setFormDescription(role.description || '');
    setFormPermissions([...role.permissions]);
    setStatusMessage(null);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setIsCreating(false);
    setIsCloning(false);
    setStatusMessage(null);
  };

  const togglePermission = (code: string) => {
    setFormPermissions((prev) =>
      prev.includes(code) ? prev.filter((p) => p !== code) : [...prev, code]
    );
  };

  const selectAllModule = (module: string) => {
    const moduleCodes = allPermissions.filter((p) => p.module === module).map((p) => p.code);
    setFormPermissions((prev) => Array.from(new Set([...prev, ...moduleCodes])));
  };

  const clearAllModule = (module: string) => {
    const moduleCodes = new Set(allPermissions.filter((p) => p.module === module).map((p) => p.code));
    setFormPermissions((prev) => prev.filter((code) => !moduleCodes.has(code)));
  };

  const handleSaveRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      setStatusMessage({ type: 'error', text: 'Role name cannot be empty.' });
      return;
    }

    setSaving(true);
    setStatusMessage(null);

    try {
      if (isCreating || isCloning) {
        const res = await apiClient.post<{ role: RoleData }>('/security/roles', {
          name: formName.trim(),
          description: formDescription.trim(),
          permissions: formPermissions,
        });
        setStatusMessage({ type: 'success', text: `Role '${formName}' created successfully.` });
        await loadRolesAndPermissions();
        if (res.data?.role) {
          setSelectedRole(res.data.role);
        }
      } else if (selectedRole && !selectedRole.isSystemRole) {
        const res = await apiClient.put<{ role: RoleData }>(`/security/roles/${selectedRole.id}`, {
          name: formName.trim(),
          description: formDescription.trim(),
          permissions: formPermissions,
        });
        setStatusMessage({ type: 'success', text: `Role '${formName}' updated successfully.` });
        await loadRolesAndPermissions();
        if (res.data?.role) {
          setSelectedRole(res.data.role);
        }
      }
      setIsEditing(false);
      setIsCreating(false);
      setIsCloning(false);
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: err.response?.data?.error || err.message || 'Failed to save role.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRole = async (role: RoleData) => {
    if (role.isSystemRole) return;
    if (!window.confirm(`Are you sure you want to delete the custom role '${role.name}'?`)) return;

    try {
      await apiClient.delete(`/security/roles/${role.id}`);
      setStatusMessage({ type: 'success', text: `Role '${role.name}' deleted.` });
      await loadRolesAndPermissions();
      setSelectedRole(roles.find((r) => r.id !== role.id) || null);
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: err.response?.data?.error || err.message || 'Failed to delete role.',
      });
    }
  };

  // Group permissions by module
  const modules: string[] = Array.from(new Set<string>(allPermissions.map((p) => p.module)));
  const filteredPermissions = allPermissions.filter((p) => {
    const q = permSearch.toLowerCase();
    return (
      p.code.toLowerCase().includes(q) ||
      p.resource.toLowerCase().includes(q) ||
      p.action.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q) ||
      p.module.toLowerCase().includes(q)
    );
  });

  // Active SoD conflicts for current edit form
  const activeSodConflicts = isEditing ? detectSodConflicts(formPermissions) : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Shield className="w-5 h-5 text-indigo-600" />
            Roles & Permissions Matrix
          </h2>
          <p className="text-xs text-slate-500">
            Define system and custom roles with granular operation-level permissions and Segregation of Duties checks.
          </p>
        </div>
        {!isEditing && (
          <button
            type="button"
            onClick={handleStartCreate}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Create Custom Role
          </button>
        )}
      </div>

      {statusMessage && (
        <div
          className={`p-3 rounded-lg text-xs font-semibold flex items-center gap-2 ${
            statusMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}
        >
          {statusMessage.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          {statusMessage.text}
        </div>
      )}

      {/* Main Grid: Role List on Left, Permissions Viewer/Editor on Right */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
        {/* LEFT COLUMN: ROLES LIST */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-3">
          <div className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
            Available Roles ({roles.length})
          </div>
          <div className="space-y-1.5 max-h-[600px] overflow-y-auto">
            {roles.map((role) => {
              const isSelected = selectedRole?.id === role.id && !isCreating;
              return (
                <div
                  key={role.id}
                  onClick={() => {
                    if (!isEditing) setSelectedRole(role);
                  }}
                  className={`p-3 rounded-lg border text-xs cursor-pointer transition-all ${
                    isSelected
                      ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/30 text-indigo-950 dark:text-indigo-200'
                      : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold">{role.name}</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wide ${
                        role.isSystemRole
                          ? 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                          : 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300'
                      }`}
                    >
                      {role.isSystemRole ? 'System' : 'Custom'}
                    </span>
                  </div>
                  {role.description && <p className="text-[11px] text-slate-500 mt-1 line-clamp-1">{role.description}</p>}
                  <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
                    <span>{role.permissions.length} permissions</span>
                    <span>{role.assignedUsersCount ?? 0} members</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* RIGHT COLUMN: PERMISSION EDITOR / VIEWER */}
        <div className="md:col-span-2 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 space-y-5">
          {isEditing ? (
            /* EDIT / CREATE ROLE FORM */
            <form onSubmit={handleSaveRole} className="space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  {isCreating ? 'Create Custom Role' : isCloning ? 'Clone Role' : `Edit Role: ${selectedRole?.name}`}
                </h3>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleCancelEdit}
                    className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold hover:bg-slate-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-sm"
                  >
                    {saving ? 'Saving...' : 'Save Role'}
                  </button>
                </div>
              </div>

              {/* SoD Conflicts Warning Banner */}
              {activeSodConflicts.length > 0 && (
                <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-amber-900 dark:text-amber-300">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    <span>Segregation of Duties Conflict Detected ({activeSodConflicts.length})</span>
                  </div>
                  {activeSodConflicts.map((c) => (
                    <div key={c.id} className="text-[11px] text-amber-800 dark:text-amber-400 pl-6 space-y-0.5">
                      <div className="font-bold">[{c.id}] {c.title}</div>
                      <div>{c.description}</div>
                      <div className="italic text-amber-700 dark:text-amber-500">Mitigation: {c.mitigation}</div>
                    </div>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <label className="font-bold text-slate-700 dark:text-slate-300">
                  Role Name *
                  <input
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    required
                    placeholder="e.g. Senior Billing Specialist"
                    className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2 font-normal"
                  />
                </label>
                <label className="font-bold text-slate-700 dark:text-slate-300">
                  Role Description
                  <input
                    type="text"
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    placeholder="Brief summary of duties"
                    className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2 font-normal"
                  />
                </label>
              </div>

              {/* Permission Matrix Tree */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    Select Permissions ({formPermissions.length} selected)
                  </span>
                  <div className="relative w-48">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                    <input
                      type="search"
                      placeholder="Search permissions..."
                      value={permSearch}
                      onChange={(e) => setPermSearch(e.target.value)}
                      className="w-full text-xs pl-8 pr-2 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                    />
                  </div>
                </div>

                <div className="space-y-4 max-h-[450px] overflow-y-auto pr-1">
                  {modules.map((moduleName) => {
                    const modulePerms = filteredPermissions.filter((p) => p.module === moduleName);
                    if (modulePerms.length === 0) return null;
                    const allSelected = modulePerms.every((p) => formPermissions.includes(p.code));

                    return (
                      <div key={moduleName} className="rounded-lg border border-slate-200 dark:border-slate-800 p-3 space-y-2">
                        <div className="flex items-center justify-between pb-1 border-b border-slate-100 dark:border-slate-800">
                          <span className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                            {moduleName}
                          </span>
                          <div className="flex items-center gap-2 text-[11px]">
                            <button
                              type="button"
                              onClick={() => selectAllModule(moduleName)}
                              className="text-indigo-600 hover:underline font-semibold"
                            >
                              Select All
                            </button>
                            <span className="text-slate-300">|</span>
                            <button
                              type="button"
                              onClick={() => clearAllModule(moduleName)}
                              className="text-slate-500 hover:underline"
                            >
                              Clear
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                          {modulePerms.map((perm) => {
                            const isChecked = formPermissions.includes(perm.code);
                            return (
                              <label
                                key={perm.code}
                                className={`flex items-start gap-2 p-2 rounded border cursor-pointer transition-colors ${
                                  isChecked
                                    ? 'bg-indigo-50/40 dark:bg-indigo-950/20 border-indigo-200 dark:border-indigo-800'
                                    : 'border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => togglePermission(perm.code)}
                                  className="mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                />
                                <div className="space-y-0.5">
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-semibold text-slate-900 dark:text-slate-100">{perm.resource}: {perm.action}</span>
                                    <span
                                      className={`text-[9px] px-1 py-0.2 rounded font-bold uppercase ${
                                        perm.risk === 'CRITICAL'
                                          ? 'bg-rose-100 text-rose-700'
                                          : perm.risk === 'HIGH'
                                          ? 'bg-amber-100 text-amber-700'
                                          : perm.risk === 'MEDIUM'
                                          ? 'bg-blue-100 text-blue-700'
                                          : 'bg-emerald-100 text-emerald-700'
                                      }`}
                                    >
                                      {perm.risk}
                                    </span>
                                  </div>
                                  <p className="text-[10px] text-slate-500 line-clamp-1">{perm.description}</p>
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </form>
          ) : selectedRole ? (
            /* VIEW ROLE PERMISSIONS */
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-slate-900 dark:text-white">{selectedRole.name}</h3>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wide ${
                        selectedRole.isSystemRole
                          ? 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                          : 'bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300'
                      }`}
                    >
                      {selectedRole.isSystemRole ? 'Protected System Template' : 'Custom Role'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">{selectedRole.description || 'No description provided.'}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleStartClone(selectedRole)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    <Copy className="w-3.5 h-3.5 text-slate-500" />
                    Clone
                  </button>
                  {!selectedRole.isSystemRole && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleStartEdit(selectedRole)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-indigo-200 text-indigo-600 text-xs font-semibold hover:bg-indigo-50"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteRole(selectedRole)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-rose-200 text-rose-600 text-xs font-semibold hover:bg-rose-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Granted Permissions List */}
              <div className="space-y-3">
                <div className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  Granted Privileges ({selectedRole.permissions.length})
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[480px] overflow-y-auto pr-1">
                  {selectedRole.permissions.map((code) => {
                    const meta = allPermissions.find((p) => p.code === code) || {
                      code,
                      resource: code.split('.')[0],
                      action: code.split('.')[1] || 'Action',
                      risk: 'LOW' as const,
                      description: code,
                      module: 'General',
                      dependencies: [],
                    };
                    return (
                      <div
                        key={code}
                        className="p-2 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 flex items-start gap-2"
                      >
                        <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-900 dark:text-slate-100">
                            <span>{meta.resource}: {meta.action}</span>
                            <span
                              className={`text-[9px] px-1 py-0.2 rounded font-bold uppercase ${
                                meta.risk === 'CRITICAL'
                                  ? 'bg-rose-100 text-rose-700'
                                  : meta.risk === 'HIGH'
                                  ? 'bg-amber-100 text-amber-700'
                                  : meta.risk === 'MEDIUM'
                                  ? 'bg-blue-100 text-blue-700'
                                  : 'bg-emerald-100 text-emerald-700'
                              }`}
                            >
                              {meta.risk}
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-500 line-clamp-1">{meta.description}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-12 text-xs text-slate-400">Select a role on the left to view privileges.</div>
          )}
        </div>
      </div>
    </div>
  );
};
