import React, { useState } from 'react';
import { ListPlus, Plus, Trash2 } from 'lucide-react';
import { api, money } from '../lib/api';

/**
 * Office-only variation lines (requirement 7.5). Amounts are money and never
 * shown to staff. Does not change the job value; invoicing stays on the quote (11.1).
 */
export default function JobVariations({ jobId, lines = [], onChanged, onError }) {
  const [form, setForm] = useState({ description: '', amount: '' });
  const [saving, setSaving] = useState(false);

  const run = async (fn) => {
    setSaving(true);
    try {
      await fn();
      onChanged();
    } catch (err) {
      onError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const add = (e) => {
    e.preventDefault();
    if (!form.description.trim() || form.amount === '') return;
    run(async () => {
      await api.post(`/jobs/${jobId}/variations`, {
        description: form.description,
        amount: form.amount,
      });
      setForm({ description: '', amount: '' });
    });
  };

  const remove = (line) => run(() => api.del(`/jobs/${jobId}/variations/${line.id}`));

  const total = lines.reduce((sum, line) => sum + (Number(line.amount) || 0), 0);

  return (
    <div>
      <div className="label mb-2 flex items-center gap-1.5"><ListPlus size={13} /> Variations</div>
      <p className="text-xs text-slate-400 mb-2">Office only. Listed here — not added to the job value, and not billed until invoicing (11.1).</p>
      <ul
        className={`space-y-1.5 mb-2 ${
          lines.length > 4 ? 'max-h-[13.25rem] overflow-y-auto overscroll-contain pr-0.5' : ''
        }`}
      >
        {lines.map((line) => (
          <li key={line.id} className="flex items-center gap-2 rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2">
            <div className="flex-1 min-w-0 text-sm text-slate-800">{line.description}</div>
            <div className="text-sm font-medium text-slate-700 tabular-nums">{money(line.amount)}</div>
            <button type="button" disabled={saving} onClick={() => remove(line)} className="text-slate-400 hover:text-red-600" aria-label={`Remove ${line.description}`}>
              <Trash2 size={14} />
            </button>
          </li>
        ))}
      </ul>
      {lines.length === 0 && <p className="text-xs text-slate-400 mb-2">No variations yet.</p>}
      {lines.length > 0 && (
        <div className="text-xs text-slate-500 mb-2 flex justify-between">
          <span>Variations total</span>
          <span className="font-medium tabular-nums">{money(total)}</span>
        </div>
      )}
      <form onSubmit={add} className="flex flex-wrap gap-1.5">
        <input
          className="input flex-1 !py-1.5 text-sm min-w-[8rem]"
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          placeholder="Extra work"
          aria-label="Variation description"
        />
        <input
          className="input w-24 !py-1.5 text-sm"
          value={form.amount}
          onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
          placeholder="£"
          inputMode="decimal"
          aria-label="Variation amount"
        />
        <button type="submit" disabled={saving} className="btn-secondary !py-1 !px-3 text-xs" aria-label="Add variation">
          <Plus size={12} /> Add
        </button>
      </form>
    </div>
  );
}
