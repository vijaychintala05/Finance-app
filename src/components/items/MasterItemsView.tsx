import React, { useState, useEffect } from 'react';
import { Package, Plus, Search, Edit2, Trash2, CheckCircle, X } from 'lucide-react';
import { ApiClient } from '../../api/client';

export interface ItemModel {
  id: string;
  name: string;
  sku?: string;
  description?: string;
  hsnSac?: string;
  unit: string;
  salesRate: number;
  purchaseRate: number;
  gstRate: number;
  isActive: boolean;
}

export const MasterItemsView: React.FC = () => {
  const [items, setItems] = useState<ItemModel[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Partial<ItemModel> | null>(null);

  const apiClient = new ApiClient();

  const loadItems = async () => {
    setLoading(true);
    const res = await apiClient.get<{ items: ItemModel[] }>(`/items?search=${encodeURIComponent(search)}`);
    setLoading(false);
    if (res.data?.items) {
      setItems(res.data.items);
    }
  };

  useEffect(() => {
    loadItems();
  }, [search]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem?.name) return;

    if (editingItem.id) {
      await apiClient.put(`/items/${editingItem.id}`, editingItem);
    } else {
      await apiClient.post('/items', editingItem);
    }

    setModalOpen(false);
    setEditingItem(null);
    loadItems();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this item?')) return;
    await apiClient.delete(`/items/${id}`);
    loadItems();
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Package className="w-6 h-6 text-slate-700" /> Item & Service Master
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Maintain standardize products, consulting rates, HSN/SAC codes and tax rates.
          </p>
        </div>
        <button
          onClick={() => {
            setEditingItem({ unit: 'Pcs', salesRate: 0, purchaseRate: 0, gstRate: 18, isActive: true });
            setModalOpen(true);
          }}
          className="flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-xs transition-colors"
        >
          <Plus className="w-4 h-4" /> Add New Item / Service
        </button>
      </div>

      <div className="flex items-center gap-4 bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, SKU or HSN/SAC..."
            className="w-full text-xs pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-900"
          />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
            <tr>
              <th className="p-3">Item / Service Name</th>
              <th className="p-3">SKU</th>
              <th className="p-3">HSN / SAC</th>
              <th className="p-3">Unit</th>
              <th className="p-3 text-right">Sales Rate (₹)</th>
              <th className="p-3 text-right">GST Rate</th>
              <th className="p-3 text-center">Status</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={8} className="p-8 text-center text-slate-400">Loading item catalog...</td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-8 text-center text-slate-500">No items found. Click "Add New Item" to create one.</td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="p-3 font-semibold text-slate-900">
                    {item.name}
                    {item.description && <p className="text-[11px] text-slate-400 font-normal truncate max-w-xs">{item.description}</p>}
                  </td>
                  <td className="p-3 font-mono text-slate-600">{item.sku || '—'}</td>
                  <td className="p-3 font-mono text-slate-600">{item.hsnSac || '—'}</td>
                  <td className="p-3 text-slate-600">{item.unit}</td>
                  <td className="p-3 text-right font-medium text-slate-900">₹{Number(item.salesRate).toLocaleString('en-IN')}</td>
                  <td className="p-3 text-right font-medium text-slate-700">{item.gstRate}%</td>
                  <td className="p-3 text-center">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 bg-emerald-50 rounded-full">
                      <CheckCircle className="w-3 h-3" /> Active
                    </span>
                  </td>
                  <td className="p-3 text-right space-x-2">
                    <button
                      onClick={() => {
                        setEditingItem(item);
                        setModalOpen(true);
                      }}
                      className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-md"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(item.id)}
                      className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-md"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-md bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900">
                {editingItem?.id ? 'Edit Item / Service' : 'Add New Item / Service'}
              </h3>
              <button onClick={() => setModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSave} className="p-4 space-y-3 text-xs">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Item / Service Name *</label>
                <input
                  type="text"
                  required
                  value={editingItem?.name || ''}
                  onChange={(e) => setEditingItem({ ...editingItem, name: e.target.value })}
                  placeholder="e.g. Cloud Server Hosting"
                  className="w-full p-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">SKU Code</label>
                  <input
                    type="text"
                    value={editingItem?.sku || ''}
                    onChange={(e) => setEditingItem({ ...editingItem, sku: e.target.value })}
                    placeholder="SRV-01"
                    className="w-full p-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">HSN / SAC Code</label>
                  <input
                    type="text"
                    value={editingItem?.hsnSac || ''}
                    onChange={(e) => setEditingItem({ ...editingItem, hsnSac: e.target.value })}
                    placeholder="998315"
                    className="w-full p-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Unit</label>
                  <input
                    type="text"
                    value={editingItem?.unit || 'Pcs'}
                    onChange={(e) => setEditingItem({ ...editingItem, unit: e.target.value })}
                    className="w-full p-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Sales Rate (₹)</label>
                  <input
                    type="number"
                    value={editingItem?.salesRate || 0}
                    onChange={(e) => setEditingItem({ ...editingItem, salesRate: Number(e.target.value) })}
                    className="w-full p-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">GST Rate (%)</label>
                  <input
                    type="number"
                    value={editingItem?.gstRate || 18}
                    onChange={(e) => setEditingItem({ ...editingItem, gstRate: Number(e.target.value) })}
                    className="w-full p-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Description</label>
                <textarea
                  rows={2}
                  value={editingItem?.description || ''}
                  onChange={(e) => setEditingItem({ ...editingItem, description: e.target.value })}
                  placeholder="Optional description for invoices and estimates..."
                  className="w-full p-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-900"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-3 py-1.5 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-xs"
                >
                  Save Item
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
