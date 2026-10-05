jest.mock('../models', () => ({
  User: { findByPk: jest.fn() },
}));
jest.mock('../db', () => ({
  plain: (row) => (row && typeof row.toJSON === 'function' ? row.toJSON() : row),
}));

const request = require('supertest');
const express = require('express');
const {
  requireOffice, requireAdmin, forbidStaffPdfs, ROLES,
} = require('../auth');
const { STAFF_JOB_ATTRS, toPublicStaffJob, omitFinancial, FINANCIAL_KEYS } = require('../staffView');

function mockRes() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
}

describe('requireOffice (requirement 1.5)', () => {
  test.each(['ADMIN', 'OFFICE'])('allows %s', (role) => {
    const next = jest.fn();
    requireOffice({ user: { role } }, mockRes(), next);
    expect(next).toHaveBeenCalled();
  });

  test('rejects STAFF with 403', () => {
    const res = mockRes();
    requireOffice({ user: { role: ROLES.STAFF } }, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Not permitted' });
  });
});

describe('requireAdmin', () => {
  test('allows ADMIN', () => {
    const next = jest.fn();
    requireAdmin({ user: { role: ROLES.ADMIN } }, mockRes(), next);
    expect(next).toHaveBeenCalled();
  });

  test('rejects OFFICE and STAFF', () => {
    for (const role of [ROLES.OFFICE, ROLES.STAFF]) {
      const res = mockRes();
      requireAdmin({ user: { role } }, res, jest.fn());
      expect(res.status).toHaveBeenCalledWith(403);
    }
  });
});

describe('forbidStaffPdfs (requirement 1.5)', () => {
  const app = express();
  app.get('/api/files/:filename', (req, res, next) => {
    req.user = { id: 2, role: req.query.role };
    next();
  }, forbidStaffPdfs, (req, res) => res.json({ ok: true }));

  test('blocks quote and invoice PDFs for STAFF', async () => {
    const quote = await request(app).get('/api/files/quote-Q-2026-0001.pdf').query({ role: 'STAFF' });
    expect(quote.status).toBe(403);
    const invoice = await request(app).get('/api/files/invoice-INV-2026-0001.pdf').query({ role: 'STAFF' });
    expect(invoice.status).toBe(403);
  });

  test('allows a clock-out photo for STAFF', async () => {
    const res = await request(app).get('/api/files/shift-2-1.jpg').query({ role: 'STAFF' });
    expect(res.status).toBe(200);
  });

  test('allows PDFs for ADMIN and OFFICE', async () => {
    const admin = await request(app).get('/api/files/quote-Q-2026-0001.pdf').query({ role: 'ADMIN' });
    expect(admin.status).toBe(200);
    const office = await request(app).get('/api/files/invoice-INV-2026-0001.pdf').query({ role: 'OFFICE' });
    expect(office.status).toBe(200);
  });
});

describe('staff view allowlist (requirement 1.5)', () => {
  test('job allowlist does not include money columns', () => {
    expect(STAFF_JOB_ATTRS).not.toEqual(expect.arrayContaining([...FINANCIAL_KEYS]));
    for (const key of FINANCIAL_KEYS) {
      expect(STAFF_JOB_ATTRS).not.toContain(key);
    }
  });

  test('toPublicStaffJob drops value, quote_id, and totals', () => {
    const pub = toPublicStaffJob({
      id: 1,
      title: 'Re-roof',
      value: 12000,
      quote_id: 9,
      total: 14400,
      customer_name: 'Ada',
      customer_phone: '07700',
      crew: ['Jamie'],
    });
    expect(pub).toEqual({
      id: 1,
      title: 'Re-roof',
      customer_name: 'Ada',
      customer_phone: '07700',
      crew: ['Jamie'],
    });
    expect(pub.value).toBeUndefined();
    expect(pub.quote_id).toBeUndefined();
  });

  test('toPublicStaffJob copies work_dates for staff clock-in grouping', () => {
    const pub = toPublicStaffJob({
      id: 1,
      title: 'test',
      work_dates: ['2026-10-04'],
      value: 12000,
    });
    expect(pub.work_dates).toEqual(['2026-10-04']);
    expect(pub.value).toBeUndefined();
  });

  test('toPublicStaffJob copies notes and files (requirement 7.4)', () => {
    const pub = toPublicStaffJob({
      id: 1,
      title: 'Re-roof',
      notes: 'Side gate',
      files: [{ id: 2, stage: 'before' }],
      value: 12000,
    });
    expect(pub.notes).toBe('Side gate');
    expect(pub.files).toEqual([{ id: 2, stage: 'before' }]);
    expect(pub.value).toBeUndefined();
  });

  test('toPublicStaffJob drops variations (requirement 7.5)', () => {
    const pub = toPublicStaffJob({
      id: 1,
      title: 'Re-roof',
      variations: [{ id: 9, description: 'Lead soakers', amount: 180 }],
      value: 12000,
    });
    expect(pub.variations).toBeUndefined();
    expect(pub.value).toBeUndefined();
  });

  test('omitFinancial strips cost_rate, labour_cost, and hourly_cost from operative payloads (requirement 1.8)', () => {
    const out = omitFinancial({
      id: 3,
      worked_minutes: 480,
      cost_rate: 24.5,
      labour_cost: 196,
      hourly_cost: 24.5,
      cis_status: 'net20',
    });
    expect(out.cost_rate).toBeUndefined();
    expect(out.labour_cost).toBeUndefined();
    expect(out.hourly_cost).toBeUndefined();
    expect(out.cis_status).toBeUndefined();
    expect(out.worked_minutes).toBe(480);
  });
});
