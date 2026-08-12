import React from 'react';
import { UserPlus } from 'lucide-react';

interface DashboardQuickActionsProps {
  onOpenInvoiceEditor: () => void;
  onOpenExpenseModal: () => void;
  onOpenClientModal: () => void;
}

export const DashboardQuickActions: React.FC<DashboardQuickActionsProps> = ({
  onOpenInvoiceEditor,
  onOpenExpenseModal,
  onOpenClientModal,
}) => {
  return (
    <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl p-6 text-white shadow-md flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-lg">Quick Actions</h3>
          <div className="w-7 h-7 bg-white/20 rounded-full flex items-center justify-center font-bold text-sm">
            ⚡
          </div>
        </div>
        <p className="text-blue-100 text-xs mt-1">Instant double-entry & billing actions.</p>
      </div>

      <div className="flex flex-col gap-2.5 mt-6">
        <button
          onClick={onOpenInvoiceEditor}
          className="flex items-center gap-3 bg-white/10 hover:bg-white/20 p-3 rounded-xl border border-white/15 transition-all text-left cursor-pointer"
        >
          <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center font-bold text-sm">
            +
          </div>
          <div>
            <span className="text-xs font-bold block">New Invoice</span>
            <span className="text-[10px] text-blue-100">Bill a client project</span>
          </div>
        </button>

        <button
          onClick={onOpenExpenseModal}
          className="flex items-center gap-3 bg-white/10 hover:bg-white/20 p-3 rounded-xl border border-white/15 transition-all text-left cursor-pointer"
        >
          <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center font-bold text-sm">
            $
          </div>
          <div>
            <span className="text-xs font-bold block">Log Expense</span>
            <span className="text-[10px] text-blue-100">Record vendor cost</span>
          </div>
        </button>

        <button
          onClick={onOpenClientModal}
          className="flex items-center gap-3 bg-white/10 hover:bg-white/20 p-3 rounded-xl border border-white/15 transition-all text-left cursor-pointer"
        >
          <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center font-bold text-sm">
            <UserPlus className="w-4 h-4" />
          </div>
          <div>
            <span className="text-xs font-bold block">New Customer</span>
            <span className="text-[10px] text-blue-100">Add client profile</span>
          </div>
        </button>
      </div>
    </div>
  );
};
