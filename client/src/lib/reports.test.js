import { describe, it, expect, vi } from 'vitest';
import {
  isoRange, isLiveReport, isGenerateReport, isAdminReport, REPORT_CARDS, RANGE_PRESETS,
  effectiveRange, matchingPreset, reportCsvPath, reportCsvFilename, visibleReportCards,
} from './reports.js';

describe('reports helpers (requirements 14.1–14.3)', () => {
  it('keeps 7/30/90 presets and hides profitability from office', () => {
    expect(RANGE_PRESETS).toEqual([7, 30, 90]);
    expect(REPORT_CARDS.map((c) => c.id)).toEqual([
      'lead-volume', 'win-loss', 'customers', 'jobs', 'invoices', 'profitability',
    ]);
    expect(isLiveReport('profitability')).toBe(true);
    expect(isGenerateReport('profitability')).toBe(true);
    expect(isAdminReport('profitability')).toBe(true);
    expect(visibleReportCards(false).map((c) => c.id)).not.toContain('profitability');
    expect(visibleReportCards(true).map((c) => c.id)).toContain('profitability');
    expect(visibleReportCards(true).map((c) => c.id)).not.toContain('pipeline-value');
  });

  it('builds an inclusive ISO window', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-28T12:00:00.000Z'));
    expect(isoRange(30)).toEqual({ from: '2026-08-29', to: '2026-09-28' });
    vi.useRealTimers();
  });

  it('lets from/to override the 7/30/90 pills', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-28T12:00:00.000Z'));
    expect(effectiveRange(30, '', '')).toEqual({ from: '2026-08-29', to: '2026-09-28', custom: false });
    expect(effectiveRange(7, '2026-01-01', '2026-01-31')).toEqual({
      from: '2026-01-01', to: '2026-01-31', custom: true,
    });
    expect(matchingPreset('2026-08-29', '2026-09-28')).toBe(30);
    expect(matchingPreset('2026-01-01', '2026-01-31')).toBeNull();
    vi.useRealTimers();
  });

  it('names CSV files with the window, except live pipeline', () => {
    expect(reportCsvPath('pipeline-value')).toBe('/reports/pipeline-value.csv');
    expect(reportCsvFilename('pipeline-value')).toBe('pipeline-value-live.csv');
    expect(reportCsvPath('customers', { from: '2026-09-01', to: '2026-09-28' }))
      .toBe('/reports/customers.csv?from=2026-09-01&to=2026-09-28');
    expect(reportCsvFilename('invoices', { from: '2026-09-01', to: '2026-09-28' }))
      .toBe('invoices-2026-09-01-to-2026-09-28.csv');
    expect(reportCsvPath('profitability', { from: '2026-09-01', to: '2026-09-28' }, { labour: true }))
      .toBe('/reports/profitability-labour.csv?from=2026-09-01&to=2026-09-28');
  });
});
