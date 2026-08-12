import React, { useEffect, useState } from 'react';
import { Building2, Check, Copy, Plus, X } from 'lucide-react';
import { useBooks } from '../../context/BooksContext';

interface OrganizationSwitcherModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenWizard: () => void;
}

export const OrganizationSwitcherModal: React.FC<OrganizationSwitcherModalProps> = ({
  isOpen,
  onClose,
  onOpenWizard,
}) => {
  const { organizations, currentOrg, switchOrganization } = useBooks();
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSwitch = async (organizationId: string) => {
    await switchOrganization(organizationId);
    onClose();
  };

  const handleCopyId = async (event: React.MouseEvent, publicId: string) => {
    event.stopPropagation();
    await navigator.clipboard.writeText(publicId);
    setCopiedId(publicId);
    window.setTimeout(() => setCopiedId(null), 2000);
  };

  const handleCreate = () => {
    onClose();
    onOpenWizard();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 px-4 pt-16 backdrop-blur-xs sm:pt-20"
      onClick={onClose}
    >
      <div
        className="my-2 flex w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">
              Organizations
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Only organizations returned by your authenticated membership are shown.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-rose-600 dark:hover:bg-slate-800"
            title="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-5 py-2.5 dark:border-slate-800 dark:bg-slate-800/80">
          <span className="text-xs font-bold tracking-wide text-slate-700 dark:text-slate-200">
            My organizations ({organizations.length})
          </span>
          <button
            onClick={handleCreate}
            className="flex items-center space-x-1 text-xs font-bold text-blue-600 hover:text-blue-800"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>New organization</span>
          </button>
        </div>

        <div className="max-h-[55vh] space-y-2 overflow-y-auto px-4 py-3">
          {organizations.map((organization) => {
            const isActive = organization.id === currentOrg.id;
            const publicId = organization.publicOrgId || organization.orgCode;
            return (
              <button
                type="button"
                key={organization.id}
                onClick={() => void handleSwitch(organization.id)}
                className={`group flex w-full items-center justify-between gap-3 rounded-xl border p-3.5 text-left transition-all ${
                  isActive
                    ? 'border-slate-300 bg-slate-50/90 shadow-2xs dark:border-slate-700 dark:bg-slate-800'
                    : 'border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/30 dark:border-slate-700 dark:bg-slate-900'
                }`}
              >
                <span className="flex min-w-0 items-center space-x-3.5">
                  <span
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${
                      isActive
                        ? 'border-slate-300 bg-white text-blue-600 dark:border-slate-600 dark:bg-slate-900'
                        : 'border-slate-200 bg-slate-50 text-slate-500 group-hover:border-blue-200 group-hover:text-blue-600 dark:border-slate-700 dark:bg-slate-800'
                    }`}
                  >
                    <Building2 className="h-5 w-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold text-slate-900 dark:text-white">
                      {organization.name}
                    </span>
                    <span className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                      <span className="font-medium">Public organization ID:</span>
                      <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                        {publicId}
                      </span>
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(event) => void handleCopyId(event, publicId)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            void handleCopyId(event as unknown as React.MouseEvent, publicId);
                          }
                        }}
                        className="rounded p-0.5 text-slate-400 hover:text-slate-700"
                        title="Copy public organization ID"
                      >
                        {copiedId === publicId ? (
                          <Check className="h-3 w-3 text-emerald-600" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </span>
                    </span>
                  </span>
                </span>
                {isActive && (
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white">
                    <Check className="h-3.5 w-3.5 stroke-[3]" />
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-5 py-3 dark:border-slate-800 dark:bg-slate-800/60">
          <span className="text-xs text-slate-500">
            Organization export and deletion require an audited server workflow.
          </span>
          <button
            onClick={handleCreate}
            className="flex shrink-0 items-center space-x-1.5 rounded-xl bg-blue-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-2xs transition-colors hover:bg-blue-700"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add organization</span>
          </button>
        </div>
      </div>
    </div>
  );
};
