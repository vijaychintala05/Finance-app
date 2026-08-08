import React, { useEffect, useRef, useState } from 'react';
import {
  Building2,
  Check,
  CheckCircle2,
  Copy,
  Download,
  FileText,
  Plus,
  Settings,
  Trash2,
  Upload,
  X,
  ExternalLink,
  Globe,
  Sparkles,
} from 'lucide-react';
import { useBooks } from '../../context/BooksContext';
import { OrganizationMeta } from '../../types';

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
  const {
    organizations,
    currentOrg,
    switchOrganization,
    deleteOrganization,
    exportOrganizationJSON,
    importOrganizationJSON,
  } = useBooks();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string>('');
  const [importSuccess, setImportSuccess] = useState<string>('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isManageMode, setIsManageMode] = useState<boolean>(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSwitch = (orgId: string) => {
    switchOrganization(orgId);
    onClose();
  };

  const handleCopyId = (e: React.MouseEvent, code: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(code);
    setCopiedId(code);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDelete = (e: React.MouseEvent, org: OrganizationMeta) => {
    e.stopPropagation();
    if (organizations.length <= 1) {
      alert('You must keep at least one active organization.');
      return;
    }
    if (
      window.confirm(
        `Are you sure you want to delete Organization "${org.name}" (${org.orgCode})?\nThis action cannot be undone.`
      )
    ) {
      deleteOrganization(org.id);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const ok = importOrganizationJSON(content);
        if (ok) {
          setImportSuccess('Organization imported successfully!');
          setImportError('');
          setTimeout(() => {
            setImportSuccess('');
          }, 3000);
        } else {
          setImportError('Invalid organization JSON file format.');
        }
      } catch (err) {
        setImportError('Failed to parse organization JSON file.');
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-20 px-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      {/* Popover Flyout Panel attached to top-center */}
      <div
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200/90 dark:border-slate-800 w-full max-w-lg overflow-hidden flex flex-col my-2 animate-in fade-in slide-in-from-top-4 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Row: Organizations | Manage | Close */}
        <div className="p-4 px-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-slate-900">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">
            Organizations
          </h2>

          <div className="flex items-center space-x-3">
            <button
              onClick={() => setIsManageMode(!isManageMode)}
              className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 text-xs font-semibold flex items-center space-x-1.5 cursor-pointer py-1 px-2 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
            >
              {isManageMode ? (
                <Check className="w-3.5 h-3.5 stroke-[2.5]" />
              ) : (
                <Settings className="w-3.5 h-3.5" />
              )}
              <span>{isManageMode ? 'Done' : 'Manage'}</span>
            </button>

            <button
              onClick={onClose}
              className="text-slate-400 hover:text-rose-600 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Section Header: My Organizations */}
        <div className="bg-slate-50/80 dark:bg-slate-800/80 px-5 py-2.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <span className="text-xs font-bold text-slate-700 dark:text-slate-200 tracking-wide">
            My Organizations ({organizations.length})
          </span>

          <button
            onClick={() => {
              onClose();
              onOpenWizard();
            }}
            className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center space-x-1 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Organization</span>
          </button>
        </div>

        {/* Alerts */}
        {importSuccess && (
          <div className="bg-emerald-50 border-b border-emerald-100 text-emerald-800 text-xs font-semibold p-3 px-5 flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{importSuccess}</span>
          </div>
        )}

        {importError && (
          <div className="bg-rose-50 border-b border-rose-100 text-rose-800 text-xs font-semibold p-3 px-5 flex items-center space-x-2">
            <X className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{importError}</span>
          </div>
        )}

        {/* Organizations List */}
        <div className="p-3 px-4 space-y-2 max-h-[55vh] overflow-y-auto">
          {organizations.map((org) => {
            const isActive = org.id === currentOrg.id;
            const isCopied = copiedId === org.orgCode;

            return (
              <div
                key={org.id}
                onClick={() => handleSwitch(org.id)}
                className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 group ${
                  isActive
                    ? 'bg-slate-50/90 border-slate-300 shadow-2xs'
                    : 'bg-white border-slate-200 hover:border-blue-300 hover:bg-blue-50/30'
                }`}
              >
                <div className="flex items-center space-x-3.5 min-w-0">
                  {/* Square Document / Building Icon Box */}
                  <div
                    className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border transition-colors ${
                      isActive
                        ? 'bg-white border-slate-300 text-blue-600 shadow-2xs'
                        : 'bg-slate-50 border-slate-200 text-slate-500 group-hover:border-blue-200 group-hover:text-blue-600'
                    }`}
                  >
                    <FileText className="w-5 h-5" />
                  </div>

                  {/* Info Column */}
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-slate-900 leading-tight truncate">
                      {org.name}
                    </h3>

                    <div className="flex items-center space-x-1.5 mt-1 text-xs text-slate-500 flex-wrap">
                      <span className="font-medium text-slate-600">
                        Public Org ID: <span className="font-mono font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">{org.publicOrgId || org.orgCode}</span>
                      </span>

                      {/* Copy Code Icon Button */}
                      <button
                        onClick={(e) => handleCopyId(e, org.publicOrgId || org.orgCode)}
                        className="p-0.5 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer rounded"
                        title="Copy Public Org ID"
                      >
                        {isCopied ? (
                          <Check className="w-3 h-3 text-emerald-600" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>

                      <span className="text-slate-300">•</span>
                      <span className="px-1.5 py-0.5 bg-indigo-50 text-indigo-700 rounded text-[10px] font-bold border border-indigo-100">
                        {org.subscription || 'Enterprise'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right Side: Active Checkmark or Management Action */}
                <div className="flex items-center space-x-2 shrink-0">
                  {isManageMode ? (
                    <div className="flex items-center space-x-1" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => exportOrganizationJSON(org.id)}
                        className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                        title="Export JSON"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      {organizations.length > 1 && (
                        <button
                          onClick={(e) => handleDelete(e, org)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                          title="Delete Organization"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ) : isActive ? (
                    /* Blue Circle Solid Checkmark Icon */
                    <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-2xs">
                      <Check className="w-3.5 h-3.5 stroke-[3]" />
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer Bar with Import & Add Org */}
        <div className="bg-slate-50 p-3 px-5 border-t border-slate-100 flex items-center justify-between">
          <input
            type="file"
            ref={fileInputRef}
            accept=".json"
            onChange={handleFileChange}
            className="hidden"
          />

          <button
            onClick={() => fileInputRef.current?.click()}
            className="text-xs font-bold text-slate-600 hover:text-blue-600 flex items-center space-x-1.5 cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5 text-slate-500" />
            <span>Import Organization JSON</span>
          </button>

          <button
            onClick={() => {
              onClose();
              onOpenWizard();
            }}
            className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center space-x-1.5 shadow-2xs transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Organization</span>
          </button>
        </div>
      </div>
    </div>
  );
};
