import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import CustomerTimeline from './CustomerTimeline.jsx';

const ITEMS = [
  {
    id: 'message-1',
    type: 'message',
    at: '2026-01-02T10:00:00Z',
    summary: 'WhatsApp enquiry',
    user_name: null,
    meta: { channel: 'whatsapp', direction: 'in', status: 'received' },
  },
  {
    id: 'message-2',
    type: 'call',
    at: '2026-01-01T09:00:00Z',
    summary: 'Called about guttering',
    user_name: 'Lisa',
    meta: { channel: 'phone', direction: 'in', status: 'logged' },
  },
  {
    id: 'message-3',
    type: 'note',
    at: '2026-01-03T11:00:00Z',
    summary: 'Needs scaffold',
    user_name: 'Paul',
    meta: { channel: 'note', direction: 'out', status: 'logged' },
  },
  {
    id: 'activity-10',
    type: 'quote',
    at: '2026-01-02T12:00:00Z',
    summary: 'Quote Q-2026-0001 created — £1,200.00',
    user_name: 'Lisa',
    meta: { kind: 'quote_created' },
  },
  {
    id: 'activity-11',
    type: 'job',
    at: '2026-01-04T08:00:00Z',
    summary: 'Job "Re-roof" created',
    user_name: 'Lisa',
    meta: { kind: 'job_created' },
  },
  {
    id: 'activity-12',
    type: 'invoice',
    at: '2026-01-05T09:00:00Z',
    summary: 'Invoice INV-2026-0001 created — £1,200.00',
    user_name: 'Lisa',
    meta: { kind: 'invoice_created' },
  },
];

describe('CustomerTimeline (requirement 2.3)', () => {
  it('renders all six timeline types', () => {
    render(<CustomerTimeline items={ITEMS} />);
    expect(screen.getByText('WhatsApp enquiry')).toBeInTheDocument();
    expect(screen.getByText('Called about guttering')).toBeInTheDocument();
    expect(screen.getByText('Needs scaffold')).toBeInTheDocument();
    expect(screen.getByText(/Quote Q-2026-0001/)).toBeInTheDocument();
    expect(screen.getByText(/Job "Re-roof"/)).toBeInTheDocument();
    expect(screen.getByText(/Invoice INV-2026-0001/)).toBeInTheDocument();
    expect(screen.getAllByText('Message').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Call').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Note').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Quote').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Job').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Invoice').length).toBeGreaterThanOrEqual(1);
  });

  it('shows empty state when there are no items', () => {
    render(<CustomerTimeline items={[]} />);
    expect(screen.getByText(/no activity yet/i)).toBeInTheDocument();
  });

  it('keeps a default height when empty and scrolls a long feed', () => {
    const { rerender } = render(<CustomerTimeline items={[]} />);
    const empty = screen.getByRole('region', { name: /activity timeline/i });
    expect(empty.className).toMatch(/min-h-64/);
    expect(empty.className).not.toMatch(/overflow-y-auto/);

    rerender(<CustomerTimeline items={ITEMS} />);
    const feed = screen.getByRole('region', { name: /activity timeline/i });
    expect(feed.className).toMatch(/overflow-y-auto/);
    expect(feed.className).toMatch(/max-h-\[32rem\]/);
  });
});
