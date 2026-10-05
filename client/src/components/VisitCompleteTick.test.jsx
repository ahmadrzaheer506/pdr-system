import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import VisitCompleteTick, { VisitCompleteModal } from './VisitCompleteTick.jsx';

describe('VisitCompleteTick', () => {
  it('lets staff tick a booked visit complete', async () => {
    const onComplete = vi.fn();
    const user = userEvent.setup();
    render(<VisitCompleteTick done={false} saving={false} onComplete={onComplete} />);
    await user.click(screen.getByRole('checkbox', { name: /visit completed/i }));
    expect(onComplete).toHaveBeenCalled();
  });

  it('shows a ticked state after the visit is done', () => {
    render(<VisitCompleteTick done saving={false} onComplete={() => {}} />);
    expect(screen.getByText('Visit completed')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('asks for optional remarks before confirming', async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(
      <VisitCompleteModal
        visit={{ customer_name: 'Sandra Cole' }}
        open
        saving={false}
        onClose={() => {}}
        onConfirm={onConfirm}
      />,
    );
    expect(screen.getByLabelText(/completion remarks/i)).toBeInTheDocument();
    await user.type(screen.getByLabelText(/completion remarks/i), 'Ridge is ok');
    await user.click(screen.getByRole('button', { name: /^complete visit$/i }));
    expect(onConfirm).toHaveBeenCalledWith('Ridge is ok');
  });
});
