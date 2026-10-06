jest.mock('../models', () => ({
  logIntegrationEvent: jest.fn(),
  Message: { findOne: jest.fn() },
}));

const whatsapp = require('../integrations/whatsapp');

describe('WhatsApp send without keys', () => {
  const prevToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const prevPhone = process.env.WHATSAPP_PHONE_NUMBER_ID;

  afterEach(() => {
    process.env.WHATSAPP_ACCESS_TOKEN = prevToken;
    process.env.WHATSAPP_PHONE_NUMBER_ID = prevPhone;
  });

  test('rejects outbound send when access token and phone number ID are missing', async () => {
    delete process.env.WHATSAPP_ACCESS_TOKEN;
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    await expect(whatsapp.sendText('07700900100', 'Hi')).rejects.toThrow(whatsapp.NOT_CONNECTED_ERROR);
    await expect(whatsapp.sendDocument('07700900100', 'https://example/q.pdf', 'q.pdf')).rejects.toThrow(
      whatsapp.NOT_CONNECTED_ERROR,
    );
  });
});

describe('WhatsApp Graph errors', () => {
  test('explains the 24-hour re-engagement rule', () => {
    expect(whatsapp.friendlyGraphError(400, { code: 131047 })).toMatch(/24 hours/i);
  });

  test('explains a PDF media fetch failure without calling it localhost', () => {
    expect(whatsapp.friendlyGraphError(400, { code: 131053 })).toBe(whatsapp.MEDIA_FETCH_ERROR);
    expect(whatsapp.MEDIA_FETCH_ERROR).not.toMatch(/localhost/i);
  });

  test('treats token, allow-list, and 24h errors as fatal (no text fallback)', () => {
    expect(whatsapp.isFatalGraphError({ graphCode: 131047 })).toBe(true);
    expect(whatsapp.isFatalGraphError({ graphCode: 190 })).toBe(true);
    expect(whatsapp.isFatalGraphError({ graphCode: 131030 })).toBe(true);
    expect(whatsapp.isFatalGraphError({ graphCode: 132001 })).toBe(false);
  });

  test('rejects localhost PDF URLs that Meta cannot download', () => {
    expect(whatsapp.canMetaFetchMedia('http://localhost:4000/public-files/x/quote.pdf')).toBe(false);
    expect(whatsapp.canMetaFetchMedia('https://app.example.com/public-files/x/quote.pdf')).toBe(true);
    expect(whatsapp.canMetaFetchMedia('https://popliteal-minh-unperilous.ngrok-free.dev/public-files/x/quote.pdf')).toBe(true);
  });
});
