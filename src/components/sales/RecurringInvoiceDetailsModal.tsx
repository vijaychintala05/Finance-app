import React, { useState } from 'react';
import {
  ArrowLeft,
  Calendar,
  Clock,
  MoreVertical,
  PauseCircle,
  Play,
  Printer,
  RotateCcw,
  Trash2,
  User,
  X,
} from 'lucide-react';
import { RecurringInvoiceProfile } from '../../types';
import { useBooks } from '../../context/BooksContext';
import { formatCurrency, formatDate } from '../../utils/formatters';

interface RecurringInvoiceDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: RecurringInvoiceProfile | null;
  onToggleStatus?: (id: string) => void;
}

export const RecurringInvoiceDetailsModal: React.FC<RecurringInvoiceDetailsModalProps> = ({
  isOpen,
  onClose,
  profile,
  onToggleStatus,
}) => {
  const { settings, updateRecurringInvoice, deleteRecurringInvoice } = useBooks();
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  if (!isOpen || !profile) return null;

  const handleToggle = () => {
    if (onToggleStatus) {
      onToggleStatus(profile.id);
    } else {
      updateRecurringInvoice(profile.id, {
        status: profile.status === 'Active' ? 'Paused' : 'Active',
      });
    }
  };

  const handleDelete = () => {
    if (confirm(`Are you sure you want to delete profile "${profile.profileName}"?`)) {
      if (deleteRecurringInvoice) {
        deleteRecurringInvoice(profile.id);
      }
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 z-50 animate-fade-in overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl border border-slate-200 dark:border-slate-800 my-auto">
        {/* TOP BAR */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 sticky top-0 z-10">
          <div className="flex items-center space-x-3">
            <button
              onClick={onClose}
              className="p-2 -ml-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 cursor-pointer transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Recurring Invoice Profile
            </h3>
          </div>

          <div className="flex items-center space-x-1 relative">
            <button
              onClick={() => setShowMoreMenu(!showMoreMenu)}
              className="p-2.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 cursor-pointer transition-colors"
            >
              <MoreVertical className="w-4 h-4" />
            </button>

            {showMoreMenu && (
              <div className="absolute right-0 top-12 w-48 bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 py-2 z-20">
                <button
                  onClick={() => {
                    setShowMoreMenu(false);
                    window.print();
                  }}
                  className="w-full text-left px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center space-x-2"
                >
                  <Printer className="w-4 h-4 text-slate-500" />
                  <span>Print Details</span>
                </button>

                <button
                  onClick={() => {
                    setShowMoreMenu(false);
                    handleDelete();
                  }}
                  className="w-full text-left px-4 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950 flex items-center space-x-2"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Delete Profile</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* DETAILS BODY */}
        <div className="p-5 space-y-6 max-h-[80vh] overflow-y-auto">
          {/* PROFILE AMOUNT & BADGE */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                {profile.profileName}
              </h2>
              <p className="text-2xl font-black text-purple-600 dark:text-purple-400 font-mono tracking-tight mt-1">
                {formatCurrency(profile.amount, settings.currencySymbol)}{' '}
                <span className="text-xs font-semibold text-slate-400">/ {profile.frequency}</span>
              </p>
            </div>

            <span
              className={`px-3 py-1 rounded-full text-xs font-extrabold border ${
                profile.status === 'Active'
                  ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                  : 'bg-amber-100 text-amber-800 border-amber-200'
              }`}
            >
              {profile.status}
            </span>
          </div>

          {/* METADATA GRID */}
          <div className="bg-purple-50/70 dark:bg-purple-950/40 border border-purple-100 dark:border-purple-900 rounded-2xl p-4 space-y-3">
            <div className="flex justify-between items-center text-xs">
              <span className="text-purple-600 dark:text-purple-400 font-extrabold uppercase text-[10px] tracking-wider">
                Target Customer
              </span>
              <span className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-purple-500" />
                <span>{profile.clientName}</span>
              </span>
            </div>

            <div className="flex justify-between items-center text-xs pt-2 border-t border-purple-100/80 dark:border-purple-900/80">
              <span className="text-purple-600 dark:text-purple-400 font-extrabold uppercase text-[10px] tracking-wider">
                Next Invoicing Date
              </span>
              <span className="font-bold text-slate-800 dark:text-slate-200 font-mono">
                {formatDate(profile.nextRunDate)}
              </span>
            </div>

            <div className="flex justify-between items-center text-xs pt-2 border-t border-purple-100/80 dark:border-purple-900/80">
              <span className="text-purple-600 dark:text-purple-400 font-extrabold uppercase text-[10px] tracking-wider">
                Auto-Send Email
              </span>
              <span className="font-bold text-emerald-600 dark:text-emerald-400">
                {profile.autoSend ? 'Enabled (Auto Email)' : 'Disabled (Draft)'}
              </span>
            </div>
          </div>

          {/* TOGGLE STATUS BUTTON */}
          <div className="pt-2">
            <button
              onClick={handleToggle}
              className={`w-full py-3 px-4 rounded-xl text-xs font-bold flex items-center justify-center space-x-2 cursor-pointer shadow-xs ${
                profile.status === 'Active'
                  ? 'bg-amber-100 hover:bg-amber-200 text-amber-800'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white'
              }`}
            >
              {profile.status === 'Active' ? (
                <>
                  <PauseCircle className="w-4 h-4" />
                  <span>Pause Recurring Schedule</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  <span>Resume Active Schedule</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
