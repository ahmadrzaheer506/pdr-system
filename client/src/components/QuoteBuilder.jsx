import React, { useState, useEffect, useCallback } from 'react';
import { Trash2, Plus, Info, ChevronDown, ChevronRight } from 'lucide-react';
import { api, money } from '../lib/api';
import { Modal } from './ui.jsx';

const blankItem = () => ({ description: '', qty: 1, unit_price: 0, vat_code: 'standard', kind: 'both' });

const VAT_OPTIONS = [
  { code: 'standard', short: '20%', label: 'Standard 20%', help: 'Most repair, maintenance and improvement work.' },
  { code: 'reduced', short: '5%', label: 'Reduced 5%', help: 'Energy-saving materials, residential conversions, homes empty 2+ years.' },
  { code: 'zero', short: '0%', label: 'Zero rated', help: 'Qualifying new-build residential and certain charity buildings.' },
  { code: 'exempt', short: 'Ex', label: 'Exempt', help: 'Outside the scope of VAT. Rare in construction.' },
];

const KIND_OPTIONS = [
  { kind: 'both', short: 'Mixed' },
  { kind: 'labour', short: 'Labour' },
  { kind: 'materials', short: 'Mats' },
];

export default function QuoteBuilder({ open, onClose, customerId, customer, existingQuote, onSaved }) {
  const [form, setForm] = useState(null);
  const [calc, setCalc] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showTerms, setShowTerms] = useState(false);
  const [showTax, setShowTax] = useState(false);
  const [options, setOptions] = useState(null);

  useEffect(() => { if (open && !options) api.get('/quotes/meta/options').then(setOptions); }, [open]);

  useEffect(() => {
    if (!open) return;
    const d = options?.defaults || {};
    setForm({
      title: existingQuote?.title || '',
      items: existingQuote?.items?.length ? existingQuote.items.map((i) => ({ ...blankItem(), ...i })) : [blankItem()],
      notes: existingQuote?.notes || '',
      valid_until: existingQuote?.valid_until || '',
      vat_treatment: existingQuote?.vat_treatment || 'standard',
      cis_applies: !!existingQuote?.cis_applies,
      cis_rate: existingQuote?.cis_rate ?? 20,
      retention_percent: existingQuote?.retention_percent || 0,
      payment_schedule: existingQuote?.payment_schedule
        ? (typeof existingQuote.payment_schedule === 'string' ? JSON.parse(existingQuote.payment_schedule) : existingQuote.payment_schedule)
        : (d.payment_schedule || []),
      inclusions: existingQuote?.inclusions ?? d.inclusions ?? '',
      exclusions: existingQuote?.exclusions ?? d.exclusions ?? '',
      warranty_years: existingQuote?.warranty_years ?? d.warranty_years ?? 10,
      warranty_text: existingQuote?.warranty_text ?? d.warranty_text ?? '',
      lead_time: existingQuote?.lead_time ?? d.lead_time ?? '',
      duration_estimate: existingQuote?.duration_estimate ?? '',
      access_requirements: existingQuote?.access_requirements ?? '',
      provisional_sums: existingQuote?.provisional_sums
        ? (typeof existingQuote.provisional_sums === 'string' ? JSON.parse(existingQuote.provisional_sums) : existingQuote.provisional_sums)
        : [],
    });
    setError('');
  }, [open, existingQuote, options]);

  // Live totals from the server so the preview uses the exact same engine
  // that will produce the PDF — no second implementation to drift.
  const refreshTotals = useCallback(async (f) => {
    if (!f) return;
    try { setCalc(await api.post('/quotes/preview', f)); } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!form) return;
    const t = setTimeout(() => refreshTotals(form), 250);
    return () => clearTimeout(t);
  }, [form, refreshTotals]);

  if (!open || !form) return null;
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const updateItem = (i, field, value) => {
    const next = [...form.items];
    next[i] = { ...next[i], [field]: ['qty', 'unit_price'].includes(field) ? Number(value) : value };
    set('items', next);
  };

  const isDomestic = (customer?.customer_type || 'domestic') === 'domestic';

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (existingQuote) await api.put(`/quotes/${existingQuote.id}`, form);
      else await api.post('/quotes', { customer_id: customerId, ...form });
      onSaved();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title={existingQuote ? `Edit quote ${existingQuote.ref}` : 'New quotation'} wide>
      <form onSubmit={submit} className="space-y-4">
        {error && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-3 py-2">{error}</div>}

        <div>
          <label className="label">Quote title</label>
          <input className="input" value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Full re-roof — 1930s semi-detached" required />
        </div>

        {/* ---------- line items ---------- */}
        <div>
          <label className="label">Scope of works</label>
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <div className="grid grid-cols-[1fr_54px_84px_74px_74px_84px_28px] gap-1.5 bg-slate-50 px-2.5 py-2 text-[11px] font-medium text-slate-500">
              <div>Description</div><div>Qty</div><div>Unit £</div><div>VAT</div><div>Type</div><div className="text-right">Total £</div><div></div>
            </div>
            {form.items.map((it, i) => (
              <div key={i} className="grid grid-cols-[1fr_54px_84px_74px_74px_84px_28px] gap-1.5 px-2.5 py-2 border-t border-slate-100 items-center">
                <input className="input !py-1.5 !text-sm" value={it.description} onChange={(e) => updateItem(i, 'description', e.target.value)} placeholder="Description" required />
                <input className="input !py-1.5 !text-sm !px-2" type="number" min="0" step="any" value={it.qty} onChange={(e) => updateItem(i, 'qty', e.target.value)} />
                <input className="input !py-1.5 !text-sm !px-2" type="number" min="0" step="0.01" value={it.unit_price} onChange={(e) => updateItem(i, 'unit_price', e.target.value)} />
                <select className="input !py-1.5 !text-xs !px-1.5" value={it.vat_code} onChange={(e) => updateItem(i, 'vat_code', e.target.value)}>
                  {VAT_OPTIONS.map((v) => <option key={v.code} value={v.code} title={v.help}>{v.short}</option>)}
                </select>
                <select className="input !py-1.5 !text-xs !px-1.5" value={it.kind} onChange={(e) => updateItem(i, 'kind', e.target.value)}>
                  {KIND_OPTIONS.map((k) => <option key={k.kind} value={k.kind}>{k.short}</option>)}
                </select>
                <div className="text-sm text-slate-600 text-right pr-1">{(it.qty * it.unit_price).toFixed(2)}</div>
                <button type="button" onClick={() => set('items', form.items.filter((_, x) => x !== i))} className="text-slate-300 hover:text-red-500"><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between mt-2">
            <button type="button" onClick={() => set('items', [...form.items, blankItem()])} className="btn-ghost !py-1 !px-2 text-xs"><Plus size={14} /> Add line</button>
            <span className="text-[11px] text-slate-400">Type matters for CIS — labour is deductible, materials are not.</span>
          </div>
        </div>

        {/* ---------- live totals ---------- */}
        {calc && (
          <div className="bg-slate-50 rounded-lg p-4">
            <div className="flex justify-end">
              <div className="w-full sm:w-72 space-y-1 text-sm">
                <Row label="Subtotal (ex VAT)" value={money(calc.subtotal)} />
                {calc.cis_applies && (
                  <>
                    <Row label="  of which labour" value={money(calc.labour_total)} muted />
                    <Row label="  of which materials" value={money(calc.materials_total)} muted />
                  </>
                )}
                {calc.vat_treatment === 'standard'
                  ? calc.vat_breakdown.filter((g) => g.net > 0).map((g) => (
                      <Row key={g.code} label={`VAT ${g.rate}% on ${money(g.net)}`} value={money(g.vat)} muted />
                    ))
                  : <Row label={calc.vat_treatment === 'reverse_charge' ? 'VAT — reverse charge' : 'VAT — not registered'} value={money(0)} muted />}
                <div className="flex justify-between font-bold text-slate-900 pt-1.5 border-t border-slate-300 text-base">
                  <span>Total</span><span>{money(calc.total)}</span>
                </div>
                {calc.vat_treatment === 'reverse_charge' && (
                  <div className="text-[11px] text-amber-700 bg-amber-50 rounded px-2 py-1">
                    Customer accounts for {money(calc.reverse_charge_vat)} VAT to HMRC
                  </div>
                )}
                {calc.cis_deduction > 0 && <Row label={`Less CIS @ ${calc.cis_rate}%`} value={`-${money(calc.cis_deduction)}`} danger />}
                {calc.retention_amount > 0 && <Row label={`Less retention @ ${calc.retention_percent}%`} value={`-${money(calc.retention_amount)}`} danger />}
                {(calc.cis_deduction > 0 || calc.retention_amount > 0) && (
                  <div className="flex justify-between font-bold text-slate-900 pt-1.5 border-t border-slate-300">
                    <span>Payable now</span><span>{money(calc.due_now)}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ---------- VAT / CIS treatment ---------- */}
        <Section open={showTax} onToggle={() => setShowTax(!showTax)} title="VAT, CIS & retention"
          summary={`${form.vat_treatment === 'reverse_charge' ? 'Reverse charge' : form.vat_treatment === 'not_registered' ? 'No VAT' : 'Standard VAT'}${form.cis_applies ? ` · CIS ${form.cis_rate}%` : ''}${form.retention_percent ? ` · ${form.retention_percent}% retention` : ''}`}>
          <div className="space-y-3">
            <div>
              <label className="label">VAT treatment</label>
              <select className="input" value={form.vat_treatment} onChange={(e) => set('vat_treatment', e.target.value)}>
                <option value="standard">Standard — charge VAT at the rates set per line</option>
                <option value="reverse_charge">Domestic Reverse Charge — customer accounts for the VAT</option>
                <option value="not_registered">Not VAT registered — no VAT charged</option>
              </select>
              {form.vat_treatment === 'reverse_charge' && (
                <p className="text-xs text-amber-700 bg-amber-50 rounded px-2.5 py-2 mt-1.5 flex gap-1.5">
                  <Info size={13} className="flex-shrink-0 mt-0.5" />
                  Only for CIS-registered business customers who are not the end user. The quote will carry the VAT Act 1994 s.55A wording automatically.
                </p>
              )}
            </div>

            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={form.cis_applies} onChange={(e) => set('cis_applies', e.target.checked)} />
              Apply CIS deduction (you are working as a subcontractor)
            </label>
            {form.cis_applies && (
              <div>
                <label className="label">CIS rate</label>
                <select className="input" value={form.cis_rate} onChange={(e) => set('cis_rate', Number(e.target.value))}>
                  <option value={20}>20% — registered subcontractor</option>
                  <option value={30}>30% — unverified</option>
                  <option value={0}>0% — gross payment status</option>
                </select>
                <p className="text-xs text-slate-400 mt-1">Deducted from the labour element only. Materials are never subject to CIS.</p>
              </div>
            )}

            <div>
              <label className="label">Retention held back (%)</label>
              <input className="input" type="number" min="0" max="20" step="0.5" value={form.retention_percent} onChange={(e) => set('retention_percent', Number(e.target.value))} />
              <p className="text-xs text-slate-400 mt-1">Common on commercial contracts. Leave at 0 for domestic work.</p>
            </div>
          </div>
        </Section>

        {/* ---------- payment schedule ---------- */}
        <Section open={showTerms} onToggle={() => setShowTerms(!showTerms)} title="Payment schedule & terms"
          summary={`${form.payment_schedule.length} payment stage${form.payment_schedule.length === 1 ? '' : 's'} · ${form.warranty_years}yr guarantee`}>
          <div className="space-y-4">
            <div>
              <label className="label">Payment stages</label>
              {form.payment_schedule.map((st, i) => (
                <div key={i} className="grid grid-cols-[1fr_70px_28px] gap-2 mb-1.5 items-center">
                  <input className="input !py-1.5 !text-sm" value={st.label} placeholder="Stage name"
                    onChange={(e) => { const n = [...form.payment_schedule]; n[i] = { ...n[i], label: e.target.value }; set('payment_schedule', n); }} />
                  <div className="relative">
                    <input className="input !py-1.5 !text-sm !pr-6" type="number" min="0" max="100" value={st.percent ?? ''}
                      onChange={(e) => { const n = [...form.payment_schedule]; n[i] = { ...n[i], percent: Number(e.target.value) }; set('payment_schedule', n); }} />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400">%</span>
                  </div>
                  <button type="button" onClick={() => set('payment_schedule', form.payment_schedule.filter((_, x) => x !== i))} className="text-slate-300 hover:text-red-500"><Trash2 size={14} /></button>
                  <input className="input !py-1 !text-xs col-span-3 -mt-0.5" value={st.trigger || ''} placeholder="When is this due? e.g. On practical completion"
                    onChange={(e) => { const n = [...form.payment_schedule]; n[i] = { ...n[i], trigger: e.target.value }; set('payment_schedule', n); }} />
                </div>
              ))}
              <button type="button" onClick={() => set('payment_schedule', [...form.payment_schedule, { label: '', percent: 0, trigger: '' }])} className="btn-ghost !py-1 !px-2 text-xs"><Plus size={14} /> Add stage</button>
              {form.payment_schedule.length > 0 && (
                <p className={`text-xs mt-1 ${Math.abs(form.payment_schedule.reduce((s, x) => s + (Number(x.percent) || 0), 0) - 100) > 0.01 ? 'text-amber-600' : 'text-slate-400'}`}>
                  Stages total {form.payment_schedule.reduce((s, x) => s + (Number(x.percent) || 0), 0)}% — should be 100%
                </p>
              )}
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <div><label className="label">Guarantee (years)</label><input className="input" type="number" value={form.warranty_years} onChange={(e) => set('warranty_years', Number(e.target.value))} /></div>
              <div><label className="label">Valid until</label><input className="input" type="date" value={form.valid_until ? form.valid_until.slice(0, 10) : ''} onChange={(e) => set('valid_until', e.target.value)} /></div>
              <div><label className="label">Lead time</label><input className="input" value={form.lead_time} onChange={(e) => set('lead_time', e.target.value)} /></div>
              <div><label className="label">Time on site</label><input className="input" value={form.duration_estimate} onChange={(e) => set('duration_estimate', e.target.value)} placeholder="e.g. 5–7 working days" /></div>
            </div>

            <div><label className="label">Access required</label><input className="input" value={form.access_requirements} onChange={(e) => set('access_requirements', e.target.value)} placeholder="e.g. Driveway access for scaffold lorry and skip" /></div>
            <div><label className="label">What's included (one per line)</label><textarea className="input" rows={4} value={form.inclusions} onChange={(e) => set('inclusions', e.target.value)} /></div>
            <div><label className="label">What's not included (one per line)</label><textarea className="input" rows={5} value={form.exclusions} onChange={(e) => set('exclusions', e.target.value)} /></div>

            <div>
              <label className="label">Provisional sums</label>
              {form.provisional_sums.map((ps, i) => (
                <div key={i} className="grid grid-cols-[1fr_90px_28px] gap-2 mb-1.5">
                  <input className="input !py-1.5 !text-sm" value={ps.description} placeholder="e.g. Rotten rafter feet, if found"
                    onChange={(e) => { const n = [...form.provisional_sums]; n[i] = { ...n[i], description: e.target.value }; set('provisional_sums', n); }} />
                  <input className="input !py-1.5 !text-sm" type="number" value={ps.amount} placeholder="£"
                    onChange={(e) => { const n = [...form.provisional_sums]; n[i] = { ...n[i], amount: Number(e.target.value) }; set('provisional_sums', n); }} />
                  <button type="button" onClick={() => set('provisional_sums', form.provisional_sums.filter((_, x) => x !== i))} className="text-slate-300 hover:text-red-500"><Trash2 size={14} /></button>
                </div>
              ))}
              <button type="button" onClick={() => set('provisional_sums', [...form.provisional_sums, { description: '', amount: 0 }])} className="btn-ghost !py-1 !px-2 text-xs"><Plus size={14} /> Add provisional sum</button>
            </div>

            <div><label className="label">Notes shown on the quote</label><textarea className="input" rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} /></div>
          </div>
        </Section>

        {isDomestic && (
          <p className="text-xs text-slate-500 bg-sky-50 border border-sky-100 rounded-lg px-3 py-2 flex gap-2">
            <Info size={14} className="flex-shrink-0 mt-0.5 text-sky-600" />
            <span>
              This is a domestic customer, so the quote will automatically include the 14-day cancellation notice
              and statutory cancellation form required by the Consumer Contracts Regulations 2013.
            </span>
          </p>
        )}

        <button className="btn-primary w-full" disabled={saving}>
          {saving ? 'Saving…' : existingQuote ? 'Save changes' : 'Create quote'}
        </button>
      </form>
    </Modal>
  );
}

function Row({ label, value, muted, danger }) {
  return (
    <div className={`flex justify-between ${danger ? 'text-red-600' : muted ? 'text-slate-500' : 'text-slate-700'}`}>
      <span>{label}</span><span>{value}</span>
    </div>
  );
}

function Section({ open, onToggle, title, summary, children }) {
  return (
    <div className="border border-slate-200 rounded-lg">
      <button type="button" onClick={onToggle} className="w-full flex items-center gap-2 px-3.5 py-2.5 text-left hover:bg-slate-50">
        {open ? <ChevronDown size={15} className="text-slate-400" /> : <ChevronRight size={15} className="text-slate-400" />}
        <span className="font-medium text-sm text-slate-700">{title}</span>
        <span className="text-xs text-slate-400 ml-auto truncate">{summary}</span>
      </button>
      {open && <div className="px-3.5 pb-4 pt-1 border-t border-slate-100">{children}</div>}
    </div>
  );
}
