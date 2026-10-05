// ============================================================
// UK construction tax engine — VAT, CIS, retention, staged payments.
//
// Shared by quotes and invoices (requirement 6.3).
//
// Covers:
//  · Per-line VAT rates (seeded 20 / 5 / 0 / exempt; extra rates in Settings)
//  · Labour vs materials split (CIS is deducted from LABOUR ONLY)
//  · CIS Domestic Reverse Charge (VAT Act 1994 s.55A, in force 1 Mar 2021)
//  · CIS deduction at 20% (net), 30% (unverified), 0% (gross status)
//  · Retention held back on commercial contracts
//  · Staged payment schedules
//
// All money is rounded to whole pence at each documented boundary so the
// printed document always adds up — no floating-point drift on the page.
// ============================================================

/** Round to 2dp, avoiding binary float artefacts (0.1+0.2 style). */
const p = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

const CORE_VAT_CODES = Object.freeze(['standard', 'reduced', 'zero', 'exempt']);

const DEFAULT_VAT_RATES = Object.freeze([
  { code: 'standard', rate: 20, short: '20%', label: 'Standard 20%', help: 'Most repair, maintenance and improvement work.' },
  { code: 'reduced', rate: 5, short: '5%', label: 'Reduced 5%', help: 'Qualifying energy-saving materials, residential conversions, and homes empty 2+ years.' },
  { code: 'zero', rate: 0, short: '0%', label: 'Zero rated', help: 'Qualifying new-build residential and certain charity buildings.' },
  { code: 'exempt', rate: 0, short: 'Ex', label: 'Exempt', help: 'Outside the scope of VAT. Rare in construction.' },
]);

const VAT_TREATMENTS = Object.freeze(['standard', 'reverse_charge', 'not_registered']);
const CIS_RATE_VALUES = Object.freeze([0, 20, 30]);

/** @param {{ code: string, rate: number, short?: string, label?: string, help?: string }} row */
function vatRatesMapFromList(list) {
  const map = {};
  for (const row of list || []) {
    if (!row || !row.code) continue;
    map[row.code] = {
      rate: Number(row.rate) || 0,
      short: row.short || `${Number(row.rate) || 0}%`,
      label: row.label || row.code,
      help: row.help || '',
    };
  }
  return map;
}

const VAT_RATES = vatRatesMapFromList(DEFAULT_VAT_RATES);

const CIS_RATES = {
  gross: { rate: 0, label: 'Gross status (0%)' },
  net20: { rate: 20, label: 'Registered subcontractor (20%)' },
  higher30: { rate: 30, label: 'Unverified (30%)' },
};

/**
 * Parse one VAT rate row from Settings.
 * @returns {{ value: object }|{ error: string }}
 */
function parseVatRate(row) {
  const code = String(row?.code || '').trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_|_$/g, '');
  if (!code) return { error: 'VAT code is required' };
  if (code.length > 32) return { error: 'VAT code is too long' };
  const rate = Number(row.rate);
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) return { error: `VAT rate for ${code} must be between 0 and 100` };
  const short = String(row.short || `${rate}%`).trim().slice(0, 12) || `${rate}%`;
  const label = String(row.label || `${code} ${rate}%`).trim().slice(0, 80) || short;
  const help = String(row.help || '').trim().slice(0, 240);
  return { value: { code, rate, short, label, help } };
}

/**
 * Parse a Settings list of VAT rates. At least one row is required.
 * @returns {{ value: object[] }|{ error: string }}
 */
function parseVatRates(list) {
  if (!Array.isArray(list)) return { error: 'VAT rates must be a list' };
  const seen = new Set();
  const out = [];
  for (const row of list) {
    const parsed = parseVatRate(row);
    if (parsed.error) return parsed;
    if (seen.has(parsed.value.code)) return { error: `Duplicate VAT code: ${parsed.value.code}` };
    seen.add(parsed.value.code);
    out.push(parsed.value);
  }
  if (!out.length) return { error: 'At least one VAT rate is required' };
  return { value: out };
}

/**
 * Seeded rates plus any Settings overlays (add or update by code).
 * @param {object[]|undefined} custom
 */
function mergeVatRates(custom) {
  const byCode = new Map(DEFAULT_VAT_RATES.map((r) => [r.code, { ...r }]));
  for (const row of Array.isArray(custom) ? custom : []) {
    const parsed = parseVatRate(row);
    if (parsed.error) continue;
    byCode.set(parsed.value.code, parsed.value);
  }
  return [...byCode.values()];
}

function ratesTable(custom) {
  if (custom && typeof custom === 'object' && !Array.isArray(custom) && custom.standard) {
    return custom;
  }
  return vatRatesMapFromList(mergeVatRates(Array.isArray(custom) ? custom : undefined));
}

