jest.mock('../models', () => ({
  Followup: { update: jest.fn(), create: jest.fn(), findAll: jest.fn(), count: jest.fn(), findByPk: jest.fn(), findOne: jest.fn() },
  Quote: { findAll: jest.fn() },
  Customer: { findByPk: jest.fn() },
  Message: { findOne: jest.fn() },
}));
jest.mock('../db', () => ({
  getSetting: jest.fn(),
  money: (n) => `£${n}`,
  plain: (row) => row,
}));
jest.mock('../services/pipeline', () => ({
  logActivity: jest.fn(),
  setStage: jest.fn(),
  resolveLeadForCustomer: jest.fn(async () => null),
}));
jest.mock('../services/messenger', () => ({
  sendToCustomer: jest.fn(),
}));
jest.mock('../services/taskEngine', () => ({
  ensureQuoteFollowupTask: jest.fn(async () => 44),
  resolveQuoteFollowupTask: jest.fn(),
}));

const { Op } = require('sequelize');
const { Followup, Quote, Message, Customer } = require('../models');
const { getSetting } = require('../db');
const { sendToCustomer } = require('../services/messenger');
const { ensureQuoteFollowupTask, resolveQuoteFollowupTask } = require('../services/taskEngine');
const {
  scheduleForQuote,
  stopFollowupsAfterInbound,
  processDue,
  cancelPendingForQuote,
  updateFollowupSchedule,
  cancelFollowup,
} = require('../services/followups');

