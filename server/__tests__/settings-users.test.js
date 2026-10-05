jest.mock('../models', () => ({
  User: { create: jest.fn(), findByPk: jest.fn(), findAll: jest.fn(), count: jest.fn() },
  SecurityEvent: { create: jest.fn(), findAll: jest.fn() },
}));
jest.mock('../db', () => ({
  allSettings: jest.fn(),
  setSetting: jest.fn(),
  getSetting: jest.fn(async () => 28),
  plain: (row) => (row && typeof row.toJSON === 'function' ? row.toJSON() : row),
}));
jest.mock('../integrations/registry', () => ({
  all: jest.fn(),
  recentEvents: jest.fn(),
}));
jest.mock('../integrations/email', () => ({
  send: jest.fn(async () => ({ simulated: true })),
}));
jest.mock('../auth', () => {
  const actual = jest.requireActual('../auth');
  return {
    ...actual,
    requireAuth: (req, res, next) => { req.user = { id: 1, role: 'ADMIN' }; next(); },
    requireOffice: (req, res, next) => next(),
    requireAdmin: (req, res, next) => next(),
  };
});

const request = require('supertest');
const express = require('express');
const { User, SecurityEvent } = require('../models');
const settings = require('../routes/settings');
const { ROLE_VALUES } = require('../roles');
const { getSetting } = require('../db');
const email = require('../integrations/email');

const app = express();
app.use(express.json());
app.use('/api/settings', settings);
app.use((err, req, res, next) => { res.status(500).json({ error: err.message }); });

const validUser = {
  name: 'Test User',
  email: 'test@example.com',
  password: 'password123',
};

describe('POST /api/settings/users roles (requirement 1.4)', () => {
  beforeEach(() => jest.clearAllMocks());

  test.each([...ROLE_VALUES])('accepts stored role %s', async (role) => {
    User.create.mockResolvedValue({ id: 99 });
    const res = await request(app).post('/api/settings/users').send({ ...validUser, role });
    expect(res.status).toBe(200);
    expect(User.create).toHaveBeenCalledWith(expect.objectContaining({ role }));
    expect(SecurityEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      action: 'user_create', actor_user_id: 1, target_user_id: 99, detail: role,
    }));
  });

  test('rejects a spec name that is not the stored value', async () => {
    const res = await request(app).post('/api/settings/users').send({ ...validUser, role: 'DIRECTOR' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid role');
    expect(User.create).not.toHaveBeenCalled();
  });

  test('rejects an unknown role', async () => {
    const res = await request(app).post('/api/settings/users').send({ ...validUser, role: 'SUPERUSER' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid role');
  });
});

describe('PUT /api/settings/users/:id roles (requirement 1.4)', () => {
  beforeEach(() => jest.clearAllMocks());

  test('rejects an invalid role on update', async () => {
    User.findByPk.mockResolvedValue({
      id: 5,
      role: 'STAFF',
      name: 'Jamie',
      phone: null,
      skills: [],
      is_driver: false,
      active: true,
      holiday_allowance: 28,
      color: '#000',
      update: jest.fn(),
    });
    const res = await request(app).put('/api/settings/users/5').send({ role: 'OPERATIVE' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid role');
  });

  test('keeps an existing stored role when role is omitted', async () => {
    const update = jest.fn();
    User.findByPk.mockResolvedValue({
      id: 5,
      role: 'STAFF',
      name: 'Jamie',
      phone: null,
      skills: [],
      is_driver: false,
      active: true,
      holiday_allowance: 28,
      color: '#000',
      update,
    });
    const res = await request(app).put('/api/settings/users/5').send({ name: 'Jamie Updated' });
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ role: 'STAFF' }));
    expect(update.mock.calls[0][0].token_version).toBeUndefined();
  });
});

describe('PUT /api/settings/users/:id financials_restricted (requirement 1.6)', () => {
  beforeEach(() => jest.clearAllMocks());

  function officeUser(update) {
    return {
      id: 8,
      role: 'OFFICE',
      name: 'Lisa',
      phone: null,
      skills: [],
      is_driver: false,
      active: true,
      holiday_allowance: 28,
      color: '#000',
      financials_restricted: false,
      update,
    };
  }

  test('ADMIN can turn the restriction on for an OFFICE user', async () => {
    const update = jest.fn();
    User.findByPk.mockResolvedValue(officeUser(update));
    const res = await request(app).put('/api/settings/users/8').send({ financials_restricted: true });
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ financials_restricted: true, role: 'OFFICE' }));
  });

  test('clears the flag when the user is not OFFICE', async () => {
    const update = jest.fn();
    User.findByPk.mockResolvedValue({
      ...officeUser(update),
      role: 'ADMIN',
      financials_restricted: true,
    });
    const res = await request(app).put('/api/settings/users/8').send({ financials_restricted: true });
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ financials_restricted: false }));
  });
});

