import React, { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { Modal } from './ui.jsx';
import { vatSelectOptions } from '../lib/taxDefaults';
import { coerceDecimal, decimalFieldValue, parseDecimalInput } from '../lib/numberInput.js';
import SelectMenu from './SelectMenu.jsx';

const KIND_EDIT = [
  { value: 'labour', label: 'Labour' },
  { value: 'materials', label: 'Materials' },
  { value: 'both', label: 'Both' },
];

export const EMPTY_CATALOGUE_ITEM = {
  id: '',
  description: '',
  unit: 'item',
  unit_price: 0,
  vat_code: 'standard',
  kind: 'materials',
};

/**
 * Add/edit a service catalogue row. Shared by Settings and the quote line combobox.
 */
export default function CatalogueItemForm({
  open,
  onClose,
  initial = null,
  existing = false,
  vatRates = [],
  onSaved,
  zClass = 'z-[100]',
}) {
  const [draft, setDraft] = useState(EMPTY_CATALOGUE_ITEM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const wasOpen = useRef(false);

  useEffect(() => {
    if (open && !wasOpen.current) {
      setDraft({ ...EMPTY_CATALOGUE_ITEM, ...(initial || {}) });
      setError('');
      setSaving(false);
    }
    wasOpen.current = open;
  }, [open, initial]);

  useEffect(() => {
    if (!open) return undefined;
    const onEsc = (event) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      event.stopImmediatePropagation();
      onClose?.();
    };
    document.addEventListener('keydown', onEsc, true);
    return () => document.removeEventListener('keydown', onEsc, true);
  }, [open, onClose]);

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const payload = {
        id: draft.id,
        description: draft.description,
        unit: draft.unit,
        unit_price: coerceDecimal(draft.unit_price),
        vat_code: draft.vat_code,
        kind: draft.kind,
      };
      const res = existing
        ? await api.put(`/catalogue/${draft.id}`, payload)
        : await api.post('/catalogue', payload);
      onSaved?.(res.item || payload);
      onClose?.();
    } catch (err) {
      setError(err.message || 'Could not save catalogue item');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={existing ? 'Edit catalogue item' : 'Add catalogue item'}
      zClass={zClass}
    >
      <div className="space-y-3">
        {error ? <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
        <div>
          <label className="label" htmlFor="cat-id">SKU</label>
          <input
            id="cat-id"
            className="input"
            disabled={existing}
            value={draft.id}
            onChange={(e) => setDraft({ ...draft, id: e.target.value })}
          />
        </div>
        <div>
          <label className="label" htmlFor="cat-description">Description</label>
          <input
            id="cat-description"
            className="input"
            value={draft.description}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="cat-unit">Unit</label>
            <input id="cat-unit" className="input" value={draft.unit} onChange={(e) => setDraft({ ...draft, unit: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="cat-price">Unit price</label>
            <input
              id="cat-price"
              className="input"
              type="text"
              inputMode="decimal"
              value={decimalFieldValue(draft.unit_price)}
              onChange={(e) => setDraft({ ...draft, unit_price: parseDecimalInput(e.target.value) })}
            />
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
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-primary" disabled={saving} onClick={save}>
            {saving ? 'Saving…' : 'Save item'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
