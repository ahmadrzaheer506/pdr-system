const { buildIntegrationGuidePdf, DOWNLOAD_NAME, GUIDE_PATH } = require('../services/integrationGuidePdf');
const fs = require('fs');

describe('integration setup guide PDF', () => {
  test('guide markdown is present', () => {
    expect(fs.existsSync(GUIDE_PATH)).toBe(true);
    const md = fs.readFileSync(GUIDE_PATH, 'utf8');
    expect(md).toMatch(/Google Calendar/);
    expect(md).toMatch(/QuickBooks Online \(UK\)/);
    expect(md).toMatch(/WhatsApp Business/);
  });

  test('builds a branded PDF from the markdown guide', async () => {
    const pdf = await buildIntegrationGuidePdf({ name: 'Paul Douglas Roofing & Building Ltd' });
    expect(Buffer.isBuffer(pdf)).toBe(true);
    expect(pdf.slice(0, 4).toString()).toBe('%PDF');
    expect(pdf.length).toBeGreaterThan(8000);
    expect(DOWNLOAD_NAME).toBe('CRM-integration-setup-guide.pdf');
  }, 15000);
});
