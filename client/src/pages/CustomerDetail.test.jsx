import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import CustomerDetail from './CustomerDetail.jsx';
import { api } from '../lib/api';
import { taskHref } from '../lib/taskList.js';
import { pickSelectOption } from '../test/selectMenu.js';

vi.mock('../components/QuoteBuilder.jsx', () => ({
  default: ({ open, existingQuote }) => (
    open ? <div>Quote builder {existingQuote?.ref || 'new'}</div> : null
  ),
}));
vi.mock('../components/BookVisit.jsx', () => ({ default: () => null }));
vi.mock('../components/JobModal.jsx', () => ({
  default: ({ jobId }) => (jobId ? <div>Job modal {jobId}</div> : null),
}));
vi.mock('../components/DatePicker.jsx', () => ({
  default: ({ id, label, value, onChange }) => (
    <label htmlFor={id}>
      {label}
      <input id={id} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  ),
}));

vi.mock('../lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn(), upload: vi.fn(), download: vi.fn() },
  money: (n) => `£${Number(n || 0).toFixed(2)}`,
  fmtDate: () => '',
  fmtDateTime: (d) => `dt:${d}`,
  fmtTimeAgo: () => '',
}));

const DETAIL = {
  customer: {
    id: 9,
    name: 'Dave Whitfield',
    phone: '07700 900100',
    email: 'dave@example.com',
    address: '1 Test Road',
    postcode: 'S1 1AA',
    notes: '',
    stage: 'ENQUIRY',
    customer_type: 'domestic',
    company_name: null,
    vat_number: null,
    owner_id: 1,
    owner_name: 'Paul Douglas',
    phones: [{ id: 1, value: '07700 900100', type: 'mobile', is_primary: true }],
    emails: [{ id: 2, value: 'dave@example.com', type: 'personal', is_primary: true }],
    sites: [{ id: 3, address: '1 Test Road', postcode: 'S1 1AA', is_primary: true }],
  },
  messages: [],
  activity: [],
  timeline: [
    {
      id: 'message-1',
      type: 'message',
      at: '2026-01-02T10:00:00Z',
      summary: 'Following up on quote',
      user_name: null,
      meta: { channel: 'whatsapp', direction: 'in', status: 'received' },
    },
    {
      id: 'activity-1',
      type: 'quote',
      at: '2026-01-01T09:00:00Z',
      summary: 'Quote Q-2026-0001 created — £1,200.00',
      user_name: 'Lisa',
      meta: { kind: 'quote_created' },
    },
  ],
  quotes: [],
  jobs: [],
  invoices: [],
  appointments: [
    {
      id: 11,
      start: '2026-03-10T09:00:00Z',
      end: '2026-03-10T10:00:00Z',
      status: 'booked',
      visit_type: 'site_visit',
      address: '1 Test Road',
      gcal_status: null,
    },
    {
      id: 12,
      start: '2026-10-10T09:00:00Z',
      end: '2026-10-10T10:00:00Z',
      status: 'booked',
      visit_type: 'follow_up',
      address: '1 Test Road',
      notes: 'Check flashing',
      site_id: 3,
      phone_id: 1,
      email_id: 2,
      assignee_name: 'Jamie Fisher',
      gcal_status: null,
    },
  ],
  leads: [],
  followups: [],
  internal_notes: [{ id: 21, body: 'Scaffold booked for Monday', created_at: '2026-01-04T09:00:00Z', user_name: 'Lisa' }],
  files: [{ id: 31, original_name: 'survey.pdf', mime: 'application/pdf', size_bytes: 1200, created_at: '2026-01-04T09:00:00Z' }],
  stageHistory: [{
    id: 1, from_stage: 'ENQUIRY', to_stage: 'QUOTED', created_at: '2026-01-07T09:00:00Z', user_name: 'Lisa',
  }],
  stages: [],
  labels: { ENQUIRY: 'Enquiry', QUOTED: 'Quoted' },
};

