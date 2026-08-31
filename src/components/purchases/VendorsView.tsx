import React, { useState } from 'react';
import {
  Building2,
  ChevronRight,
  CreditCard,
  Edit2,
  ExternalLink,
  Mail,
  Phone,
  Plus,
  Receipt,
  Search,
  Trash2,
  User,
} from 'lucide-react';
import { useBooks } from '../../context/BooksContext';
import { Vendor } from '../../types';
import { formatCurrency } from '../../utils/formatters';
import { VendorWorkspace } from './VendorWorkspace';

interface VendorsViewProps {
  autoOpenCreateModal?: boolean;
  onModalClosed?: () => void;
  selectedEntityId?: string;
  onSelectedEntityClosed?: () => void;
}

export const VendorsView: React.FC<VendorsViewProps> = ({
  autoOpenCreateModal,
  onModalClosed,
  selectedEntityId,
  onSelectedEntityClosed,
}) => {
  const { vendors, settings, addVendor, updateVendor, deleteVendor } = useBooks();

  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null);
  const [viewingVendor, setViewingVendor] = useState<Vendor | null>(null);

  React.useEffect(() => {
    if (autoOpenCreateModal) {
      handleOpenCreate();
      if (onModalClosed) onModalClosed();
    }
  }, [autoOpenCreateModal]);

  React.useEffect(() => {
    if (selectedEntityId) {
      const found = vendors.find((v) => v.id === selectedEntityId || v.name === selectedEntityId);
      if (found) {
        setViewingVendor(found);
      }
    }
  }, [selectedEntityId, vendors]);

  // Form state
  const [name, setName] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [taxId, setTaxId] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('Net 30');
  const [address, setAddress] = useState('');

  const filteredVendors = vendors.filter(
    (v) =>
      v.name.toLowerCase().includes(search.toLowerCase()) ||
      (v.contactPerson && v.contactPerson.toLowerCase().includes(search.toLowerCase())) ||
      (v.email && v.email.toLowerCase().includes(search.toLowerCase())) ||
      (v.phone && v.phone.toLowerCase().includes(search.toLowerCase()))
  );

  const handleOpenCreate = () => {
    setSelectedVendor(null);
    setName('');
    setContactPerson('');
    setEmail('');
    setPhone('');
    setTaxId('');
    setPaymentTerms('Net 30');
    setAddress('');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (v: Vendor) => {
    setSelectedVendor(v);
    setName(v.name);
    setContactPerson(v.contactPerson || '');
    setEmail(v.email || '');
    setPhone(v.phone || '');
    setTaxId(v.taxId || '');
    setPaymentTerms(v.paymentTerms || 'Net 30');
    setAddress(v.address || '');
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    if (onSelectedEntityClosed) onSelectedEntityClosed();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    if (selectedVendor) {
      updateVendor(selectedVendor.id, {
        name,
        contactPerson,
        email,
        phone,
        taxId,
        paymentTerms,
        address,
      });
      // Also update viewingVendor state if active
      if (viewingVendor && viewingVendor.id === selectedVendor.id) {
        setViewingVendor({
          ...viewingVendor,
          name,
          contactPerson,
          email,
          phone,
          taxId,
          paymentTerms,
          address,
        });
      }
    } else {
      try {
        await addVendor({
          name,
          contactPerson,
          email,
          phone,
          taxId,
          paymentTerms,
          currency: settings.currencyCode,
          address,
          payablesBalance: 0,
          status: 'Active',
        });
      } catch (error: any) {
        window.alert(error.message || 'Vendor could not be created');
        return;
      }
    }

    handleCloseModal();
  };

  // If viewing a single vendor workspace, render VendorWorkspace full page
  if (viewingVendor) {
    const liveVendor = vendors.find((v) => v.id === viewingVendor.id) || viewingVendor;
    return (
      <VendorWorkspace
        vendor={liveVendor}
        onBack={() => {
          setViewingVendor(null);
          if (onSelectedEntityClosed) onSelectedEntityClosed();
        }}
        onEdit={(v) => handleOpenEdit(v)}
      />
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center space-x-2">
            <Building2 className="w-6 h-6 text-purple-600" />
            <span>Vendors & Suppliers</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Maintain vendor directories, contact details, payment terms, tax IDs, and outstanding payables
          </p>
        </div>

        <button
          onClick={handleOpenCreate}
          className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center space-x-1.5 shadow-2xs cursor-pointer transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>Add Vendor</span>
        </button>
      </div>

      {/* Search */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs flex items-center">
        <div className="relative w-full max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search vendor name, contact person, email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white pl-9 pr-3 py-2 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-purple-500 font-medium"
          />
        </div>
      </div>

      {/* Vendor Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 font-bold border-b border-slate-200 dark:border-slate-800 uppercase text-[10px] tracking-wider">
              <tr>
                <th className="p-3 pl-4">Vendor Name</th>
                <th className="p-3">Contact Person</th>
                <th className="p-3">Email & Phone</th>
                <th className="p-3">Payment Terms</th>
                <th className="p-3 text-right">Payables Balance</th>
                <th className="p-3 text-center">Status</th>
                <th className="p-3 text-right pr-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {filteredVendors.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400">
                    No vendors found matching search.
                  </td>
                </tr>
              ) : (
                filteredVendors.map((v) => (
                  <tr
                    key={v.id}
                    onClick={() => setViewingVendor(v)}
                    className="hover:bg-purple-50/40 dark:hover:bg-slate-800/50 transition-colors cursor-pointer group"
                  >
                    <td className="p-3 pl-4 font-bold text-slate-900 dark:text-white">
                      <div className="flex items-center gap-1.5">
                        <span>{v.name}</span>
                        <ChevronRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 text-purple-600 transition-opacity" />
                      </div>
                      {v.taxId && <div className="text-[10px] font-mono text-slate-400">Tax ID: {v.taxId}</div>}
                    </td>
                    <td className="p-3 text-slate-600 dark:text-slate-300 font-medium">{v.contactPerson || '—'}</td>
                    <td className="p-3 text-slate-600 dark:text-slate-300">
                      <div className="flex items-center gap-1">
                        <Mail className="w-3 h-3 text-slate-400" />
                        <span>{v.email || '—'}</span>
                      </div>
                      {v.phone && (
                        <div className="flex items-center gap-1 text-[10px] text-slate-400 mt-0.5">
                          <Phone className="w-3 h-3 text-slate-400" />
                          <span>{v.phone}</span>
                        </div>
                      )}
                    </td>
                    <td className="p-3 font-semibold text-slate-700 dark:text-slate-300">{v.paymentTerms || 'Net 30'}</td>
                    <td className="p-3 text-right font-financial font-bold text-purple-600 dark:text-purple-400">
                      {formatCurrency(v.payablesBalance || 0, settings.currencySymbol)}
                    </td>
                    <td className="p-3 text-center">
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300">
                        {v.status || 'Active'}
                      </span>
                    </td>
                    <td className="p-3 text-right pr-4" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end space-x-2">
                        <button
                          onClick={() => handleOpenEdit(v)}
                          className="p-1 text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 cursor-pointer"
                          title="Edit Vendor"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            if (window.confirm(`Delete vendor "${v.name}"?`)) {
                              deleteVendor(v.id);
                            }
                          }}
                          className="p-1 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 cursor-pointer"
                          title="Delete Vendor"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Vendor Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl border border-slate-200 dark:border-slate-800">
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Building2 className="w-5 h-5 text-purple-600" />
              <span>{selectedVendor ? 'Edit Vendor Details' : 'Add New Vendor'}</span>
            </h3>

            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Vendor Company Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. AWS Cloud Services / Century Plywood"
                  className="w-full border border-slate-300 dark:border-slate-700 rounded-lg p-2 text-xs font-medium dark:bg-slate-800 dark:text-white"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Contact Person</label>
                  <input
                    type="text"
                    value={contactPerson}
                    onChange={(e) => setContactPerson(e.target.value)}
                    placeholder="e.g. Rajesh Sharma"
                    className="w-full border border-slate-300 dark:border-slate-700 rounded-lg p-2 text-xs font-medium dark:bg-slate-800 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Tax ID / GSTIN</label>
                  <input
                    type="text"
                    value={taxId}
                    onChange={(e) => setTaxId(e.target.value)}
                    placeholder="e.g. 36AABCU9603R1ZM"
                    className="w-full border border-slate-300 dark:border-slate-700 rounded-lg p-2 text-xs font-mono dark:bg-slate-800 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="accounts@vendor.com"
                    className="w-full border border-slate-300 dark:border-slate-700 rounded-lg p-2 text-xs font-medium dark:bg-slate-800 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Phone</label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+91 98765 43210"
                    className="w-full border border-slate-300 dark:border-slate-700 rounded-lg p-2 text-xs font-medium dark:bg-slate-800 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Payment Terms</label>
                  <select
                    value={paymentTerms}
                    onChange={(e) => setPaymentTerms(e.target.value)}
                    className="w-full border border-slate-300 dark:border-slate-700 rounded-lg p-2 text-xs font-medium dark:bg-slate-800 dark:text-white"
                  >
                    <option value="Due on Receipt">Due on Receipt</option>
                    <option value="Net 15">Net 15 Days</option>
                    <option value="Net 30">Net 30 Days</option>
                    <option value="Net 45">Net 45 Days (MSME)</option>
                    <option value="Net 60">Net 60 Days</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Address</label>
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="City, State"
                    className="w-full border border-slate-300 dark:border-slate-700 rounded-lg p-2 text-xs font-medium dark:bg-slate-800 dark:text-white"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 transition-colors cursor-pointer"
                >
                  {selectedVendor ? 'Save Changes' : 'Create Vendor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
