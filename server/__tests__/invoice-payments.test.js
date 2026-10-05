jest.mock('../models', () => ({
  Invoice: { findOne: jest.fn(), count: jest.fn() },
  InvoicePayment: { create: jest.fn(), findAll: jest.fn() },
}));

const invoicePayments = require('../invoicePayments');

describe('invoicePayments helpers (requirement 11.4)', () => {
  test('outstanding is due_now minus amount_paid, never negative', () => {
    expect(invoicePayments.outstanding({ due_now: 548, amount_paid: 48 })).toBe(500);
    expect(invoicePayments.outstanding({ due_now: 548, amount_paid: 548 })).toBe(0);
    expect(invoicePayments.outstanding({ due_now: 548, amount_paid: 600 })).toBe(0);
  });

  test('allows payment on sent, part_paid and overdue only', () => {
    expect(invoicePayments.canRecordPayment('sent')).toBe(true);
    expect(invoicePayments.canRecordPayment('part_paid')).toBe(true);
    expect(invoicePayments.canRecordPayment('overdue')).toBe(true);
    expect(invoicePayments.canRecordPayment('draft')).toBe(false);
    expect(invoicePayments.canRecordPayment('paid')).toBe(false);
  });

  test('omitted amount pays remaining; overpay is capped at due_now', () => {
    const invoice = { status: 'sent', due_now: 548, amount_paid: 48 };
    expect(invoicePayments.parsePaymentBody({}, invoice, '2026-09-26')).toEqual({
      amount: 500,
      paid_at: '2026-09-26',
      note: null,
    });
    expect(invoicePayments.parsePaymentBody({ amount: 999, note: '  BACS  ' }, invoice, '2026-09-26').amount).toBe(500);
  });

  test('rejects a zero amount and an invalid date', () => {
    const invoice = { status: 'sent', due_now: 548, amount_paid: 0 };
    expect(invoicePayments.parsePaymentBody({ amount: 0 }, invoice, '2026-09-26').status).toBe(400);
    expect(invoicePayments.parsePaymentBody({ amount: 10, paid_at: '26/09/2026' }, invoice, '2026-09-26').error)
      .toMatch(/YYYY-MM-DD/);
  });
});
