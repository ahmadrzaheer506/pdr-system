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