describe('quote follow-up engine (requirement 12.1)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Followup.update.mockResolvedValue([0]);
    Followup.create.mockResolvedValue({});
    Followup.count.mockResolvedValue(0);
    Message.findOne.mockResolvedValue(null);
  });

  test('schedules delays from quote sent_at and snapshots each step body', async () => {
    getSetting.mockImplementation(async (key) => {
      if (key === 'followups') {
        return {
          enabled: true,
          steps: [
            { delay_days: 2, channel: 'whatsapp', body: 'Hi {name} — {ref}' },
            { delay_days: 5, channel: 'email', body: 'Email {title}' },
          ],
        };
      }
      if (key === 'templates') return {};
      return null;
    });
    const sentAt = new Date('2026-09-20T10:00:00.000Z');
    await scheduleForQuote({ id: 4, customer_id: 9, ref: 'Q-2026-0004', sent_at: sentAt });
    expect(Followup.update).not.toHaveBeenCalled();
    expect(Followup.create).toHaveBeenNthCalledWith(1, expect.objectContaining({
      quote_id: 4,
      step: 1,
      channel: 'whatsapp',
      body_template: 'Hi {name} — {ref}',
    }));
    expect(Followup.create.mock.calls[0][0].scheduled_at.getTime())
      .toBe(sentAt.getTime() + 2 * 24 * 3600 * 1000);
    expect(Followup.create.mock.calls[1][0].scheduled_at.getTime())
      .toBe(sentAt.getTime() + 5 * 24 * 3600 * 1000);
    expect(ensureQuoteFollowupTask).toHaveBeenCalledWith(
      expect.objectContaining({ id: 4, ref: 'Q-2026-0004' }),
      Followup.create.mock.calls[0][0].scheduled_at
    );
  });

  test('does not cancel and recreate follow-ups when the quote is resent', async () => {
    Followup.count.mockResolvedValue(3);
    getSetting.mockResolvedValue({ enabled: true, steps: [{ delay_days: 2, channel: 'email', body: 'Hi' }] });
    const n = await scheduleForQuote({ id: 4, customer_id: 9, ref: 'Q-1', sent_at: new Date() });
    expect(n).toBe(0);
    expect(Followup.update).not.toHaveBeenCalled();
    expect(Followup.create).not.toHaveBeenCalled();
    expect(ensureQuoteFollowupTask).not.toHaveBeenCalled();
  });

  test('does not schedule when the sequence is disabled', async () => {
    getSetting.mockResolvedValue({ enabled: false, steps: [{ delay_days: 1, channel: 'email', body: 'Hi' }] });
    await scheduleForQuote({ id: 4, customer_id: 9, ref: 'Q-1' });
    expect(Followup.create).not.toHaveBeenCalled();
    expect(ensureQuoteFollowupTask).not.toHaveBeenCalled();
  });

  test('skips Company steps with no body and does not invent Templates copy', async () => {
    getSetting.mockImplementation(async (key) => {
      if (key === 'followups') {
        return {
          enabled: true,
          steps: [
            { delay_days: 2, channel: 'whatsapp', body: '' },
            { delay_days: 5, channel: 'email', body: 'Email {title}' },
          ],
        };
      }
      return { quote_followup_1: 'OLD LEGACY' };
    });
    const n = await scheduleForQuote({ id: 4, customer_id: 9, ref: 'Q-1', sent_at: new Date() });
    expect(n).toBe(1);
    expect(Followup.create).toHaveBeenCalledTimes(1);
    expect(Followup.create).toHaveBeenCalledWith(expect.objectContaining({
      step: 1,
      channel: 'email',
      body_template: 'Email {title}',
    }));
  });

  test('does not schedule when Company follow-ups have no usable steps', async () => {
    getSetting.mockResolvedValue({
      enabled: true,
      steps: [{ delay_days: 2, channel: 'whatsapp', body: '  ' }],
    });
    const n = await scheduleForQuote({ id: 4, customer_id: 9, ref: 'Q-1' });
    expect(n).toBe(0);
    expect(Followup.create).not.toHaveBeenCalled();
    expect(ensureQuoteFollowupTask).not.toHaveBeenCalled();
  });

  test('inbound halt only stops quotes already sent before the reply', async () => {
    Quote.findAll.mockResolvedValue([{ id: 4, ref: 'Q-OLD' }]);
    Followup.update.mockResolvedValue([2]);
    const inboundAt = new Date('2026-09-25T12:00:00.000Z');
    const n = await stopFollowupsAfterInbound(9, inboundAt);
    expect(n).toBe(2);
    expect(Quote.findAll.mock.calls[0][0].where.customer_id).toBe(9);
    expect(Quote.findAll.mock.calls[0][0].where.sent_at[Op.lt]).toEqual(inboundAt);
    expect(Followup.update).toHaveBeenCalledWith(
      { status: 'stopped', stop_reason: 'customer replied' },
      { where: { quote_id: 4, status: 'pending' } }
    );
    expect(resolveQuoteFollowupTask).toHaveBeenCalledWith(4);
  });

  test('leaves later quotes alone when no sent quote predates the inbound', async () => {
    Quote.findAll.mockResolvedValue([]);
    const n = await stopFollowupsAfterInbound(9, new Date());
    expect(n).toBe(0);
    expect(Followup.update).not.toHaveBeenCalled();
    expect(resolveQuoteFollowupTask).not.toHaveBeenCalled();
  });

  test('processDue sends the snapshotted step body, not a hardcoded 1/2 template', async () => {
    const row = {
      quote_id: 4,
      customer_id: 9,
      step: 3,
      channel: 'email',
      body_template: 'Ping {name} about {ref}',
      Quote: {
        id: 4, ref: 'Q-4', title: 'Felt overlay', total: 1200, status: 'sent',
        sent_at: new Date('2026-09-01T00:00:00Z'),
      },
      Customer: { name: 'Dave Whitfield' },
      save: jest.fn(),
    };
    Followup.findAll.mockResolvedValue([row]);
    getSetting.mockImplementation(async (key) => {
      if (key === 'followups') return { enabled: true, email_subject: 'Re {ref}', steps: [] };
      return { quote_followup_1: 'OLD', followup_email_subject: 'Legacy {ref}' };
    });
    sendToCustomer.mockResolvedValue({ messageId: 1 });
    Customer.findByPk.mockResolvedValue({ stage: 'QUOTED' });

    const sent = await processDue();
    expect(sent).toBe(1);
    expect(sendToCustomer).toHaveBeenCalledWith(9, 'email', 'Ping Dave about Q-4', expect.objectContaining({
      subject: 'Re Q-4',
    }));
    expect(row.status).toBe('sent');
    expect(row.message).toBe('Ping Dave about Q-4');
  });

  test('processDue cancels a due step that has no Company body', async () => {
    const row = {
      quote_id: 4,
      customer_id: 9,
      step: 1,
      channel: 'whatsapp',
      body_template: '',
      Quote: {
        id: 4, ref: 'Q-4', title: 'Felt overlay', total: 1200, status: 'sent',
        sent_at: new Date('2026-09-01T00:00:00Z'),
      },
      Customer: { name: 'Dave Whitfield' },
      save: jest.fn(),
    };
    Followup.findAll.mockResolvedValue([row]);
    getSetting.mockImplementation(async (key) => {
      if (key === 'followups') return { enabled: true, steps: [{ delay_days: 2, channel: 'whatsapp', body: '' }] };
      return { quote_followup_1: 'OLD LEGACY {ref}' };
    });

    const sent = await processDue();
    expect(sent).toBe(0);
    expect(sendToCustomer).not.toHaveBeenCalled();
    expect(row.status).toBe('cancelled');
    expect(row.stop_reason).toBe('no Company follow-up body');
  });

  test('processDue stops every remaining pending step for that quote after a reply', async () => {
    const row = {
      quote_id: 4,
      customer_id: 9,
      step: 1,
      channel: 'whatsapp',
      body_template: 'Hi',
      Quote: { id: 4, ref: 'Q-4', title: 'Roof', total: 1, status: 'sent', sent_at: new Date('2026-09-01') },
      Customer: { name: 'Dave' },
      save: jest.fn(),
    };
    Followup.findAll.mockResolvedValue([row]);
    Message.findOne.mockResolvedValue({ id: 99 });
    Followup.update.mockResolvedValue([2]);

    const sent = await processDue();
    expect(sent).toBe(0);
    expect(sendToCustomer).not.toHaveBeenCalled();
    expect(Followup.update).toHaveBeenCalledWith(
      { status: 'stopped', stop_reason: 'customer replied' },
      { where: { quote_id: 4, status: 'pending' } }
    );
    expect(resolveQuoteFollowupTask).toHaveBeenCalledWith(4);
  });

  test('cancelPendingForQuote marks only that quote pending', async () => {
    Followup.update.mockResolvedValue([3]);
    const n = await cancelPendingForQuote(4, 'cancelled by office');
    expect(n).toBe(3);
    expect(Followup.update).toHaveBeenCalledWith(
      { status: 'cancelled', stop_reason: 'cancelled by office' },
      { where: { quote_id: 4, status: 'pending' } }
    );
  });

  test('moves a pending follow-up and updates the task due date', async () => {
    const row = {
      id: 8,
      quote_id: 4,
      step: 2,
      status: 'pending',
      save: jest.fn(),
    };
    Followup.findByPk.mockResolvedValue(row);
    Followup.findOne.mockResolvedValue({ scheduled_at: new Date('2026-10-12T09:00:00.000Z') });
    const at = '2026-10-12T09:00:00.000Z';
    const result = await updateFollowupSchedule({
      quoteId: 4,
      followupId: 8,
      scheduledAt: at,
      userId: 1,
      quote: { id: 4, ref: 'Q-4', customer_id: 9 },
    });
    expect(result.scheduled_at.toISOString()).toBe(at);
    expect(row.save).toHaveBeenCalled();
    expect(ensureQuoteFollowupTask).toHaveBeenCalledWith(
      expect.objectContaining({ id: 4 }),
      new Date(at),
    );
  });

  test('rejects a date change on a sent follow-up', async () => {
    Followup.findByPk.mockResolvedValue({ id: 8, quote_id: 4, status: 'sent' });
    await expect(updateFollowupSchedule({
      quoteId: 4,
      followupId: 8,
      scheduledAt: '2026-10-12T09:00:00.000Z',
      quote: { id: 4, ref: 'Q-4', customer_id: 9 },
    })).rejects.toMatchObject({ status: 400 });
    expect(ensureQuoteFollowupTask).not.toHaveBeenCalled();
  });

  test('cancels one pending step and keeps later ones', async () => {
    const row = { id: 8, quote_id: 4, step: 1, status: 'pending', save: jest.fn() };
    Followup.findByPk.mockResolvedValue(row);
    Followup.findOne.mockResolvedValue({ scheduled_at: new Date('2026-10-15T09:00:00.000Z') });
    await cancelFollowup({
      quoteId: 4,
      followupId: 8,
      userId: 1,
      quote: { id: 4, ref: 'Q-4', customer_id: 9 },
    });
    expect(row.status).toBe('cancelled');
    expect(row.save).toHaveBeenCalled();
    expect(ensureQuoteFollowupTask).toHaveBeenCalled();
    expect(resolveQuoteFollowupTask).not.toHaveBeenCalled();
  });

  test('resolves the follow-up task when the last pending step is cancelled', async () => {
    const row = { id: 8, quote_id: 4, step: 2, status: 'pending', save: jest.fn() };
    Followup.findByPk.mockResolvedValue(row);
    Followup.findOne.mockResolvedValue(null);
    await cancelFollowup({
      quoteId: 4,
      followupId: 8,
      quote: { id: 4, ref: 'Q-4', customer_id: 9 },
    });
    expect(resolveQuoteFollowupTask).toHaveBeenCalledWith(4);
    expect(ensureQuoteFollowupTask).not.toHaveBeenCalled();
  });
});
