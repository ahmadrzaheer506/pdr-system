const FALLBACK_VAT_RATES = [
  { code: 'standard', rate: 20, short: '20%', label: 'Standard 20%', help: 'Most repair, maintenance and improvement work.' },
  { code: 'reduced', rate: 5, short: '5%', label: 'Reduced 5%', help: 'Energy-saving materials, residential conversions, homes empty 2+ years.' },
  { code: 'zero', rate: 0, short: '0%', label: 'Zero rated', help: 'Qualifying new-build residential and certain charity buildings.' },
  { code: 'exempt', rate: 0, short: 'Ex', label: 'Exempt', help: 'Outside the scope of VAT. Rare in construction.' },
];

export const CORE_VAT_CODES = ['standard', 'reduced', 'zero', 'exempt'];

/**
 * Quote/invoice tax starting point from customer type (requirement 6.3 / 6.4).
 * Commercial → reverse charge + CIS 20% + 5% retention; domestic → standard VAT, no CIS, 0% retention.
 */
export function quoteTaxDefaults(customer, uk = {}) {
  const commercial = (customer?.customer_type || 'domestic') === 'commercial';
  const vatRegistered = uk.vat_registered !== false;
  const cisRate = Number(uk.default_cis_rate);
  const defaultCis = [0, 20, 30].includes(cisRate) ? cisRate : 20;
  if (commercial) {
    return {
      vat_treatment: vatRegistered ? 'reverse_charge' : 'not_registered',
      cis_applies: true,
      cis_rate: defaultCis,
      retention_percent: 5,
    };
  }
  return {
    vat_treatment: vatRegistered ? 'standard' : 'not_registered',
    cis_applies: false,
    cis_rate: defaultCis,
    retention_percent: 0,
  };
}

/** Normalise GET /quotes/meta/options vat_rates (array or legacy map). */
export function vatOptionsFromMeta(vatRates) {
  if (Array.isArray(vatRates) && vatRates.length) {
    return vatRates.map((r) => ({
      code: r.code,
      rate: r.rate,
      short: r.short || `${r.rate}%`,
      label: r.label || r.code,
      help: r.help || '',
    }));
  }
  if (vatRates && typeof vatRates === 'object') {
    const keys = Object.keys(vatRates);
    if (keys.length) {
      return keys.map((code) => {
        const r = vatRates[code] || {};
        return {
          code,
          rate: r.rate,
          short: r.short || `${r.rate ?? ''}%`,
          label: r.label || code,
          help: r.help || '',
        };
      });
    }
  }
  return FALLBACK_VAT_RATES;
}

/** SelectMenu options from Settings VAT rates, keeping an unknown saved code selectable. */
export function vatSelectOptions(vatRates, extraCode) {
  const opts = vatOptionsFromMeta(vatRates).map((r) => ({
    value: r.code,
    label: r.label || r.code,
  }));
  const extra = String(extraCode || '').trim();
  if (extra && !opts.some((o) => o.value === extra)) {
    opts.push({ value: extra, label: extra });
  }
  return opts;
}

export { FALLBACK_VAT_RATES };
