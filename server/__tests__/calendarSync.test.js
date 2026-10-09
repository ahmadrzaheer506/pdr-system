jest.mock('../integrations/gcal', () => ({
  isConfigured: jest.fn(() => true),
  isConnected: jest.fn(async () => true),
  createEvent: jest.fn(async ({ userId, title }) => ({ eventId: `evt-${userId}`, simulated: false, title })),
  updateEvent: jest.fn(async () => ({ simulated: false })),
  cancelEvent: jest.fn(async () => ({ simulated: false })),
  calFetch: jest.fn(),
  getEvent: jest.fn(),
}));

jest.mock('../models', () => ({
  User: { findAll: jest.fn(), findByPk: jest.fn() },
  Appointment: { findByPk: jest.fn(), findAll: jest.fn() },
  AppointmentAssignee: { findAll: jest.fn() },
  Job: { findByPk: jest.fn(), findAll: jest.fn() },
  JobDayAssignment: { findAll: jest.fn() },
  HolidayRequest: { findByPk: jest.fn(), findAll: jest.fn() },
  Task: { findByPk: jest.fn(), findAll: jest.fn() },
  TaskAssignee: { findAll: jest.fn() },
  CalendarSyncLink: { findOne: jest.fn(), findAll: jest.fn(), create: jest.fn() },
  OauthToken: { findAll: jest.fn() },
  Customer: { findByPk: jest.fn() },
  Lead: { findByPk: jest.fn() },
  Quote: { findByPk: jest.fn() },
}));

const gcal = require('../integrations/gcal');
const {
  User, Appointment, AppointmentAssignee, Job, JobDayAssignment,
  HolidayRequest, Task, TaskAssignee, CalendarSyncLink, OauthToken, Customer,
  Lead, Quote,
} = require('../models');
const calendarSync = require('../calendarSync');

const PAUL = 1;
const LISA = 2;
const JAMIE = 9;

