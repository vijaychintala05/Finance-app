import React, { useState } from 'react';
import {
  ArrowLeft,
  Building2,
  Calendar,
  CreditCard,
  Edit2,
  FolderKanban,
  Globe,
  Mail,
  MapPin,
  MoreVertical,
  Phone,
  Plus,
  Receipt,
  Trash2,
  User,
  X,
} from 'lucide-react';
import { Client } from '../../types';
import { useBooks } from '../../context/BooksContext';
import { formatCurrency, formatDate, getStatusBadgeStyle } from '../../utils/formatters';

interface ClientDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  client: Client | null;
  onEdit: (client: Client) => void;
}

export const ClientDetailsModal: React.FC<ClientDetailsModalProps> = ({
  isOpen,
  onClose,
  client,
  onEdit,
}) => {
  const { invoices, projects, settings, deleteClient } = useBooks();
  const [activeTab, setActiveTab] = useState<'overview' | 'invoices' | 'projects'>('overview');

  if (!isOpen || !client) return null;

  const clientInvoices = invoices.filter((i) => i.clientId === client.id && i.status !== 'Void');
  const totalBilled = clientInvoices.reduce((sum, i) => sum + i.totalAmount, 0);
  const totalAR = clientInvoices.reduce((sum, i) => sum + i.balanceDue, 0);
  const clientProjects = projects.filter((p) => p.clientId === client.id);

  const handleDelete = () => {
    if (confirm(`Are you sure you want to delete client ${client.companyName}?`)) {
      deleteClient(client.id);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 z-50 animate-fade-in overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-2xl w-full overflow-hidden shadow-2xl border border-slate-200 dark:border-slate-800 my-auto">
        {/* TOP BAR */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 sticky top-0 z-10">
          <div className="flex items-center space-x-3">
            <button
              onClick={onClose}
              className="p-2 -ml-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 cursor-pointer transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                {client.companyName}
              </h3>
              <p className="text-xs text-slate-500">Contact: {client.name}</p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => {
                onClose();
                onEdit(client);
              }}
              className="px-3 py-1.5 bg-blue-50 dark:bg-slate-800 hover:bg-blue-100 text-blue-600 dark:text-blue-400 rounded-xl text-xs font-bold flex items-center space-x-1.5 cursor-pointer transition-colors"
            >
              <Edit2 className="w-3.5 h-3.5" />
              <span>Edit</span>
            </button>
            <button
              onClick={handleDelete}
              className="p-2 text-slate-400 hover:text-rose-600 rounded-xl hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* STATS STRIP */}
        <div className="grid grid-cols-3 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800 p-4 gap-4 text-center">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Invoiced</p>
            <p className="text-base font-black text-slate-900 dark:text-slate-100 font-mono mt-0.5">
              {formatCurrency(totalBilled, settings.currencySymbol)}
            </p>
          </div>
          <div className="border-x border-slate-200 dark:border-slate-700/60">
            <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wider">Outstanding AR</p>
            <p className="text-base font-black text-amber-600 dark:text-amber-400 font-mono mt-0.5">
              {formatCurrency(totalAR, settings.currencySymbol)}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">Active Projects</p>
            <p className="text-base font-black text-blue-600 dark:text-blue-400 font-mono mt-0.5">
              {clientProjects.length}
            </p>
          </div>
        </div>

        {/* NAVIGATION TABS */}
        <div className="flex border-b border-slate-100 dark:border-slate-800 px-6 gap-6 text-xs font-bold">
          <button
            onClick={() => setActiveTab('overview')}
            className={`py-3 border-b-2 cursor-pointer transition-colors ${
              activeTab === 'overview'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Client Info
          </button>
          <button
            onClick={() => setActiveTab('invoices')}
            className={`py-3 border-b-2 cursor-pointer transition-colors ${
              activeTab === 'invoices'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Invoices ({clientInvoices.length})
          </button>
          <button
            onClick={() => setActiveTab('projects')}
            className={`py-3 border-b-2 cursor-pointer transition-colors ${
              activeTab === 'projects'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Projects ({clientProjects.length})
          </button>
        </div>

        {/* TAB BODY */}
        <div className="p-6 space-y-6 max-h-[60vh] overflow-y-auto">
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* CONTACT & PAYMENT DETAILS */}
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="bg-slate-50 dark:bg-slate-800/40 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 space-y-3">
                  <h4 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider">
                    Primary Contact
                  </h4>
                  <div className="space-y-2 text-xs font-semibold text-slate-800 dark:text-slate-200">
                    <p className="flex items-center gap-2">
                      <User className="w-4 h-4 text-slate-400" />
                      <span>{client.name}</span>
                    </p>
                    <p className="flex items-center gap-2">
                      <Mail className="w-4 h-4 text-blue-500" />
                      <a href={`mailto:${client.email}`} className="text-blue-600 hover:underline">
                        {client.email}
                      </a>
                    </p>
                    {client.phone && (
                      <p className="flex items-center gap-2">
                        <Phone className="w-4 h-4 text-emerald-500" />
                        <a href={`tel:${client.phone}`} className="hover:underline">
                          {client.phone}
                        </a>
                      </p>
                    )}
                  </div>
                </div>

                <div className="bg-slate-50 dark:bg-slate-800/40 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 space-y-3">
                  <h4 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider">
                    Billing Terms & Tax
                  </h4>
                  <div className="space-y-2 text-xs font-semibold text-slate-800 dark:text-slate-200">
                    <p className="flex items-center justify-between">
                      <span className="text-slate-400">Payment Terms:</span>
                      <span className="bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded font-bold">
                        {client.paymentTerms}
                      </span>
                    </p>
                    <p className="flex items-center justify-between">
                      <span className="text-slate-400">Tax Reg / GSTIN:</span>
                      <span>{client.taxNumber || 'N/A'}</span>
                    </p>
                    <p className="flex items-center justify-between">
                      <span className="text-slate-400">Currency:</span>
                      <span>{client.currency || 'USD ($)'}</span>
                    </p>
                  </div>
                </div>
              </div>

              {/* ADDRESSES */}
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="bg-slate-50 dark:bg-slate-800/40 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 space-y-2">
                  <h4 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-blue-500" />
                    <span>Billing Address</span>
                  </h4>
                  <p className="text-xs text-slate-700 dark:text-slate-300 font-medium leading-relaxed whitespace-pre-line">
                    {client.billingAddress || 'No billing address provided.'}
                  </p>
                </div>

                <div className="bg-slate-50 dark:bg-slate-800/40 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 space-y-2">
                  <h4 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-amber-500" />
                    <span>Shipping Address</span>
                  </h4>
                  <p className="text-xs text-slate-700 dark:text-slate-300 font-medium leading-relaxed whitespace-pre-line">
                    {client.shippingAddress || client.billingAddress || 'Same as billing address.'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'invoices' && (
            <div className="space-y-3">
              {clientInvoices.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-8">
                  No invoices recorded for this client.
                </p>
              ) : (
                clientInvoices.map((inv) => (
                  <div
                    key={inv.id}
                    className="flex items-center justify-between p-3.5 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-100 dark:border-slate-800"
                  >
                    <div>
                      <p className="text-xs font-mono font-bold text-blue-600 dark:text-blue-400">
                        {inv.invoiceNumber}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Issued: {formatDate(inv.issueDate)} • Due: {formatDate(inv.dueDate)}
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="text-xs font-mono font-bold text-slate-900 dark:text-slate-100">
                        {formatCurrency(inv.totalAmount, settings.currencySymbol)}
                      </p>
                      <span
                        className={`inline-block text-[10px] px-2 py-0.5 rounded font-extrabold border mt-0.5 ${getStatusBadgeStyle(
                          inv.status
                        )}`}
                      >
                        {inv.status}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'projects' && (
            <div className="space-y-3">
              {clientProjects.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-8">
                  No active projects assigned to this client.
                </p>
              ) : (
                clientProjects.map((prj) => (
                  <div
                    key={prj.id}
                    className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-100 dark:border-slate-800 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h5 className="text-xs font-bold text-slate-900 dark:text-slate-100">
                          {prj.name}
                        </h5>
                        <p className="text-[10px] font-mono text-slate-400">{prj.code}</p>
                      </div>
                      <span className="text-[10px] font-extrabold px-2.5 py-1 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                        {prj.status}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs font-medium text-slate-500 pt-1">
                      <span>Rate: {formatCurrency(prj.hourlyRate, settings.currencySymbol)}/hr</span>
                      <span>Budget: {formatCurrency(prj.budget, settings.currencySymbol)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
