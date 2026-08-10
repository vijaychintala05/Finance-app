import React, { useState } from 'react';
import { Edit, Mail, Phone, Plus, Search, Trash2, Users } from 'lucide-react';
import { Client } from '../../types';
import { useBooks } from '../../context/BooksContext';
import { formatCurrency } from '../../utils/formatters';
import { ClientModal } from './ClientModal';
import { ClientDetailsModal } from './ClientDetailsModal';

interface ClientsViewProps {
  autoOpenCreateModal?: boolean;
  onModalClosed?: () => void;
  selectedEntityId?: string;
}

export const ClientsView: React.FC<ClientsViewProps> = ({
  autoOpenCreateModal,
  onModalClosed,
  selectedEntityId,
}) => {
  const { clients, invoices, projects, settings, deleteClient } = useBooks();

  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [clientToEdit, setClientToEdit] = useState<Client | null>(null);
  const [viewingClient, setViewingClient] = useState<Client | null>(null);

  React.useEffect(() => {
    if (autoOpenCreateModal) {
      setClientToEdit(null);
      setIsModalOpen(true);
      if (onModalClosed) onModalClosed();
    }
  }, [autoOpenCreateModal, onModalClosed]);

  React.useEffect(() => {
    if (selectedEntityId) {
      const found = clients.find((c) => c.id === selectedEntityId || c.name === selectedEntityId);
      if (found) {
        setViewingClient(found);
      }
    }
  }, [selectedEntityId, clients]);

  const filteredClients = clients.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.companyName.toLowerCase().includes(search.toLowerCase()) ||
      c.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Top Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center space-x-2">
            <Users className="w-6 h-6 text-blue-600" />
            <span>Clients & Customers</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Manage firm clients, payment terms, and billing contact details
          </p>
        </div>

        <button
          onClick={() => {
            setClientToEdit(null);
            setIsModalOpen(true);
          }}
          className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl text-xs font-semibold flex items-center space-x-1.5 shadow-sm transition-all cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Add Client</span>
        </button>
      </div>

      {/* Search Bar */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex items-center">
        <div className="relative w-full max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search clients by name, company, email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 pl-9 pr-3 py-2 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Mobile Client Contact Cards Feed (lg:hidden) */}
      <div className="block lg:hidden space-y-3">
        {filteredClients.map((client) => {
          const clientInvoices = invoices.filter(
            (i) => i.clientId === client.id && i.status !== 'Void'
          );
          const totalAR = clientInvoices.reduce((sum, i) => sum + i.balanceDue, 0);
          const clientProjects = projects.filter((p) => p.clientId === client.id);

          return (
            <div
              key={client.id}
              onClick={() => setViewingClient(client)}
              className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-2xs space-y-3 cursor-pointer hover:bg-slate-50 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center font-black text-sm shadow-2xs">
                    {client.companyName ? client.companyName.charAt(0).toUpperCase() : 'C'}
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900">{client.companyName}</h4>
                    <p className="text-[11px] text-slate-500">{client.name}</p>
                  </div>
                </div>

                <button
                  onClick={() => {
                    setClientToEdit(client);
                    setIsModalOpen(true);
                  }}
                  className="p-1.5 text-slate-600 hover:text-blue-600 bg-slate-100 rounded-xl cursor-pointer"
                >
                  <Edit className="w-4 h-4" />
                </button>
              </div>

              {/* Quick Contact Buttons Row */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                {client.phone ? (
                  <a
                    href={`tel:${client.phone}`}
                    className="p-2 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200/80 flex items-center justify-center space-x-1.5 text-slate-700 font-bold"
                  >
                    <Phone className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Call Client</span>
                  </a>
                ) : (
                  <div className="p-2 bg-slate-50 rounded-xl border border-slate-100 text-slate-400 text-center font-medium">
                    No Phone
                  </div>
                )}

                <a
                  href={`mailto:${client.email}`}
                  className="p-2 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200/80 flex items-center justify-center space-x-1.5 text-slate-700 font-bold"
                >
                  <Mail className="w-3.5 h-3.5 text-blue-600" />
                  <span>Email</span>
                </a>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                <div className="flex items-center space-x-2">
                  <span className="text-[10px] bg-slate-100 px-2 py-0.5 rounded-md font-semibold text-slate-600">
                    {client.paymentTerms}
                  </span>
                  <span className="text-[10px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded-md font-semibold">
                    {clientProjects.length} Projects
                  </span>
                </div>

                <div>
                  <span className="text-[10px] text-slate-400 mr-1">AR Due:</span>
                  <span className="font-mono font-black text-amber-600">
                    {formatCurrency(totalAR, settings.currencySymbol)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Desktop High-Density Clients Table (hidden lg:block) */}
      <div className="hidden lg:block bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 uppercase text-[10px] tracking-wider border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="p-3 pl-4">Client / Company</th>
                <th className="p-3">Contact</th>
                <th className="p-3">Payment Terms</th>
                <th className="p-3">Active Projects</th>
                <th className="p-3">Total Invoiced</th>
                <th className="p-3">Outstanding (AR)</th>
                <th className="p-3 text-right pr-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredClients.map((client) => {
                const clientInvoices = invoices.filter(
                  (i) => i.clientId === client.id && i.status !== 'Void'
                );
                const totalBilled = clientInvoices.reduce((sum, i) => sum + i.totalAmount, 0);
                const totalAR = clientInvoices.reduce((sum, i) => sum + i.balanceDue, 0);
                const clientProjects = projects.filter((p) => p.clientId === client.id);

                return (
                  <tr
                    key={client.id}
                    onClick={() => setViewingClient(client)}
                    className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors cursor-pointer"
                  >
                    <td className="p-3 pl-4">
                      <div className="font-bold text-slate-900 dark:text-slate-100">
                        {client.companyName}
                      </div>
                      <div className="text-[11px] text-slate-500">{client.name}</div>
                    </td>

                    <td className="p-3 space-y-0.5">
                      <div className="flex items-center space-x-1 text-slate-600 dark:text-slate-300">
                        <Mail className="w-3 h-3 text-slate-400" />
                        <span>{client.email}</span>
                      </div>
                      {client.phone && (
                        <div className="flex items-center space-x-1 text-slate-500 text-[11px]">
                          <Phone className="w-3 h-3 text-slate-400" />
                          <span>{client.phone}</span>
                        </div>
                      )}
                    </td>

                    <td className="p-3">
                      <span className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded text-[11px] font-medium border border-slate-200 dark:border-slate-700">
                        {client.paymentTerms}
                      </span>
                    </td>

                    <td className="p-3 font-semibold text-slate-800 dark:text-slate-200">
                      {clientProjects.length} projects
                    </td>

                    <td className="p-3 font-bold text-slate-900 dark:text-slate-100">
                      {formatCurrency(totalBilled, settings.currencySymbol)}
                    </td>

                    <td className="p-3 font-bold text-amber-600 dark:text-amber-400">
                      {formatCurrency(totalAR, settings.currencySymbol)}
                    </td>

                    <td className="p-3 pr-4 text-right space-x-2">
                      <button
                        onClick={() => {
                          setClientToEdit(client);
                          setIsModalOpen(true);
                        }}
                        className="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
                        title="Edit Client"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
                          if (
                            window.confirm(
                              `Delete client ${client.name}? Linked invoices will remain.`
                            )
                          ) {
                            deleteClient(client.id);
                          }
                        }}
                        className="p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
                        title="Delete Client"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <ClientModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        clientToEdit={clientToEdit}
      />

      <ClientDetailsModal
        isOpen={!!viewingClient}
        onClose={() => setViewingClient(null)}
        client={viewingClient}
        onEdit={(client) => {
          setClientToEdit(client);
          setIsModalOpen(true);
        }}
      />
    </div>
  );
};