describe('calendarSync (requirement 16.3)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    OauthToken.findAll.mockResolvedValue([{ user_id: PAUL }, { user_id: JAMIE }]);
    User.findAll.mockResolvedValue([{ id: PAUL }, { id: LISA }]);
    AppointmentAssignee.findAll.mockResolvedValue([{ user_id: JAMIE }]);
    JobDayAssignment.findAll.mockResolvedValue([{ user_id: JAMIE }]);
    TaskAssignee.findAll.mockResolvedValue([]);
    CalendarSyncLink.findAll.mockResolvedValue([]);
    CalendarSyncLink.findOne.mockResolvedValue(null);
    CalendarSyncLink.create.mockImplementation(async (row) => ({ ...row, destroy: jest.fn() }));
    Customer.findByPk.mockResolvedValue({ name: 'Dave Whitfield' });
    Lead.findByPk.mockResolvedValue({ ref: 'L-0042' });
    Quote.findByPk.mockResolvedValue(null);
    User.findByPk.mockResolvedValue({ name: 'Lisa Grant' });
    gcal.isConnected.mockResolvedValue(true);
    gcal.isConfigured.mockReturnValue(true);
  });

  test('skips Google when the user is not connected', async () => {
    OauthToken.findAll.mockResolvedValue([]);
    Appointment.findByPk.mockResolvedValue({
      id: 50, title: 'Site visit', start: new Date(), end: new Date(), status: 'booked',
      created_by: LISA, customer_id: 9, address: '14 Elm', notes: null, gcal_status: 'not_synced',
      update: jest.fn(),
    });
    await calendarSync.syncAppointment(50);
    expect(gcal.createEvent).not.toHaveBeenCalled();
  });

  test('pushes a visit onto admin/office and assigned staff calendars', async () => {
    Appointment.findByPk.mockResolvedValue({
      id: 50, title: 'Site visit — Dave', start: new Date('2026-10-08T09:00:00Z'),
      end: new Date('2026-10-08T10:00:00Z'), status: 'booked', created_by: LISA,
      customer_id: 9, lead_id: 12, visit_type: 'site_visit', address: '14 Elm', notes: null,
      gcal_status: 'not_synced',
      update: jest.fn(),
    });
    await calendarSync.syncAppointment(50);
    const userIds = gcal.createEvent.mock.calls.map((c) => c[0].userId).sort();
    expect(userIds).toEqual([PAUL, JAMIE]);
    expect(userIds).not.toContain(LISA);
    const payload = gcal.createEvent.mock.calls[0][0];
    expect(payload.colorId).toBe('11');
    expect(payload.allDay).toBe(true);
    expect(payload.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(payload.title).toMatch(/Site visit/);
    expect(payload.notes).toMatch(/Synced from Paul Douglas Roofing/);
    expect(payload.notes).toMatch(/Reference: L-0042/);
    expect(payload.notes).toMatch(/Customer: Dave Whitfield/);
  });

  test('drops Google events when a visit is cancelled', async () => {
    const destroy = jest.fn();
    Appointment.findByPk.mockResolvedValue({ id: 50, status: 'cancelled' });
    CalendarSyncLink.findAll.mockResolvedValue([
      { user_id: PAUL, gcal_event_id: 'evt-1', destroy },
    ]);
    await calendarSync.syncAppointment(50);
    expect(gcal.cancelEvent).toHaveBeenCalledWith('evt-1', PAUL);
    expect(destroy).toHaveBeenCalled();
  });

  test('does not push a job with no start date', async () => {
    Job.findByPk.mockResolvedValue({ id: 3, title: 'Re-roof', start_date: null });
    await calendarSync.syncJob(3);
    expect(gcal.createEvent).not.toHaveBeenCalled();
  });

  test('jobs are all-day chips with the job clock in the title', async () => {
    Job.findByPk.mockResolvedValue({
      id: 9, title: 'Full re-roof — semi-detached', start_date: '2026-10-07',
      end_date: '2026-10-08', start_time: '08:00', end_time: '16:30',
      status: 'IN_PROGRESS', customer_id: 4, quote_id: null, address: '19 Hawthorn Drive',
      notes: null, description: null,
    });
    await calendarSync.syncJob(9);
    expect(gcal.createEvent).toHaveBeenCalledWith(expect.objectContaining({
      allDay: true,
      startDate: '2026-10-07',
      endDateExclusive: '2026-10-09',
      colorId: '9',
      title: '8:00 AM – 4:30 PM · Job · Full re-roof — semi-detached',
    }));
  });

  test('field staff only receive holidays they requested', async () => {
    OauthToken.findAll.mockResolvedValue([{ user_id: JAMIE }]);
    User.findAll.mockResolvedValue([{ id: PAUL }]);
    HolidayRequest.findByPk.mockResolvedValue({
      id: 7, user_id: JAMIE, start_date: '2026-10-20', end_date: '2026-10-21',
      status: 'approved', reason: 'Break',
    });
    User.findByPk.mockResolvedValue({ name: 'Jamie Fisher' });
    await calendarSync.syncHoliday(7);
    expect(gcal.createEvent).toHaveBeenCalledWith(expect.objectContaining({
      userId: JAMIE,
      allDay: true,
      title: 'Holiday · Jamie Fisher',
      colorId: '6',
    }));
  });

  test('open tasks with a due date are pushed; done tasks are removed', async () => {
    Task.findByPk.mockResolvedValue({
      id: 11, title: 'Call Dave', due_date: '2026-10-09', status: 'open', assignee_id: JAMIE, detail: null,
    });
    TaskAssignee.findAll.mockResolvedValue([{ user_id: JAMIE }]);
    await calendarSync.syncTask(11);
    expect(gcal.createEvent.mock.calls.some((c) => c[0].userId === JAMIE)).toBe(true);

    jest.clearAllMocks();
    OauthToken.findAll.mockResolvedValue([{ user_id: PAUL }]);
    const destroy = jest.fn();
    Task.findByPk.mockResolvedValue({ id: 11, status: 'done' });
    CalendarSyncLink.findAll.mockResolvedValue([{ user_id: PAUL, gcal_event_id: 'evt-t', destroy }]);
    await calendarSync.syncTask(11);
    expect(gcal.cancelEvent).toHaveBeenCalledWith('evt-t', PAUL);
  });
});