describe('POST /api/settings/users financials_restricted (requirement 1.6)', () => {
  beforeEach(() => jest.clearAllMocks());

  test('stores the flag only for OFFICE', async () => {
    User.create.mockResolvedValue({ id: 10 });
    await request(app).post('/api/settings/users').send({
      ...validUser, role: 'OFFICE', financials_restricted: true,
    });
    expect(User.create).toHaveBeenCalledWith(expect.objectContaining({
      role: 'OFFICE', financials_restricted: true,
    }));
    User.create.mockClear();
    await request(app).post('/api/settings/users').send({
      ...validUser, role: 'STAFF', financials_restricted: true,
    });
    expect(User.create).toHaveBeenCalledWith(expect.objectContaining({
      role: 'STAFF', financials_restricted: false,
    }));
  });
});

function userRow(overrides = {}) {
  const update = overrides.update || jest.fn();
  const save = overrides.save || jest.fn(async function save() { return this; });
  return {
    id: 5,
    name: 'Jamie',
    email: 'jamie@example.com',
    phone: null,
    role: 'STAFF',
    skills: [],
    is_driver: false,
    active: true,
    holiday_allowance: 28,
    color: '#000',
    financials_restricted: false,
    hourly_cost: 0,
    cis_status: 'none',
    token_version: 0,
    password_hash: 'existing-hash',
    password_reset_token: 'old-hash',
    password_reset_expires: new Date(),
    ...overrides,
    update,
    save,
  };
}

describe('PUT /api/settings/users/:id lifecycle (requirement 1.7)', () => {
  beforeEach(() => jest.clearAllMocks());

  test('updates name, email, phone, and role', async () => {
    const update = jest.fn();
    User.findByPk.mockResolvedValue(userRow({ update }));
    const res = await request(app).put('/api/settings/users/5').send({
      name: 'Jamie Field',
      email: 'jamie.field@example.com',
      phone: '07700 900000',
      role: 'OFFICE',
    });
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Jamie Field',
      email: 'jamie.field@example.com',
      phone: '07700 900000',
      role: 'OFFICE',
      token_version: 1,
    }));
    expect(SecurityEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      action: 'role_change', actor_user_id: 1, target_user_id: 5, detail: 'STAFF → OFFICE',
    }));
  });

  test('rejects deactivating yourself', async () => {
    const update = jest.fn();
    User.findByPk.mockResolvedValue(userRow({ id: 1, role: 'ADMIN', update }));
    const res = await request(app).put('/api/settings/users/1').send({ active: false });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('You cannot deactivate your own account');
    expect(update).not.toHaveBeenCalled();
  });

  test('rejects deactivating the last remaining ADMIN', async () => {
    const update = jest.fn();
    User.findByPk.mockResolvedValue(userRow({ id: 9, role: 'ADMIN', update }));
    User.count.mockResolvedValue(1);
    const res = await request(app).put('/api/settings/users/9').send({ active: false });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Cannot deactivate or change the role of the last administrator');
    expect(update).not.toHaveBeenCalled();
  });

  test('rejects changing the role of the last remaining ADMIN', async () => {
    const update = jest.fn();
    User.findByPk.mockResolvedValue(userRow({ id: 1, role: 'ADMIN', update }));
    User.count.mockResolvedValue(1);
    const res = await request(app).put('/api/settings/users/1').send({ role: 'OFFICE' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Cannot deactivate or change the role of the last administrator');
    expect(update).not.toHaveBeenCalled();
  });

  test('allows deactivating an ADMIN when another remains', async () => {
    const update = jest.fn();
    User.findByPk.mockResolvedValue(userRow({ id: 9, role: 'ADMIN', update }));
    User.count.mockResolvedValue(2);
    const res = await request(app).put('/api/settings/users/9').send({ active: false });
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ active: false, role: 'ADMIN', token_version: 1 }));
    expect(SecurityEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      action: 'deactivate', actor_user_id: 1, target_user_id: 9,
    }));
  });

  test('reactivates a deactivated user', async () => {
    const update = jest.fn();
    User.findByPk.mockResolvedValue(userRow({ active: false, token_version: 4, update }));
    const res = await request(app).put('/api/settings/users/5').send({ active: true });
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ active: true }));
    expect(update.mock.calls[0][0].token_version).toBeUndefined();
    expect(SecurityEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      action: 'reactivate', target_user_id: 5,
    }));
  });

  test('sets an admin temporary password with the 8-character rule', async () => {
    const row = userRow();
    User.findByPk.mockResolvedValue(row);
    const short = await request(app).put('/api/settings/users/5').send({ password: 'short' });
    expect(short.status).toBe(400);
    expect(short.body.error).toMatch(/at least 8 characters/);
    expect(row.update).not.toHaveBeenCalled();

    const ok = await request(app).put('/api/settings/users/5').send({ password: 'tempPass9' });
    expect(ok.status).toBe(200);
    expect(row.save).toHaveBeenCalled();
    expect(row.password_hash).not.toBe('existing-hash');
    expect(row.password_reset_token).toBeNull();
    expect(row.password_reset_expires).toBeNull();
    expect(row.update).toHaveBeenCalledWith(expect.objectContaining({ token_version: 1 }));
    expect(SecurityEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      action: 'admin_temp_password', actor_user_id: 1, target_user_id: 5,
    }));
    const logged = JSON.stringify(SecurityEvent.create.mock.calls.map((c) => c[0]));
    expect(logged).not.toContain('tempPass9');
  });
});

