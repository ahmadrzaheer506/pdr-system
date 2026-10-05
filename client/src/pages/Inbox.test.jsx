import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Inbox from './Inbox.jsx';
import { api } from '../lib/api';
import { pickSelectOption } from '../test/selectMenu.js';
import { pickDate } from '../test/datePicker.js';

vi.mock('../lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn() },
  fmtTimeAgo: () => '1h ago',
}));

const NEW_LIST = {
  leads: [
    {
      id: 1, customer_id: 9, customer_name: 'Dave Whitfield', source: 'whatsapp',
      status: 'NEW', message: 'Leak in the bedroom', phone: '07700 900100', email: null,
      next_action: 'Review & respond', created_at: '2026-09-22T10:00:00Z',
    },
    {
      id: 2, customer_id: 10, customer_name: 'Priya Nair', source: 'phone',
      status: 'NEW', message: 'Called about guttering', phone: '0118 111', email: null,
      created_at: '2026-09-22T09:00:00Z',
    },
    {
      id: 3, customer_id: 11, customer_name: 'Amy Considine', source: 'manual',
      status: 'NEW', message: 'Walk-in', phone: null, email: 'amy@example.co.uk',
      created_at: '2026-09-22T08:00:00Z',
    },
    {
      id: 4, customer_id: 12, customer_name: 'SMS Lead', source: 'sms',
      status: 'NEW', message: 'Text about tiles', phone: '07700 900200', email: null,
      created_at: '2026-09-22T07:00:00Z',
    },
  ],
  counts: { NEW: 4, ACTIONED: 1, CONVERTED: 0, CLOSED: 6 },
};

const CLOSED_LIST = {
  leads: [
    {
      id: 20, customer_id: 30, customer_name: 'Neil Draper', source: 'phone',
      status: 'CLOSED', message: 'Enquiry — did not proceed', phone: '07700 900300', email: null,
      created_at: '2026-09-20T09:00:00Z',
    },
  ],
  counts: { NEW: 4, ACTIONED: 1, CONVERTED: 0, CLOSED: 6 },
};

describe('Lead Inbox (requirement 3.1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.get.mockResolvedValue(NEW_LIST);
    api.put.mockResolvedValue({ ok: true });
  });

  it('lists every channel on one page and has a Closed tab', async () => {
    render(<MemoryRouter><Inbox /></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'Lead Inbox' })).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/leads?status=NEW');
    expect(screen.getByText('Dave Whitfield')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Dave Whitfield' })[0]).toHaveAttribute('href', '/leads/9?from=inbox&lead=1');
    expect(screen.getByText('WhatsApp')).toBeInTheDocument();
    expect(screen.getByText('Priya Nair')).toBeInTheDocument();
    expect(screen.getByText('Phone')).toBeInTheDocument();
    expect(screen.getByText('Amy Considine')).toBeInTheDocument();
    expect(screen.getByText('Manual')).toBeInTheDocument();
    expect(screen.getByText('SMS Lead')).toBeInTheDocument();
    expect(screen.getByText('SMS')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /closed/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/search leads/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/filter by source/i)).toBeInTheDocument();
    expect(screen.queryByText(/demo simulator/i)).toBeNull();
  });

  it('does not show the demo simulator', async () => {
    render(<MemoryRouter><Inbox /></MemoryRouter>);
    await screen.findByText('Dave Whitfield');
    expect(screen.queryByText(/inject a test enquiry/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /^lead ad$/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^whatsapp$/i })).toBeNull();
  });

  it('shows a card empty state with the same inbox message when a tab has no leads', async () => {
    api.get.mockResolvedValue({
      leads: [],
      counts: { NEW: 0, ACTIONED: 3, CONVERTED: 0, CLOSED: 6 },
    });
    render(<MemoryRouter><Inbox /></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'No leads here' })).toBeInTheDocument();
    expect(screen.getByText(/will land in this inbox automatically/i)).toBeInTheDocument();
  });

  it('loads CLOSED leads when Closed is selected', async () => {
    const user = userEvent.setup();
    api.get.mockResolvedValueOnce(NEW_LIST).mockResolvedValueOnce(CLOSED_LIST);
    render(<MemoryRouter><Inbox /></MemoryRouter>);
    await screen.findByText('Dave Whitfield');
    await user.click(screen.getByRole('button', { name: /closed/i }));
    expect(await screen.findByText('Neil Draper')).toBeInTheDocument();
    expect(api.get).toHaveBeenLastCalledWith('/leads?status=CLOSED');
    expect(screen.getByText('Enquiry — did not proceed')).toBeInTheDocument();
  });

  it('sends search, source, and created-date filters', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><Inbox /></MemoryRouter>);
    await screen.findByText('Dave Whitfield');
    await user.type(screen.getByLabelText(/search leads/i), 'Dave');
    await pickSelectOption(user, /filter by source/i, 'whatsapp');
    await pickDate(user, /created from/i, '2026-09-01');
    await pickDate(user, /created to/i, '2026-09-22');
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/leads?status=NEW&q=Dave&source=whatsapp&created_from=2026-09-01&created_to=2026-09-22');
    });
    await user.click(screen.getByRole('button', { name: /clear filters/i }));
    await waitFor(() => {
      expect(api.get).toHaveBeenLastCalledWith('/leads?status=NEW');
    });
  });
});

