import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CustomerInternalNotes from './CustomerInternalNotes.jsx';
import { api } from '../lib/api';

vi.mock('../lib/api', () => ({
  api: { post: vi.fn(), del: vi.fn() },
  fmtDateTime: (d) => `dt:${d}`,
}));

describe('CustomerInternalNotes (requirement 2.4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.post.mockResolvedValue({ note: { id: 2 } });
  });

  it('posts a new internal note and does not use the messages endpoint', async () => {
    const user = userEvent.setup();
    const onChanged = vi.fn();
    render(
      <CustomerInternalNotes
        customer={{ id: 9, notes: 'Standing memo' }}
        notes={[{ id: 1, body: 'Call before 8am', created_at: '2026-01-02T10:00:00Z', user_name: 'Paul' }]}
        onChanged={onChanged}
        onError={vi.fn()}
      />,
    );
    expect(screen.getByText('Internal notes')).toBeInTheDocument();
    expect(screen.getByText('Standing memo')).toBeInTheDocument();
    expect(screen.getByText('Call before 8am')).toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: 'Internal note' }), 'Scaffold Monday');
    await user.click(screen.getByRole('button', { name: /^add$/i }));
    expect(api.post).toHaveBeenCalledWith('/customers/9/notes', { body: 'Scaffold Monday' });
    expect(onChanged).toHaveBeenCalled();
  });

  it('badges task, site visit, customer, and general notes', () => {
    render(
      <CustomerInternalNotes
        customer={{ id: 9, notes: '' }}
        leadId={40}
        notes={[
          { id: 1, body: 'Typed in the office', source: 'general', created_at: '2026-01-02T10:00:00Z', user_name: 'Paul' },
          { id: 2, body: 'Called about tiles', source: 'task', created_at: '2026-01-02T11:00:00Z', user_name: 'Lisa' },
          { id: 3, body: 'Valley is sound', source: 'visit', created_at: '2026-01-02T12:00:00Z', user_name: 'Jamie' },
          { id: 4, body: 'Need a quote for a leaking valley', source: 'customer', created_at: '2026-01-02T09:00:00Z' },
          { id: 5, body: 'Ridge to finish tomorrow', source: 'clock', created_at: '2026-01-02T16:00:00Z', user_name: 'Jamie' },
        ]}
        onChanged={vi.fn()}
        onError={vi.fn()}
      />,
    );
    expect(screen.getByText('General')).toBeInTheDocument();
    expect(screen.getByText('Task completion remarks')).toBeInTheDocument();
    expect(screen.getByText('Site visit completion remarks')).toBeInTheDocument();
    expect(screen.getByText('From customer')).toBeInTheDocument();
    expect(screen.getByText('Clock-out notes')).toBeInTheDocument();
  });

  it('sends the enquiry id with a new general note', async () => {
    const user = userEvent.setup();
    render(
      <CustomerInternalNotes
        customer={{ id: 9, notes: '' }}
        leadId={40}
        notes={[]}
        onChanged={vi.fn()}
        onError={vi.fn()}
      />,
    );
    await user.type(screen.getByRole('textbox', { name: 'Internal note' }), 'Call before 8am');
    await user.click(screen.getByRole('button', { name: /^add$/i }));
    expect(api.post).toHaveBeenCalledWith('/customers/9/notes', { body: 'Call before 8am', lead_id: 40 });
  });

  it('does not scroll internal notes when there are four or fewer', () => {
    render(
      <CustomerInternalNotes
        customer={{ id: 9, notes: '' }}
        notes={[1, 2, 3, 4].map((id) => ({ id, body: `Note ${id}`, created_at: '2026-01-02T10:00:00Z', user_name: 'Paul' }))}
        onChanged={vi.fn()}
        onError={vi.fn()}
      />,
    );
    expect(screen.getByRole('list', { name: 'Internal notes' })).not.toHaveClass('overflow-y-auto');
  });

  it('scrolls internal notes after four entries', () => {
    render(
      <CustomerInternalNotes
        customer={{ id: 9, notes: '' }}
        notes={[1, 2, 3, 4, 5].map((id) => ({ id, body: `Note ${id}`, created_at: '2026-01-02T10:00:00Z', user_name: 'Paul' }))}
        onChanged={vi.fn()}
        onError={vi.fn()}
      />,
    );
    expect(screen.getByRole('list', { name: 'Internal notes' })).toHaveClass('overflow-y-auto');
  });
});