describe('POST /api/settings/users welcome email', () => {
  beforeEach(() => jest.clearAllMocks());

  test('emails the new user their login and temporary password', async () => {
    User.create.mockResolvedValue({ id: 99, email: 'test@example.com' });
    const res = await request(app).post('/api/settings/users').send({ ...validUser, role: 'STAFF' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: 99, emailed: true });
    expect(email.send).toHaveBeenCalledWith(
      'test@example.com',
      'Your Paul Douglas Roofing account',
      expect.objectContaining({
        body: expect.stringContaining('Temporary password: password123'),
        actionLabel: 'Sign in',
      }),
    );
  });
});

describe('POST /api/settings/users/:id/reset-password', () => {
  beforeEach(() => jest.clearAllMocks());

  test('sends the same reset link as forgot-password', async () => {
    const save = jest.fn(async function save() { return this; });
    User.findByPk.mockResolvedValue({
      id: 5, name: 'Jamie', email: 'jamie@example.com', active: true, save,
    });
    const res = await request(app).post('/api/settings/users/5/reset-password');
    expect(res.status).toBe(200);
    expect(save).toHaveBeenCalled();
    expect(email.send).toHaveBeenCalledWith(
      'jamie@example.com',
      'Reset your password',
      expect.objectContaining({ actionLabel: 'Reset password' }),
    );
    expect(SecurityEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      action: 'forgot_password', target_user_id: 5, detail: 'admin_reset_link',
    }));
  });

  test('refuses an inactive account', async () => {
    User.findByPk.mockResolvedValue({
      id: 5, name: 'Jamie', email: 'jamie@example.com', active: false, save: jest.fn(),
    });
    const res = await request(app).post('/api/settings/users/5/reset-password');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/inactive/i);
    expect(email.send).not.toHaveBeenCalled();
  });
});

