import React, { useEffect, useState } from 'react';
import { Package, ClipboardCheck, Plus, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { MATERIAL_STATUSES, materialQtyLabel } from '../lib/jobKit';
import ScrollableLeadList from './ScrollableLeadList.jsx';

/**
 * Materials list with needed/packed/used ticks, plus a per-job checklist.
 * Office can apply a Settings checklist template (requirement 7.3). Staff share add/remove/tick.
 */
export default function JobKit({
  jobId,
  apiBase,
  materialLines = [],
  checklistItems = [],
  materialsNote,
  checklistTemplate,
  allowTemplates = false,
  onChanged,
  onError,
}) {
  const [templates, setTemplates] = useState([]);
  const [matForm, setMatForm] = useState({ description: '', qty: '1', unit: '' });
  const [checkBody, setCheckBody] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!allowTemplates) return undefined;
    api.get('/jobs/checklist-templates')
      .then((d) => setTemplates(d.templates || []))
      .catch((err) => onError(err.message));
  }, [allowTemplates]);

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

  const addMaterial = (e) => {
    e.preventDefault();
    if (!matForm.description.trim()) return;
    run(async () => {
      await api.post(`${apiBase}/${jobId}/materials`, {
        description: matForm.description,
        qty: matForm.qty,
        unit: matForm.unit,
      });
      setMatForm({ description: '', qty: '1', unit: '' });
    });
  };

  const setStatus = (line, status) => run(() => api.put(`${apiBase}/${jobId}/materials/${line.id}`, { status }));
  const removeMaterial = (line) => run(() => api.del(`${apiBase}/${jobId}/materials/${line.id}`));

  const addCheck = (e) => {
    e.preventDefault();
    if (!checkBody.trim()) return;
    run(async () => {
      await api.post(`${apiBase}/${jobId}/checklist`, { body: checkBody });
      setCheckBody('');
    });
  };

  const toggleCheck = (item) => run(() => api.put(`${apiBase}/${jobId}/checklist/${item.id}`, { done: !item.done }));
  const removeCheck = (item) => run(() => api.del(`${apiBase}/${jobId}/checklist/${item.id}`));

  const applyTemplate = (templateId) => run(() => api.post(`${apiBase}/${jobId}/checklist/apply`, { template_id: templateId }));

  const showNote = Boolean(materialsNote) && materialLines.length === 0;

  return (
    <div className="space-y-5">
      <div>
        <div id={`job-kit-materials-${jobId}`} className="label mb-2 flex items-center gap-1.5"><Package size={13} /> Materials</div>
        {showNote && (
          <div className="text-sm bg-amber-50 text-amber-800 rounded-xl px-3 py-2 mb-2 ring-1 ring-amber-100">{materialsNote}</div>
        )}
        {materialLines.length > 0 && (
          <ScrollableLeadList
            labelledBy={`job-kit-materials-${jobId}`}
            count={materialLines.length}
            limit={5}
            fallbackClass="max-h-[22rem]"
            className="mb-2"
          >
            {materialLines.map((line) => {
              const qty = materialQtyLabel(line);
              return (
              <div key={line.id} role="listitem" className="flex items-start gap-2 rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-800">{line.description}</div>
                  {qty ? <div className="mt-0.5 text-xs text-slate-500">{qty}</div> : null}
                </div>
                <div className="flex flex-wrap gap-1">
                  {MATERIAL_STATUSES.map((status) => (
                    <button
                      key={status}
                      type="button"
                      disabled={saving}
                      onClick={() => setStatus(line, status)}
                      className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${
                        line.status === status ? 'bg-navy-900 text-white' : 'bg-white text-slate-500 ring-1 ring-slate-200'
                      }`}
                    >
                      {status}
                    </button>
                  ))}
                </div>
                <button type="button" disabled={saving} onClick={() => removeMaterial(line)} className="text-slate-400 hover:text-red-600" aria-label={`Remove ${line.description}`}>
                  <Trash2 size={14} />
                </button>
              </div>
              );
            })}
          </ScrollableLeadList>
        )}
        {materialLines.length === 0 && !showNote && (
          <p className="text-xs text-slate-400 mb-2">No materials listed yet.</p>
        )}
        <form onSubmit={addMaterial} className="flex flex-wrap gap-1.5">
          <input className="input flex-1 !py-1.5 text-sm min-w-[8rem]" value={matForm.description} onChange={(e) => setMatForm((f) => ({ ...f, description: e.target.value }))} placeholder="Item" aria-label="Material item" />
          <input className="input w-16 !py-1.5 text-sm" value={matForm.qty} onChange={(e) => setMatForm((f) => ({ ...f, qty: e.target.value }))} placeholder="Qty" inputMode="decimal" aria-label="Quantity" />
          <input className="input w-20 !py-1.5 text-sm" value={matForm.unit} onChange={(e) => setMatForm((f) => ({ ...f, unit: e.target.value }))} placeholder="m²" aria-label="Unit" />
          <button type="submit" disabled={saving} className="btn-secondary !py-1 !px-3 text-xs" aria-label="Add material"><Plus size={12} /> Add</button>
        </form>
      </div>

      <div>
        <div className="label mb-2 flex items-center gap-1.5"><ClipboardCheck size={13} /> Checklist</div>
        {allowTemplates && (
          <div className="mb-2">
            <div className="flex flex-wrap gap-1.5">
              {templates.map((tpl) => (
                <button
                  key={tpl.id}
                  type="button"
                  disabled={saving}
                  onClick={() => applyTemplate(tpl.id)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                    checklistTemplate === tpl.id ? 'bg-navy-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {tpl.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-400 mt-1">Applying a template replaces the current checklist.</p>
          </div>
        )}
        <ul className="space-y-1.5 mb-2">
          {checklistItems.map((item) => (
            <li key={item.id} className="flex items-center gap-2 rounded-xl px-1 py-0.5">
              <label className="flex items-center gap-2.5 flex-1 text-sm text-slate-700">
                <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500" checked={!!item.done} disabled={saving} onChange={() => toggleCheck(item)} />
                <span className={item.done ? 'line-through text-slate-400' : ''}>{item.body}</span>
              </label>
              <button type="button" disabled={saving} onClick={() => removeCheck(item)} className="text-slate-400 hover:text-red-600" aria-label={`Remove ${item.body}`}>
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
        {checklistItems.length === 0 && (
          <p className="text-xs text-slate-400 mb-2">{allowTemplates ? 'Apply a template or add an item.' : 'No checklist items yet.'}</p>
        )}
        <form onSubmit={addCheck} className="flex gap-1.5">
          <input className="input flex-1 !py-1.5 text-sm" value={checkBody} onChange={(e) => setCheckBody(e.target.value)} placeholder="Checklist item" />
          <button type="submit" disabled={saving} className="btn-secondary !py-1 !px-3 text-xs" aria-label="Add checklist item"><Plus size={12} /> Add</button>
        </form>
      </div>
    </div>
  );
}
