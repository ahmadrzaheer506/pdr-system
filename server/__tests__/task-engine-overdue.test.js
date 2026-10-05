jest.mock('../models', () => ({
  Task: { findOne: jest.fn(), create: jest.fn(), update: jest.fn() },
  Appointment: { findAll: jest.fn() },
  Customer: {},
  Job: { findAll: jest.fn() },
  Invoice: { findAll: jest.fn() },
  Quote: { findAll: jest.fn() },
}));

jest.mock('../db', () => ({
  todayStr: () => '2026-09-26',
  plain: (row) => row,
}));

jest.mock('../notifications', () => ({
  safeNotify: jest.fn(async (fn) => fn()),
  notifyOffice: jest.fn(async () => []),
  notifyUsers: jest.fn(async () => []),
}));

const { Invoice, Task } = require('../models');
const { notifyOffice } = require('../notifications');
const { scanOverdueInvoices } = require('../services/taskEngine');

describe('scanOverdueInvoices (requirement 11.4)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Task.findOne.mockResolvedValue(null);
    Task.create.mockResolvedValue({ id: 8 });
  });

  test('flips sent and part_paid past due_date to overdue and opens a chase-payment task', async () => {
    const logActivity = jest.fn();
    const inv = {
      id: 12,
      customer_id: 5,
      ref: 'INV-2026-0010',
      status: 'sent',
      due_date: '2026-09-20',
      Customer: { name: 'Fiona Whitmore' },
      save: jest.fn(),
    };
    Invoice.findAll.mockResolvedValue([inv]);

    const n = await scanOverdueInvoices(logActivity);
    expect(n).toBe(1);
    expect(inv.status).toBe('overdue');
    expect(inv.save).toHaveBeenCalled();
    expect(logActivity).toHaveBeenCalledWith(5, null, 'invoice_overdue', 'Invoice INV-2026-0010 is overdue');
    expect(Task.create).toHaveBeenCalledWith(expect.objectContaining({
      rule_key: 'chase_payment:invoice:12',
      title: 'Payment overdue — INV-2026-0010 (Fiona Whitmore)',
      entity_type: 'invoice',
      entity_id: 12,
    }));
    expect(notifyOffice).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'invoice_overdue',
      entity_id: 12,
    }), { dedupe: true });
  });
});
