import React, { useEffect, useState, useCallback } from 'react';
import { Plus, Pencil, Trash2, Package } from 'lucide-react';
import { api, money } from '../lib/api';
import { Modal, PageLoading, useToast, Toast } from './ui.jsx';
import { vatSelectOptions } from '../lib/taxDefaults';
import SelectMenu from './SelectMenu.jsx';

const KINDS = [
  { value: '', label: 'All kinds' },
  { value: 'labour', label: 'Labour' },
  { value: 'materials', label: 'Materials' },
  { value: 'both', label: 'Both' },
];

const KIND_EDIT = KINDS.filter((k) => k.value);

const EMPTY = {
  id: '',
  description: '',
  unit: 'm²',
  unit_price: 0,
  vat_code: 'standard',
  kind: 'materials',
};

/**
 * Settings catalogue CRUD (requirement 17.2). ADMIN mutates; OFFICE can search/view.
 */
export default function CatalogueSettings({ canEdit }) {
  const [items, setItems] = useState(null);
  const [q, setQ] = useState('');
  const [qDebounced, setQDebounced] = useState('');
  const [kind, setKind] = useState('');
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [vatRates, setVatRates] = useState(null);
  const { toast, show } = useToast();

  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q), 250);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (qDebounced.trim()) params.set('q', qDebounced.trim());
    if (kind) params.set('kind', kind);
    const qs = params.toString();
    const d = await api.get(`/catalogue${qs ? `?${qs}` : ''}`);
    setItems(d.items || []);
  }, [qDebounced, kind]);

  useEffect(() => {
    load().catch((err) => show(err.message, 'error'));
  }, [load, show]);

  useEffect(() => {
    api.get('/quotes/meta/options')
      .then((d) => setVatRates(d.vat_rates || []))
      .catch(() => setVatRates([]));
  }, []);

  const close = () => setDraft(null);

  const save = async () => {
    setSaving(true);
    try {
      if (draft._existing) {
        await api.put(`/catalogue/${draft.id}`, draft);
      } else {
        await api.post('/catalogue', draft);
      }
      show('Saved');
      close();
      await load();
    } catch (err) {
      show(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (item) => {
    if (!window.confirm(`Delete “${item.description}”? Existing quotes keep their copied price.`)) return;
    try {
      await api.del(`/catalogue/${item.id}`);
      show('Deleted');
      await load();
    } catch (err) {
      show(err.message, 'error');
    }
  };

  if (!items) return <PageLoading />;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
      <div className="mb-5 flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
          <Package size={15} />
        </div>
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold text-slate-900">Service catalogue</h3>
          <p className="mt-0.5 text-xs leading-relaxed text-slate-500">Used on quotes. Changing a row does not rewrite lines already saved on a quote.</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-[12rem] flex-1">
          <input
            id="catalogue-search"
            className="input !h-10"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Description or SKU"
            aria-label="Search"
          />
        </div>
        <SelectMenu
          id="catalogue-kind"
          label="Kind"
          value={kind}
          onChange={setKind}
          options={KINDS}
          align="right"
          className="w-[9.5rem] shrink-0"
        />
        {canEdit && (
          <button type="button" className="btn-primary !h-10" onClick={() => setDraft({ ...EMPTY })}>
            <Plus size={14} /> Add item
          </button>
        )}
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
              <th className="py-2 pr-3">Description</th>
              <th className="py-2 pr-3">Unit</th>
              <th className="py-2 pr-3">Price</th>
              <th className="py-2 pr-3">VAT</th>
              <th className="py-2 pr-3">Kind</th>
              {canEdit && <th className="py-2" />}
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b border-slate-100">
                <td className="py-2 pr-3">{item.description}</td>
                <td className="py-2 pr-3 text-slate-500">{item.unit}</td>
                <td className="py-2 pr-3">{money(item.unit_price)}</td>
                <td className="py-2 pr-3">{item.vat_code}</td>
                <td className="py-2 pr-3 capitalize">{item.kind}</td>
                {canEdit && (
                  <td className="py-2 text-right whitespace-nowrap">
                    <button type="button" className="btn-ghost !py-1 !px-2" aria-label={`Edit ${item.description}`} onClick={() => setDraft({ ...item, _existing: true })}>
                      <Pencil size={14} />
                    </button>
                    <button type="button" className="btn-ghost !py-1 !px-2" aria-label={`Delete ${item.description}`} onClick={() => remove(item)}>
                      <Trash2 size={14} />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {items.length === 0 && <p className="text-sm text-slate-400 py-4">No catalogue items match.</p>}
      </div>
      <Modal open={!!draft} onClose={close} title={draft?._existing ? 'Edit catalogue item' : 'Add catalogue item'}>
        {draft && (
          <div className="space-y-3">
            <div>
              <label className="label" htmlFor="cat-id">SKU</label>
              <input id="cat-id" className="input" disabled={!!draft._existing} value={draft.id} onChange={(e) => setDraft({ ...draft, id: e.target.value })} />
            </div>
            <div>
              <label className="label" htmlFor="cat-description">Description</label>
              <input id="cat-description" className="input" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label" htmlFor="cat-unit">Unit</label>
                <input id="cat-unit" className="input" value={draft.unit} onChange={(e) => setDraft({ ...draft, unit: e.target.value })} />
              </div>
              <div>
                <label className="label" htmlFor="cat-price">Unit price</label>
                <input id="cat-price" className="input" type="number" min={0} step="0.01" value={draft.unit_price} onChange={(e) => setDraft({ ...draft, unit_price: Number(e.target.value) })} />
              </div>
              <div>
                <label className="label" htmlFor="cat-vat">VAT code</label>
                <SelectMenu
                  id="cat-vat"
                  label="VAT code"
                  value={draft.vat_code}
                  onChange={(value) => setDraft({ ...draft, vat_code: value })}
                  options={vatSelectOptions(vatRates, draft.vat_code)}
                />
              </div>
              <div>
                <label className="label" htmlFor="cat-kind-edit">Kind</label>
                <SelectMenu
                  id="cat-kind-edit"
                  label="Kind"
                  value={draft.kind}
                  onChange={(value) => setDraft({ ...draft, kind: value })}
                  options={KIND_EDIT}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="btn-secondary" onClick={close}>Cancel</button>
              <button type="button" className="btn-primary" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save item'}</button>
            </div>
          </div>
        )}
      </Modal>
      <Toast {...toast} />
    </section>
  );
}
