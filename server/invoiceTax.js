/**
 * Invoice VAT / CIS (requirement 11.2).
 * Same ukTax.documentTotals path as quotes. Drafts can change treatment;
 * sent / paid / part_paid / overdue are frozen. Retention stays 6.4 inherit.
 */
const ukTax = require('./services/ukTax');

function isTaxFrozen(status) {
  return status !== 'draft';
}

/**
 * Round the reverse-charge VAT that the customer must account for, from stored
 * breakdown rows (vat amounts are zero on reverse-charge documents).
 */
function reverseChargeVatFromBreakdown(inv) {
  if (inv.vat_treatment !== 'reverse_charge') return 0;
  const p = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  return p((inv.vat_breakdown || []).reduce((sum, group) => (
    sum + (Number(group.net) || 0) * ((Number(group.rate) || 0) / 100)
  ), 0));
}

function decorateTaxView(inv) {
  const reverse_charge_vat = reverseChargeVatFromBreakdown(inv);
  return {
    ...inv,
    reverse_charge_vat,
    reverse_charge_notice: inv.vat_treatment === 'reverse_charge'
      ? ukTax.reverseChargeNotice(reverse_charge_vat)
      : null,
    tax_frozen: isTaxFrozen(inv.status),
  };
}

function parseDraftTax(body, invoice) {
  const b = body || {};
  let vat_treatment = invoice.vat_treatment;
  if (b.vat_treatment !== undefined) {
    if (!ukTax.VAT_TREATMENTS.includes(b.vat_treatment)) {
      return { error: 'Invalid VAT treatment', status: 400 };
    }
    vat_treatment = b.vat_treatment;
  }
  let cis_applies = !!invoice.cis_applies;
  if (b.cis_applies !== undefined) {
    if (typeof b.cis_applies !== 'boolean') {
      return { error: 'cis_applies must be a boolean', status: 400 };
    }
    cis_applies = b.cis_applies;
  }
  let cis_rate = Number(invoice.cis_rate);
  if (b.cis_rate !== undefined && b.cis_rate !== null && b.cis_rate !== '') {
    cis_rate = Number(b.cis_rate);
    if (!ukTax.CIS_RATE_VALUES.includes(cis_rate)) {
      return { error: 'Invalid CIS rate', status: 400 };
    }
  }
  return { vat_treatment, cis_applies, cis_rate };
}

/**
 * Recalculate stored tax columns for a draft invoice. Retention and lines stay as stored.
 * @returns {{ error: string, status: number }|{ cols: object, calc: object }}
 */
function applyDraftTax(invoice, body, customer, uk) {
  if (isTaxFrozen(invoice.status)) {
    return { error: 'VAT and CIS can only be edited on a draft invoice', status: 400 };
  }
  const parsed = parseDraftTax(body, invoice);
  if (parsed.error) return parsed;
  const { calc, cols } = ukTax.documentTotals(invoice.items || [], {
    vat_treatment: parsed.vat_treatment,
    cis_applies: parsed.cis_applies,
    cis_rate: parsed.cis_rate,
    retention_percent: invoice.retention_percent,
    provisional_sums: invoice.provisional_sums || [],
    provisional_sums_in_total: !!invoice.provisional_sums_in_total,
  }, customer, uk);
  return {
    calc,
    cols: {
      subtotal: cols.subtotal,
      vat_amount: cols.vat_amount,
      total: cols.grand_total,
      vat_treatment: cols.vat_treatment,
      labour_total: cols.labour_total,
      materials_total: cols.materials_total,
      vat_breakdown: cols.vat_breakdown,
      cis_applies: cols.cis_applies,
      cis_rate: cols.cis_rate,
      cis_deduction: cols.cis_deduction,
      retention_percent: cols.retention_percent,
      retention_amount: cols.retention_amount,
      due_now: cols.due_now,
      provisional_sums_in_total: !!cols.provisional_sums_in_total,
    },
  };
}

module.exports = {
  isTaxFrozen,
  decorateTaxView,
  parseDraftTax,
  applyDraftTax,
  reverseChargeVatFromBreakdown,
};