/** Short label for a line's VAT code on PDFs and pickers. */
function vatShort(code, custom) {
  const rates = mergeVatRates(custom);
  const row = rates.find((r) => r.code === code);
  if (row) return row.short || `${row.rate}%`;
  return `${code || '—'}`;
}

const COMMERCIAL_RETENTION_PERCENT = 5;

/**
 * Quote/invoice tax starting point from customer type (requirement 6.3 / 6.4).
 * Commercial → reverse charge + CIS 20% + 5% retention; domestic → standard VAT, no CIS, 0% retention.
 */
function taxDefaultsForCustomer(customer, uk = {}) {
  const commercial = (customer?.customer_type || 'domestic') === 'commercial';
  const vatRegistered = uk.vat_registered !== false;
  const cisRate = Number(uk.default_cis_rate);
  const defaultCis = CIS_RATE_VALUES.includes(cisRate) ? cisRate : 20;
  if (commercial) {
    return {
      vat_treatment: vatRegistered ? 'reverse_charge' : 'not_registered',
      cis_applies: true,
      cis_rate: defaultCis,
      retention_percent: COMMERCIAL_RETENTION_PERCENT,
    };
  }
  return {
    vat_treatment: vatRegistered ? 'standard' : 'not_registered',
    cis_applies: false,
    cis_rate: defaultCis,
    retention_percent: 0,
  };
}

/**
 * Merge office-supplied tax fields with customer-type defaults.
 * Missing/invalid fields fall back to the default; explicit false/0 is kept.
 */
function resolveTaxOpts(opts = {}, customer, uk = {}) {
  const defaults = taxDefaultsForCustomer(customer, uk);
  const vat_treatment = VAT_TREATMENTS.includes(opts.vat_treatment) ? opts.vat_treatment : defaults.vat_treatment;
  const cis_applies = typeof opts.cis_applies === 'boolean' ? opts.cis_applies : defaults.cis_applies;
  const givenRate = Number(opts.cis_rate);
  const cis_rate = CIS_RATE_VALUES.includes(givenRate) ? givenRate : defaults.cis_rate;
  const retentionMissing = opts.retention_percent === undefined || opts.retention_percent === null || opts.retention_percent === '';
  const retentionNum = Number(opts.retention_percent);
  const retention_percent = retentionMissing || !Number.isFinite(retentionNum) || retentionNum < 0
    ? defaults.retention_percent
    : retentionNum;
  return {
    vat_treatment,
    cis_applies,
    cis_rate,
    retention_percent,
    payment_schedule: opts.payment_schedule || [],
    labour_split: opts.labour_split,
    vat_rates: uk.vat_rates,
    provisional_sums: opts.provisional_sums || [],
    provisional_sums_in_total: typeof opts.provisional_sums_in_total === 'boolean'
      ? opts.provisional_sums_in_total
      : false,
    optional_extras: opts.optional_extras || [],
  };
}

/**
 * A line item is:
 *   { description, qty, unit_price, vat_code, kind }
 *     vat_code: seeded or Settings-defined code (default 'standard')
 *     kind:     'labour' | 'materials' | 'both'              (default 'both')
 *
 * 'both' lines are split using labour_split (default 60% labour, which is
 * typical for roofing) so CIS is deducted from a defensible figure. A quote
 * intended for a contractor should use explicit 'labour'/'materials' lines.
 */
function normaliseItem(item, labourSplit = 0.6, rates = VAT_RATES) {
  const qty = Number(item.qty) || 0;
  const unit = Number(item.unit_price) || 0;
  const net = p(qty * unit);
  const fallback = rates.standard ? 'standard' : Object.keys(rates)[0];
  const vatCode = rates[item.vat_code] ? item.vat_code : fallback;
  const kind = ['labour', 'materials', 'both'].includes(item.kind) ? item.kind : 'both';

  let labour = 0;
  let materials = 0;
  if (kind === 'labour') labour = net;
  else if (kind === 'materials') materials = net;
  else {
    labour = p(net * labourSplit);
    materials = p(net - labour);
  }

  return { ...item, qty, unit_price: unit, vat_code: vatCode, kind, net, labour, materials };
}

/**
 * Calculate a complete UK quote/invoice.
 *
 * @param {Array}  items
 * @param {Object} opts
 *   vat_treatment: 'standard' | 'reverse_charge' | 'not_registered'
 *   cis_applies:   boolean   — deduct CIS (only when invoicing a contractor)
 *   cis_rate:      0 | 20 | 30
 *   retention_percent: number
 *   labour_split:  0..1 for 'both' lines
 *   payment_schedule: [{label, percent?, amount?, trigger}]
 *   vat_rates: Settings list or rate map
 *   provisional_sums: [{description, amount}] — face-value, listed after works total
 *   provisional_sums_in_total: boolean — when true, grand_total = works total + P.S.
 *   optional_extras: [{description, amount}] — listed after works total, never included (6.5)
 * @returns full breakdown, safe to store and to print.
 */
