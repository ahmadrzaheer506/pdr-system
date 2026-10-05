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

const mockSendMail = jest.fn(async () => ({ messageId: 'test' }));
jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => ({ sendMail: mockSendMail })),
}));

const nodemailer = require('nodemailer');
const { logIntegrationEvent } = require('../models');
const branding = require('../branding');
const email = require('../integrations/email');

describe('SMTP email adapter', () => {
  const prev = {};

  beforeEach(() => {
    ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'SMTP_PORT', 'SMTP_FROM'].forEach((k) => {
      prev[k] = process.env[k];
    });
    mockSendMail.mockClear();
    nodemailer.createTransport.mockClear();
    logIntegrationEvent.mockClear();
    branding.resolveLogoPath.mockReturnValue('/tmp/brand-logo.png');
    email.resetTransporter();
  });

  afterEach(() => {
    Object.entries(prev).forEach(([k, v]) => {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    });
    email.resetTransporter();
  });

  test('stays simulated until host, user, and password are set', async () => {
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    expect(email.isConfigured()).toBe(false);
    const result = await email.send('a@example.com', 'Hi', 'Body');
    expect(result.simulated).toBe(true);
    expect(mockSendMail).not.toHaveBeenCalled();
    expect(logIntegrationEvent).toHaveBeenCalledWith(
      'email', 'out', 'email.simulated', expect.any(Object), 'simulated',
    );
  });

  test('sends branded HTML through nodemailer when SMTP is configured', async () => {
    process.env.SMTP_HOST = 'smtp.gmail.com';
    process.env.SMTP_USER = 'sender@example.com';
    process.env.SMTP_PASS = 'ubie bcpn bhuk pnur';
    process.env.SMTP_PORT = '587';
    process.env.SMTP_FROM = 'Paul Douglas Roofing <sender@example.com>';
    expect(email.isConfigured()).toBe(true);
    const result = await email.send('customer@example.com', 'Quote', 'Please find attached');
    expect(result.simulated).toBe(false);
    expect(nodemailer.createTransport).toHaveBeenCalledWith(expect.objectContaining({
      host: 'smtp.gmail.com',
      port: 587,
      auth: { user: 'sender@example.com', pass: 'ubiebcpnbhukpnur' },
    }));
    const mail = mockSendMail.mock.calls[0][0];
    expect(mail.to).toBe('customer@example.com');
    expect(mail.subject).toBe('Quote');
    expect(mail.text).toContain('Please find attached');
    expect(mail.html).toContain('Please find attached');
    expect(mail.html).toContain('#dc1114');
    expect(mail.html).toContain('cid:pdr-logo');
    expect(mail.html).toContain('Paul Douglas Roofing and Building Ltd');
    expect(mail.attachments[0]).toEqual(expect.objectContaining({
      cid: 'pdr-logo',
      path: '/tmp/brand-logo.png',
    }));
  });

  test('keeps caller attachments after the inline logo', async () => {
    process.env.SMTP_HOST = 'smtp.gmail.com';
    process.env.SMTP_USER = 'sender@example.com';
    process.env.SMTP_PASS = 'secret';
    await email.send('customer@example.com', 'Invoice INV-1', 'Please find attached', [
      { filename: 'INV-1.pdf', path: '/tmp/INV-1.pdf' },
    ]);
    const mail = mockSendMail.mock.calls[0][0];
    expect(mail.attachments).toEqual([
      expect.objectContaining({ cid: 'pdr-logo' }),
      { filename: 'INV-1.pdf', path: '/tmp/INV-1.pdf' },
    ]);
  });
});
