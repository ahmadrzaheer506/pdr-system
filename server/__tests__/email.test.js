jest.mock('../models', () => ({
  logIntegrationEvent: jest.fn(async () => {}),
}));

jest.mock('../db', () => ({
  DATA_DIR: require('os').tmpdir(),
  getSetting: jest.fn(async () => ({
    name: 'Paul Douglas Roofing and Building Ltd',
    address: 'Unit 4, Trade Park, Roofers Lane',
    city: 'United Kingdom',
    phone: '01234 567890',
    email: 'office@pauldouglasroofing.co.uk',
  })),
  setSetting: jest.fn(),
}));

jest.mock('../branding', () => ({
  resolveLogoPath: jest.fn(() => '/tmp/brand-logo.png'),
  mimeForPath: () => 'image/png',
}));

const fs = require('fs');
const { logIntegrationEvent } = require('../models');
const branding = require('../branding');
const email = require('../integrations/email');

describe('Mailgun email adapter', () => {
  const prev = {};
  const keys = ['MAILGUN_API_KEY', 'MAILGUN_DOMAIN', 'MAILGUN_FROM', 'MAILGUN_REGION', 'MAILGUN_API_URL'];

  beforeEach(() => {
    keys.forEach((k) => { prev[k] = process.env[k]; });
    logIntegrationEvent.mockClear();
    branding.resolveLogoPath.mockReturnValue('/tmp/brand-logo.png');
    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    jest.spyOn(fs, 'readFileSync').mockReturnValue(Buffer.from('file-bytes'));
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ id: '<msg@mg.example.com>', message: 'Queued. Thank you.' }),
    }));
  });

  afterEach(() => {
    Object.entries(prev).forEach(([k, v]) => {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    });
    fs.existsSync.mockRestore?.();
    fs.readFileSync.mockRestore?.();
  });

  function configure() {
    process.env.MAILGUN_API_KEY = 'key-test';
    process.env.MAILGUN_DOMAIN = 'mg.example.com';
    process.env.MAILGUN_FROM = 'Paul Douglas Roofing <sender@example.com>';
  }

  test('stays simulated until Mailgun key and domain are set', async () => {
    delete process.env.MAILGUN_API_KEY;
    delete process.env.MAILGUN_DOMAIN;
    expect(email.isConfigured()).toBe(false);
    const result = await email.send('a@example.com', 'Hi', 'Body');
    expect(result.simulated).toBe(true);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(logIntegrationEvent).toHaveBeenCalledWith(
      'email', 'out', 'email.simulated', expect.any(Object), 'simulated',
    );
  });

  test('sends branded HTML through Mailgun when configured', async () => {
    configure();
    expect(email.isConfigured()).toBe(true);
    const result = await email.send('customer@example.com', 'Quote', 'Please find attached');
    expect(result.simulated).toBe(false);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.mailgun.net/v3/mg.example.com/messages',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: `Basic ${Buffer.from('api:key-test').toString('base64')}`,
        }),
      }),
    );
    const form = global.fetch.mock.calls[0][1].body;
    expect(form.get('to')).toBe('customer@example.com');
    expect(form.get('from')).toBe('Paul Douglas Roofing <sender@example.com>');
    expect(form.get('subject')).toBe('Quote');
    expect(form.get('text')).toContain('Please find attached');
    expect(form.get('html')).toContain('Please find attached');
    expect(form.get('html')).toContain('#dc1114');
    expect(form.get('html')).toContain('cid:pdr-logo.png');
    expect(form.get('html')).toContain('Paul Douglas Roofing and Building Ltd');
    expect(form.get('inline')).toBeTruthy();
  });

  test('keeps caller attachments as Mailgun files', async () => {
    configure();
    await email.send('customer@example.com', 'Invoice INV-1', 'Please find attached', [
      { filename: 'INV-1.pdf', path: '/tmp/INV-1.pdf' },
    ]);
    const form = global.fetch.mock.calls[0][1].body;
    expect(form.get('inline')).toBeTruthy();
    expect(form.get('attachment')).toBeTruthy();
  });

  test('uses the EU API host when MAILGUN_REGION=eu', async () => {
    configure();
    process.env.MAILGUN_REGION = 'eu';
    await email.send('customer@example.com', 'Hi', 'Body');
    expect(global.fetch.mock.calls[0][0]).toBe('https://api.eu.mailgun.net/v3/mg.example.com/messages');
  });

  test('still sends if branding.mimeForPath is missing', async () => {
    configure();
    const prev = branding.mimeForPath;
    branding.mimeForPath = undefined;
    try {
      await expect(email.send('a@example.com', 'Hi', 'Body')).resolves.toEqual(
        expect.objectContaining({ simulated: false }),
      );
    } finally {
      branding.mimeForPath = prev;
    }
  });

  test('surfaces Mailgun API errors to the caller', async () => {
    configure();
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 401,
      json: async () => ({ message: 'Forbidden' }),
    }));
    await expect(email.send('a@example.com', 'Hi', 'Body')).rejects.toThrow(/Mailgun 401/);
    expect(logIntegrationEvent).toHaveBeenCalledWith(
      'email', 'out', 'email.error', expect.objectContaining({ error: expect.stringMatching(/Forbidden/) }), 'error',
    );
  });
});