function calculate(items = [], opts = {}) {
  const {
    vat_treatment = 'standard',
    cis_applies = false,
    cis_rate = 20,
    retention_percent = 0,
    labour_split = 0.6,
    payment_schedule = [],
    vat_rates,
    provisional_sums = [],
    provisional_sums_in_total = false,
    optional_extras = [],
  } = opts;

  const rates = ratesTable(vat_rates);
  const lines = items.map((i) => normaliseItem(i, labour_split, rates));

  const subtotal = p(lines.reduce((s, l) => s + l.net, 0));
  const labourTotal = p(lines.reduce((s, l) => s + l.labour, 0));
  const materialsTotal = p(lines.reduce((s, l) => s + l.materials, 0));

  // ---- VAT, grouped by rate so the document can show a proper breakdown ----
  const groups = new Map();
  for (const l of lines) {
    const code = l.vat_code;
    const meta = rates[code] || { rate: 0, label: code };
    const rate = meta.rate;
    if (!groups.has(code)) groups.set(code, { code, label: meta.label, rate, net: 0, vat: 0 });
    groups.get(code).net = p(groups.get(code).net + l.net);
  }

  const chargesVat = vat_treatment === 'standard';
  for (const g of groups.values()) {
    g.vat = chargesVat ? p(g.net * (g.rate / 100)) : 0;
  }
  const vatBreakdown = [...groups.values()].sort((a, b) => b.rate - a.rate);
  const vatTotal = p(vatBreakdown.reduce((s, g) => s + g.vat, 0));

  // Under the Domestic Reverse Charge the customer accounts for the VAT.
  // We must still SHOW what that VAT would be — HMRC requires the invoice to
  // state the amount of VAT due under the reverse charge, or the rate.
  const reverseChargeVat =
    vat_treatment === 'reverse_charge'
      ? p(vatBreakdown.reduce((s, g) => s + p(g.net * (g.rate / 100)), 0))
      : 0;

  const grossTotal = p(subtotal + vatTotal);

  // ---- CIS: deducted from the LABOUR element only, and always from the
  //      net (VAT-exclusive) figure. Materials are never subject to CIS. ----
  const effectiveCisRate = cis_applies ? Number(cis_rate) || 0 : 0;
  const cisDeduction = cis_applies ? p(labourTotal * (effectiveCisRate / 100)) : 0;

  // ---- Retention: a percentage of the net (works) value held until making good ----
  const retentionAmount = retention_percent ? p(subtotal * (Number(retention_percent) / 100)) : 0;

  // ---- Provisional sums sit after the works total (requirement 6.4).
  //      Toggle on → grand total includes them; off → listed only. ----
  const provisionalSumsTotal = p((provisional_sums || []).reduce((s, row) => s + (Number(row.amount) || 0), 0));
  const includeProvisional = !!provisional_sums_in_total;
  const grandTotal = p(grossTotal + (includeProvisional ? provisionalSumsTotal : 0));

  // ---- Optional extras sit after the works total and never join it (requirement 6.5). ----
  const optionalExtrasTotal = p((optional_extras || []).reduce((s, row) => s + (Number(row.amount) || 0), 0));

  // What the customer actually pays on this document now
  const dueNow = p(grandTotal - cisDeduction - retentionAmount);

  // ---- Staged payments, computed off the gross total ----
  const schedule = [];
  let scheduled = 0;
  (payment_schedule || []).forEach((stage, idx) => {
    let amount;
    if (stage.amount !== undefined && stage.amount !== null && stage.amount !== '') {
      amount = p(stage.amount);
    } else {
      amount = p(grossTotal * ((Number(stage.percent) || 0) / 100));
    }
    scheduled = p(scheduled + amount);
    schedule.push({ ...stage, amount, order: idx + 1 });
  });
  // Push any rounding remainder into the final stage so stages always sum
  // exactly to the total — otherwise the document is a penny out.
  if (schedule.length && p(scheduled) !== grossTotal) {
    const diff = p(grossTotal - scheduled);
    schedule[schedule.length - 1].amount = p(schedule[schedule.length - 1].amount + diff);
  }

  return {
    lines,
    subtotal,
    labour_total: labourTotal,
    materials_total: materialsTotal,
    vat_breakdown: vatBreakdown,
    vat_total: vatTotal,
    vat_treatment,
    reverse_charge_vat: reverseChargeVat,
    total: grossTotal,
    cis_applies: !!cis_applies,
    cis_rate: effectiveCisRate,
    cis_deduction: cisDeduction,
    retention_percent: Number(retention_percent) || 0,
    retention_amount: retentionAmount,
    due_now: dueNow,
    payment_schedule: schedule,
    provisional_sums_total: provisionalSumsTotal,
    provisional_sums_in_total: includeProvisional,
    optional_extras_total: optionalExtrasTotal,
    grand_total: grandTotal,
  };
}

