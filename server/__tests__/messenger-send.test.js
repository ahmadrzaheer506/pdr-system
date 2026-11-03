jest.mock('../models', () => ({
  Customer: { update: jest.fn() },
  Lead: { findByPk: jest.fn() },
  Message: { create: jest.fn(), findOne: jest.fn() },
  CustomerPhone: {},
  CustomerEmail: {},
}));
jest.mock('../services/pipeline', () => ({ logActivity: jest.fn() }));
jest.mock('../customerContacts', () => ({
  loadCustomerWithContacts: jest.fn(),
  applyLeadContacts: jest.fn(),
}));
jest.mock('../integrations/whatsapp', () => ({
  canMetaFetchMedia: jest.fn(),
  LOCALHOST_PDF_WARNING: 'localhost pdf skipped',
  MEDIA_FETCH_ERROR: 'could not download pdf',
  isFatalGraphError: jest.fn((err) => [190, 131030, 131047].includes(err && err.graphCode)),
  sendDocument: jest.fn(),
  sendTemplate: jest.fn(),
  sendText: jest.fn(),
}));
jest.mock('../integrations/email', () => ({ send: jest.fn() }));
jest.mock('../integrations/meta', () => ({ sendPageMessage: jest.fn() }));

const { Customer, Lead, Message } = require('../models');
const contacts = require('../customerContacts');
const whatsapp = require('../integrations/whatsapp');
const email = require('../integrations/email');
const { sendToCustomer } = require('../services/messenger');

describe('sendToCustomer WhatsApp', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    contacts.loadCustomerWithContacts.mockResolvedValue({ id: 9, phone: '923069158103' });
    Customer.update.mockResolvedValue([1]);
    Message.create.mockResolvedValue({ id: 55 });
    whatsapp.sendText.mockResolvedValue({ simulated: false, wa_id: 'wamid.text' });
    whatsapp.sendTemplate.mockResolvedValue({ simulated: false, wa_id: 'wamid.tpl' });
    whatsapp.sendDocument.mockResolvedValue({ simulated: false, wa_id: 'wamid.doc' });
  });

  test('skips localhost PDFs and still sends text after a missing template', async () => {
    whatsapp.canMetaFetchMedia.mockReturnValue(false);
    whatsapp.sendTemplate.mockRejectedValue(Object.assign(new Error('template missing'), { graphCode: 132001 }));

    const result = await sendToCustomer(9, 'whatsapp', 'Quote body', {
      docUrl: 'http://localhost:4000/public-files/x/q.pdf',
      docName: 'Q.pdf',
      template: 'quote_sent',
    });

    expect(whatsapp.sendDocument).not.toHaveBeenCalled();
    expect(whatsapp.sendText).toHaveBeenCalledWith('923069158103', 'Quote body');
    expect(result.warning).toBe(whatsapp.LOCALHOST_PDF_WARNING);
  });

  test('falls back to text when Meta cannot fetch a public PDF', async () => {
    whatsapp.canMetaFetchMedia.mockReturnValue(true);
    whatsapp.sendDocument.mockRejectedValue(
      Object.assign(new Error(whatsapp.MEDIA_FETCH_ERROR), { graphCode: 131053 }),
    );
    whatsapp.sendTemplate.mockRejectedValue(Object.assign(new Error('template missing'), { graphCode: 132001 }));

    const result = await sendToCustomer(9, 'whatsapp', 'Quote body', {
      docUrl: 'https://tunnel.example/public-files/x/q.pdf',
      docName: 'Q.pdf',
      template: 'quote_sent',
    });

    expect(whatsapp.sendDocument).toHaveBeenCalled();
    expect(whatsapp.sendText).toHaveBeenCalledWith('923069158103', 'Quote body');
    expect(result.warning).toBe(whatsapp.MEDIA_FETCH_ERROR);
  });

  test('does not send free text after a 24-hour re-engagement error', async () => {
    whatsapp.canMetaFetchMedia.mockReturnValue(false);
    whatsapp.sendTemplate.mockRejectedValue(
      Object.assign(new Error('24 hours'), { graphCode: 131047 }),
    );

    await expect(
      sendToCustomer(9, 'whatsapp', 'Quote body', { template: 'quote_sent' }),
    ).rejects.toMatchObject({ graphCode: 131047 });
    expect(whatsapp.sendText).not.toHaveBeenCalled();
  });
});

describe('sendToCustomer email uses the enquiry address', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    contacts.loadCustomerWithContacts.mockResolvedValue({
      id: 9,
      email: 'old@example.com',
      emails: [
        { id: 2, value: 'old@example.com', is_primary: true },
        { id: 9, value: 'new@example.com', is_primary: false },
      ],
    });
    contacts.applyLeadContacts.mockReturnValue({ email: 'new@example.com', phone: null });
    Lead.findByPk.mockResolvedValue({ id: 40, customer_id: 9, email_id: 9 });
    Customer.update.mockResolvedValue([1]);
    Message.create.mockResolvedValue({ id: 56 });
    email.send.mockResolvedValue({ simulated: false });
  });

  test('sends to the lead email instead of the customer primary', async () => {
    await sendToCustomer(9, 'email', 'Hello', { leadId: 40, subject: 'Quote' });
    expect(Lead.findByPk).toHaveBeenCalledWith(40);
    expect(contacts.applyLeadContacts).toHaveBeenCalled();
    expect(email.send).toHaveBeenCalledWith('new@example.com', 'Quote', 'Hello', []);
  });
});
