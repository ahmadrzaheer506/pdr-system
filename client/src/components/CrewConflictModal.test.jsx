import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CrewConflictModal from './CrewConflictModal.jsx';

const CONFLICTS = [
  { user_id: 4, type: 'holiday', name: 'Liam Ozturk', detail: 'On approved holiday' },
  { user_id: 3, type: 'double_book', name: 'Jamie Fisher', detail: 'Already on “Guttering”' },
];

describe('CrewConflictModal', () => {
  it('lists holiday and booked people and confirms or cancels', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <CrewConflictModal
        open
        conflicts={CONFLICTS}
        dateLabel="4 Oct 2026"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    expect(screen.getByRole('heading', { name: /assign with conflicts/i })).toBeInTheDocument();
    expect(screen.getByText('Liam Ozturk')).toBeInTheDocument();
    expect(screen.getByText('Jamie Fisher')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: /assign anyway/i }));
    expect(onConfirm).toHaveBeenCalled();
  });

  it('shows assigning loading on the confirm button', () => {
    render(
      <CrewConflictModal
        open
        conflicts={CONFLICTS}
        saving
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    const confirm = screen.getByRole('button', { name: /assigning/i });
    expect(confirm).toBeDisabled();
    expect(confirm).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('button', { name: /cancel/i })).toBeDisabled();
  });
});
