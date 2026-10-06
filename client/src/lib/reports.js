/**
 * Report types, 7/30/90 windows (14.1), and from/to + CSV (14.2).
 * Pipeline value stays a live 4.5 snapshot (no date filter) on Home / Pipeline.
 */
import { ymdInZone, addCalendarDays } from './ukTime.js';

export const RANGE_PRESETS = [7, 30, 90];

export const LIVE_REPORTS = Object.freeze([
  'lead-volume', 'win-loss', 'pipeline-value', 'customers', 'jobs', 'invoices', 'profitability',
]);
export const GENERATE_REPORTS = Object.freeze(['customers', 'jobs', 'invoices', 'profitability']);
export const ADMIN_REPORTS = Object.freeze(['profitability']);

export const REPORT_CARDS = Object.freeze([
  {
    id: 'lead-volume',
    title: 'Lead volume',
    detail: 'New inbox leads in the selected window.',
  },
  {
    id: 'win-loss',
    title: 'Win / loss',
    detail: 'Enquiries currently Won or Lost, updated in the selected window.',
  },
  {
    id: 'customers',
    title: 'Customers',
    detail: 'Customers created in a from/to window. Opens on the last 30 days.',
  },
  {
    id: 'jobs',
    title: 'Jobs',
    detail: 'Jobs created in a from/to window. Opens on the last 30 days.',
  },
  {
    id: 'invoices',
    title: 'Invoices',
    detail: 'Invoices created in a from/to window. Opens on the last 30 days.',
  },
  {
    id: 'profitability',
    title: 'Job profitability',
    detail: 'Quoted labour margin and hours by operative. Director only. Opens on the last 30 days.',
    adminOnly: true,
  },
]);

export function isoRange(days) {
  const n = RANGE_PRESETS.includes(days) ? days : 30;
  const to = ymdInZone();
  const from = addCalendarDays(to, -n);
  return { from, to };
}

export function isLiveReport(type) {
  return LIVE_REPORTS.includes(type);
}

export function isGenerateReport(type) {
  return GENERATE_REPORTS.includes(type);
}

export function isAdminReport(type) {
  return ADMIN_REPORTS.includes(type);
}

export function visibleReportCards(isAdmin) {
  return REPORT_CARDS.filter((card) => !card.adminOnly || isAdmin);
}

/** Custom from/to override 7/30/90 when both dates are set (requirement 14.2). */
export function effectiveRange(preset, from, to) {
  if (from && to) return { from, to, custom: true };
  return { ...isoRange(preset || 30), custom: false };
}

/** Highlight a 7/30/90 pill when From/To still match that window. */
export function matchingPreset(from, to) {
  if (!from || !to) return null;
  const match = RANGE_PRESETS.find((days) => {
    const range = isoRange(days);
    return range.from === from && range.to === to;
  });
  return match || null;
}

export function reportCsvPath(type, range, { labour = false } = {}) {
  if (type === 'pipeline-value') return '/reports/pipeline-value.csv';
  if (type === 'profitability' && labour) {
    return `/reports/profitability-labour.csv?from=${range.from}&to=${range.to}`;
  }
  return `/reports/${type}.csv?from=${range.from}&to=${range.to}`;
}

export function reportCsvFilename(type, range, { labour = false } = {}) {
  if (type === 'pipeline-value') return 'pipeline-value-live.csv';
  if (type === 'profitability' && labour) {
    return `profitability-labour-${range.from}-to-${range.to}.csv`;
  }
  return `${type}-${range.from}-to-${range.to}.csv`;
}
