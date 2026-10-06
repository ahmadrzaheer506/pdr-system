import React, { useState, useEffect, useCallback } from 'react';
import { Trash2, Plus, Info, ChevronDown, ChevronRight, Download, ListOrdered, Loader2 } from 'lucide-react';
import { api, money } from '../lib/api';
import { Modal } from './ui.jsx';
import ContactPickers from './ContactPickers.jsx';
import { primaryOf } from '../lib/contacts';
import { quoteTaxDefaults, vatSelectOptions } from '../lib/taxDefaults';
import SelectMenu from './SelectMenu.jsx';
import DatePicker from './DatePicker.jsx';
import CatalogueItemInput from './CatalogueItemInput.jsx';

const blankItem = () => ({
  description: '',
  qty: 1,
  unit: '',
  unit_price: 0,
  vat_code: 'standard',
  kind: 'both',
  catalogue_id: null,
});

const KIND_OPTIONS = [
  { kind: 'both', label: 'Mixed' },
  { kind: 'labour', label: 'Labour' },
  { kind: 'materials', label: 'Materials' },
];

export default function QuoteBuilder({ open, onClose, customerId, customer, leadId, lead, existingQuote, onSaved }) {
  const [form, setForm] = useState(null);
  const [calc, setCalc] = useState(null);
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [sending, setSending] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showTerms, setShowTerms] = useState(false);
  const [showTax, setShowTax] = useState(false);
  const [showGuarantee, setShowGuarantee] = useState(false);
  const [options, setOptions] = useState(null);

  useEffect(() => { if (open && !options) api.get('/quotes/meta/options').then(setOptions).catch(() => setOptions({})); }, [open]);

  useEffect(() => {
    if (!open) return;
    const d = options?.defaults || {};
    const tax = quoteTaxDefaults(customer, options?.uk || {});
    setForm({
      title: existingQuote?.title || '',
      items: existingQuote?.items?.length ? existingQuote.items.map((i) => ({ ...blankItem(), ...i })) : [blankItem()],
      notes: existingQuote?.notes || '',
      valid_until: existingQuote?.valid_until || '',
      vat_treatment: existingQuote?.vat_treatment || tax.vat_treatment,
      cis_applies: existingQuote ? !!existingQuote.cis_applies : tax.cis_applies,
      cis_rate: existingQuote?.cis_rate ?? tax.cis_rate,
      retention_percent: existingQuote?.retention_percent ?? tax.retention_percent,
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
      provisional_sums_in_total: existingQuote ? !!existingQuote.provisional_sums_in_total : false,
      optional_extras: existingQuote?.optional_extras
        ? (typeof existingQuote.optional_extras === 'string' ? JSON.parse(existingQuote.optional_extras) : existingQuote.optional_extras)
        : [],
      site_id: existingQuote?.site_id || lead?.site_id || lead?.meta?.site_id || primaryOf(customer?.sites)?.id || '',
      phone_id: existingQuote?.phone_id || lead?.phone_id || lead?.meta?.phone_id || primaryOf(customer?.phones)?.id || '',
      email_id: existingQuote?.email_id || lead?.email_id || lead?.meta?.email_id || primaryOf(customer?.emails)?.id || '',
    });
    setError('');
    setNotice('');
  }, [open, existingQuote, options, customer, lead]);

  // Live totals from the server so the preview uses the exact same engine
  // that will produce the PDF — no second implementation to drift.
  const refreshTotals = useCallback(async (f) => {
    if (!f) return;
    try { setCalc(await api.post('/quotes/preview', { ...f, customer_id: customerId })); } catch { /* ignore */ }
  }, [customerId]);

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

  const setLineDescription = (i, description) => {
    const next = [...form.items];
    next[i] = { ...next[i], description, catalogue_id: null };
    set('items', next);
  };

  const applyCatalogueLine = (i, cat) => {
    if (!cat) return;
    const next = [...form.items];
    next[i] = {
      ...blankItem(),
      ...next[i],
      catalogue_id: cat.id,
      description: cat.description,
      unit: cat.unit,
      unit_price: cat.unit_price,
      vat_code: cat.vat_code || next[i].vat_code,
      kind: cat.kind || next[i].kind,
    };
    set('items', next);
  };

  const isDomestic = (customer?.customer_type || 'domestic') === 'domestic';

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (existingQuote && ['accepted', 'declined'].includes(existingQuote.status)) {
        setError('Quote already decided — clone it with a new title instead');
        return;
      }
      if (existingQuote) await api.put(`/quotes/${existingQuote.id}`, form);
      else await api.post('/quotes', { customer_id: customerId, lead_id: leadId || null, ...form });
      onSaved();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  const cloneQuote = async () => {
    if (!existingQuote) return;
    const title = String(form.title || '').trim();
    if (!title) {
      setError('Quote title is required');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api.post(`/quotes/${existingQuote.id}/clone`, { title });
      onSaved();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  const downloadPdf = async () => {
    if (!existingQuote?.id) {
      setError('Save the quote first, then you can download the PDF.');
      return;
    }
    setDownloading(true);
    setError('');
    setNotice('');
    try {
      const { pdf } = await api.post(`/quotes/${existingQuote.id}/pdf`);
      await api.download(`/files/${encodeURIComponent(pdf)}?download=1`, `${existingQuote.ref}.pdf`);
    } catch (err) { setError(err.message); }
    finally { setDownloading(false); }
  };

  const sendQuote = async (channels) => {
    if (!existingQuote?.id) {
      setError('Save the quote first, then you can send it.');
      return;
    }
    setSending(channels[0] === 'whatsapp' ? 'whatsapp' : 'email');
    setError('');
    setNotice('');
    try {
      await api.post(`/quotes/${existingQuote.id}/send`, { channels });
      const via = channels[0] === 'whatsapp' ? 'WhatsApp' : 'Email';
      setNotice(`Quote sent via ${via}.`);
    } catch (err) { setError(err.message); }
    finally { setSending(null); }
  };

  return (
    <Modal open={open} onClose={onClose} title={existingQuote ? `Edit quote ${existingQuote.ref}` : 'New quotation'} size="4xl">
      <form onSubmit={submit} className="space-y-4">
        {error && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-3 py-2">{error}</div>}
        {notice && <div className="bg-emerald-50 text-emerald-800 text-sm rounded-lg px-3 py-2">{notice}</div>}

        <div>
          <label className="label">Quote title</label>
          <input className="input" value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Full re-roof — 1930s semi-detached" required />
        </div>

        <ContactPickers
          customer={customer}
          customerId={customerId}
          idPrefix="quote-contact"
          value={{ site_id: form.site_id, phone_id: form.phone_id, email_id: form.email_id }}
          onChange={(next) => setForm((f) => ({ ...f, ...next }))}
          onError={setError}
        />

        {/* ---------- line items ---------- */}
        <div className="min-w-0 rounded-[1.25rem] bg-slate-50/80 p-4 ring-1 ring-slate-200/80">
          <div className="mb-3 flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-slate-600 ring-1 ring-slate-200/80">
              <ListOrdered size={15} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <label className="label !mb-0 !text-[13px] !font-semibold !text-slate-900">Scope of works</label>
                <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium tabular-nums text-slate-500 ring-1 ring-slate-200/80">
                  {form.items.length} line{form.items.length === 1 ? '' : 's'}
                </span>
              </div>
              <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
                Type to search the catalogue, or keep a custom name. Quantity and unit price can still be changed. Type matters for CIS — labour is deductible, materials are not.
              </p>
            </div>
          </div>

          <div className="space-y-2.5">
            {form.items.map((it, i) => {
              const lineNet = (Number(it.qty || 0) * Number(it.unit_price || 0)).toFixed(2);
              return (
                <div
                  key={i}
                  className="rounded-2xl bg-white p-3.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] ring-1 ring-slate-200/90"
                >
                  <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start">
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <div className="mt-1.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-[11px] font-semibold tabular-nums text-slate-500">
                        {i + 1}
                      </div>
                      <div className="min-w-0 flex-1">
                      <CatalogueItemInput
                        label={`Item ${i + 1}`}
                        value={it.description || ''}
                        onChange={(description) => setLineDescription(i, description)}
                        onPick={(cat) => applyCatalogueLine(i, cat)}
                        catalogue={options?.catalogue || []}
                        placeholder="Search or type an item"
                        required
                      />
                      <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-5">
                        <label className="block min-w-0">
                          <span className="label">Qty</span>
                          <input
                            className="input !px-2.5"
                            type="number"
                            min="0"
                            step="any"
                            value={it.qty}
                            onChange={(e) => updateItem(i, 'qty', e.target.value)}
                            aria-label={`Quantity ${i + 1}`}
                          />
                        </label>
                        <label className="block min-w-0">
                          <span className="label">Unit</span>
                          <input
                            className="input !px-2.5"
                            value={it.unit || ''}
                            onChange={(e) => updateItem(i, 'unit', e.target.value)}
                            placeholder="m²"
                            aria-label={`Unit ${i + 1}`}
                          />
                        </label>
                        <label className="block min-w-0">
                          <span className="label">Unit £</span>
                          <input
                            className="input !px-2.5"
                            type="number"
                            min="0"
                            step="0.01"
                            value={it.unit_price}
                            onChange={(e) => updateItem(i, 'unit_price', e.target.value)}
                            aria-label={`Unit price ${i + 1}`}
                          />
                        </label>
                        <div className="min-w-0">
                          <span className="label">VAT</span>
                          <SelectMenu
                            label={`VAT ${i + 1}`}
                            value={it.vat_code}
                            onChange={(vat_code) => updateItem(i, 'vat_code', vat_code)}
                            options={vatSelectOptions(options?.vat_rates, it.vat_code)}
                          />
                        </div>
                        <div className="min-w-0">
                          <span className="label">Type</span>
                          <SelectMenu
                            label={`Type ${i + 1}`}
                            value={it.kind}
                            onChange={(kind) => updateItem(i, 'kind', kind)}
                            options={KIND_OPTIONS.map((k) => ({ value: k.kind, label: k.label }))}
                          />
                        </div>
                      </div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-3 pl-10 sm:flex-col sm:items-end sm:justify-start sm:gap-2 sm:pl-0 sm:pt-1">
                      <div className="text-right">
                        <div className="text-[10px] font-medium uppercase tracking-wide text-slate-400">Total £</div>
                        <div className="text-sm font-semibold tabular-nums text-slate-900">{lineNet}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => set('items', form.items.filter((_, x) => x !== i))}
                        className="rounded-lg p-1.5 text-red-500 transition-colors hover:bg-red-50 hover:text-red-600"
                        aria-label={`Remove line ${i + 1}`}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={() => set('items', [...form.items, blankItem()])}
              className="btn-secondary !h-10 shrink-0"
            >
              <Plus size={14} /> Add line
            </button>
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
                {calc.provisional_sums_total > 0 && (
                  <Row
                    label={calc.provisional_sums_in_total ? 'Provisional sums' : 'Provisional sums (not included)'}
                    value={money(calc.provisional_sums_total)}
                    muted={!calc.provisional_sums_in_total}
                  />
                )}
                {calc.provisional_sums_in_total && calc.provisional_sums_total > 0 && (
                  <div className="flex justify-between font-bold text-slate-900 pt-1.5 border-t border-slate-200">
                    <span>Grand total</span><span>{money(calc.grand_total)}</span>
                  </div>
                )}
                {calc.optional_extras_total > 0 && (
                  <Row label="Optional extras (not included)" value={money(calc.optional_extras_total)} muted />
                )}
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
              <label className="label" htmlFor="quote-vat-treatment">VAT treatment</label>
              <SelectMenu
                id="quote-vat-treatment"
                label="VAT treatment"
                value={form.vat_treatment}
                onChange={(vat_treatment) => set('vat_treatment', vat_treatment)}
                options={[
                  { value: 'standard', label: 'Standard — charge VAT at the rates set per line' },
                  { value: 'reverse_charge', label: 'Domestic Reverse Charge — customer accounts for the VAT' },
                  { value: 'not_registered', label: 'Not VAT registered — no VAT charged' },
                ]}
              />
              {form.vat_treatment === 'reverse_charge' && (
                <p className="text-xs text-amber-700 bg-amber-50 rounded px-2.5 py-2 mt-1.5 flex gap-1.5">
                  <Info size={13} className="flex-shrink-0 mt-0.5" />
                  Only for CIS-registered business customers who are not the end user. The quote will carry the VAT Act 1994 s.55A wording automatically.
                </p>
              )}
              {!existingQuote && (customer?.customer_type || 'domestic') === 'commercial' && (
                <p className="text-xs text-slate-500 mt-1.5">Commercial quotes start on reverse charge and CIS 20%. You can still change this.</p>
              )}
            </div>

            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" className="h-4 w-4 shrink-0 accent-brand-500" checked={form.cis_applies} onChange={(e) => set('cis_applies', e.target.checked)} />
              Apply CIS deduction (you are working as a subcontractor)
            </label>
            {form.cis_applies && (
              <div>
                <label className="label">CIS rate</label>
                <SelectMenu
                  label="CIS rate"
                  value={form.cis_rate}
                  onChange={(cis_rate) => set('cis_rate', Number(cis_rate))}
                  options={[
                    { value: 20, label: '20% — registered subcontractor' },
                    { value: 30, label: '30% — unverified' },
                    { value: 0, label: '0% — gross payment status' },
                  ]}
                />
                <p className="text-xs text-slate-400 mt-1">Deducted from the labour element only. Materials are never subject to CIS.</p>
              </div>
            )}

            <div>
              <label className="label" htmlFor="quote-retention">Retention held back (%)</label>
              <input id="quote-retention" className="input" type="number" min="0" max="20" step="0.5" value={form.retention_percent} onChange={(e) => set('retention_percent', Number(e.target.value))} />
              <p className="text-xs text-slate-400 mt-1">Percentage of the net works total. Commercial quotes start at 5%; domestic at 0%. You can still change this.</p>
            </div>
          </div>
        </Section>

        <Section open={showGuarantee} onToggle={() => setShowGuarantee(!showGuarantee)} title="Guarantee terms"
          summary={`${form.warranty_years || 0} year guarantee`}>
          <div className="space-y-3">
            <div>
              <label className="label" htmlFor="quote-warranty-years">Guarantee (years)</label>
              <input id="quote-warranty-years" className="input" type="number" min="0" value={form.warranty_years} onChange={(e) => set('warranty_years', Number(e.target.value))} />
            </div>
            <div>
              <label className="label" htmlFor="quote-warranty-text">Guarantee wording</label>
              <textarea id="quote-warranty-text" className="input" rows={3} value={form.warranty_text} onChange={(e) => set('warranty_text', e.target.value)} />
              <p className="text-xs text-slate-400 mt-1">Use {'{years}'} where the number of years should appear on the PDF.</p>
            </div>
          </div>
        </Section>

        {/* ---------- payment schedule ---------- */}
        <Section open={showTerms} onToggle={() => setShowTerms(!showTerms)} title="Payment schedule & terms"
          summary={`${form.payment_schedule.length} payment stage${form.payment_schedule.length === 1 ? '' : 's'}`}>
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
              <div>
                <label className="label">Valid until</label>
                <DatePicker
                  label="Valid until"
                  value={form.valid_until ? form.valid_until.slice(0, 10) : ''}
                  onChange={(valid_until) => set('valid_until', valid_until)}
                />
              </div>
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
                    aria-label={`Provisional sum amount ${i + 1}`}
                    onChange={(e) => { const n = [...form.provisional_sums]; n[i] = { ...n[i], amount: Number(e.target.value) }; set('provisional_sums', n); }} />
                  <button type="button" onClick={() => set('provisional_sums', form.provisional_sums.filter((_, x) => x !== i))} className="text-slate-300 hover:text-red-500"><Trash2 size={14} /></button>
                </div>
              ))}
              <button type="button" onClick={() => set('provisional_sums', [...form.provisional_sums, { description: '', amount: 0 }])} className="btn-ghost !py-1 !px-2 text-xs"><Plus size={14} /> Add provisional sum</button>
              <label className="flex items-center gap-2 text-sm text-slate-700 mt-2">
                <input
                  type="checkbox"
                  className="h-4 w-4 shrink-0 accent-brand-500"
                  checked={!!form.provisional_sums_in_total}
                  onChange={(e) => set('provisional_sums_in_total', e.target.checked)}
                />
                Include provisional sums in the grand total
              </label>
              <p className="text-xs text-slate-400 mt-1">Off: listed as estimates only. On: added after the works total.</p>
            </div>

            <div>
              <label className="label">Optional extras</label>
              {form.optional_extras.map((ex, i) => (
                <div key={i} className="grid grid-cols-[1fr_90px_28px] gap-2 mb-1.5">
                  <input className="input !py-1.5 !text-sm" value={ex.description} placeholder="e.g. Supply & fit Velux window"
                    onChange={(e) => { const n = [...form.optional_extras]; n[i] = { ...n[i], description: e.target.value }; set('optional_extras', n); }} />
                  <input className="input !py-1.5 !text-sm" type="number" value={ex.amount} placeholder="£"
                    aria-label={`Optional extra amount ${i + 1}`}
                    onChange={(e) => { const n = [...form.optional_extras]; n[i] = { ...n[i], amount: Number(e.target.value) }; set('optional_extras', n); }} />
                  <button type="button" onClick={() => set('optional_extras', form.optional_extras.filter((_, x) => x !== i))} className="text-slate-300 hover:text-red-500"><Trash2 size={14} /></button>
                </div>
              ))}
              <button type="button" onClick={() => set('optional_extras', [...form.optional_extras, { description: '', amount: 0 }])} className="btn-ghost !py-1 !px-2 text-xs"><Plus size={14} /> Add optional extra</button>
              <p className="text-xs text-slate-400 mt-1">Listed after the works total and not included. Tick which ones were taken when the quote is accepted.</p>
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

        {existingQuote && ['accepted', 'declined'].includes(existingQuote.status) && (
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
            This quote is {existingQuote.status}. Clone it with a new title to issue another quote with a new reference.
          </p>
        )}

        {existingQuote && ['accepted', 'declined'].includes(existingQuote.status) ? (
          <button type="button" className="btn-primary w-full" disabled={saving} onClick={cloneQuote}>
            {saving ? 'Cloning…' : 'Clone quote'}
          </button>
        ) : (
          <button className="btn-primary w-full" disabled={saving}>
            {saving ? 'Saving…' : existingQuote ? 'Save changes' : 'Create quote'}
          </button>
        )}
        {!['accepted', 'declined'].includes(existingQuote?.status) && (
          <div className="flex gap-1.5">
            <button
              type="button"
              className="btn-secondary flex-1 inline-flex items-center justify-center gap-1.5"
              aria-label="Send WhatsApp"
              aria-busy={sending === 'whatsapp' || undefined}
              disabled={saving || downloading || sending || !existingQuote?.id}
              title={!existingQuote?.id ? 'Save the quote first' : undefined}
              onClick={() => sendQuote(['whatsapp'])}
            >
              {sending === 'whatsapp' ? <><Loader2 size={14} className="animate-spin" /> Sending…</> : 'Send WhatsApp'}
            </button>
            <button
              type="button"
              className="btn-secondary flex-1 inline-flex items-center justify-center gap-1.5"
              aria-label="Send Email"
              aria-busy={sending === 'email' || undefined}
              disabled={saving || downloading || sending || !existingQuote?.id}
              title={!existingQuote?.id ? 'Save the quote first' : undefined}
              onClick={() => sendQuote(['email'])}
            >
              {sending === 'email' ? <><Loader2 size={14} className="animate-spin" /> Sending…</> : 'Send Email'}
            </button>
          </div>
        )}
        <button
          type="button"
          className="btn-secondary w-full inline-flex items-center justify-center gap-1.5"
          disabled={saving || downloading || sending || !existingQuote?.id}
          title={!existingQuote?.id ? 'Save the quote first' : undefined}
          onClick={downloadPdf}
        >
          <Download size={14} /> {downloading ? 'Preparing PDF…' : 'Download PDF'}
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