/**
 * Totals columns stored on quotes and invoices (requirement 6.3).
 */
function documentTotals(items, opts, customer, uk = {}) {
  const tax = resolveTaxOpts(opts, customer, uk);
  const calc = calculate(items, tax);
  return {
    calc,
    tax,
    cols: {
      subtotal: calc.subtotal,
      vat_amount: calc.vat_total,
      total: calc.total,
      vat_treatment: calc.vat_treatment,
      labour_total: calc.labour_total,
      materials_total: calc.materials_total,
      vat_breakdown: calc.vat_breakdown,
      cis_applies: !!calc.cis_applies,
      cis_rate: calc.cis_rate,
      cis_deduction: calc.cis_deduction,
      retention_percent: calc.retention_percent,
      retention_amount: calc.retention_amount,
      due_now: calc.due_now,
      payment_schedule: calc.payment_schedule,
      provisional_sums_total: calc.provisional_sums_total,
      provisional_sums_in_total: calc.provisional_sums_in_total,
      optional_extras_total: calc.optional_extras_total,
      grand_total: calc.grand_total,
    },
  };
}

/**
 * The exact wording HMRC expects on a reverse-charge invoice. The legislation
 * requires the invoice to make clear the reverse charge applies and that the
 * customer must account for the VAT.
 */
function reverseChargeNotice(vatAmount) {
  return `Reverse charge: VAT Act 1994 Section 55A applies. Customer to pay the VAT to HMRC. VAT to be accounted for by the customer: £${Number(vatAmount || 0).toFixed(2)}.`;
}

function cisNotice(rate, labourTotal, deduction) {
  return `CIS deduction at ${rate}% has been applied to the labour element of £${Number(labourTotal).toFixed(2)}, giving a deduction of £${Number(deduction).toFixed(2)}. Materials are not subject to CIS deduction. The contractor must pay this deduction to HMRC on the subcontractor's behalf.`;
}

/**
 * Consumer Contracts (Information, Cancellation and Additional Charges)
 * Regulations 2013. For an off-premises contract — which a quote given at
 * the customer's home is — the consumer has 14 days to cancel, and the
 * trader MUST give this notice in writing. Failure to do so extends the
 * cancellation period by up to 12 months and is a criminal offence.
 */
function cancellationNotice(companyName, address, email, phone) {
  return {
    heading: 'Your right to cancel',
    body: [
      `You have the right to cancel this contract within 14 days without giving any reason. The cancellation period expires 14 days from the day the contract was entered into.`,
      `To exercise the right to cancel you must inform us — ${companyName}, ${address}${email ? `, ${email}` : ''}${phone ? `, ${phone}` : ''} — of your decision by a clear statement (for example a letter sent by post, or an email). You may use the cancellation form below, but it is not obligatory.`,
      `To meet the cancellation deadline, it is sufficient for you to send your communication concerning your exercise of the right to cancel before the cancellation period has expired.`,
      `If you cancel this contract, we will reimburse all payments received from you without undue delay and no later than 14 days after the day on which we are informed of your decision.`,
      `If you asked us to begin work during the cancellation period, you must pay us an amount in proportion to what has been performed up until you communicated your cancellation.`,
    ],
  };
}

/**
 * Late Payment of Commercial Debts (Interest) Act 1998 — applies to
 * business-to-business contracts only, never to consumers.
 */
function latePaymentNotice(ratePlusBase = 8) {
  return `We reserve the right to charge interest on overdue invoices at ${ratePlusBase}% above the Bank of England base rate, together with reasonable recovery costs, under the Late Payment of Commercial Debts (Interest) Act 1998.`;
}

module.exports = {
  VAT_RATES,
  VAT_TREATMENTS,
  CIS_RATES,
  CIS_RATE_VALUES,
  CORE_VAT_CODES,
  DEFAULT_VAT_RATES,
  calculate,
  normaliseItem,
  reverseChargeNotice,
  cisNotice,
  cancellationNotice,
  latePaymentNotice,
  parseVatRate,
  parseVatRates,
  mergeVatRates,
  vatShort,
  taxDefaultsForCustomer,
  resolveTaxOpts,
  documentTotals,
  COMMERCIAL_RETENTION_PERCENT,
  p,
};
