jest.mock('../models', () => ({
  logIntegrationEvent: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../services/messenger', () => ({ ingestInbound: jest.fn() }));
jest.mock('../integrations/meta', () => {
  const actual = jest.requireActual('../integrations/meta');
  return {
    ...actual,
    fetchLeadgen: jest.fn(),
    fetchProfileName: jest.fn(),
  };
});

const crypto = require('crypto');
const request = require('supertest');
const express = require('express');
const { ingestInbound } = require('../services/messenger');
const meta = require('../integrations/meta');
const webhooks = require('../routes/webhooks');

const app = express();
app.use(webhooks);

const ORIG_META = process.env.META_APP_SECRET;
const ORIG_EMAIL = process.env.EMAIL_INBOUND_SECRET;
const ORIG_VERIFY = process.env.META_VERIFY_TOKEN;

function sign(raw, secret) {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(raw).digest('hex');
}

describe('inbound webhooks (requirement 3.2)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.META_APP_SECRET;
    delete process.env.EMAIL_INBOUND_SECRET;
    delete process.env.META_VERIFY_TOKEN;
    ingestInbound.mockResolvedValue({ customerId: 1, leadId: 2, messageId: 3, matched: false });
    meta.fetchLeadgen.mockResolvedValue(null);
    meta.fetchProfileName.mockResolvedValue(null);
  });

  afterEach(() => {
    if (ORIG_META === undefined) delete process.env.META_APP_SECRET;
    else process.env.META_APP_SECRET = ORIG_META;
    if (ORIG_EMAIL === undefined) delete process.env.EMAIL_INBOUND_SECRET;
    else process.env.EMAIL_INBOUND_SECRET = ORIG_EMAIL;
    if (ORIG_VERIFY === undefined) delete process.env.META_VERIFY_TOKEN;
    else process.env.META_VERIFY_TOKEN = ORIG_VERIFY;
  });

  test('WhatsApp text message becomes an inbox ingest', async () => {
    const res = await request(app).post('/whatsapp').send({
      entry: [{
        changes: [{
          value: {
            messages: [{ from: '447911223344', type: 'text', text: { body: 'Leak in the bedroom' } }],
            contacts: [{ profile: { name: 'Dave Whitfield' } }],
          },
        }],
      }],
    });
    expect(res.status).toBe(200);
    expect(ingestInbound).toHaveBeenCalledWith({
      source: 'whatsapp',
      channel: 'whatsapp',
      name: 'Dave Whitfield',
      phone: '+447911223344',
      body: 'Leak in the bedroom',
    });
  });

  test('Facebook Page message becomes an inbox ingest', async () => {
    const res = await request(app).post('/facebook').send({
      entry: [{
        messaging: [{ sender: { id: 'psid-1' }, message: { text: 'Need a quote' } }],
      }],
    });
    expect(res.status).toBe(200);
    expect(ingestInbound).toHaveBeenCalledWith({
      source: 'facebook',
      channel: 'facebook',
      name: 'Facebook contact',
      body: 'Need a quote',
      meta: { psid: 'psid-1' },
    });
  });

  test('Lead Ad webhook creates a customer + NEW lead from the payload when Graph is empty', async () => {
    const res = await request(app).post('/facebook').send({
      entry: [{
        changes: [{
          field: 'leadgen',
          value: {
            leadgen_id: 'lg-1',
            form_id: 'form-9',
            name: 'Jane Lead',
            phone_number: '+447700900100',
            email: 'jane@example.com',
          },
        }],
      }],
    });
    expect(res.status).toBe(200);
    expect(meta.fetchLeadgen).toHaveBeenCalledWith('lg-1');
    expect(ingestInbound).toHaveBeenCalledWith({
      source: 'facebook_lead',
      channel: 'facebook',
      name: 'Jane Lead',
      phone: '+447700900100',
      email: 'jane@example.com',
      body: 'Facebook Lead Ad submission (form form-9)',
      meta: expect.objectContaining({ leadgen_id: 'lg-1', form_id: 'form-9' }),
    });
  });

  test('Lead Ad uses Graph fields when they are returned', async () => {
    meta.fetchLeadgen.mockResolvedValue({
      full_name: 'Graph Name',
      phone_number: '07700900111',
      email: 'graph@example.com',
    });
    const res = await request(app).post('/facebook').send({
      entry: [{
        changes: [{ field: 'leadgen', value: { leadgen_id: 'lg-2', form_id: 'form-2', name: 'Payload Name' } }],
      }],
    });
    expect(res.status).toBe(200);
    expect(ingestInbound).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Graph Name',
      phone: '07700900111',
      email: 'graph@example.com',
    }));
  });

  test('inbound email with the shared secret is ingested', async () => {
    const res = await request(app)
      .post('/email?secret=change-me')
      .type('form')
      .send({ from: 'Priya Nair <priya@example.co.uk>', subject: 'Roof quote', text: 'Please call' });
    expect(res.status).toBe(200);
    expect(ingestInbound).toHaveBeenCalledWith({
      source: 'email',
      channel: 'email',
      name: 'Priya Nair',
      email: 'priya@example.co.uk',
      subject: 'Roof quote',
      body: 'Please call',
    });
  });

  test('inbound email without the secret is rejected', async () => {
    const res = await request(app).post('/email').send({ from: 'x@y.com', text: 'hi' });
    expect(res.status).toBe(403);
    expect(ingestInbound).not.toHaveBeenCalled();
  });

  test('WhatsApp and Facebook POSTs reject a bad Meta signature when the app secret is set', async () => {
    process.env.META_APP_SECRET = 'test-meta-secret';
    const payload = { entry: [] };
    const raw = JSON.stringify(payload);
    const bad = await request(app)
      .post('/whatsapp')
      .set('Content-Type', 'application/json')
      .set('X-Hub-Signature-256', 'sha256=deadbeef')
      .send(raw);
    expect(bad.status).toBe(403);
    const okSig = sign(raw, 'test-meta-secret');
    const ok = await request(app)
      .post('/facebook')
      .set('Content-Type', 'application/json')
      .set('X-Hub-Signature-256', okSig)
      .send(raw);
    expect(ok.status).toBe(200);
  });
});

describe('leadAdIntake (requirement 3.2)', () => {
  test('falls back to payload then default name', () => {
    expect(webhooks.leadAdIntake({ name: 'Jane', form_id: '1' }).name).toBe('Jane');
    expect(webhooks.leadAdIntake({}).name).toBe('Facebook lead');
    expect(webhooks.leadAdIntake({ name: 'Payload' }, { full_name: 'Graph' }).name).toBe('Graph');
  });
});