describe('Log enquiry (requirement 3.3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.get.mockResolvedValue(NEW_LIST);
    api.post.mockResolvedValue({ customerId: 9, leadId: 40 });
  });

  it('keeps Came in via, requires name, and posts without a phone', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><Inbox /></MemoryRouter>);
    await user.click(await screen.findByRole('button', { name: /log enquiry/i }));
    expect(screen.getByRole('radio', { name: /existing customer/i })).toHaveAttribute('aria-checked', 'true');
    await user.click(screen.getByRole('radio', { name: /new customer/i }));
    expect(screen.getByLabelText(/^name$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^came in via$/i)).toHaveAttribute('data-value', 'manual');
    expect(screen.getByLabelText(/^customer type$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^phone type$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^email type$/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^postcode$/i)).not.toBeInTheDocument();
    await user.click(screen.getByLabelText(/^came in via$/i));
    expect(screen.getByRole('option', { name: /logged manually/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /^phone$/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /^lead ad$/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/^phone$/i)).not.toBeRequired();
    await user.click(screen.getByRole('option', { name: /^phone$/i }));
    await user.type(screen.getByLabelText(/^name$/i), 'Dave Whitfield');
    await user.type(screen.getByLabelText(/what do they need/i), 'Called about guttering');
    await user.click(screen.getByRole('button', { name: /add to inbox/i }));
    expect(api.post).toHaveBeenCalledWith('/leads', expect.objectContaining({
      source: 'phone',
      name: 'Dave Whitfield',
      phone: '',
      phone_type: 'mobile',
      email: '',
      email_type: 'personal',
      address: '',
      customer_type: 'domestic',
      message: 'Called about guttering',
    }));
    expect(api.post.mock.calls[0][1]).not.toHaveProperty('postcode');
  });
});

describe('Inbox matching and next-action (requirement 3.4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.get.mockResolvedValue(NEW_LIST);
    api.post.mockResolvedValue({ customerId: 9, leadId: 40 });
    api.put.mockResolvedValue({ ok: true });
  });

  it('shows the stored next action and Mark actioned does not require a pick-list', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><Inbox /></MemoryRouter>);
    expect(await screen.findByText('Next: Review & respond')).toBeInTheDocument();
    expect(screen.queryByLabelText(/next action/i)).toBeNull();
    await user.click(screen.getAllByRole('button', { name: /mark actioned/i })[0]);
    expect(api.put).toHaveBeenCalledWith('/leads/1', { status: 'ACTIONED' });
  });

  it('shows the same 409 notice as customer create when the phone is already on file', async () => {
    const user = userEvent.setup();
    const err = new Error('This phone number is already on Dave Whitfield. Open that customer instead.');
    err.status = 409;
    err.data = { error: err.message, customer_id: 9, name: 'Dave Whitfield' };
    api.post.mockRejectedValue(err);

    render(<MemoryRouter><Inbox /></MemoryRouter>);
    await user.click(await screen.findByRole('button', { name: /log enquiry/i }));
    await user.click(screen.getByRole('radio', { name: /new customer/i }));
    await user.type(screen.getByLabelText(/^name$/i), 'Someone Else');
    await user.type(screen.getByLabelText(/^phone$/i), '07700 900100');
    await user.click(screen.getByRole('button', { name: /add to inbox/i }));

    expect(await screen.findByRole('link', { name: /open dave whitfield/i })).toHaveAttribute('href', '/customers/9');
    expect(screen.getByRole('alert')).toHaveTextContent(/Dave Whitfield/);
    expect(api.post).toHaveBeenCalledWith('/leads', expect.objectContaining({
      name: 'Someone Else',
      phone: '07700 900100',
    }));
  });
});

const DAVE_CUSTOMER = {
  customer: {
    id: 9,
    name: 'Dave Whitfield',
    sites: [{ id: 1, address: '14 Elm Grove', postcode: 'RG1 5AB', is_primary: true }],
    phones: [{ id: 3, value: '07700 900100', type: 'mobile', is_primary: true }],
    emails: [{ id: 4, value: 'dave@example.com', type: 'personal', is_primary: true }],
  },
};

const CUSTOMER_LIST = {
  customers: [
    { id: 9, name: 'Dave Whitfield', phone: '07700 900100' },
    { id: 10, name: 'Priya Nair', company_name: 'Nair Roofing' },
  ],
};

