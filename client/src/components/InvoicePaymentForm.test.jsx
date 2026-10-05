import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import InvoicePaymentForm, { InvoicePaymentLedger } from './InvoicePaymentForm.jsx';
import { api } from '../lib/api';

vi.mock('../lib/api', () => ({
  api: { post: vi.fn() },
  money: (n) => `£${n}`,
  fmtDate: (d) => d,
}));

const SENT = {
  id: 12,
  ref: 'INV-2026-0010',
  status: 'sent',
  due_now: 548,
  amount_paid: 48,
  outstanding: 500,
};

describe('InvoicePaymentForm (requirement 11.4)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('posts date, amount and optional note', async () => {
    const user = userEvent.setup();
    const onRecorded = vi.fn();
    api.post.mockResolvedValue({ ok: true, invoice: { ...SENT, amount_paid: 248 } });
    render(<InvoicePaymentForm invoice={SENT} onRecorded={onRecorded} onError={() => {}} />);
    await user.clear(screen.getByLabelText(/amount received/i));
    await user.type(screen.getByLabelText(/amount received/i), '200');
    await user.type(screen.getByLabelText(/note \(optional\)/i), 'BACS');
    await user.click(screen.getByRole('button', { name: /record payment/i }));
    expect(api.post).toHaveBeenCalledWith('/invoices/12/payment', expect.objectContaining({
      amount: 200,
      note: 'BACS',
      paid_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    }));
    expect(onRecorded).toHaveBeenCalled();
  });

  it('lists ledger rows', () => {
    render(
      <InvoicePaymentLedger
        payments={[{ id: 1, amount: 200, paid_at: '2026-09-20', note: 'BACS' }]}
      />,
    );
    expect(screen.getByText('2026-09-20')).toBeInTheDocument();
    expect(screen.getByText(/BACS/)).toBeInTheDocument();
    expect(screen.getByText('£200')).toBeInTheDocument();
  });
});
