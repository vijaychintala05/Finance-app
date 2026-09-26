import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle, Edit2, Package, Plus, Search, Trash2, X } from 'lucide-react';
import { apiClient } from '../../api/client';
import { useBooks } from '../../context/BooksContext';
import type { ItemActionPermissions } from '../../permissions/useItemPermissions';
import { formatCurrency } from '../../utils/formatters';

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

type ItemDraft = Partial<ItemModel>;

export const MasterItemsView: React.FC<{ permissions: ItemActionPermissions }> = ({ permissions }) => {
  const { currentOrg } = useBooks();
  const [items, setItems] = useState<ItemModel[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ItemDraft | null>(null);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(false);
  const [uncertainSave, setUncertainSave] = useState(false);
  const [uncertainArchiveId, setUncertainArchiveId] = useState<string | null>(null);
  const [archiveCandidate, setArchiveCandidate] = useState<ItemModel | null>(null);
  const archiveTriggerRef = useRef<HTMLButtonElement | null>(null);
  const archiveCancelRef = useRef<HTMLButtonElement | null>(null);
  const archiveDialogRef = useRef<HTMLElement | null>(null);
  const archiveRetryRef = useRef<HTMLButtonElement | null>(null);
  const archiveHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const requestGeneration = useRef(0);
  const currentOrgRef = useRef(currentOrg.id);
  currentOrgRef.current = currentOrg.id;

  const loadItems = useCallback(async () => {
    const requestedOrgId = currentOrg.id;
    const generation = ++requestGeneration.current;
    setLoading(true);
    setItems([]);
    setError('');
    setLoadError('');
    try {
      const response = await apiClient.get<{ items: ItemModel[] }>(
        `/items?search=${encodeURIComponent(search)}`,
        requestedOrgId
      );
      if (generation !== requestGeneration.current || currentOrgRef.current !== requestedOrgId) return;
      if (response.error || !Array.isArray(response.data?.items)) {
        setLoadError(response.error || 'The item catalog could not be loaded.');
        setItems([]);
      } else {
        setItems(response.data.items);
      }
    } catch {
      if (generation === requestGeneration.current && currentOrgRef.current === requestedOrgId) {
        setLoadError('The item catalog could not be loaded.');
        setItems([]);
      }
    } finally {
      if (generation === requestGeneration.current && currentOrgRef.current === requestedOrgId) setLoading(false);
    }
  }, [currentOrg.id, search]);

  useEffect(() => {
    void loadItems();
    return () => { requestGeneration.current += 1; };
  }, [loadItems]);

  useEffect(() => {
    setModalOpen(false);
    setEditingItem(null);
    setBusy(false);
    setUncertainSave(false);
    setUncertainArchiveId(null);
    setArchiveCandidate(null);
  }, [currentOrg.id]);

  const closeModal = (force = false) => {
    if (uncertainSave && !force) return;
    setModalOpen(false);
    setEditingItem(null);
    setUncertainSave(false);
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingItem?.name?.trim() || busy) return;
    const requestedOrgId = currentOrg.id;
    setBusy(true);
    setError('');
    setLoadError('');
    try {
      const response = editingItem.id
        ? await apiClient.put(`/items/${editingItem.id}`, editingItem, requestedOrgId)
        : await apiClient.post('/items', editingItem, requestedOrgId);
      if (currentOrgRef.current !== requestedOrgId) return;
      if (response.error) {
        const uncertain = response.status >= 500 || response.retryable === true || response.errorCode === 'NETWORK_FAILURE' || response.errorCode === 'COMMAND_IN_PROGRESS';
        setUncertainSave(uncertain);
        setError(uncertain ? response.error + ' The result may be pending. Retry without changing the form.' : response.error);
        return;
      }
        setUncertainSave(false);

      closeModal(true);
      await loadItems();
    } catch {
      setUncertainSave(true);
      setError('The item save result could not be confirmed. Retry without changing the form.');
    } finally {
      setBusy(false);
    }
  };

  const handleArchive = async (item: ItemModel) => {
    if (!permissions.itemsArchive || busy) return;
    const requestedOrgId = currentOrg.id;
    archiveHeadingRef.current?.focus();
    setArchiveCandidate(null);
    setBusy(true);
    setError('');
    setLoadError('');
    try {
      const response = await apiClient.delete<{ archived?: boolean }>(`/items/${item.id}`, requestedOrgId);
      if (currentOrgRef.current !== requestedOrgId) return;
      if (response.error) {
        const uncertain = response.status >= 500 || response.retryable === true || response.errorCode === 'NETWORK_FAILURE' || response.errorCode === 'COMMAND_IN_PROGRESS';
        setUncertainArchiveId(uncertain ? item.id : null);
        setError(uncertain ? response.error + ' The result may be pending. Retry the archive unchanged.' : response.error);
        return;
      }
      setUncertainArchiveId(null);
    setArchiveCandidate(null);
      setItems((previous) => previous.filter((row) => row.id !== item.id));
      await loadItems();
    } catch {
      setUncertainArchiveId(item.id);
      setError('The archive result could not be confirmed. Retry the archive unchanged.');
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (!archiveCandidate) return;
    archiveCancelRef.current?.focus();

    const containDialogFocus = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        archiveTriggerRef.current?.focus();
        setArchiveCandidate(null);
        return;
      }
      if (event.key !== 'Tab') return;
      const controls = archiveDialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled)');
      if (!controls?.length) return;
      const activeIndex = Array.from(controls).indexOf(document.activeElement as HTMLElement);
      const nextIndex = event.shiftKey
        ? (activeIndex <= 0 ? controls.length - 1 : activeIndex - 1)
        : (activeIndex < 0 || activeIndex === controls.length - 1 ? 0 : activeIndex + 1);
      event.preventDefault();
      controls[nextIndex].focus();
    };

    document.addEventListener('keydown', containDialogFocus);
    return () => document.removeEventListener('keydown', containDialogFocus);
  }, [archiveCandidate]);
  useEffect(() => {
    if (!busy && uncertainArchiveId) archiveRetryRef.current?.focus();
  }, [busy, uncertainArchiveId]);
  const canEdit = permissions.itemsEdit;
  const canCreate = permissions.itemsCreate;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 ref={archiveHeadingRef} tabIndex={-1} className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Package className="w-6 h-6 text-slate-700" /> Items &amp; Services
          </h1>
          <p className="text-xs text-slate-500 mt-1">Maintain document items and service rates, HSN/SAC codes, and tax rates. SKU and unit appear on document lines; this catalog does not track on-hand stock, inventory valuation, warehouse availability, or reorder levels.</p>
        </div>
        {canCreate && <button
          disabled={uncertainArchiveId !== null} onClick={() => { setEditingItem({ unit: 'Pcs', salesRate: 0, purchaseRate: 0, gstRate: 18, isActive: true }); setModalOpen(true); }}
          className="flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-xs transition-colors"
        >
          <Plus className="w-4 h-4" /> Add New Item / Service
        </button>}
      </div>

      {(error || loadError) && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error || loadError}</div>}

      <div className="flex items-center gap-4 bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input type="search" disabled={uncertainArchiveId !== null} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name, SKU or HSN/SAC..." className="w-full text-xs pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-900" />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
        <table className="mobile-record-table w-full text-left text-xs">
          <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
            <tr>
              <th className="p-3">Item / Service Name</th><th className="p-3">SKU</th><th className="p-3">HSN / SAC</th><th className="p-3">Unit</th><th className="p-3 text-right">Sales Rate</th><th className="p-3 text-right">GST Rate</th><th className="p-3 text-center">Status</th>
              {(canEdit || permissions.itemsArchive) && <th className="p-3 text-right">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? <tr><td colSpan={8} className="p-8 text-center text-slate-400">Loading item catalog...</td></tr>
              : loadError ? <tr><td colSpan={8} className="p-8 text-center text-rose-700">Items could not be loaded.</td></tr>
              : items.length === 0 ? <tr><td colSpan={8} className="p-8 text-center text-slate-500">No items found.</td></tr>
              : items.map((item) => <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                <td className="p-3 font-semibold text-slate-900">{item.name}{item.description && <p className="text-[11px] text-slate-400 font-normal truncate max-w-xs">{item.description}</p>}</td>
                <td className="p-3 font-mono text-slate-600">{item.sku || '—'}</td><td className="p-3 font-mono text-slate-600">{item.hsnSac || '—'}</td><td className="p-3 text-slate-600">{item.unit}</td>
                <td className="p-3 text-right font-medium text-slate-900">{formatCurrency(item.salesRate, '₹')}</td><td className="p-3 text-right font-medium text-slate-700">{item.gstRate}%</td>
                <td className="p-3 text-center"><span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 bg-emerald-50 rounded-full"><CheckCircle className="w-3 h-3" /> Active</span></td>
                {(canEdit || permissions.itemsArchive) && <td className="p-3 text-right space-x-2">
                  {canEdit && <button aria-label={`Edit ${item.name}`} disabled={busy || uncertainArchiveId !== null} onClick={() => { setEditingItem(item); setModalOpen(true); }} className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-md"><Edit2 className="w-3.5 h-3.5" /></button>}
                  {permissions.itemsArchive && <button ref={uncertainArchiveId === item.id ? archiveRetryRef : null} aria-label={uncertainArchiveId === item.id ? `Retry archive ${item.name}` : `Archive ${item.name}`} disabled={busy || (uncertainArchiveId !== null && uncertainArchiveId !== item.id)} onClick={(event) => { if (uncertainArchiveId === item.id) void handleArchive(item); else { archiveTriggerRef.current = event.currentTarget; setArchiveCandidate(item); } }} className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-md disabled:opacity-50"><Trash2 className="w-3.5 h-3.5" /></button>}
                </td>}
              </tr>)}
          </tbody>
        </table>
      </div>

      {archiveCandidate && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
        <section role="dialog" aria-modal="true" aria-labelledby="archive-item-title" aria-describedby="archive-item-description" ref={archiveDialogRef} className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl">
          <h2 id="archive-item-title" className="text-base font-bold text-slate-900">Archive {archiveCandidate.name}?</h2>
          <p id="archive-item-description" className="mt-2 text-sm text-slate-600">The item will leave the active catalog. Existing invoices and purchase records will keep their item history.</p>
          <div className="mt-5 flex justify-end gap-2">
            <button ref={archiveCancelRef} type="button" disabled={busy} onClick={() => { archiveTriggerRef.current?.focus(); setArchiveCandidate(null); }} className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700">Keep item</button>
            <button type="button" disabled={busy} onClick={() => void handleArchive(archiveCandidate)} className="rounded-lg bg-rose-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Archive item</button>
          </div>
        </section>
      </div>}
      {modalOpen && (canCreate || canEdit) && editingItem && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
        <div className="w-full max-w-md bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-slate-100"><h3 className="text-sm font-bold text-slate-900">{editingItem.id ? 'Edit Item / Service' : 'Add New Item / Service'}</h3><button aria-label="Close item form" disabled={busy || uncertainSave} onClick={() => closeModal()} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button></div>
          <form onSubmit={handleSave} className="p-4 space-y-3 text-xs">
            <fieldset disabled={busy || uncertainSave} className="space-y-3">
            <label className="block text-slate-700 font-semibold">Item / Service Name *<input type="text" required value={editingItem.name || ''} onChange={(event) => setEditingItem({ ...editingItem, name: event.target.value })} className="mt-1 w-full p-2 border border-slate-200 rounded-lg" /></label>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-slate-700 font-semibold">SKU Code<input type="text" value={editingItem.sku || ''} onChange={(event) => setEditingItem({ ...editingItem, sku: event.target.value })} className="mt-1 w-full p-2 border border-slate-200 rounded-lg" /></label>
              <label className="text-slate-700 font-semibold">HSN / SAC Code<input type="text" value={editingItem.hsnSac || ''} onChange={(event) => setEditingItem({ ...editingItem, hsnSac: event.target.value })} className="mt-1 w-full p-2 border border-slate-200 rounded-lg" /></label>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <label className="text-slate-700 font-semibold">Unit<input type="text" value={editingItem.unit || 'Pcs'} onChange={(event) => setEditingItem({ ...editingItem, unit: event.target.value })} className="mt-1 w-full p-2 border border-slate-200 rounded-lg" /></label>
              <label className="text-slate-700 font-semibold">Sales Rate<input type="number" min="0" step="0.01" value={editingItem.salesRate ?? 0} onChange={(event) => setEditingItem({ ...editingItem, salesRate: Number(event.target.value) })} className="mt-1 w-full p-2 border border-slate-200 rounded-lg" /></label>
              <label className="text-slate-700 font-semibold">GST Rate (%)<input type="number" min="0" max="100" step="0.01" value={editingItem.gstRate ?? 18} onChange={(event) => setEditingItem({ ...editingItem, gstRate: Number(event.target.value) })} className="mt-1 w-full p-2 border border-slate-200 rounded-lg" /></label>
            </div>
            <label className="block text-slate-700 font-semibold">Description<textarea rows={2} value={editingItem.description || ''} onChange={(event) => setEditingItem({ ...editingItem, description: event.target.value })} className="mt-1 w-full p-2 border border-slate-200 rounded-lg" /></label>
            </fieldset>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100"><button type="button" disabled={busy || uncertainSave} onClick={() => closeModal()} className="px-3 py-1.5 text-slate-600 bg-slate-100 rounded-lg">Cancel</button><button type="submit" disabled={busy} className="px-4 py-1.5 text-white bg-slate-900 rounded-lg disabled:opacity-50">{busy ? 'Saving…' : uncertainSave ? 'Retry unchanged save' : 'Save Item'}</button></div>
          </form>
        </div>
      </div>}
    </div>
  );
};
