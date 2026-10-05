jest.mock('../models', () => ({
  Notification: { bulkCreate: jest.fn(), findOne: jest.fn() },
  User: { findAll: jest.fn() },
}));
jest.mock('../db', () => ({
  todayStr: () => '2026-09-26',
  plain: (row) => row,
}));
jest.mock('../integrations/email', () => ({
  send: jest.fn(async () => ({ simulated: true })),
}));

const { Notification, User } = require('../models');
const email = require('../integrations/email');
const {
  hrefFor, titleFor, createNotifications, notifyOffice, KIND_TITLES,
} = require('../notifications');

function staff(id, prefs) {
  return {
    id,
    email: `user${id}@example.com`,
    role: 'STAFF',
    name: `User ${id}`,
    notification_prefs: prefs,
  };
}

describe('notifications helper (requirement 13.1 / 13.2)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Notification.bulkCreate.mockResolvedValue([]);
    Notification.findOne.mockResolvedValue(null);
    User.findAll.mockResolvedValue([]);
  });

  test('titles exist for every critical kind', () => {
    expect(titleFor('new_enquiry')).toBe('New enquiry');
    expect(titleFor('holiday_approved')).toBe('Holiday approved');
    expect(Object.keys(KIND_TITLES).sort()).toEqual([
      'crew_added', 'crew_removed', 'holiday_approved', 'holiday_declined',
      'holiday_submitted', 'invoice_overdue', 'new_enquiry', 'quote_accepted',
      'task_reminder', 'visit_booked',
    ].sort());
  });

  test('hrefs open the related record for office and staff', () => {
    expect(hrefFor({ kind: 'crew_added', job_id: 8 }, 'STAFF')).toBe('/staff/jobs/8');
    expect(hrefFor({ kind: 'crew_added', job_id: 8 }, 'OFFICE')).toBe('/schedule');
    expect(hrefFor({ kind: 'new_enquiry' }, 'ADMIN')).toBe('/inbox');
    expect(hrefFor({ kind: 'quote_accepted', entity_type: 'customer', entity_id: 7 }, 'OFFICE')).toBe('/leads/7');
    expect(hrefFor({ kind: 'invoice_overdue' }, 'ADMIN')).toBe('/invoices');
    expect(hrefFor({ kind: 'task_reminder', entity_id: 24, work_date: '2026-09-26' }, 'OFFICE'))
      .toBe('/tasks?when=today&task=24');
    expect(hrefFor({ kind: 'task_reminder', entity_id: 24, work_date: '2026-09-26' }, 'STAFF'))
      .toBe('/staff/tasks?when=today&task=24');
    expect(hrefFor({ kind: 'holiday_submitted' }, 'OFFICE')).toBe('/holidays');
    expect(hrefFor({ kind: 'holiday_declined' }, 'STAFF')).toBe('/staff/holidays');
    expect(hrefFor({ kind: 'visit_booked', entity_type: 'appointment', entity_id: 50 }, 'STAFF'))
      .toBe('/staff/visits/50');
    expect(hrefFor({ kind: 'visit_booked', entity_type: 'customer', entity_id: 9 }, 'OFFICE'))
      .toBe('/leads/9');
  });

  test('notifies field staff of an assigned visit unless they turned it off', async () => {
    User.findAll.mockResolvedValue([
      staff(4, { in_app: {}, email: {} }),
    ]);
    await createNotifications([
      { user_id: 4, kind: 'visit_booked', message: 'You\'re assigned', entity_type: 'appointment', entity_id: 50 },
    ]);
    expect(Notification.bulkCreate).toHaveBeenCalledWith([
      expect.objectContaining({ user_id: 4, kind: 'visit_booked', entity_id: 50 }),
    ], expect.anything());
  });

  test('writes nothing and emails nobody until the user opts in', async () => {
    User.findAll.mockResolvedValue([
      staff(4, { in_app: {}, email: {} }),
      { id: 2, email: 'lisa@example.com', role: 'OFFICE', name: 'Lisa', notification_prefs: { in_app: {}, email: {} } },
    ]);
    const rows = await createNotifications([
      { user_id: 4, kind: 'crew_added', message: 'Assigned', job_id: 8 },
      { user_id: 2, kind: 'crew_added', message: 'Assigned', job_id: 8 },
    ]);
    expect(rows).toEqual([]);
    expect(Notification.bulkCreate).not.toHaveBeenCalled();
    expect(email.send).not.toHaveBeenCalled();
  });

  test('emails field staff on crew add only when email is on', async () => {
    User.findAll.mockResolvedValue([
      staff(4, { in_app: {}, email: { crew_added: true } }),
      { id: 2, email: 'lisa@example.com', role: 'OFFICE', name: 'Lisa', notification_prefs: { in_app: { crew_added: true }, email: {} } },
    ]);
    await createNotifications([
      { user_id: 4, kind: 'crew_added', message: 'Assigned', job_id: 8 },
      { user_id: 2, kind: 'crew_added', message: 'Assigned', job_id: 8 },
    ]);
    expect(email.send).toHaveBeenCalledTimes(1);
    expect(email.send).toHaveBeenCalledWith('user4@example.com', 'Assigned to a job', 'Assigned');
    expect(Notification.bulkCreate).toHaveBeenCalledWith([
      expect.objectContaining({ user_id: 2, kind: 'crew_added' }),
    ], expect.anything());
  });

  test('does not email office events even when in-app is on', async () => {
    User.findAll.mockResolvedValue([
      { id: 1, email: 'paul@example.com', role: 'ADMIN', name: 'Paul', notification_prefs: { in_app: { quote_accepted: true }, email: {} } },
    ]);
    await createNotifications([
      { user_id: 1, kind: 'quote_accepted', message: 'Helen accepted Q-1', entity_type: 'customer', entity_id: 7 },
    ]);
    expect(email.send).not.toHaveBeenCalled();
    expect(Notification.bulkCreate).toHaveBeenCalled();
  });

  test('dedupes by kind + entity for the same user', async () => {
    User.findAll.mockResolvedValue([
      { id: 1, role: 'ADMIN', notification_prefs: { in_app: { invoice_overdue: true }, email: {} } },
    ]);
    Notification.findOne.mockResolvedValue({ id: 9 });
    const rows = await createNotifications([
      { user_id: 1, kind: 'invoice_overdue', message: 'INV overdue', entity_type: 'invoice', entity_id: 12 },
    ], { dedupe: true });
    expect(rows).toEqual([]);
    expect(Notification.bulkCreate).not.toHaveBeenCalled();
  });

  test('notifyOffice writes only to office users who opted in, excluding the actor', async () => {
    User.findAll.mockResolvedValue([
      { id: 1, role: 'ADMIN', notification_prefs: { in_app: { new_enquiry: true }, email: {} } },
      { id: 2, role: 'OFFICE', notification_prefs: { in_app: { new_enquiry: true }, email: {} } },
    ]);
    await notifyOffice({
      kind: 'new_enquiry',
      message: 'Dave (whatsapp): roof quote',
      entity_type: 'lead',
      entity_id: 40,
    }, { excludeId: 1 });
    expect(Notification.bulkCreate).toHaveBeenCalledWith([
      expect.objectContaining({ user_id: 2, kind: 'new_enquiry', entity_id: 40 }),
    ], expect.anything());
  });
});
