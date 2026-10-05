import { describe, it, expect } from 'vitest';
import {
  leadWorkspaceScope,
  filterByLeadScope,
  enquiryWorkspaceStage,
  recordTime,
} from './leadWorkspace.js';

const leads = [
  { id: 10, source: 'facebook_lead', status: 'NEW', created_at: '2026-10-02T21:00:00Z' },
  { id: 12, source: 'phone', status: 'NEW', created_at: '2026-10-02T22:10:00Z' },
  { id: 11, source: 'phone', status: 'NEW', created_at: '2026-10-02T22:00:00Z' },
];

describe('leadWorkspaceScope', () => {
  it('returns null when Open is not tied to a lead', () => {
    expect(leadWorkspaceScope(leads, null)).toBeNull();
    expect(leadWorkspaceScope(leads, '')).toBeNull();
  });

  it('windows each enquiry between its created_at and the next lead', () => {
    const first = leadWorkspaceScope(leads, 10);
    expect(first.lead.id).toBe(10);
    expect(first.start).toBe(0);
    expect(first.end).toBe(Date.parse('2026-10-02T22:00:00Z'));

    const middle = leadWorkspaceScope(leads, 11);
    expect(middle.end).toBe(Date.parse('2026-10-02T22:10:00Z'));

    const latest = leadWorkspaceScope(leads, 12);
    expect(latest.end).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('filterByLeadScope', () => {
  const rows = [
    { id: 'ancient', created_at: '2026-01-01T09:00:00Z' },
    { id: 'old-quote', created_at: '2026-10-02T21:15:00Z', ref: 'Q-1' },
    { id: 'new-note', created_at: '2026-10-02T22:05:00Z' },
    { id: 'visit', start: '2026-10-03T09:00:00Z', created_at: '2026-10-02T21:20:00Z' },
    { id: 'timeline', at: '2026-10-02T21:02:00Z' },
  ];

  it('keeps prior quotes, visits and timeline on the earlier enquiry only', () => {
    const first = filterByLeadScope(rows, leadWorkspaceScope(leads, 10));
    expect(first.map((r) => r.id)).toEqual(['ancient', 'old-quote', 'visit', 'timeline']);

    const latest = filterByLeadScope(rows, leadWorkspaceScope(leads, 12));
    expect(latest).toEqual([]);

    const middle = filterByLeadScope(rows, leadWorkspaceScope(leads, 11));
    expect(middle.map((r) => r.id)).toEqual(['new-note']);
  });

  it('does not treat a future visit start as belonging to a later enquiry', () => {
    expect(recordTime({ start: '2026-10-03T09:00:00Z', created_at: '2026-10-02T21:20:00Z' }))
      .toBe(Date.parse('2026-10-02T21:20:00Z'));
  });

  it('prefers lead_id over the time window when present', () => {
    const scope = leadWorkspaceScope(leads, 12);
    const rows = [
      { id: 'old', created_at: '2026-10-02T21:15:00Z', lead_id: 10 },
      { id: 'mine', created_at: '2026-10-02T21:15:00Z', lead_id: 12 },
    ];
    expect(filterByLeadScope(rows, scope).map((r) => r.id)).toEqual(['mine']);
  });
});

describe('enquiryWorkspaceStage', () => {
  it('uses the enquiry stage, not the customer last-write', () => {
    const scope = leadWorkspaceScope(
      leads.map((l) => ({ ...l, stage: l.id === 12 ? 'ENQUIRY' : 'WON' })),
      12,
    );
    expect(enquiryWorkspaceStage('WON', scope)).toBe('ENQUIRY');
  });

  it('keeps the earlier enquiry at WON', () => {
    const scope = leadWorkspaceScope(
      leads.map((l) => ({ ...l, stage: l.id === 10 ? 'WON' : 'ENQUIRY' })),
      10,
    );
    expect(enquiryWorkspaceStage('ENQUIRY', scope)).toBe('WON');
  });
});
