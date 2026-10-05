jest.mock('../models', () => ({
  Task: { findOne: jest.fn(), create: jest.fn(), update: jest.fn() },
  Appointment: { findAll: jest.fn(), update: jest.fn() },
  Customer: { findByPk: jest.fn() },
  Job: { findAll: jest.fn() },
  Invoice: { findAll: jest.fn() },
  Quote: { findAll: jest.fn(), count: jest.fn() },
  Lead: { findOne: jest.fn(), findAll: jest.fn(), update: jest.fn() },
  Activity: { create: jest.fn() },
  StageHistory: { create: jest.fn() },
}));

jest.mock('../db', () => ({
  todayStr: () => '2026-09-23',
  plain: (row) => row,
}));

const { Appointment, Task, Quote, Lead } = require('../models');
const { scanAppointments, completeVisit } = require('../services/taskEngine');

function bookedVisit({ id = 7, customerId = 9, stage = 'SITE_VISIT_BOOKED', name = 'Dave Whitfield' } = {}) {
  return {
    id,
    customer_id: customerId,
    title: `Site visit — ${name}`,
    status: 'booked',
    stage_advanced: false,
    Customer: { id: customerId, name, stage },
    save: jest.fn(),
  };
}

describe('scanAppointments', () => {
  beforeEach(() => jest.clearAllMocks());

  test('does not auto-complete a visit when its end time has passed', async () => {
    const setStage = jest.fn();
    const n = await scanAppointments(setStage);
    expect(n).toBe(0);
    expect(Appointment.findAll).not.toHaveBeenCalled();
    expect(setStage).not.toHaveBeenCalled();
    expect(Task.create).not.toHaveBeenCalled();
  });
});

describe('completeVisit', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Task.findOne.mockResolvedValue(null);
    Task.create.mockResolvedValue({ id: 44 });
    Quote.count.mockResolvedValue(0);
    Lead.findOne.mockResolvedValue(null);
  });

  test('when ticked with no quote, moves to Quote pending and opens a produce-quote task', async () => {
    const setStage = jest.fn();
    const visit = bookedVisit();
    const result = await completeVisit(visit, setStage, 3);
    expect(result).toEqual({ already: false, hasQuote: false, taskId: 44 });
    expect(visit.status).toBe('done');
    expect(visit.stage_advanced).toBe(true);
    expect(visit.save).toHaveBeenCalled();
    expect(setStage).toHaveBeenCalledWith(9, 'QUOTE_PENDING', 3, 'Site visit completed — quote needed', { leadId: null });
    expect(Task.create).toHaveBeenCalledWith(expect.objectContaining({
      rule_key: 'produce_quote:customer:9',
      title: 'Produce quote for Dave Whitfield',
      entity_type: 'customer',
      entity_id: 9,
    }));
  });

  test('stores optional completion remarks on the visit', async () => {
    const visit = bookedVisit();
    await completeVisit(visit, jest.fn(), 3, 'Valley flashing is sound');
    expect(visit.complete_note).toBe('Valley flashing is sound');
    expect(visit.status).toBe('done');
    expect(visit.save).toHaveBeenCalled();
  });

  test('does not change stage when the customer is already past Site visit booked', async () => {
    const setStage = jest.fn();
    await completeVisit(bookedVisit({ stage: 'QUOTED' }), setStage, 3);
    expect(setStage).not.toHaveBeenCalled();
    expect(Task.create).toHaveBeenCalled();
  });

  test('when ticked and a quote already exists, moves to Quoted and does not create a produce-quote task', async () => {
    const setStage = jest.fn();
    Quote.count.mockResolvedValue(1);
    const visit = bookedVisit();
    const result = await completeVisit(visit, setStage, 3);
    expect(result).toEqual({ already: false, hasQuote: true, taskId: null });
    expect(visit.status).toBe('done');
    expect(setStage).toHaveBeenCalledWith(9, 'QUOTED', 3, 'Site visit completed — quote already on the lead', { leadId: null });
    expect(Task.create).not.toHaveBeenCalled();
  });

  test('leaves an already completed visit unchanged', async () => {
    const setStage = jest.fn();
    const result = await completeVisit({ ...bookedVisit(), status: 'done' }, setStage, 3);
    expect(result).toEqual({ already: true, hasQuote: null, taskId: null });
    expect(setStage).not.toHaveBeenCalled();
    expect(Task.create).not.toHaveBeenCalled();
  });
});