const PRIYA_MULTI = {
  customer: {
    id: 10,
    name: 'Priya Nair',
    sites: [
      { id: 11, address: '1 High St', postcode: 'RG1 1AA', is_primary: true },
      { id: 12, address: '2 Low Rd', postcode: 'RG2 2BB', is_primary: false },
    ],
    phones: [
      { id: 21, value: '0118 111', type: 'landline', is_primary: true },
      { id: 22, value: '07700 111222', type: 'mobile', is_primary: false },
    ],
    emails: [
      { id: 31, value: 'priya@example.com', type: 'personal', is_primary: true },
      { id: 32, value: 'office@nair.test', type: 'work', is_primary: false },
    ],
  },
};

const PRIYA_MIXED = {
  customer: {
    id: 10,
    name: 'Priya Nair',
    sites: [{ id: 11, address: '1 High St', postcode: 'RG1 1AA', is_primary: true }],
    phones: [
      { id: 21, value: '0118 111', type: 'landline', is_primary: true },
      { id: 22, value: '07700 111222', type: 'mobile', is_primary: false },
    ],
    emails: [{ id: 31, value: 'priya@example.com', type: 'personal', is_primary: true }],
  },
};

function mockEnquiryCustomers(detailById = {}) {
  api.get.mockImplementation((url) => {
    const path = String(url);
    if (path === '/customers' || path.startsWith('/customers?')) return Promise.resolve(CUSTOMER_LIST);
    if (path === '/customers/9') return Promise.resolve(detailById[9] || DAVE_CUSTOMER);
    if (path === '/customers/10') return Promise.resolve(detailById[10] || PRIYA_MULTI);
    return Promise.resolve(NEW_LIST);
  });
}

