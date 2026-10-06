jest.mock('../models', () => ({
  Customer: { findByPk: jest.fn(), create: jest.fn(), update: jest.fn() },
  Lead: { findOne: jest.fn(), create: jest.fn() },
  Message: { create: jest.fn() },
  CustomerPhone: { findOne: jest.fn() },
  CustomerEmail: { findOne: jest.fn() },
}));
jest.mock('../services/pipeline', () => ({ logActivity: jest.fn() }));
jest.mock('../services/followups', () => ({ stopFollowupsAfterInbound: jest.fn() }));
jest.mock('../customerContacts', () => ({
  listContacts: jest.fn(),
  parseContactInput: jest.fn(),
  saveContactLists: jest.fn(),
  addPhone: jest.fn(),
  addEmail: jest.fn(),
  addSite: jest.fn(),
  resolveLeadContactsForCreate: jest.fn(async () => ({
    site_id: null, phone_id: null, email_id: null, site: null, phone: null, email: null,
  })),
}));
jest.mock('../notifications', () => ({
  safeNotify: jest.fn(async (fn) => fn()),
  notifyOffice: jest.fn(),
}));
jest.mock('../db', () => ({
  nextRef: jest.fn(async () => 'L-0041'),
}));

const { Customer, Lead, Message } = require('../models');
const { ingestInbound } = require('../services/messenger');

describe('ingestInbound leads (requirement 3.3)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Customer.findByPk.mockResolvedValue({ id: 9 });
    Customer.update.mockResolvedValue([1]);
    Message.create.mockResolvedValue({ id: 70 });
    Lead.create.mockResolvedValue({ id: 41 });
  });

  test('webhooks reuse an open NEW lead on an existing customer', async () => {
    Lead.findOne.mockResolvedValue({ id: 12, status: 'NEW' });
    const result = await ingestInbound({
      source: 'whatsapp',
      customerId: 9,
      name: 'Dave Whitfield',
      body: 'Another message',
    });
    expect(Lead.findOne).toHaveBeenCalledWith({ where: { customer_id: 9, status: 'NEW' } });
    expect(Lead.create).not.toHaveBeenCalled();
    expect(result.leadId).toBe(12);
  });

  test('office log enquiry always creates a new NEW lead on an existing customer', async () => {
    Lead.findOne.mockResolvedValue({ id: 12, status: 'NEW' });
    const result = await ingestInbound({
      source: 'phone',
      customerId: 9,
      name: 'Dave Whitfield',
      body: 'Called about guttering',
      forceNewLead: true,
    });
    expect(Lead.findOne).not.toHaveBeenCalled();
    expect(Lead.create).toHaveBeenCalledWith(expect.objectContaining({
      customer_id: 9,
      ref: 'L-0041',
      source: 'phone',
      message: 'Called about guttering',
      status: 'NEW',
      next_action: 'Review & respond',
      stage: 'ENQUIRY',
      site_id: null,
      phone_id: null,
      email_id: null,
    }));
    expect(result.leadId).toBe(41);
  });
});
