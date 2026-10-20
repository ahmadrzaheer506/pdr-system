jest.mock('../models', () => ({
  logIntegrationEvent: jest.fn().mockResolvedValue(undefined),
  Lead: { update: jest.fn().mockResolvedValue([1]) },
}));
jest.mock('../customerFiles', () => {
  const actual = jest.requireActual('../customerFiles');
  return {
    ...actual,
    addFile: jest.fn(async (_customerId, _userId, file) => ({
      file: { id: 41, original_name: file.originalname || 'photo.jpg' },
    })),
  };
});
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
const ORIG_WEBSITE = process.env.WEBSITE_ENQUIRY_SECRET;

function sign(raw, secret) {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(raw).digest('hex');
}

describe('inbound webhooks (requirement 3.2)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.META_APP_SECRET;
    delete process.env.EMAIL_INBOUND_SECRET;
    delete process.env.META_VERIFY_TOKEN;
    delete process.env.WEBSITE_ENQUIRY_SECRET;
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
    if (ORIG_WEBSITE === undefined) delete process.env.WEBSITE_ENQUIRY_SECRET;
    else process.env.WEBSITE_ENQUIRY_SECRET = ORIG_WEBSITE;
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
      .send({
        from: 'Priya Nair <priya@example.co.uk>',
        sender: 'priya@example.co.uk',
        subject: 'Roof quote',
        'stripped-text': 'Please call',
        'body-plain': 'Please call\n--\nsent from phone',
      });
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

describe('website enquiry webhook', () => {
  const payload = {
    ref: 'ENQ-261020-B11Y',
    service: 'Roof Tiling',
    property_type: 'Bungalow',
    urgency: 'Planning',
    postcode: 'FG4 5RT',
    address: 'eeee',
    message: 'Need tiles replacing',
    source: 'Google',
    first_name: 'Sahil',
    last_name: 'test',
    phone: '07700 900000',
    email: 'test@gmail.com',
    contact_pref: 'Call',
    consent: 'yes',
  };

  test('rejects missing or default secrets', async () => {
    const none = await request(app).post('/website').send(payload);
    expect(none.status).toBe(403);
    process.env.WEBSITE_ENQUIRY_SECRET = 'change-me';
    const weak = await request(app).post('/website?secret=change-me').send(payload);
    expect(weak.status).toBe(403);
    expect(ingestInbound).not.toHaveBeenCalled();
  });

  test('creates an inbox lead from the landing-page JSON', async () => {
    process.env.WEBSITE_ENQUIRY_SECRET = 'landing-secret-value';
    const res = await request(app)
      .post('/website')
      .set('X-Enquiry-Secret', 'landing-secret-value')
      .send(payload);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      matched: false,
      customerId: 1,
      leadId: 2,
      photos: 0,
    });
    expect(ingestInbound).toHaveBeenCalledWith(expect.objectContaining({
      source: 'website',
      name: 'Sahil test',
      phone: '07700 900000',
      email: 'test@gmail.com',
      forceNewLead: true,
      meta: expect.objectContaining({
        heard_from: 'Google',
        service: 'Roof Tiling',
        external_ref: 'ENQ-261020-B11Y',
      }),
    }));
  });

  test('stores multipart photos on the customer, not as URLs', async () => {
    process.env.WEBSITE_ENQUIRY_SECRET = 'landing-secret-value';
    const jpeg = Buffer.from([
      0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00,
    ]);
    const customerFiles = require('../customerFiles');
    const { Lead } = require('../models');
    const res = await request(app)
      .post('/website')
      .set('X-Enquiry-Secret', 'landing-secret-value')
      .field('enquiry', JSON.stringify(payload))
      .attach('photos', jpeg, { filename: 'roof.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(200);
    expect(res.body.photos).toBe(1);
    expect(customerFiles.addFile).toHaveBeenCalledWith(
      1,
      null,
      expect.objectContaining({ originalname: 'roof.jpg', mimetype: 'image/jpeg' }),
    );
    expect(Lead.update).toHaveBeenCalledWith(
      expect.objectContaining({
        meta: expect.objectContaining({ photo_file_ids: [41], photo_names: ['roof.jpg'] }),
      }),
      { where: { id: 2 } },
    );
  });
});

describe('leadAdIntake (requirement 3.2)', () => {
  test('falls back to payload then default name', () => {
    expect(webhooks.leadAdIntake({ name: 'Jane', form_id: '1' }).name).toBe('Jane');
    expect(webhooks.leadAdIntake({}).name).toBe('Facebook lead');
    expect(webhooks.leadAdIntake({ name: 'Payload' }, { full_name: 'Graph' }).name).toBe('Graph');
  });
});