describe('Log enquiry existing customer (requirement 3.3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnquiryCustomers();
    api.post.mockResolvedValue({ customerId: 9, leadId: 40 });
  });

  async function openExisting() {
    const user = userEvent.setup();
    render(<MemoryRouter><Inbox /></MemoryRouter>);
    await user.click(await screen.findByRole('button', { name: /log enquiry/i }));
    expect(screen.getByRole('radio', { name: /existing customer/i })).toHaveAttribute('aria-checked', 'true');
    expect(screen.queryByLabelText(/^name$/i)).toBeNull();
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/customers'));
    await waitFor(() => {
      expect(screen.getByLabelText(/^search customer$/i)).toBeInTheDocument();
    });
    return user;
  }

  async function pickCustomer(user, id) {
    const trigger = screen.getByLabelText(/^search customer$/i);
    await user.click(trigger);
    const option = await screen.findByRole('option', { name: (_, el) => el.getAttribute('data-value') === String(id) });
    await user.click(option);
  }

  it('auto-selects site, phone and email when the customer has one of each', async () => {
    const user = await openExisting();
    await pickCustomer(user, 9);
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/customers/9'));
    expect(await screen.findByLabelText(/^site$/i)).toHaveAttribute('data-value', '1');
    expect(screen.getByLabelText(/^site$/i)).toHaveTextContent(/14 Elm Grove, RG1 5AB/);
    expect(screen.getByLabelText(/^phone$/i)).toHaveAttribute('data-value', '3');
    expect(screen.getByLabelText(/^phone$/i)).toHaveTextContent('07700 900100');
    expect(screen.getByLabelText(/^email$/i)).toHaveAttribute('data-value', '4');
    expect(screen.getByLabelText(/^email$/i)).toHaveTextContent('dave@example.com');
    await user.type(screen.getByLabelText(/what do they need/i), 'Called about guttering');
    await user.click(screen.getByRole('button', { name: /add to inbox/i }));
    expect(api.post).toHaveBeenCalledWith('/leads', {
      source: 'manual',
      customer_id: 9,
      site_id: 1,
      phone_id: 3,
      email_id: 4,
      message: 'Called about guttering',
    });
    await waitFor(() => {
      const leadGets = api.get.mock.calls.filter(([url]) => String(url).startsWith('/leads'));
      expect(leadGets.length).toBeGreaterThanOrEqual(2);
      expect(leadGets.at(-1)[0]).toBe('/leads?status=NEW');
    });
    expect(await screen.findByText('Enquiry added')).toBeInTheDocument();
  });

  it('does not auto-select when the customer has multiple sites, phones or emails', async () => {
    const user = await openExisting();
    await pickCustomer(user, 10);
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/customers/10'));
    expect(await screen.findByLabelText(/^site$/i)).toHaveAttribute('data-value', '');
    expect(screen.getByLabelText(/^phone$/i)).toHaveAttribute('data-value', '');
    expect(screen.getByLabelText(/^email$/i)).toHaveAttribute('data-value', '');
    await user.click(screen.getByRole('button', { name: /add to inbox/i }));
    expect(api.post).toHaveBeenCalledWith('/leads', {
      source: 'manual',
      customer_id: 10,
      site_id: null,
      phone_id: null,
      email_id: null,
      message: '',
    });
  });

  it('auto-selects only the contact types that have a single option', async () => {
    mockEnquiryCustomers({ 10: PRIYA_MIXED });
    const user = await openExisting();
    await pickCustomer(user, 10);
    expect(await screen.findByLabelText(/^site$/i)).toHaveAttribute('data-value', '11');
    expect(screen.getByLabelText(/^phone$/i)).toHaveAttribute('data-value', '');
    expect(screen.getByLabelText(/^email$/i)).toHaveAttribute('data-value', '31');
  });

  it('asks the user to pick a customer before saving', async () => {
    const user = await openExisting();
    await user.click(screen.getByRole('button', { name: /add to inbox/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Pick a customer');
    expect(api.post).not.toHaveBeenCalled();
  });

  it('lets office add missing site, phone and email from the enquiry form', async () => {
    mockEnquiryCustomers({
      9: { customer: { id: 9, name: 'Dave Whitfield', sites: [], phones: [], emails: [] } },
    });
    api.post.mockImplementation((url, body) => {
      if (url === '/customers/9/sites') return Promise.resolve({ site: { id: 101, address: body.address, is_primary: true } });
      if (url === '/customers/9/phones') return Promise.resolve({ phone: { id: 102, value: body.value, type: body.type, is_primary: true } });
      if (url === '/customers/9/emails') return Promise.resolve({ email: { id: 103, value: body.value, type: body.type, is_primary: true } });
      return Promise.resolve({ customerId: 9, leadId: 40 });
    });
    const user = await openExisting();
    await pickCustomer(user, 9);
    expect(await screen.findByLabelText(/^site$/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^postcode$/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/^phone$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^email$/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /add site/i }));
    await user.type(screen.getByLabelText(/new site address/i), '14 Elm Grove');
    await user.click(screen.getByRole('button', { name: /save site/i }));
    await user.click(screen.getByRole('button', { name: /add phone/i }));
    await user.type(screen.getByLabelText(/new phone number/i), '07700 900100');
    await user.click(screen.getByRole('button', { name: /save phone/i }));
    await user.click(screen.getByRole('button', { name: /add email/i }));
    await user.type(screen.getByLabelText(/new email address/i), 'dave@example.com');
    await user.click(screen.getByRole('button', { name: /save email/i }));
    await waitFor(() => expect(screen.getByLabelText(/^site$/i)).toHaveAttribute('data-value', '101'));
    await user.click(screen.getByRole('button', { name: /add to inbox/i }));
    expect(api.post).toHaveBeenCalledWith('/customers/9/sites', { address: '14 Elm Grove' });
    expect(api.post).toHaveBeenCalledWith('/customers/9/phones', { value: '07700 900100', type: 'mobile' });
    expect(api.post).toHaveBeenCalledWith('/customers/9/emails', { value: 'dave@example.com', type: 'personal' });
    const leadCall = api.post.mock.calls.find((call) => call[0] === '/leads');
    expect(leadCall[1]).toEqual(expect.objectContaining({
      customer_id: 9,
      site_id: 101,
      phone_id: 102,
      email_id: 103,
    }));
    expect(leadCall[1]).not.toHaveProperty('postcode');
    expect(leadCall[1]).not.toHaveProperty('address');
  });
});

describe('Inbox book visit (requirement 5.1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.get.mockImplementation((url) => {
      if (String(url) === '/settings/users') {
        return Promise.resolve({ users: [{ id: 3, name: 'Jamie Fisher', role: 'STAFF', active: true }] });
      }
      if (String(url).startsWith('/customers/')) return Promise.resolve(DAVE_CUSTOMER);
      return Promise.resolve(NEW_LIST);
    });
    api.post.mockResolvedValue({ id: 50 });
  });

  it('opens Book visit on a lead customer and posts the appointment', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><Inbox /></MemoryRouter>);
    await screen.findByText('Dave Whitfield');
    await user.click(screen.getAllByRole('button', { name: /book visit/i })[0]);
    expect(await screen.findByRole('heading', { name: /book a site visit/i })).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/customers/9');
    expect(await screen.findByLabelText(/^site$/i)).toBeInTheDocument();
    await pickSelectOption(user, /^assigned to$/i, /jamie fisher/i);
    const submit = screen.getAllByRole('button', { name: /^book visit$/i }).find((b) => b.className.includes('btn-primary'));
    await user.click(submit);
    expect(api.post).toHaveBeenCalledWith('/appointments', expect.objectContaining({
      customer_id: 9,
      assignee_ids: [3],
    }));
    expect(await screen.findByText('Visit booked')).toBeInTheDocument();
  });
});
