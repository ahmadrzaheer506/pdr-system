jest.mock('../models', () => ({
  CatalogueItem: {
    findAll: jest.fn(),
    findByPk: jest.fn(),
    create: jest.fn(),
  },
}));
jest.mock('../db', () => ({
  getSetting: jest.fn(async () => ({ vat_rates: [] })),
}));
jest.mock('../auth', () => {
  const actual = jest.requireActual('../auth');
  const state = { user: { id: 1, role: 'ADMIN' } };
  return {
    ...actual,
    requireAuth: (req, res, next) => { req.user = state.user; next(); },
    requireOffice: (req, res, next) => next(),
    requireAdmin: (req, res, next) => {
      if (req.user && req.user.role === 'ADMIN') return next();
      return res.status(403).json({ error: 'Owner/admin only' });
    },
    __setUser: (user) => { state.user = user; },
  };
});

const request = require('supertest');
const express = require('express');
const { CatalogueItem } = require('../models');
const { __setUser } = require('../auth');
const catalogueRouter = require('../routes/catalogue');

const app = express();
app.use(express.json());
app.use('/api/catalogue', catalogueRouter);
app.use((err, req, res, next) => { res.status(500).json({ error: err.message }); });

function row(fields) {
  const item = {
    ...fields,
    toJSON() { return { ...fields }; },
    update: jest.fn(async function patch(next) { Object.assign(this, next); }),
    destroy: jest.fn(async () => {}),
  };
  return item;
}

describe('GET/POST /api/catalogue (requirement 17.2)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __setUser({ id: 1, role: 'ADMIN' });
  });

  test('lists items and filters by search', async () => {
    CatalogueItem.findAll.mockResolvedValue([
      row({ id: 'felt_3layer', description: 'Supply & fit 3-layer torch-on felt system', unit: 'm²', unit_price: 42, vat_code: 'standard', kind: 'materials' }),
    ]);
    const res = await request(app).get('/api/catalogue?q=felt&kind=materials');
    expect(res.status).toBe(200);
    expect(res.body.items[0].id).toBe('felt_3layer');
    expect(CatalogueItem.findAll).toHaveBeenCalled();
  });

  test('admin creates an item', async () => {
    CatalogueItem.create.mockImplementation(async (payload) => row(payload));
    const res = await request(app).post('/api/catalogue').send({
      id: 'ridge_vent',
      description: 'Ridge vent',
      unit: 'lin m',
      unit_price: 18,
      vat_code: 'standard',
      kind: 'materials',
    });
    expect(res.status).toBe(200);
    expect(res.body.item.id).toBe('ridge_vent');
    expect(CatalogueItem.create).toHaveBeenCalled();
  });

  test('office cannot create an item', async () => {
    __setUser({ id: 2, role: 'OFFICE' });
    const res = await request(app).post('/api/catalogue').send({
      id: 'ridge_vent',
      description: 'Ridge vent',
      unit: 'lin m',
      unit_price: 18,
      vat_code: 'standard',
      kind: 'materials',
    });
    expect(res.status).toBe(403);
    expect(CatalogueItem.create).not.toHaveBeenCalled();
  });

  test('admin updates and deletes an item', async () => {
    const existing = row({
      id: 'skip', description: 'Skip hire', unit: 'each', unit_price: 220, vat_code: 'standard', kind: 'materials',
    });
    CatalogueItem.findByPk.mockResolvedValue(existing);
    const put = await request(app).put('/api/catalogue/skip').send({
      description: 'Skip hire (8 yard)',
      unit: 'each',
      unit_price: 240,
      vat_code: 'standard',
      kind: 'materials',
    });
    expect(put.status).toBe(200);
    expect(existing.update).toHaveBeenCalledWith(expect.objectContaining({ unit_price: 240 }));

    const del = await request(app).delete('/api/catalogue/skip');
    expect(del.status).toBe(200);
    expect(existing.destroy).toHaveBeenCalled();
  });
});