describe('user skills, driver, and pay rates (requirement 1.8)', () => {
  beforeEach(() => jest.clearAllMocks());

  test('GET /users returns hourly_cost and cis_status for office viewers', async () => {
    User.findAll.mockResolvedValue([{
      toJSON: () => ({
        id: 3, name: 'Jamie', role: 'STAFF', skills: ['roofer'], is_driver: true,
        hourly_cost: 24.5, cis_status: 'net20', financials_restricted: false,
      }),
    }]);
    const res = await request(app).get('/api/settings/users');
    expect(res.status).toBe(200);
    expect(User.findAll).toHaveBeenCalledWith(expect.objectContaining({
      order: [['created_at', 'DESC'], ['id', 'DESC']],
    }));
    expect(res.body.users[0]).toMatchObject({
      hourly_cost: 24.5, cis_status: 'net20', skills: ['roofer'], is_driver: true,
    });
  });

  test('POST stores hourly_cost and CIS for any role and skills only for STAFF', async () => {
    User.create.mockResolvedValue({ id: 11 });
    await request(app).post('/api/settings/users').send({
      ...validUser, role: 'OFFICE', skills: ['roofer'], is_driver: true,
      hourly_cost: 18.5, cis_status: 'gross',
    });
    expect(User.create).toHaveBeenCalledWith(expect.objectContaining({
      role: 'OFFICE', skills: [], is_driver: false, hourly_cost: 18.5, cis_status: 'gross',
    }));
    User.create.mockClear();
    await request(app).post('/api/settings/users').send({
      ...validUser, role: 'STAFF', skills: ['slate'], is_driver: true,
      hourly_cost: 24.5, cis_status: 'net20',
    });
    expect(User.create).toHaveBeenCalledWith(expect.objectContaining({
      role: 'STAFF', skills: ['slate'], is_driver: true, hourly_cost: 24.5, cis_status: 'net20',
    }));
  });

  test('rejects a negative hourly_cost and an unknown CIS status', async () => {
    const neg = await request(app).post('/api/settings/users').send({
      ...validUser, role: 'ADMIN', hourly_cost: -1,
    });
    expect(neg.status).toBe(400);
    expect(neg.body.error).toMatch(/non-negative/);
    const cis = await request(app).post('/api/settings/users').send({
      ...validUser, role: 'ADMIN', cis_status: 'contractor',
    });
    expect(cis.status).toBe(400);
    expect(cis.body.error).toBe('Invalid CIS status');
    expect(User.create).not.toHaveBeenCalled();
  });

  test('PUT updates STAFF skills/driver/rates and clears skills when the role is not STAFF', async () => {
    const update = jest.fn();
    User.findByPk.mockResolvedValue(userRow({
      skills: ['roofer'], is_driver: true, hourly_cost: 24.5, cis_status: 'none', update,
    }));
    const staff = await request(app).put('/api/settings/users/5').send({
      skills: ['roofer', 'slate'], is_driver: false, hourly_cost: 26, cis_status: 'higher30',
    });
    expect(staff.status).toBe(200);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      skills: ['roofer', 'slate'], is_driver: false, hourly_cost: 26, cis_status: 'higher30',
    }));

    update.mockClear();
    User.findByPk.mockResolvedValue(userRow({
      skills: ['roofer'], is_driver: true, hourly_cost: 24.5, cis_status: 'net20', update,
    }));
    const office = await request(app).put('/api/settings/users/5').send({ role: 'OFFICE', hourly_cost: 20 });
    expect(office.status).toBe(200);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      role: 'OFFICE', skills: [], is_driver: false, hourly_cost: 20,
    }));
  });
});

describe('POST/PUT /api/settings/users holiday allowance (requirement 17.3)', () => {
  beforeEach(() => jest.clearAllMocks());

  test('inherits the company default when the field is blank', async () => {
    getSetting.mockResolvedValue(32);
    User.create.mockResolvedValue({ id: 12 });
    const res = await request(app).post('/api/settings/users').send({ ...validUser, role: 'STAFF' });
    expect(res.status).toBe(200);
    expect(getSetting).toHaveBeenCalledWith('holiday_allowance_days');
    expect(User.create).toHaveBeenCalledWith(expect.objectContaining({ holiday_allowance: 32 }));
  });

  test('inherits when the allowance is whitespace', async () => {
    getSetting.mockResolvedValue(32);
    User.create.mockResolvedValue({ id: 14 });
    const res = await request(app).post('/api/settings/users').send({
      ...validUser, role: 'STAFF', holiday_allowance: '  ',
    });
    expect(res.status).toBe(200);
    expect(User.create).toHaveBeenCalledWith(expect.objectContaining({ holiday_allowance: 32 }));
  });

  test('stores an explicit allowance instead of the default', async () => {
    getSetting.mockResolvedValue(32);
    User.create.mockResolvedValue({ id: 13 });
    const res = await request(app).post('/api/settings/users').send({
      ...validUser, role: 'STAFF', holiday_allowance: 20,
    });
    expect(res.status).toBe(200);
    expect(User.create).toHaveBeenCalledWith(expect.objectContaining({ holiday_allowance: 20 }));
  });

  test('updates a stored allowance on edit', async () => {
    const update = jest.fn();
    User.findByPk.mockResolvedValue(userRow({ update }));
    const res = await request(app).put('/api/settings/users/5').send({ holiday_allowance: 22 });
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ holiday_allowance: 22 }));
  });

  test('keeps the stored allowance when the field is omitted', async () => {
    const update = jest.fn();
    User.findByPk.mockResolvedValue(userRow({ holiday_allowance: 18, update }));
    const res = await request(app).put('/api/settings/users/5').send({ name: 'Jamie Field' });
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ holiday_allowance: 18 }));
  });
});
