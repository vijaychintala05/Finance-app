import React, { useState } from 'react';
import {
  CheckCircle,
  Clock,
  Plus,
  Search,
  Truck,
} from 'lucide-react';
import { useBooks } from '../../context/BooksContext';
import { formatDate } from '../../utils/formatters';
import { DeliveryChallan } from '../../types';
import { DeliveryChallanDetailsModal } from './DeliveryChallanDetailsModal';

export const DeliveryChallansView: React.FC = () => {
  const { deliveryChallans, addDeliveryChallan, updateDeliveryChallan, clients } = useBooks();

  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [viewingChallan, setViewingChallan] = useState<DeliveryChallan | null>(null);

  // Modal
  const [clientName, setClientName] = useState(clients[0]?.name || '');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [itemsSummary, setItemsSummary] = useState('');

  const filtered = deliveryChallans.filter(
    (c) =>
      c.challanNumber.toLowerCase().includes(search.toLowerCase()) ||
      c.clientName.toLowerCase().includes(search.toLowerCase()) ||
      c.itemsSummary.toLowerCase().includes(search.toLowerCase())
  );

  const handleCreateChallan = (e: React.FormEvent) => {
    e.preventDefault();
    const targetClient = clientName || clients[0]?.name || 'Unassigned Customer';

    const created = addDeliveryChallan({
      challanNumber: `DC-2026-00${deliveryChallans.length + 1}`,
      clientName: targetClient,
      dispatchDate: new Date().toISOString().split('T')[0],
      deliveryAddress: deliveryAddress || 'Main Commercial Premises',
      itemsSummary: itemsSummary || 'Dispatched items batch',
      status: 'In Transit',
    });
    if (!created) return;

    setIsModalOpen(false);
    setDeliveryAddress('');
    setItemsSummary('');
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center space-x-2">
            <Truck className="w-6 h-6 text-sky-600" />
            <span>Delivery Challans & Dispatch Slips</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Issue goods dispatch notes, track physical delivery statuses, and maintain transport audit records
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center space-x-1.5 shadow-2xs cursor-pointer transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>New Delivery Challan</span>
        </button>
      </div>

      {/* Search */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs flex items-center">
        <div className="relative w-full max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search challan #, client or item..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white pl-9 pr-3 py-2 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 font-bold border-b border-slate-200 dark:border-slate-800 uppercase text-[10px] tracking-wider">
              <tr>
                <th className="p-3 pl-4">Challan #</th>
                <th className="p-3">Customer</th>
                <th className="p-3">Dispatch Date</th>
                <th className="p-3">Delivery Destination</th>
                <th className="p-3">Dispatched Goods Summary</th>
                <th className="p-3 text-center">Status</th>
                <th className="p-3 text-right pr-4">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((dc) => (
                <tr
                  key={dc.id}
                  onClick={() => setViewingChallan(dc)}
                  className="hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  <td className="p-3 pl-4 font-mono font-bold text-sky-600">{dc.challanNumber}</td>
                  <td className="p-3 font-bold text-slate-800">{dc.clientName}</td>
                  <td className="p-3 text-slate-500">{formatDate(dc.dispatchDate)}</td>
                  <td className="p-3 text-slate-600 font-medium max-w-xs truncate">{dc.deliveryAddress}</td>
                  <td className="p-3 text-slate-700 font-medium">{dc.itemsSummary}</td>
                  <td className="p-3 text-center">
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border ${
                        dc.status === 'Delivered'
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                          : 'bg-amber-100 text-amber-800 border-amber-200'
                      }`}
                    >
                      {dc.status}
                    </span>
                  </td>
                  <td className="p-3 text-right pr-4" onClick={(e) => e.stopPropagation()}>
                    {dc.status !== 'Delivered' && (
                      <button
                        onClick={() => {
                          updateDeliveryChallan(dc.id, { status: 'Delivered' });
                        }}
                        className="text-xs font-bold text-sky-600 hover:underline cursor-pointer"
                      >
                        Mark Delivered
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl border border-slate-200 dark:border-slate-800">
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Truck className="w-5 h-5 text-sky-600" />
              <span>Create Delivery Challan</span>
            </h3>

            <form onSubmit={handleCreateChallan} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Customer / Consignee</label>
                <select
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs font-medium"
                >
                  {clients.map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Delivery Destination Address</label>
                <input
                  type="text"
                  placeholder="Street, City, State, ZIP"
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs font-medium"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Items / Packages Summary</label>
                <textarea
                  rows={3}
                  placeholder="e.g. 5x Workstations, 2x Monitors..."
                  value={itemsSummary}
                  onChange={(e) => setItemsSummary(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs font-medium"
                  required
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
                  Issue Challan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <DeliveryChallanDetailsModal
        isOpen={!!viewingChallan}
        onClose={() => setViewingChallan(null)}
        challan={viewingChallan}
      />
    </div>
  );
};
