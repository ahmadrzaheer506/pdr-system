jest.mock('../models', () => ({
  Customer: { findByPk: jest.fn(), findAll: jest.fn(), update: jest.fn() },
  Lead: { findOne: jest.fn(), findAll: jest.fn(), update: jest.fn() },
  Activity: { create: jest.fn() },
  StageHistory: { create: jest.fn() },
}));

const { Customer, Lead, Activity, StageHistory } = require('../models');
const { STAGES, STAGE_LABELS, setStage, sumPipelineBoardTotals } = require('../services/pipeline');

describe('pipeline stages (requirement 4.1)', () => {
  test('keeps all current columns including Paid as the last stage', () => {
    expect(STAGES).toEqual([
      'ENQUIRY',
      'SITE_VISIT_BOOKED',
      'QUOTE_PENDING',
      'QUOTED',
      'FOLLOW_UP',
      'WON',
      'LOST',
      'SCHEDULED',
      'IN_PROGRESS',
      'COMPLETED',
      'INVOICED',
      'PAID',
    ]);
    expect(STAGES).toHaveLength(12);
    expect(STAGE_LABELS.PAID).toBe('Paid');
    expect(STAGE_LABELS.INVOICED).toBe('Invoiced');
  });
});

describe('sumPipelineBoardTotals (requirement 4.5)', () => {
  test('sums sent/draft value on Enquiry → Follow-up only', () => {
    const totals = sumPipelineBoardTotals({
      ENQUIRY: [{ pipeline_value: 1000 }],
      QUOTED: [{ pipeline_value: '500.5' }],
      FOLLOW_UP: [{ pipeline_value: 200 }],
      PAID: [{ pipeline_value: 8000 }],
      LOST: [{ pipeline_value: 400 }],
      WON: [{ pipeline_value: 300 }],
    });
    expect(totals.board).toBe(1700.5);
    expect(totals.byStage.ENQUIRY).toBe(1000);
    expect(totals.byStage.QUOTED).toBe(500.5);
    expect(totals.byStage.FOLLOW_UP).toBe(200);
    expect(totals.byStage.PAID).toBeNull();
    expect(totals.byStage.LOST).toBeNull();
    expect(totals.byStage.WON).toBeNull();
  });
});

describe('setStage (requirement 4.2)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Lead.findAll.mockResolvedValue([]);
    Lead.update.mockResolvedValue([1]);
    StageHistory.create.mockResolvedValue({});
    Activity.create.mockResolvedValue({});
  });

  test('moves the enquiry, not every job on the customer, and writes stage_history', async () => {
    const customerSave = jest.fn();
    const leadSave = jest.fn();
    Customer.findByPk.mockResolvedValue({ id: 9, stage: 'WON', save: customerSave });
    Lead.findOne.mockResolvedValue({ id: 41, customer_id: 9, stage: 'ENQUIRY', save: leadSave });
    await setStage(9, 'PAID', 1, null, { leadId: 41 });
    expect(leadSave).toHaveBeenCalled();
    expect(customerSave).toHaveBeenCalled();
    expect(StageHistory.create).toHaveBeenCalledWith({
      customer_id: 9,
      lead_id: 41,
      from_stage: 'ENQUIRY',
      to_stage: 'PAID',
      user_id: 1,
    });
    expect(Activity.create).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'stage_change',
      detail: 'Stage: Enquiry → Paid',
    }));
  });

  test('same-column reorder does not write a history row', async () => {
    Customer.findByPk.mockResolvedValue({ id: 9, stage: 'ENQUIRY', save: jest.fn() });
    Lead.findOne.mockResolvedValue({ id: 9, customer_id: 9, stage: 'ENQUIRY', save: jest.fn() });
    Lead.findAll.mockResolvedValue([{ id: 2 }, { id: 3 }]);
    await setStage(9, 'ENQUIRY', 1, null, { beforeId: 3, leadId: 9 });
    expect(StageHistory.create).not.toHaveBeenCalled();
    expect(Activity.create).not.toHaveBeenCalled();
    expect(Lead.update).toHaveBeenCalledWith({ board_order: 0 }, { where: { id: 2 } });
    expect(Lead.update).toHaveBeenCalledWith({ board_order: 1 }, { where: { id: 9 } });
    expect(Lead.update).toHaveBeenCalledWith({ board_order: 2 }, { where: { id: 3 } });
  });

  test('two enquiries on the same customer keep independent stages', async () => {
    const customerSave = jest.fn();
    Customer.findByPk.mockResolvedValue({ id: 9, stage: 'ENQUIRY', save: customerSave });
    const first = { id: 40, customer_id: 9, stage: 'ENQUIRY', save: jest.fn() };
    const second = { id: 41, customer_id: 9, stage: 'ENQUIRY', save: jest.fn() };
    Lead.findOne.mockImplementation(async ({ where }) => {
      if (where.id === 40) return first;
      if (where.id === 41) return second;
      return null;
    });
    await setStage(9, 'LOST', 1, null, { leadId: 40 });
    expect(first.stage).toBe('LOST');
    expect(first.status).toBe('CLOSED');
    expect(first.save).toHaveBeenCalled();
    expect(second.stage).toBe('ENQUIRY');
    expect(second.save).not.toHaveBeenCalled();

    await setStage(9, 'WON', 1, null, { leadId: 41 });
    expect(second.stage).toBe('WON');
    expect(second.status).toBe('CONVERTED');
    expect(second.save).toHaveBeenCalled();
    expect(first.stage).toBe('LOST');
  });
});
