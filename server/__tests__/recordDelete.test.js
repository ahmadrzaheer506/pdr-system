jest.mock('../models', () => {
  const stub = () => ({
    count: jest.fn(),
    findAll: jest.fn(),
    update: jest.fn(),
    destroy: jest.fn(),
  });
  return {
    sequelize: { transaction: jest.fn(async (fn) => fn({})) },
    Customer: stub(),
    Lead: stub(),
    Message: stub(),
    Quote: stub(),
    Job: stub(),
    Invoice: stub(),
    Appointment: stub(),
    AppointmentAssignee: stub(),
    Task: stub(),
    TaskAssignee: stub(),
    JobAssignment: stub(),
    JobDayAssignment: stub(),
    JobMessage: stub(),
    TeamMessage: stub(),
    Activity: stub(),
    StageHistory: stub(),
    CalendarSyncLink: stub(),
    Notification: stub(),
    HolidayRequest: stub(),
    Timesheet: stub(),
    InvoicePayment: stub(),
    CustomerNote: stub(),
    CustomerFile: stub(),
    User: stub(),
    AiProposal: stub(),
  };
});

const {
  customerDeleteWarning,
  staffDeleteWarning,
  customerDeleteImpact,
  staffDeleteImpact,
  destroyCustomer,
  destroyStaffUser,
} = require('../recordDelete');
const {
  Lead, Message, Quote, Job, Invoice, Appointment, CustomerNote, CustomerFile,
  Customer, Task, TaskAssignee, AppointmentAssignee, JobAssignment, JobDayAssignment,
  User,
} = require('../models');

describe('delete warning copy', () => {
  test('customer warning names leads and related entities', () => {
    const text = customerDeleteWarning({
      leads: 2, messages: 3, quotes: 1, jobs: 0, invoices: 0, appointments: 0, notes: 0, files: 0,
    });
    expect(text).toMatch(/This customer has 2 leads/);
    expect(text).toMatch(/3 messages/);
    expect(text).toMatch(/1 quote/);
    expect(text).toMatch(/cannot be undone/i);
  });

  test('staff warning lists each pending kind that applies', () => {
    expect(staffDeleteWarning({ pending_tasks: 2, pending_visits: 0, pending_jobs: 0 }))
      .toMatch(/2 pending tasks/);
    expect(staffDeleteWarning({ pending_tasks: 0, pending_visits: 1, pending_jobs: 0 }))
      .toMatch(/1 pending site visit/);
    const both = staffDeleteWarning({ pending_tasks: 2, pending_visits: 1, pending_jobs: 3 });
    expect(both).toMatch(/2 pending tasks/);
    expect(both).toMatch(/1 pending site visit/);
    expect(both).toMatch(/3 jobs still on the schedule/);
  });

  test('customer warning is a simple confirm when nothing is linked', () => {
    expect(customerDeleteWarning({
      leads: 0, messages: 0, quotes: 0, jobs: 0, invoices: 0, appointments: 0, notes: 0, files: 0,
    })).toBe('Are you sure you want to delete this customer?');
  });

  test('staff warning when nothing is pending', () => {
    expect(staffDeleteWarning({ pending_tasks: 0, pending_visits: 0, pending_jobs: 0 }))
      .toBe('Are you sure you want to delete this user?');
  });
});

describe('customerDeleteImpact', () => {
  beforeEach(() => jest.clearAllMocks());

  test('counts related rows', async () => {
    Lead.count.mockResolvedValue(2);
    Message.count.mockResolvedValue(4);
    Quote.count.mockResolvedValue(1);
    Job.count.mockResolvedValue(0);
    Invoice.count.mockResolvedValue(0);
    Appointment.count.mockResolvedValue(1);
    CustomerNote.count.mockResolvedValue(0);
    CustomerFile.count.mockResolvedValue(0);
    const impact = await customerDeleteImpact(9);
    expect(impact.leads).toBe(2);
    expect(impact.messages).toBe(4);
    expect(impact.warning).toMatch(/2 leads/);
  });
});

describe('staffDeleteImpact', () => {
  beforeEach(() => jest.clearAllMocks());

  test('counts open tasks, booked visits, and live jobs', async () => {
    TaskAssignee.findAll.mockResolvedValue([{ task_id: 11 }]);
    Task.findAll.mockResolvedValue([{ id: 10 }, { id: 11 }]);
    AppointmentAssignee.findAll.mockResolvedValue([{ appointment_id: 50 }]);
    Appointment.findAll.mockResolvedValue([{ id: 50 }]);
    JobAssignment.findAll.mockResolvedValue([{ job_id: 7 }]);
    JobDayAssignment.findAll.mockResolvedValue([{ job_id: 8 }]);
    Job.findAll.mockResolvedValue([{ id: 7 }, { id: 8 }]);
    const impact = await staffDeleteImpact(5);
    expect(impact.pending_tasks).toBe(2);
    expect(impact.pending_visits).toBe(1);
    expect(impact.pending_jobs).toBe(2);
    expect(impact.warning).toMatch(/2 pending tasks/);
    expect(impact.warning).toMatch(/1 pending site visit/);
    expect(impact.warning).toMatch(/2 jobs still on the schedule/);
  });
});

describe('destroy helpers', () => {
  beforeEach(() => jest.clearAllMocks());

  test('destroyCustomer nulls contact FKs then deletes the customer', async () => {
    Lead.findAll.mockResolvedValue([{ id: 1 }]);
    Quote.findAll.mockResolvedValue([{ id: 2 }]);
    Job.findAll.mockResolvedValue([]);
    Invoice.findAll.mockResolvedValue([]);
    Appointment.findAll.mockResolvedValue([]);
    await destroyCustomer(9);
    expect(Lead.update).toHaveBeenCalled();
    expect(Customer.destroy).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 9 } }));
  });

  test('destroyStaffUser unassigns work then deletes the user', async () => {
    await destroyStaffUser(5);
    expect(Message.update).toHaveBeenCalled();
    expect(Task.update).toHaveBeenCalledWith(
      { assignee_id: null },
      expect.objectContaining({ where: { assignee_id: 5 } }),
    );
    expect(JobAssignment.destroy).toHaveBeenCalled();
    expect(AppointmentAssignee.destroy).toHaveBeenCalled();
    expect(User.destroy).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 5 } }));
  });
});
