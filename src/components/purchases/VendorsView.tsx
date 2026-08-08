import React, { useState } from 'react';
import {
  Building2,
  Edit2,
  Mail,
  Phone,
  Plus,
  Search,
  Trash2,
  User,
} from 'lucide-react';
import { useBooks } from '../../context/BooksContext';
import { Vendor } from '../../types';
import { formatCurrency } from '../../utils/formatters';

export const VendorsView: React.FC = () => {
  const { vendors, settings, addVendor, updateVendor, deleteVendor } = useBooks();

  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null);

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

  const handleSubmit = (e: React.FormEvent) => {
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
    } else {
      addVendor({
        name,
        contactPerson,
        email,
        phone,
        taxId,
        paymentTerms,
        address,
        payablesBalance: 0,
        status: 'Active',
      });
    }

    setIsModalOpen(false);
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center space-x-2">
            <Building2 className="w-6 h-6 text-indigo-600" />
            <span>Vendors & Suppliers</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Maintain vendor directories, contact details, payment terms, tax IDs, and outstanding payables
          </p>
        </div>

        <button
          onClick={handleOpenCreate}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center space-x-1.5 shadow-2xs cursor-pointer transition-colors"
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
            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white pl-9 pr-3 py-2 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
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
            <tbody className="divide-y divide-slate-100">
              {filteredVendors.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400">
                    No vendors found matching search.
                  </td>
                </tr>
              ) : (
                filteredVendors.map((v) => (
                  <tr key={v.id} className="hover:bg-slate-50 transition-colors">
                    <td className="p-3 pl-4 font-bold text-slate-800">
                      <div>{v.name}</div>
                      {v.taxId && <div className="text-[10px] font-mono text-slate-400">Tax ID: {v.taxId}</div>}
                    </td>
                    <td className="p-3 text-slate-600 font-medium">{v.contactPerson || '—'}</td>
                    <td className="p-3 text-slate-600">
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
                    <td className="p-3 font-semibold text-slate-700">{v.paymentTerms || 'Net 30'}</td>
                    <td className="p-3 text-right font-mono font-bold text-indigo-600">
                      {formatCurrency(v.payablesBalance || 0, settings.currencySymbol)}
                    </td>
                    <td className="p-3 text-center">
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-200">
                        {v.status || 'Active'}
                      </span>
                    </td>
                    <td className="p-3 text-right pr-4">
                      <div className="flex items-center justify-end space-x-2">
                        <button
                          onClick={() => handleOpenEdit(v)}
                          className="p-1 text-slate-400 hover:text-indigo-600 cursor-pointer"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => deleteVendor(v.id)}
                          className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
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
              <Building2 className="w-5 h-5 text-indigo-600" />
              <span>{selectedVendor ? 'Edit Vendor Details' : 'Add New Vendor'}</span>
            </h3>

            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Vendor Company Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. AWS Cloud Services"
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs font-medium"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Contact Person</label>
                  <input
                    type="text"
                    value={contactPerson}
                    onChange={(e) => setContactPerson(e.target.value)}
                    placeholder="e.g. Sarah Jenkins"
                    className="w-full border border-slate-300 rounded-lg p-2 text-xs font-medium"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Tax ID / GSTIN</label>
                  <input
                    type="text"
                    value={taxId}
                    onChange={(e) => setTaxId(e.target.value)}
                    placeholder="e.g. US99881122"
                    className="w-full border border-slate-300 rounded-lg p-2 text-xs font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="billing@vendor.com"
                    className="w-full border border-slate-300 rounded-lg p-2 text-xs font-medium"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Phone</label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+1 (555) 019-2834"
                    className="w-full border border-slate-300 rounded-lg p-2 text-xs font-medium"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Payment Terms</label>
                <select
                  value={paymentTerms}
                  onChange={(e) => setPaymentTerms(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs font-medium"
                >
                  <option value="Due on Receipt">Due on Receipt</option>
                  <option value="Net 15">Net 15</option>
                  <option value="Net 30">Net 30</option>
                  <option value="Net 60">Net 60</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Address</label>
                <textarea
                  rows={2}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Street address, City, State..."
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs font-medium"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-2xs cursor-pointer transition-colors"
                >
                  {selectedVendor ? 'Update Vendor' : 'Save Vendor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
