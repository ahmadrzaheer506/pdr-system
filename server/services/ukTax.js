// ============================================================
// UK construction tax engine — VAT, CIS, retention, staged payments.
//
// This is the piece that makes a quote/invoice legally usable in the
// UK building trade rather than just "subtotal + 20%".
//
// Covers:
//  · Per-line VAT rates: 20% standard, 5% reduced, 0% zero-rated, exempt
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

// UK VAT rates applicable to construction work.
const VAT_RATES = {
  standard: { rate: 20, label: 'Standard rate (20%)', help: 'Most repair, maintenance and improvement work.' },
  reduced: { rate: 5, label: 'Reduced rate (5%)', help: 'Qualifying energy-saving materials, residential conversions, and homes empty 2+ years.' },
  zero: { rate: 0, label: 'Zero rated (0%)', help: 'Qualifying new-build residential and certain charity buildings.' },
  exempt: { rate: 0, label: 'Exempt', help: 'Outside the scope of VAT. Rare in construction.' },
};

const CIS_RATES = {
  gross: { rate: 0, label: 'Gross status (0%)' },
  net20: { rate: 20, label: 'Registered subcontractor (20%)' },
  higher30: { rate: 30, label: 'Unverified (30%)' },
};

/**
 * A line item is:
 *   { description, qty, unit_price, vat_code, kind }
 *     vat_code: 'standard' | 'reduced' | 'zero' | 'exempt'   (default 'standard')
 *     kind:     'labour' | 'materials' | 'both'              (default 'both')
 *
 * 'both' lines are split using labour_split (default 60% labour, which is
 * typical for roofing) so CIS is deducted from a defensible figure. A quote
 * intended for a contractor should use explicit 'labour'/'materials' lines.
 */
function normaliseItem(item, labourSplit = 0.6) {
  const qty = Number(item.qty) || 0;
  const unit = Number(item.unit_price) || 0;
  const net = p(qty * unit);
  const vatCode = VAT_RATES[item.vat_code] ? item.vat_code : 'standard';
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
  } = opts;

  const lines = items.map((i) => normaliseItem(i, labour_split));

  const subtotal = p(lines.reduce((s, l) => s + l.net, 0));
  const labourTotal = p(lines.reduce((s, l) => s + l.labour, 0));
  const materialsTotal = p(lines.reduce((s, l) => s + l.materials, 0));

  // ---- VAT, grouped by rate so the document can show a proper breakdown ----
  const groups = new Map();
  for (const l of lines) {
    const code = l.vat_code;
    const rate = VAT_RATES[code].rate;
    if (!groups.has(code)) groups.set(code, { code, label: VAT_RATES[code].label, rate, net: 0, vat: 0 });
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

  // ---- Retention: a percentage of the net value held until making good ----
  const retentionAmount = retention_percent ? p(subtotal * (Number(retention_percent) / 100)) : 0;

  // What the customer actually pays on this document now
  const dueNow = p(grossTotal - cisDeduction - retentionAmount);

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
  CIS_RATES,
  calculate,
  normaliseItem,
  reverseChargeNotice,
  cisNotice,
  cancellationNotice,
  latePaymentNotice,
  p,
};