function renderDetail(path = '/leads/9') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/leads/:id" element={<CustomerDetail />} />
        <Route path="/customers/:id" element={<div>Customer record</div>} />
        <Route path="/inbox" element={<div>Inbox</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('CustomerDetail type (requirement 2.1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.get.mockImplementation((path) => {
      if (path === '/settings') {
        return Promise.resolve({ settings: { templates: { custom: [] } } });
      }
      if (String(path).includes('/settings/users')) {
        return Promise.resolve({
          users: [
            { id: 1, name: 'Paul Douglas', role: 'ADMIN', active: true },
            { id: 2, name: 'Lisa Grant', role: 'OFFICE', active: true },
            { id: 3, name: 'Jamie Fisher', role: 'STAFF', active: true },
          ],
        });
      }
      return Promise.resolve(DETAIL);
    });
    api.put.mockResolvedValue({ ok: true });
  });

  it('shows Domestic and does not offer an Edit customer button', async () => {
    renderDetail();
    expect(await screen.findByText('Domestic')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^edit$/i })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /customer record/i })).toHaveAttribute('href', '/customers/9');
    expect(screen.getByRole('button', { name: /new quote/i }).parentElement).toHaveClass('ml-auto', 'justify-end', 'shrink-0');
  });

  it('shows company name and VAT on a commercial record', async () => {
    api.get.mockResolvedValue({
      ...DETAIL,
      customer: {
        ...DETAIL.customer,
        customer_type: 'commercial',
        company_name: 'Site Roofing Ltd',
        vat_number: 'GB 123 4567 89',
      },
    });
    renderDetail();
    expect(await screen.findByText('Commercial')).toBeInTheDocument();
    expect(screen.getByText('Site Roofing Ltd')).toBeInTheDocument();
    expect(screen.getByText('VAT GB 123 4567 89')).toBeInTheDocument();
  });

  it('shows stored phones, emails, and sites in the header', async () => {
    renderDetail();
    expect((await screen.findAllByText('07700 900100')).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('1 Test Road, S1 1AA').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('Sites, phones & emails')).not.toBeInTheDocument();
  });

  it('renders the unified activity timeline (requirement 2.3)', async () => {
    renderDetail();
    expect(await screen.findByText('Activity timeline')).toBeInTheDocument();
    expect(screen.getByText('Following up on quote')).toBeInTheDocument();
    expect(screen.getByText(/Quote Q-2026-0001 created/)).toBeInTheDocument();
  });

  it('renders booked site visits without crashing', async () => {
    renderDetail();
    expect(await screen.findByText('Site visits')).toBeInTheDocument();
    expect(screen.getByText('dt:2026-03-10T09:00:00Z')).toBeInTheDocument();
  });

  it('shows internal notes and attachments on the customer page, not mixed into Conversation', async () => {
    renderDetail();
    expect(await screen.findByText('Internal notes')).toBeInTheDocument();
    expect(screen.getByText('Scaffold booked for Monday')).toBeInTheDocument();
    expect(screen.getByText('Attachments')).toBeInTheDocument();
    expect(screen.getByText('survey.pdf')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^whatsapp$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^email$/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^note$/i })).not.toBeInTheDocument();
    expect(screen.getByText('Quotes')).toBeInTheDocument();
    expect(screen.getByText('Jobs')).toBeInTheDocument();
    expect(screen.getByText('Invoices')).toBeInTheDocument();
  });

  it('hides Sites, phones & emails on the lead workspace and links to the customer record', async () => {
    renderDetail('/leads/9?from=inbox');
    expect(await screen.findByText('Dave Whitfield')).toBeInTheDocument();
    expect(screen.queryByText('Sites, phones & emails')).not.toBeInTheDocument();
    expect(screen.getByText('Internal notes')).toBeInTheDocument();
    expect(screen.getByText('Attachments')).toBeInTheDocument();
    expect(screen.getByText('Activity timeline')).toBeInTheDocument();
    expect(screen.getByText('Back to inbox')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /customer record/i })).toHaveAttribute('href', '/customers/9');
    expect(screen.getByRole('link', { name: /customer record/i })).toHaveClass('btn-secondary');
    expect(screen.queryByRole('button', { name: /^edit$/i })).not.toBeInTheDocument();
  });

  it('opens a later enquiry without the previous deal quotes, visits, or WON stage', async () => {
    api.get.mockImplementation((path) => {
      if (path === '/settings') {
        return Promise.resolve({ settings: { templates: { custom: [] } } });
      }
      if (String(path).includes('/settings/users')) {
        return Promise.resolve({ users: [] });
      }
      return Promise.resolve({
        ...DETAIL,
        customer: { ...DETAIL.customer, stage: 'WON' },
        leads: [
          {
            id: 40, source: 'phone', status: 'NEW', message: 'Called again about a porch leak',
            next_action: 'Review & respond', created_at: '2026-10-02T22:00:00Z', stage: 'ENQUIRY',
          },
          {
            id: 30, source: 'facebook_lead', status: 'NEW',
            message: 'sahil1122@yopmail.com working on it please',
            created_at: '2026-10-02T21:00:00Z', stage: 'WON',
          },
        ],
        quotes: [{
          id: 5, ref: 'Q-2026-0001', title: 'Felt', total: 1200, status: 'accepted',
          optional_extras: [], created_at: '2026-10-02T21:20:00Z',
        }],
        appointments: [{
          id: 11, start: '2026-10-03T09:00:00Z', end: '2026-10-03T10:00:00Z',
          status: 'done', visit_type: 'site_visit', address: '1 Test Road',
          created_at: '2026-10-02T21:10:00Z',
        }],
        stageHistory: [{
          id: 8, from_stage: 'QUOTED', to_stage: 'WON',
          created_at: '2026-10-02T21:30:00Z', user_name: 'Paul Douglas',
        }],
      });
    });
    renderDetail('/leads/9?from=inbox&lead=40');
    expect(await screen.findByText('Called again about a porch leak')).toBeInTheDocument();
    expect(screen.getByText('Phone')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /enquiry/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^won$/i })).not.toBeInTheDocument();
    expect(screen.queryByText('Q-2026-0001')).not.toBeInTheDocument();
    expect(screen.queryByText('sahil1122@yopmail.com working on it please')).not.toBeInTheDocument();
    expect(screen.queryByText('Following up on quote')).not.toBeInTheDocument();
    expect(screen.queryByText(/Quote Q-2026-0001 created/)).not.toBeInTheDocument();
    expect(screen.getByText('No quotes yet.')).toBeInTheDocument();
    expect(screen.getByText('None booked.')).toBeInTheDocument();
    expect(screen.getByText('No stage changes yet.')).toBeInTheDocument();
    expect(screen.getByText('No activity yet.')).toBeInTheDocument();
  });

  it('keeps the earlier enquiry quotes and visits when that lead is opened', async () => {
    api.get.mockImplementation((path) => {
      if (path === '/settings') {
        return Promise.resolve({ settings: { templates: { custom: [] } } });
      }
      if (String(path).includes('/settings/users')) {
        return Promise.resolve({ users: [] });
      }
      return Promise.resolve({
        ...DETAIL,
        customer: { ...DETAIL.customer, stage: 'WON' },
        leads: [
          {
            id: 40, source: 'phone', status: 'NEW', message: 'Called again about a porch leak',
            created_at: '2026-10-02T22:00:00Z', stage: 'ENQUIRY',
          },
          {
            id: 30, source: 'facebook_lead', status: 'NEW',
            message: 'sahil1122@yopmail.com working on it please',
            created_at: '2026-10-02T21:00:00Z', stage: 'WON',
          },
        ],
        quotes: [{
          id: 5, ref: 'Q-2026-0001', title: 'Felt', total: 1200, status: 'accepted',
          optional_extras: [], created_at: '2026-10-02T21:20:00Z',
        }],
        appointments: [{
          id: 11, start: '2026-10-03T09:00:00Z', end: '2026-10-03T10:00:00Z',
          status: 'done', visit_type: 'site_visit', address: '1 Test Road',
          created_at: '2026-10-02T21:10:00Z',
        }],
        timeline: [{
          id: 'message-fb', type: 'message', at: '2026-10-02T21:02:00Z',
          summary: 'sahil1122@yopmail.com working on it please',
          meta: { channel: 'facebook', direction: 'in' },
        }],
      });
    });
    renderDetail('/leads/9?from=inbox&lead=30');
    expect(await screen.findAllByText('sahil1122@yopmail.com working on it please')).not.toHaveLength(0);
    expect(screen.getByText('Facebook Lead')).toBeInTheDocument();
    expect(screen.getByText('Q-2026-0001')).toBeInTheDocument();
    expect(screen.getByText('dt:2026-10-03T09:00:00Z')).toBeInTheDocument();
    expect(screen.queryByText('Called again about a porch leak')).not.toBeInTheDocument();
  });

  it('requires a pick-list reason before moving to Lost (requirement 2.6)', async () => {
    const user = userEvent.setup({ delay: null });
    renderDetail();
    await user.click(await screen.findByRole('button', { name: /enquiry/i }));
    await user.click(screen.getByRole('button', { name: /^lost$/i }));
    expect(screen.getByText(/why was this lost/i)).toBeInTheDocument();
    expect(api.put).not.toHaveBeenCalled();
    await pickSelectOption(user, /^lost reason$/i, 'other');
    await user.type(screen.getByLabelText(/note \(optional\)/i), 'Went with a neighbour');
    await user.click(screen.getByRole('button', { name: /mark lost/i }));
    expect(api.put).toHaveBeenCalledWith('/customers/9/stage', {
      stage: 'LOST',
      lost_reason_code: 'other',
      lost_reason_note: 'Went with a neighbour',
    });
  });

  it('sends lead_id so Lost on one enquiry does not move the other', async () => {
    const user = userEvent.setup({ delay: null });
    api.get.mockImplementation((path) => {
      if (path === '/settings') {
        return Promise.resolve({ settings: { templates: { custom: [] } } });
      }
      if (String(path).includes('/settings/users')) {
        return Promise.resolve({ users: [] });
      }
      return Promise.resolve({
        ...DETAIL,
        customer: { ...DETAIL.customer, stage: 'WON' },
        leads: [
          { id: 40, source: 'phone', status: 'NEW', created_at: '2026-10-02T22:00:00Z', stage: 'ENQUIRY' },
          { id: 30, source: 'facebook_lead', status: 'NEW', created_at: '2026-10-02T21:00:00Z', stage: 'WON' },
        ],
      });
    });
    renderDetail('/leads/9?from=inbox&lead=40');
    await user.click(await screen.findByRole('button', { name: /enquiry/i }));
    await user.click(screen.getByRole('button', { name: /^lost$/i }));
    await user.click(screen.getByRole('button', { name: /mark lost/i }));
    expect(api.put).toHaveBeenCalledWith('/customers/9/stage', expect.objectContaining({
      stage: 'LOST',
      lead_id: 40,
    }));
  });

  it('shows stage history on the customer record (requirement 4.2)', async () => {
    renderDetail();
    expect(await screen.findByText('Stage history')).toBeInTheDocument();
    expect(screen.getByText('Enquiry → Quoted')).toBeInTheDocument();
    expect(screen.getAllByText(/Lisa/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole('list', { name: 'Stage history' })).toHaveClass('overflow-y-auto');
  });

  it('lists site visits above quotes on the lead workspace', async () => {
    renderDetail();
    const visits = await screen.findByRole('heading', { name: 'Site visits' });
    const quotes = screen.getByRole('heading', { name: 'Quotes' });
    expect(visits.compareDocumentPosition(quotes) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('does not scroll site visits when there are two or fewer', async () => {
    renderDetail();
    const list = await screen.findByRole('list', { name: 'Site visits' });
    expect(list).not.toHaveClass('overflow-y-auto');
  });

  it('scrolls site visits, quotes, jobs, and invoices after two items', async () => {
    const extraVisit = {
      id: 13,
      start: '2026-11-10T09:00:00Z',
      end: '2026-11-10T10:00:00Z',
      status: 'booked',
      visit_type: 'site_visit',
      address: '1 Test Road',
    };
    api.get.mockImplementation((path) => {
      if (path === '/settings') {
        return Promise.resolve({ settings: { templates: { custom: [] } } });
      }
      if (String(path).includes('/settings/users')) {
        return Promise.resolve({ users: [] });
      }
      return Promise.resolve({
        ...DETAIL,
        appointments: [...DETAIL.appointments, extraVisit],
        quotes: [
          { id: 1, ref: 'Q-2026-0001', title: 'Quote 1', total: 100, status: 'draft', optional_extras: [] },
          { id: 2, ref: 'Q-2026-0002', title: 'Quote 2', total: 200, status: 'sent', optional_extras: [] },
          { id: 3, ref: 'Q-2026-0003', title: 'Quote 3', total: 300, status: 'accepted', optional_extras: [] },
        ],
        jobs: [
          { id: 1, title: 'Job 1', status: 'PENDING', quote_ref: 'Q-2026-0001', value: 100 },
          { id: 2, title: 'Job 2', status: 'IN_PROGRESS', quote_ref: 'Q-2026-0002', value: 200 },
          { id: 3, title: 'Job 3', status: 'COMPLETED', quote_ref: 'Q-2026-0003', value: 300 },
        ],
        invoices: [
          { id: 1, ref: 'INV-1', status: 'sent', total: 100, amount_paid: 0, outstanding: 100 },
          { id: 2, ref: 'INV-2', status: 'sent', total: 200, amount_paid: 0, outstanding: 200 },
          { id: 3, ref: 'INV-3', status: 'paid', total: 300, amount_paid: 300, outstanding: 0 },
        ],
      });
    });
    renderDetail();
    expect(await screen.findByRole('list', { name: 'Site visits' })).toHaveClass('overflow-y-auto');
    expect(screen.getByRole('list', { name: 'Quotes' })).toHaveClass('overflow-y-auto');
    expect(screen.getByRole('list', { name: 'Jobs' })).toHaveClass('overflow-y-auto');
    expect(screen.getByRole('list', { name: 'Invoices' })).toHaveClass('overflow-y-auto');
  });

  it('shows the owner on the lead workspace', async () => {
    renderDetail();
    expect(await screen.findByText(/Owner Paul Douglas/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^edit$/i })).not.toBeInTheDocument();
  });

  it('books a site visit from the customer record (requirement 5.1)', async () => {
    renderDetail();
    expect(await screen.findByRole('button', { name: /book visit/i })).toBeInTheDocument();
    expect(screen.getByText('Site visits')).toBeInTheDocument();
    expect(screen.getByText('dt:2026-03-10T09:00:00Z')).toBeInTheDocument();
  });

  it('reschedules a future booked visit from the site visits card (requirement 5.3)', async () => {
    renderDetail();
    expect(await screen.findByText('Follow-up')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^reschedule$/i })).toHaveLength(1);
    expect(screen.getByText('dt:2026-03-10T09:00:00Z')).toBeInTheDocument();
  });

  it('cancels a future visit without requiring a note (requirement 5.3)', async () => {
    const user = userEvent.setup();
    api.put.mockResolvedValue({ ok: true });
    renderDetail();
    await user.click(await screen.findByRole('button', { name: /^cancel$/i }));
    expect(screen.getByText(/stays in their current pipeline stage/i)).toBeInTheDocument();
    await user.type(screen.getByLabelText(/^note \(optional\)$/i), 'Customer away');
    await user.click(screen.getByRole('button', { name: /^cancel visit$/i }));
    expect(api.put).toHaveBeenCalledWith('/appointments/12', {
      status: 'cancelled',
      cancel_note: 'Customer away',
    });
  });

  it('keeps an ended visit booked until the user ticks complete', async () => {
    renderDetail();
    expect(await screen.findByText('dt:2026-03-10T09:00:00Z')).toBeInTheDocument();
    const pastVisit = screen.getByText('dt:2026-03-10T09:00:00Z').closest('.border');
    expect(within(pastVisit).getByText('Booked')).toBeInTheDocument();
    expect(within(pastVisit).getByRole('checkbox', { name: /visit completed/i })).toBeInTheDocument();
    expect(within(pastVisit).queryByRole('button', { name: /^reschedule$/i })).not.toBeInTheDocument();
  });

  it('ticks a booked visit complete', async () => {
    const user = userEvent.setup();
    api.post.mockResolvedValue({ ok: true, has_quote: false, task_id: 44 });
    renderDetail();
    expect(await screen.findByText(/assigned to jamie fisher/i)).toBeInTheDocument();
    const ticks = screen.getAllByRole('checkbox', { name: /visit completed/i });
    expect(ticks.length).toBe(2);
    await user.click(ticks[1]);
    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/appointments/12/complete');
    });
    expect(screen.getAllByText('Visit completed').length).toBeGreaterThan(0);
  });

  it('shows completion remarks on a done site visit', async () => {
    api.get.mockImplementation((path) => {
      if (path === '/settings') {
        return Promise.resolve({ settings: { templates: { custom: [] } } });
      }
      if (String(path).includes('/settings/users')) {
        return Promise.resolve({ users: [] });
      }
      return Promise.resolve({
        ...DETAIL,
        appointments: [{
          id: 11,
          start: '2026-03-10T09:00:00Z',
          end: '2026-03-10T10:00:00Z',
          status: 'done',
          visit_type: 'site_visit',
          address: '1 Test Road',
          complete_note: 'Valley flashing is sound',
          assignee_name: 'Jamie Fisher',
        }],
      });
    });
    renderDetail();
    expect(await screen.findByText(/valley flashing is sound/i)).toBeInTheDocument();
  });

  it('asks which optional extras were accepted before recording acceptance (requirement 6.5)', async () => {
    const user = userEvent.setup();
    api.get.mockImplementation((path) => {
      if (String(path).includes('/settings/users')) {
        return Promise.resolve({ users: [{ id: 1, name: 'Paul Douglas', role: 'ADMIN', active: true }] });
      }
      return Promise.resolve({
        ...DETAIL,
        quotes: [{
          id: 4,
          ref: 'Q-2026-0004',
          title: 'Felt overlay',
          total: 1200,
          status: 'sent',
          optional_extras: [{ description: 'Velux window', amount: 640 }],
        }],
      });
    });
    api.post.mockResolvedValue({ ok: true, job_id: 8 });
    renderDetail();
    await user.click(await screen.findByRole('button', { name: /accepted/i }));
    expect(screen.getByText(/tick the optional extras/i)).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalledWith('/quotes/4/decision', expect.anything());
    await user.click(screen.getByLabelText(/Velux window/i));
    await user.click(screen.getByRole('button', { name: /confirm acceptance/i }));
    expect(api.post).toHaveBeenCalledWith('/quotes/4/decision', {
      decision: 'accepted',
      accepted_extra_indexes: [0],
    });
  });

  it('downloads a quote PDF from the customer record without sending (requirement 6.6)', async () => {
    const user = userEvent.setup();
    api.get.mockImplementation((path) => {
      if (String(path).includes('/settings/users')) {
        return Promise.resolve({ users: [{ id: 1, name: 'Paul Douglas', role: 'ADMIN', active: true }] });
      }
      return Promise.resolve({
        ...DETAIL,
        quotes: [{ id: 5, ref: 'Q-2026-0005', title: 'Felt', total: 1200, status: 'draft', optional_extras: [] }],
      });
    });
    api.post.mockResolvedValue({ pdf: 'quote-Q-2026-0005.pdf' });
    renderDetail();
    await user.click(await screen.findByRole('button', { name: /download pdf/i }));
    expect(api.post).toHaveBeenCalledWith('/quotes/5/pdf');
    expect(api.download).toHaveBeenCalledWith('/files/quote-Q-2026-0005.pdf?download=1', 'Q-2026-0005.pdf');
    expect(api.post).not.toHaveBeenCalledWith('/quotes/5/send', expect.anything());
  });

  it('shows why WhatsApp send failed instead of Quote sent', async () => {
    const user = userEvent.setup();
    api.get.mockImplementation((path) => {
      if (String(path).includes('/settings/users')) {
        return Promise.resolve({ users: [{ id: 1, name: 'Paul Douglas', role: 'ADMIN', active: true }] });
      }
      return Promise.resolve({
        ...DETAIL,
        quotes: [{ id: 5, ref: 'Q-2026-0005', title: 'Felt', total: 1200, status: 'draft', optional_extras: [] }],
      });
    });
    api.post.mockRejectedValue(new Error(
      'WhatsApp is not connected. Add WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID in .env, then restart the server.',
    ));
    renderDetail();
    await user.click(await screen.findByRole('button', { name: /send whatsapp/i }));
    expect(await screen.findByText(/whatsapp is not connected/i)).toBeInTheDocument();
    expect(screen.queryByText(/^quote sent$/i)).toBeNull();
  });

  it('clones a quote after asking for a new title', async () => {
    const user = userEvent.setup();
    api.get.mockImplementation((path) => {
      if (String(path).includes('/settings/users')) {
        return Promise.resolve({ users: [{ id: 1, name: 'Paul Douglas', role: 'ADMIN', active: true }] });
      }
      return Promise.resolve({
        ...DETAIL,
        quotes: [{ id: 5, ref: 'Q-2026-0005', title: 'Felt', total: 1200, status: 'draft', optional_extras: [] }],
      });
    });
    api.post.mockResolvedValue({ id: 6, ref: 'Q-2026-0006', quote: { id: 6, ref: 'Q-2026-0006', title: 'Felt rear' } });
    renderDetail();
    await user.click(await screen.findByRole('button', { name: /^clone$/i }));
    expect(screen.getByRole('heading', { name: /clone quote/i })).toBeInTheDocument();
    const title = screen.getByLabelText(/quote title/i);
    expect(title).toHaveValue('Felt');
    await user.clear(title);
    await user.type(title, 'Felt rear');
    await user.click(screen.getByRole('button', { name: /clone quote/i }));
    expect(api.post).toHaveBeenCalledWith('/quotes/5/clone', { title: 'Felt rear' });
  });

  it('disables Edit on an accepted quote and explains why on hover', async () => {
    const user = userEvent.setup();
    api.get.mockImplementation((path) => {
      if (String(path).includes('/settings/users')) {
        return Promise.resolve({ users: [{ id: 1, name: 'Paul Douglas', role: 'ADMIN', active: true }] });
      }
      return Promise.resolve({
        ...DETAIL,
        quotes: [{ id: 5, ref: 'Q-2026-0005', title: 'Felt', total: 1200, status: 'accepted', optional_extras: [] }],
      });
    });
    renderDetail();
    const edit = await screen.findByRole('button', { name: /^edit$/i });
    expect(edit).toBeDisabled();
    await user.hover(edit.parentElement);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Accepted quote cannot be edited.');
    await user.click(edit);
    expect(screen.queryByText(/quote builder/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /clone quote/i })).not.toBeInTheDocument();
  });

  it('still opens the quote builder from Edit on a draft', async () => {
    const user = userEvent.setup();
    api.get.mockImplementation((path) => {
      if (String(path).includes('/settings/users')) {
        return Promise.resolve({ users: [{ id: 1, name: 'Paul Douglas', role: 'ADMIN', active: true }] });
      }
      return Promise.resolve({
        ...DETAIL,
        quotes: [{ id: 5, ref: 'Q-2026-0005', title: 'Felt', total: 1200, status: 'draft', optional_extras: [] }],
      });
    });
    renderDetail();
    await user.click(await screen.findByRole('button', { name: /^edit$/i }));
    expect(screen.getByText('Quote builder Q-2026-0005')).toBeInTheDocument();
  });

  it('asks for confirmation before deleting a quote', async () => {
    const user = userEvent.setup();
    api.get.mockImplementation((path) => {
      if (String(path).includes('/settings/users')) {
        return Promise.resolve({ users: [{ id: 1, name: 'Paul Douglas', role: 'ADMIN', active: true }] });
      }
      return Promise.resolve({
        ...DETAIL,
        quotes: [{ id: 5, ref: 'Q-2026-0005', title: 'Felt', total: 1200, status: 'draft', optional_extras: [] }],
      });
    });
    api.del.mockResolvedValue({ ok: true });
    renderDetail();
    await user.click(await screen.findByRole('button', { name: /^delete$/i }));
    expect(screen.getByRole('heading', { name: /delete quote/i })).toBeInTheDocument();
    expect(api.del).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: /delete quote/i }));
    expect(api.del).toHaveBeenCalledWith('/quotes/5');
  });

  it('lets office resend a sent quote and shows last send channel and time (requirement 6.7)', async () => {
    const user = userEvent.setup();
    api.get.mockImplementation((path) => {
      if (String(path).includes('/settings/users')) {
        return Promise.resolve({ users: [{ id: 1, name: 'Paul Douglas', role: 'ADMIN', active: true }] });
      }
      return Promise.resolve({
        ...DETAIL,
        quotes: [{
          id: 6,
          ref: 'Q-2026-0006',
          title: 'Felt',
          total: 1200,
          status: 'sent',
          sent_via: 'whatsapp',
          sent_at: '2026-09-20T10:00:00Z',
          optional_extras: [],
        }],
      });
    });
    api.post.mockResolvedValue({ ok: true, pdf: 'quote-Q-2026-0006.pdf' });
    renderDetail();
    expect(await screen.findByText(/Sent via WhatsApp · dt:2026-09-20T10:00:00Z/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send email/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /accepted/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /send email/i }));
    expect(api.post).toHaveBeenCalledWith('/quotes/6/send', { channels: ['email'] });
  });

  it('shows sending and saving on quote actions until the request finishes', async () => {
    let resolvePost;
    api.get.mockImplementation((path) => {
      if (String(path).includes('/settings/users')) {
        return Promise.resolve({ users: [{ id: 1, name: 'Paul Douglas', role: 'ADMIN', active: true }] });
      }
      return Promise.resolve({
        ...DETAIL,
        quotes: [{
          id: 6,
          ref: 'Q-2026-0006',
          title: 'Felt',
          total: 1200,
          status: 'sent',
          optional_extras: [],
        }],
      });
    });
    api.post.mockImplementation(() => new Promise((resolve) => { resolvePost = resolve; }));
    const user = userEvent.setup();
    renderDetail();
    await user.click(await screen.findByRole('button', { name: /send whatsapp/i }));
    expect(await screen.findByText('Sending…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send whatsapp/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /send email/i })).toBeDisabled();
    resolvePost({ ok: true });
    await waitFor(() => expect(screen.queryByText('Sending…')).not.toBeInTheDocument());

    api.post.mockImplementation(() => new Promise((resolve) => { resolvePost = resolve; }));
    await user.click(screen.getByRole('button', { name: /declined/i }));
    expect(await screen.findByText('Saving…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /declined/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /accepted/i })).toBeDisabled();
    resolvePost({ ok: true });
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/quotes/6/decision', {
      decision: 'declined',
      accepted_extra_indexes: undefined,
    }));
  });

  it('opens a job from the jobs card and shows quote ref and value (requirement 7.1)', async () => {
    const user = userEvent.setup();
    api.get.mockImplementation((path) => {
      if (String(path).includes('/settings/users')) {
        return Promise.resolve({ users: [{ id: 1, name: 'Paul Douglas', role: 'ADMIN', active: true }] });
      }
      return Promise.resolve({
        ...DETAIL,
        jobs: [{
          id: 77,
          title: 'Re-roof',
          status: 'PENDING',
          value: 1840,
          quote_ref: 'Q-2026-0020',
          crew: '',
        }],
      });
    });
    renderDetail();
    expect(await screen.findByText('From Q-2026-0020')).toBeInTheDocument();
    expect(screen.getByText('£1840.00')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /re-roof/i }));
    expect(screen.getByText('Job modal 77')).toBeInTheDocument();
  });

  it('opens invoice VAT and CIS detail from the invoices card (requirement 11.2)', async () => {
    const user = userEvent.setup();
    api.get.mockImplementation((path) => {
      if (String(path).includes('/settings/users')) {
        return Promise.resolve({ users: [] });
      }
      return Promise.resolve({
        ...DETAIL,
        invoices: [{
          id: 12,
          ref: 'INV-2026-0010',
          customer_id: 9,
          lead_id: 40,
          status: 'sent',
          total: 657.6,
          vat_treatment: 'reverse_charge',
          vat_amount: 0,
          cis_applies: true,
          cis_rate: 20,
          cis_deduction: 109.6,
          due_now: 548,
          reverse_charge_vat: 109.6,
          reverse_charge_notice: 'Reverse charge: VAT Act 1994 Section 55A applies. Customer to pay the VAT to HMRC. VAT to be accounted for by the customer: £109.60.',
        }],
      });
    });
    renderDetail();
    expect(await screen.findByText('Reverse charge')).toBeInTheDocument();
    expect(screen.getByText(/VAT Act 1994 Section 55A/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /INV-2026-0010/i }));
    expect(await screen.findByRole('note')).toHaveTextContent(/VAT Act 1994 Section 55A/);
    expect(screen.getByText(/frozen on sent and paid/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /open lead/i })).toHaveAttribute('href', '/leads/9?from=customer&lead=40');
  });

  it('downloads an invoice PDF from the invoices card without sending (requirement 11.3)', async () => {
    const user = userEvent.setup();
    api.get.mockImplementation((path) => {
      if (String(path).includes('/settings/users')) {
        return Promise.resolve({ users: [] });
      }
      return Promise.resolve({
        ...DETAIL,
        invoices: [{
          id: 12,
          ref: 'INV-2026-0010',
          status: 'draft',
          total: 657.6,
          vat_treatment: 'standard',
          vat_amount: 109.6,
          cis_applies: false,
          cis_rate: 20,
          cis_deduction: 0,
          due_now: 657.6,
        }],
      });
    });
    api.post.mockResolvedValue({ pdf: 'inv.pdf' });
    api.download.mockResolvedValue();
    renderDetail();
    await user.click(await screen.findByRole('button', { name: /download pdf/i }));
    expect(api.post).toHaveBeenCalledWith('/invoices/12/pdf');
    expect(api.download).toHaveBeenCalledWith('/files/inv.pdf?download=1', 'INV-2026-0010.pdf');
    expect(api.post).not.toHaveBeenCalledWith('/invoices/12/send');
  });

  it('sends invoice email from the invoices card (requirement 11.3)', async () => {
    const user = userEvent.setup();
    api.get.mockImplementation((path) => {
      if (String(path).includes('/settings/users')) {
        return Promise.resolve({ users: [] });
      }
      return Promise.resolve({
        ...DETAIL,
        invoices: [{
          id: 12,
          ref: 'INV-2026-0010',
          status: 'sent',
          total: 657.6,
        }],
      });
    });
    api.post.mockResolvedValue({ ok: true });
    renderDetail();
    await user.click(await screen.findByRole('button', { name: /send email/i }));
    expect(api.post).toHaveBeenCalledWith('/invoices/12/send');
  });

  it('shows sending on invoice email until the request finishes', async () => {
    let resolvePost;
    api.get.mockImplementation((path) => {
      if (String(path).includes('/settings/users')) {
        return Promise.resolve({ users: [] });
      }
      return Promise.resolve({
        ...DETAIL,
        invoices: [{
          id: 12,
          ref: 'INV-2026-0010',
          status: 'draft',
          total: 657.6,
        }],
      });
    });
    api.post.mockImplementation(() => new Promise((resolve) => { resolvePost = resolve; }));
    const user = userEvent.setup();
    renderDetail();
    await user.click(await screen.findByRole('button', { name: /send email/i }));
    expect(await screen.findByText('Sending…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send email/i })).toBeDisabled();
    resolvePost({ ok: true });
    await waitFor(() => expect(screen.queryByText('Sending…')).not.toBeInTheDocument());
  });

  it('shows paid and outstanding on the invoices card and records a payment (requirement 11.4)', async () => {
    const user = userEvent.setup();
    api.get.mockImplementation((path) => {
      if (String(path).includes('/settings/users')) {
        return Promise.resolve({ users: [] });
      }
      return Promise.resolve({
        ...DETAIL,
        invoices: [{
          id: 12,
          ref: 'INV-2026-0010',
          status: 'sent',
          total: 657.6,
          due_now: 548,
          amount_paid: 48,
          outstanding: 500,
          payments: [{ id: 1, amount: 48, paid_at: '2026-09-18', note: null }],
        }],
      });
    });
    api.post.mockResolvedValue({ ok: true, invoice: { status: 'part_paid' } });
    renderDetail();
    expect(await screen.findByText(/Paid £48/)).toBeInTheDocument();
    expect(screen.getByText(/Outstanding £500/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /record payment/i }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /^record payment$/i }));
    expect(api.post).toHaveBeenCalledWith('/invoices/12/payment', expect.objectContaining({
      amount: 500,
    }));
  });

  it('shows scheduled follow-ups and cancels remaining for that quote (requirement 12.1)', async () => {
    const user = userEvent.setup();
    api.get.mockImplementation((path) => {
      if (String(path).includes('/settings/users')) {
        return Promise.resolve({ users: [] });
      }
      return Promise.resolve({
        ...DETAIL,
        followups: [
          {
            id: 1, quote_id: 4, quote_ref: 'Q-2026-0004', step: 1, channel: 'whatsapp',
            status: 'pending', scheduled_at: '2026-09-22T10:00:00Z',
          },
          {
            id: 2, quote_id: 4, quote_ref: 'Q-2026-0004', step: 2, channel: 'email',
            status: 'pending', scheduled_at: '2026-09-25T10:00:00Z',
          },
          {
            id: 3, quote_id: 5, quote_ref: 'Q-2026-0005', step: 1, channel: 'email',
            status: 'sent', scheduled_at: '2026-09-20T10:00:00Z',
          },
        ],
      });
    });
    api.post.mockResolvedValue({ ok: true, cancelled: 2 });
    renderDetail();
    expect(await screen.findByText(/Automatic follow-ups/)).toBeInTheDocument();
    expect(screen.getByText(/Q-2026-0004/)).toBeInTheDocument();
    expect(screen.getByText(/dt:2026-09-22T10:00:00Z/)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /cancel remaining/i })).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: /cancel remaining/i }));
    expect(api.post).toHaveBeenCalledWith('/quotes/4/followups/cancel');
  });

  it('lets the office change a pending follow-up date and time', async () => {
    const user = userEvent.setup();
    api.get.mockImplementation((path) => {
      if (String(path).includes('/settings/users')) {
        return Promise.resolve({ users: [] });
      }
      return Promise.resolve({
        ...DETAIL,
        followups: [
          {
            id: 1, quote_id: 4, quote_ref: 'Q-2026-0004', step: 1, channel: 'whatsapp',
            status: 'pending', scheduled_at: '2026-09-22T10:00:00Z',
          },
          {
            id: 3, quote_id: 5, quote_ref: 'Q-2026-0005', step: 1, channel: 'email',
            status: 'sent', scheduled_at: '2026-09-20T10:00:00Z',
          },
        ],
      });
    });
    api.put.mockResolvedValue({ ok: true });
    renderDetail();
    expect(await screen.findByRole('button', { name: /change date/i })).toBeInTheDocument();
    expect(screen.queryAllByRole('button', { name: /change date/i })).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: /change date/i }));
    const date = screen.getByLabelText(/^date$/i);
    const time = screen.getByLabelText(/^time$/i);
    await user.clear(date);
    await user.type(date, '2026-10-12');
    await user.clear(time);
    await user.type(time, '14:30');
    await user.click(screen.getByRole('button', { name: /save time/i }));
    expect(api.put).toHaveBeenCalledWith('/quotes/4/followups/1', {
      scheduled_at: new Date('2026-10-12T14:30').toISOString(),
    });
  });

  it('cancels a single pending follow-up without cancelling the rest', async () => {
    const user = userEvent.setup();
    api.get.mockImplementation((path) => {
      if (String(path).includes('/settings/users')) {
        return Promise.resolve({ users: [] });
      }
      return Promise.resolve({
        ...DETAIL,
        followups: [
          {
            id: 1, quote_id: 4, quote_ref: 'Q-2026-0004', step: 1, channel: 'whatsapp',
            status: 'pending', scheduled_at: '2026-09-22T10:00:00Z',
          },
          {
            id: 2, quote_id: 4, quote_ref: 'Q-2026-0004', step: 2, channel: 'email',
            status: 'pending', scheduled_at: '2026-09-25T10:00:00Z',
          },
        ],
      });
    });
    api.post.mockResolvedValue({ ok: true });
    renderDetail();
    const cancelOne = await screen.findAllByRole('button', { name: /cancel this follow-up/i });
    expect(cancelOne).toHaveLength(2);
    await user.click(cancelOne[0]);
    expect(api.post).toHaveBeenCalledWith('/quotes/4/followups/1/cancel');
    expect(api.post).not.toHaveBeenCalledWith('/quotes/4/followups/cancel');
  });

  it('links the open follow-up task on the customer card (requirement 12.2)', async () => {
    api.get.mockImplementation((path) => {
      if (String(path).includes('/settings/users')) {
        return Promise.resolve({ users: [] });
      }
      return Promise.resolve({
        ...DETAIL,
        followups: [
          {
            id: 1, quote_id: 4, quote_ref: 'Q-2026-0004', step: 1, channel: 'whatsapp',
            status: 'pending', scheduled_at: '2026-09-22T10:00:00Z',
            followup_task: { id: 88, title: 'Follow up quote Q-2026-0004', due_date: '2026-09-22', status: 'open' },
          },
        ],
      });
    });
    renderDetail();
    const chip = await screen.findByRole('link', { name: /follow-up task/i });
    expect(chip).toHaveAttribute('href', taskHref({ id: 88, due_date: '2026-09-22' }));
  });
});

describe('CustomerDetail named message templates (requirement 17.2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.put.mockResolvedValue({ ok: true });
  });

  it('inserts an extra named template into the conversation composer', async () => {
    const user = userEvent.setup();
    api.get.mockImplementation((path) => {
      if (String(path).includes('/settings/users')) {
        return Promise.resolve({ users: [] });
      }
      if (path === '/settings') {
        return Promise.resolve({
          settings: { templates: { custom: [{ key: 'site_visit_confirm', body: 'See you tomorrow {name}' }] } },
        });
      }
      return Promise.resolve(DETAIL);
    });
    renderDetail();
    const picker = await screen.findByLabelText(/insert template/i);
    await pickSelectOption(user, picker, 'site_visit_confirm');
    expect(screen.getByPlaceholderText(/write a whatsapp message/i)).toHaveValue('See you tomorrow {name}');
  });
});
