import { describe, it, expect } from 'vitest';
import { canRecordPayment, invoiceOutstanding } from './invoicePayments';

describe('invoicePayments helpers (requirement 11.4)', () => {
  it('allows recording on sent, part_paid and overdue only', () => {
    expect(canRecordPayment('sent')).toBe(true);
    expect(canRecordPayment('part_paid')).toBe(true);
    expect(canRecordPayment('overdue')).toBe(true);
    expect(canRecordPayment('draft')).toBe(false);
    expect(canRecordPayment('paid')).toBe(false);
  });

  it('outstanding is due_now minus paid, floored at zero', () => {
    expect(invoiceOutstanding({ due_now: 548, amount_paid: 48 })).toBe(500);
    expect(invoiceOutstanding({ due_now: 548, amount_paid: 600 })).toBe(0);
  });
});
