jest.mock('../models', () => ({
  OauthToken: { findOne: jest.fn(), create: jest.fn(), update: jest.fn(), destroy: jest.fn() },
  Invoice: { findAll: jest.fn(), findOne: jest.fn() },
  Customer: { update: jest.fn() },
  Job: { update: jest.fn(), findByPk: jest.fn(), findOne: jest.fn() },
  Quote: { findByPk: jest.fn(), update: jest.fn(), findAll: jest.fn() },
  logIntegrationEvent: jest.fn(),
}));
jest.mock('../db', () => ({
  plain: (row) => (row && typeof row.toJSON === 'function' ? row.toJSON() : row),
  todayStr: () => '2026-10-07',
  DATA_DIR: '/tmp',
}));
jest.mock('../invoicePayments', () => ({
  outstanding: jest.fn((inv) => Math.max(0, Number(inv.due_now) - Number(inv.amount_paid || 0))),
  recordPayment: jest.fn(),
}));

const { OauthToken, Invoice, Customer, Job, Quote, logIntegrationEvent } = require('../models');
const invoicePayments = require('../invoicePayments');
const qbo = require('../integrations/quickbooks');

describe('QuickBooks adapter', () => {
  const prev = { ...process.env };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.QBO_CLIENT_ID = 'cid';
    process.env.QBO_CLIENT_SECRET = 'csecret';
    process.env.QBO_ENVIRONMENT = 'sandbox';
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-jest-not-for-production-use';
    OauthToken.findOne.mockResolvedValue(null);
  });

  afterAll(() => {
    process.env.QBO_CLIENT_ID = prev.QBO_CLIENT_ID;
    process.env.QBO_CLIENT_SECRET = prev.QBO_CLIENT_SECRET;
    process.env.QBO_ENVIRONMENT = prev.QBO_ENVIRONMENT;
  });

  test('oauth state round-trips the owner id', () => {
    const state = qbo.signOauthState(1);
    expect(qbo.parseOauthState(state)).toBe(1);
    expect(() => qbo.parseOauthState('')).toThrow(/Missing OAuth state/);
  });

  test('pushInvoice is simulated when the company is not connected', async () => {
    const result = await qbo.pushInvoice({ ref: 'INV-1', total: 100, items: [] }, { name: 'Dave' });
    expect(result.simulated).toBe(true);
    expect(result.qboId).toMatch(/^SIM-/);
    expect(logIntegrationEvent).toHaveBeenCalledWith(
      'quickbooks', 'out', 'invoice.simulated', expect.any(Object), 'simulated',
    );
  });

  test('pushInvoice creates a live invoice when connected', async () => {
    OauthToken.findOne.mockResolvedValue({
      access_token: 'tok',
      expires_at: new Date(Date.now() + 3600_000),
      meta: { realmId: '123', itemId: '9', taxCodeStandard: '3' },
      update: jest.fn(),
    });
    global.fetch = jest.fn(async (url, opts) => {
      const path = String(url);
      if (path.includes('/query') && path.includes('Customer')) {
        return { ok: true, status: 200, json: async () => ({ QueryResponse: {} }) };
      }
      if (opts?.method === 'POST' && path.includes('/customer')) {
        return { ok: true, status: 200, json: async () => ({ Customer: { Id: 'C1' } }) };
      }
      if (opts?.method === 'POST' && path.includes('/invoice')) {
        return { ok: true, status: 200, json: async () => ({ Invoice: { Id: '88', SyncToken: '0' } }) };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    });

    const result = await qbo.pushInvoice({
      id: 12,
      ref: 'INV-2026-0010',
      items: [{ description: 'Re-roof', qty: 1, unit_price: 100 }],
      vat_amount: 20,
      issue_date: '2026-10-07',
      due_date: '2026-10-21',
    }, { id: 5, name: 'Dave Whitfield', email: 'dave@example.com' });

    expect(result).toEqual(expect.objectContaining({ qboId: '88', syncToken: '0', simulated: false }));
    expect(Customer.update).toHaveBeenCalledWith({ qbo_id: 'C1' }, { where: { id: 5 } });
  });

  test('toQboDate strips ISO time so QBO does not reject TxnDate', () => {
    expect(qbo.toQboDate('2026-10-09T00:00:00.000Z')).toBe('2026-10-09');
    expect(qbo.toQboDate(new Date(Date.UTC(2026, 9, 21)))).toBe('2026-10-21');
    expect(qbo.toQboDate(null)).toBeUndefined();
  });

  test('invoicePrivateNote keeps the quote number after the estimate is deleted', () => {
    expect(qbo.invoicePrivateNote({ ref: 'INV-2026-0009' }, 'Q-2026-0020'))
      .toBe('PDR invoice INV-2026-0009 (from estimate Q-2026-0020)');
    expect(qbo.invoicePrivateNote({ ref: 'INV-2026-0009', notes: 'PDR invoice INV-2026-0009' }, 'Q-2026-0020'))
      .toBe('PDR invoice INV-2026-0009 (from estimate Q-2026-0020)');
  });

  test('pushInvoice posts YYYY-MM-DD dates when Sequelize gives Date objects', async () => {
    OauthToken.findOne.mockResolvedValue({
      access_token: 'tok',
      expires_at: new Date(Date.now() + 3600_000),
      meta: { realmId: '123', itemId: '9', taxCodeStandard: '3' },
      update: jest.fn(),
    });
    let invoicePayload = null;
    global.fetch = jest.fn(async (url, opts) => {
      const path = String(url);
      if (opts?.method === 'POST' && path.includes('/invoice') && !path.includes('operation')) {
        invoicePayload = JSON.parse(opts.body);
        return { ok: true, status: 200, json: async () => ({ Invoice: { Id: '88', SyncToken: '0' } }) };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    });

    await qbo.pushInvoice({
      id: 12,
      ref: 'INV-2026-0007',
      items: [{ description: 'PDR quote', qty: 1, unit_price: 58 }],
      vat_amount: 11.6,
      issue_date: new Date('2026-10-09T00:00:00.000Z'),
      due_date: new Date('2026-10-23T00:00:00.000Z'),
    }, { id: 5, name: 'sahilmubeen1', qbo_id: 'C1' });

    expect(invoicePayload.TxnDate).toBe('2026-10-09');
    expect(invoicePayload.DueDate).toBe('2026-10-23');
    expect(String(invoicePayload.TxnDate)).not.toMatch(/T/);
  });

  test('pushInvoice updates the existing QBO invoice when DocNumber already exists', async () => {
    OauthToken.findOne.mockResolvedValue({
      access_token: 'tok',
      expires_at: new Date(Date.now() + 3600_000),
      meta: { realmId: '123', itemId: '9', taxCodeStandard: '3' },
      update: jest.fn(),
    });
    const invoicePosts = [];
    global.fetch = jest.fn(async (url, opts) => {
      const path = decodeURIComponent(String(url));
      if (path.includes('/query') && path.includes("DocNumber = 'INV-2026-0008'")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ QueryResponse: { Invoice: [{ Id: '99', SyncToken: '4', DocNumber: 'INV-2026-0008' }] } }),
        };
      }
      if (path.includes('/invoice/99') && !opts?.method) {
        return { ok: true, status: 200, json: async () => ({ Invoice: { Id: '99', SyncToken: '4' } }) };
      }
      if (opts?.method === 'POST' && path.includes('/invoice')) {
        invoicePosts.push(JSON.parse(opts.body));
        return { ok: true, status: 200, json: async () => ({ Invoice: { Id: '99', SyncToken: '5' } }) };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    });

    const result = await qbo.pushInvoice({
      ref: 'INV-2026-0008',
      items: [{ description: 'Work', qty: 1, unit_price: 38 }],
      vat_amount: 7.6,
      issue_date: '2026-10-09',
      due_date: '2026-10-23',
    }, { id: 5, name: 'sahilmubeen1', qbo_id: 'C1' });

    expect(result).toEqual(expect.objectContaining({ qboId: '99', syncToken: '5', simulated: false }));
    expect(invoicePosts[0]).toEqual(expect.objectContaining({ Id: '99', sparse: true }));
  });

  test('updating an existing QBO invoice still writes the quote number on the memo', async () => {
    OauthToken.findOne.mockResolvedValue({
      access_token: 'tok',
      expires_at: new Date(Date.now() + 3600_000),
      meta: { realmId: '123', itemId: '9', taxCodeStandard: '3' },
      update: jest.fn(),
    });
    Job.findByPk.mockResolvedValue({ quote_id: 20 });
    Quote.findByPk.mockResolvedValue({ id: 20, ref: 'Q-2026-0020', qbo_id: null });
    let payload = null;
    global.fetch = jest.fn(async (url, opts) => {
      const path = String(url);
      if (path.includes('/invoice/88') && !opts?.method) {
        return { ok: true, status: 200, json: async () => ({ Invoice: { Id: '88', SyncToken: '2' } }) };
      }
      if (opts?.method === 'POST' && path.includes('/invoice')) {
        payload = JSON.parse(opts.body);
        return { ok: true, status: 200, json: async () => ({ Invoice: { Id: '88', SyncToken: '3' } }) };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    });

    await qbo.pushInvoice({
      qbo_id: '88',
      job_id: 7,
      ref: 'INV-2026-0009',
      notes: 'PDR invoice INV-2026-0009',
      items: [{ description: 'Work', qty: 1, unit_price: 45 }],
      vat_amount: 9,
      issue_date: '2026-10-09',
      due_date: '2026-10-23',
    }, { id: 5, name: 'sahilmubeen3', qbo_id: 'C1' });

    expect(payload.PrivateNote).toBe('PDR invoice INV-2026-0009 (from estimate Q-2026-0020)');
    expect(payload.LinkedTxn).toBeUndefined();
  });

  test('pushInvoice recovers from Duplicate Document Number by updating the existing invoice', async () => {
    OauthToken.findOne.mockResolvedValue({
      access_token: 'tok',
      expires_at: new Date(Date.now() + 3600_000),
      meta: { realmId: '123', itemId: '9', taxCodeStandard: '3' },
      update: jest.fn(),
    });
    let docQueries = 0;
    global.fetch = jest.fn(async (url, opts) => {
      const path = decodeURIComponent(String(url));
      if (path.includes('/query') && path.includes("DocNumber = 'INV-2026-0008'")) {
        docQueries += 1;
        if (docQueries === 1) {
          return { ok: true, status: 200, json: async () => ({ QueryResponse: {} }) };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ QueryResponse: { Invoice: [{ Id: '99', SyncToken: '4' }] } }),
        };
      }
      if (opts?.method === 'POST' && path.includes('/invoice')) {
        const body = JSON.parse(opts.body);
        if (!body.Id) {
          return {
            ok: false,
            status: 400,
            json: async () => ({
              Fault: { Error: [{ Message: 'Duplicate Document Number Error', Detail: 'You must specify a different number.' }] },
            }),
          };
        }
        return { ok: true, status: 200, json: async () => ({ Invoice: { Id: '99', SyncToken: '5' } }) };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    });

    const result = await qbo.pushInvoice({
      ref: 'INV-2026-0008',
      items: [{ description: 'Work', qty: 1, unit_price: 38 }],
      vat_amount: 7.6,
      issue_date: '2026-10-09',
      due_date: '2026-10-23',
    }, { id: 5, name: 'sahilmubeen1', qbo_id: 'C1' });

    expect(result.qboId).toBe('99');
    expect(result.simulated).toBe(false);
  });

  test('pushInvoice deletes the quote Estimate (operation=delete) instead of converting it', async () => {
    OauthToken.findOne.mockResolvedValue({
      access_token: 'tok',
      expires_at: new Date(Date.now() + 3600_000),
      meta: { realmId: '123', itemId: '9', taxCodeStandard: '3' },
      update: jest.fn(),
    });
    Job.findByPk.mockResolvedValue({ quote_id: 18 });
    Quote.findByPk.mockResolvedValue({ id: 18, ref: 'Q-2026-0018', qbo_id: '77' });
    Quote.update.mockImplementation(async () => {
      Quote.findByPk.mockResolvedValue({ id: 18, ref: 'Q-2026-0018', qbo_id: null });
    });
    global.fetch = jest.fn(async (url, opts) => {
      const path = String(url);
      if (path.includes('/estimate/77') && !opts?.method) {
        return { ok: true, status: 200, json: async () => ({ Estimate: { Id: '77', SyncToken: '0', TxnStatus: 'Pending' } }) };
      }
      if (opts?.method === 'POST' && path.includes('operation=delete')) {
        return { ok: true, status: 200, json: async () => ({ Estimate: { Id: '77', status: 'Deleted' } }) };
      }
      if (opts?.method === 'POST' && path.includes('/invoice')) {
        return { ok: true, status: 200, json: async () => ({ Invoice: { Id: '88', SyncToken: '0' } }) };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    });

    await qbo.pushInvoice({
      id: 12,
      job_id: 7,
      ref: 'INV-2026-0008',
      items: [{ description: 'Fit chimney cowl', qty: 2, unit_price: 45 }],
      vat_amount: 18,
      issue_date: '2026-10-08',
      due_date: '2026-10-22',
    }, { id: 5, name: 'miman1122', qbo_id: 'C1' });

    const invoicePost = global.fetch.mock.calls.find((c) => c[1]?.method === 'POST' && String(c[0]).includes('/invoice') && !String(c[0]).includes('operation='));
    const body = JSON.parse(invoicePost[1].body);
    expect(body.LinkedTxn).toBeUndefined();
    expect(body.PrivateNote).toMatch(/from estimate Q-2026-0018/);
    const deletePost = global.fetch.mock.calls.find((c) => c[1]?.method === 'POST' && String(c[0]).includes('operation=delete'));
    expect(JSON.parse(deletePost[1].body)).toEqual({ Id: '77', SyncToken: '0' });
    const invoiceIdx = global.fetch.mock.calls.findIndex((c) => c[1]?.method === 'POST' && String(c[0]).includes('/invoice') && !String(c[0]).includes('operation='));
    const deleteIdx = global.fetch.mock.calls.findIndex((c) => c[1]?.method === 'POST' && String(c[0]).includes('operation=delete'));
    expect(invoiceIdx).toBeGreaterThanOrEqual(0);
    expect(invoiceIdx).toBeLessThan(deleteIdx);
    expect(global.fetch.mock.calls.some((c) => c[1]?.method === 'DELETE')).toBe(false);
    expect(Quote.update).toHaveBeenCalledWith(
      expect.objectContaining({ qbo_id: null }),
      { where: { id: 18 } },
    );
  });

  test('pushInvoice unlinks a Closed estimate from an existing invoice then deletes it', async () => {
    OauthToken.findOne.mockResolvedValue({
      access_token: 'tok',
      expires_at: new Date(Date.now() + 3600_000),
      meta: { realmId: '123', itemId: '9', taxCodeStandard: '3' },
      update: jest.fn(),
    });
    Job.findByPk.mockResolvedValue({ quote_id: 20 });
    Quote.findByPk.mockResolvedValue({ id: 20, ref: 'Q-2026-0020', qbo_id: '77' });
    Quote.update.mockImplementation(async () => {
      Quote.findByPk.mockResolvedValue({ id: 20, ref: 'Q-2026-0020', qbo_id: null });
    });
    global.fetch = jest.fn(async (url, opts) => {
      const path = String(url);
      if (path.includes('/invoice/88') && !opts?.method) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            Invoice: {
              Id: '88',
              SyncToken: '2',
              LinkedTxn: [{ TxnId: '77', TxnType: 'Estimate' }],
            },
          }),
        };
      }
      if (opts?.method === 'POST' && path.includes('/invoice') && !path.includes('operation=')) {
        return { ok: true, status: 200, json: async () => ({ Invoice: { Id: '88', SyncToken: '3' } }) };
      }
      if (path.includes('/estimate/77') && !opts?.method) {
        return { ok: true, status: 200, json: async () => ({ Estimate: { Id: '77', SyncToken: '1', TxnStatus: 'Closed' } }) };
      }
      if (opts?.method === 'POST' && path.includes('operation=delete')) {
        return { ok: true, status: 200, json: async () => ({ Estimate: { Id: '77', status: 'Deleted' } }) };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    });

    await qbo.pushInvoice({
      id: 12,
      job_id: 7,
      qbo_id: '88',
      qbo_sync_token: '2',
      ref: 'INV-2026-0010',
      items: [{ description: 'GRP overlay', qty: 1, unit_price: 126 }],
      vat_amount: 25.2,
    }, { id: 5, name: 'miman123456', qbo_id: 'C1' });

    const unlink = global.fetch.mock.calls.find((c) => {
      if (c[1]?.method !== 'POST' || !String(c[0]).includes('/invoice') || String(c[0]).includes('operation=')) return false;
      const payload = JSON.parse(c[1].body);
      return payload.sparse === true && Array.isArray(payload.LinkedTxn);
    });
    expect(JSON.parse(unlink[1].body).LinkedTxn).toEqual([]);
    expect(global.fetch.mock.calls.some((c) => c[1]?.method === 'POST' && String(c[0]).includes('operation=delete'))).toBe(true);
  });

  test('pushEstimate is simulated when the company is not connected', async () => {
    const result = await qbo.pushEstimate({ ref: 'Q-1', total: 500, items: [], title: 'Re-roof' }, { name: 'Dave' });
    expect(result.simulated).toBe(true);
    expect(result.qboId).toMatch(/^SIM-/);
  });

  test('pushEstimate creates a live estimate when connected', async () => {
    OauthToken.findOne.mockResolvedValue({
      access_token: 'tok',
      expires_at: new Date(Date.now() + 3600_000),
      meta: { realmId: '123', itemId: '9', taxCodeStandard: '3' },
      update: jest.fn(),
    });
    global.fetch = jest.fn(async (url, opts) => {
      const path = String(url);
      if (path.includes('/query') && path.includes('Customer')) {
        return { ok: true, status: 200, json: async () => ({ QueryResponse: { Customer: [{ Id: 'C1' }] } }) };
      }
      if (opts?.method === 'POST' && path.includes('/estimate')) {
        return { ok: true, status: 200, json: async () => ({ Estimate: { Id: '77', SyncToken: '0' } }) };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    });

    const result = await qbo.pushEstimate({
      id: 4,
      ref: 'Q-2026-0004',
      title: 'Felt overlay',
      items: [{ description: 'Felt', qty: 1, unit_price: 500 }],
      vat_amount: 100,
      valid_until: '2026-11-01',
    }, { id: 5, name: 'Dave Whitfield', qbo_id: 'C1' });

    expect(result).toEqual(expect.objectContaining({ qboId: '77', syncToken: '0', simulated: false }));
    expect(global.fetch.mock.calls.some((c) => String(c[0]).includes('/estimate'))).toBe(true);
  });

  test('attachPdf skips when the file is missing', async () => {
    OauthToken.findOne.mockResolvedValue({
      access_token: 'tok',
      expires_at: new Date(Date.now() + 3600_000),
      meta: { realmId: '123' },
    });
    const result = await qbo.attachPdf({
      entityType: 'Invoice',
      entityId: '88',
      fileName: 'INV-1.pdf',
      filePath: '/tmp/does-not-exist-pdr.pdf',
    });
    expect(result.attachableId).toBeNull();
  });

  test('pollPayments writes a ledger row when QuickBooks shows more paid', async () => {
    OauthToken.findOne.mockResolvedValue({
      access_token: 'tok',
      expires_at: new Date(Date.now() + 3600_000),
      meta: { realmId: '123' },
    });
    const inv = {
      id: 12,
      ref: 'INV-1',
      qbo_id: '88',
      customer_id: 5,
      job_id: 7,
      due_now: 120,
      amount_paid: 0,
      status: 'sent',
      update: jest.fn(),
    };
    Invoice.findAll.mockResolvedValue([inv]);
    Quote.findAll.mockResolvedValue([]);
    invoicePayments.recordPayment.mockResolvedValue({
      payment: { id: 1 },
      cols: { amount_paid: 120, status: 'paid', paid_at: new Date() },
    });
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ Invoice: { Id: '88', TotalAmt: 120, Balance: 0, SyncToken: '1' } }),
    }));

    const n = await qbo.pollPayments();
    expect(n).toBe(1);
    expect(invoicePayments.recordPayment).toHaveBeenCalledWith(
      inv,
      expect.objectContaining({ amount: 120, note: 'Synced from QuickBooks' }),
      expect.objectContaining({ source: 'qbo' }),
    );
  });

  test('pickTaxCodeId prefers a 20% UK code', () => {
    expect(qbo.pickTaxCodeId([
      { Id: 'NON', Name: 'No VAT' },
      { Id: '20', Name: '20.0% S' },
    ], { wantZero: false })).toBe('20');
    expect(qbo.pickTaxCodeId([{ Id: 'NON', Name: 'Zero rated' }], { wantZero: true })).toBe('NON');
  });

  test('disconnect drops the company token', async () => {
    OauthToken.destroy.mockResolvedValue(1);
    await expect(qbo.disconnect()).resolves.toBe(true);
    expect(OauthToken.destroy).toHaveBeenCalledWith({ where: { provider: 'quickbooks', user_id: null } });
  });
});
