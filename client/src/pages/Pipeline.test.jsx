import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Pipeline from './Pipeline.jsx';
import { api } from '../lib/api';
import { pickSelectOption } from '../test/selectMenu.js';

vi.mock('../lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn() },
  money: (n) => `£${Number(n || 0).toFixed(2)}`,
  fmtTimeAgo: () => '2d ago',
}));

const STAGES_12 = [
  'ENQUIRY', 'SITE_VISIT_BOOKED', 'QUOTE_PENDING', 'QUOTED', 'FOLLOW_UP',
  'WON', 'LOST', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'INVOICED', 'PAID',
];
const LABELS_12 = {
  ENQUIRY: 'Enquiry', SITE_VISIT_BOOKED: 'Site Visit Booked', QUOTE_PENDING: 'Quote Pending',
  QUOTED: 'Quoted', FOLLOW_UP: 'Follow-Up', WON: 'Won', LOST: 'Lost',
  SCHEDULED: 'Scheduled', IN_PROGRESS: 'In Progress', COMPLETED: 'Completed',
  INVOICED: 'Invoiced', PAID: 'Paid',
};

function daysAgoIso(n) {
  return new Date(Date.now() - n * 86400000).toISOString();
}

const FULL_BOARD = {
  stages: STAGES_12,
  labels: LABELS_12,
  board: Object.fromEntries(STAGES_12.map((s) => [s, []])),
};
FULL_BOARD.board.ENQUIRY = [{
  id: 9, name: 'Dave Whitfield', address: '14 Elm Grove, Reading', source: 'whatsapp',
  latest_quote_total: 2400, pipeline_value: 2400, stage: 'ENQUIRY',
  updated_at: daysAgoIso(2), open_tasks: 2,
}, {
  id: 10, name: 'Priya Nair', address: '8 Oakfield Road, Reading', source: 'email',
  latest_quote_total: null, pipeline_value: 0, stage: 'ENQUIRY',
  updated_at: daysAgoIso(2), open_tasks: 0,
}, {
  id: 11, name: 'Marcus Reid', address: '5 The Sidings', source: 'email',
  latest_quote_total: 500, pipeline_value: 500, stage: 'ENQUIRY',
  updated_at: daysAgoIso(8), open_tasks: 0,
}];
FULL_BOARD.board.FOLLOW_UP = [{
  id: 12, name: 'Tom Ellery', address: '9 Mill Lane', source: 'facebook_lead',
  latest_quote_total: 876, pipeline_value: 876, stage: 'FOLLOW_UP',
  updated_at: daysAgoIso(15), open_tasks: 0,
}];
FULL_BOARD.board.LOST = [{
  id: 13, name: 'Kevin Postlethwaite', address: '17 Wensley Road', source: 'phone',
  latest_quote_total: 1740, pipeline_value: 1740, stage: 'LOST',
  updated_at: daysAgoIso(20), open_tasks: 0,
}];
FULL_BOARD.board.PAID = [{
  id: 4, name: 'Helen Ackroyd', address: '2 Priory Court', source: 'referral',
  latest_quote_total: 8900, pipeline_value: 8900, stage: 'PAID',
  updated_at: daysAgoIso(20), open_tasks: 0,
}];
FULL_BOARD.owners = [{ id: 1, name: 'Paul Douglas' }, { id: 2, name: 'Lisa Grant' }];
FULL_BOARD.customers = [
  { id: 9, name: 'Dave Whitfield' },
  { id: 10, name: 'Priya Nair' },
  { id: 11, name: 'Marcus Reid' },
  { id: 12, name: 'Tom Ellery' },
  { id: 13, name: 'Kevin Postlethwaite' },
  { id: 4, name: 'Helen Ackroyd' },
];
FULL_BOARD.totals = {
  board: 3776,
  byStage: {
    ENQUIRY: 2900, SITE_VISIT_BOOKED: 0, QUOTE_PENDING: 0, QUOTED: 0, FOLLOW_UP: 876,
    WON: null, LOST: null, SCHEDULED: null, IN_PROGRESS: null, COMPLETED: null, INVOICED: null, PAID: null,
  },
};

for (const stage of STAGES_12) {
  FULL_BOARD.board[stage] = (FULL_BOARD.board[stage] || []).map((c) => ({
    ...c,
    customer_id: c.customer_id ?? c.id,
    lead_id: c.lead_id ?? c.id,
  }));
}

describe('Pipeline board (requirement 4.1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.get.mockResolvedValue(FULL_BOARD);
  });

  it('renders all current stage columns including Paid', async () => {
    render(<MemoryRouter><Pipeline /></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'Enquiry' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Site Visit Booked' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Quote Pending' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Quoted' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Follow-Up' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Won' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Lost' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Scheduled' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'In Progress' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Completed' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Invoiced' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Paid' })).toBeInTheDocument();
  });

  it('shows name, address, source, quote and open tasks on a card', async () => {
    render(<MemoryRouter><Pipeline /></MemoryRouter>);
    expect(await screen.findByText('Dave Whitfield')).toBeInTheDocument();
    expect(screen.getByText('14 Elm Grove, Reading')).toBeInTheDocument();
    expect(screen.getByText('whatsapp')).toBeInTheDocument();
    expect(screen.getByText('£2400.00')).toBeInTheDocument();
    expect(screen.getByText('2 tasks')).toBeInTheDocument();
    expect(screen.getAllByText('Updated 2d ago').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Helen Ackroyd')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /dave whitfield/i })).toHaveAttribute('href', '/leads/9?from=pipeline&lead=9');
  });

  it('renders two cards when the same customer has two enquiries', async () => {
    api.get.mockResolvedValue({
      ...FULL_BOARD,
      board: {
        ...FULL_BOARD.board,
        ENQUIRY: [{
          id: 40, lead_id: 40, customer_id: 27, name: 'M Iman', stage: 'ENQUIRY',
          address: 'sui gas road', source: 'phone', pipeline_value: 0, updated_at: daysAgoIso(0), open_tasks: 0,
        }],
        LOST: [{
          id: 41, lead_id: 41, customer_id: 27, name: 'M Iman', stage: 'LOST',
          address: 'sui gas road', source: 'email', pipeline_value: 0, updated_at: daysAgoIso(0), open_tasks: 0,
        }],
      },
    });
    render(<MemoryRouter><Pipeline /></MemoryRouter>);
    const cards = await screen.findAllByText('M Iman');
    expect(cards).toHaveLength(2);
    expect(document.querySelector('[data-stage="ENQUIRY"] a[href="/leads/27?from=pipeline&lead=40"]')).toBeTruthy();
    expect(document.querySelector('[data-stage="LOST"] a[href="/leads/27?from=pipeline&lead=41"]')).toBeTruthy();
  });
});

describe('Pipeline drag-and-drop (requirement 4.2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.get.mockResolvedValue(FULL_BOARD);
    api.put.mockResolvedValue({ ok: true });
  });

  it('moves a card to any column including skip, and toasts', async () => {
    render(<MemoryRouter><Pipeline /></MemoryRouter>);
    const card = await screen.findByText('Dave Whitfield');
    fireEvent.dragStart(card.closest('[data-customer-id]'));
    fireEvent.drop(document.querySelector('[data-stage="PAID"]'));
    expect(api.put).toHaveBeenCalledWith('/customers/9/stage', { stage: 'PAID', lead_id: 9, before_id: null });
    expect(await screen.findByText('Moved to Paid')).toBeInTheDocument();
  });

  it('reorders within a column when dropped on another card', async () => {
    render(<MemoryRouter><Pipeline /></MemoryRouter>);
    fireEvent.dragStart((await screen.findByText('Dave Whitfield')).closest('[data-customer-id]'));
    fireEvent.drop(screen.getByText('Priya Nair').closest('[data-customer-id]'));
    expect(api.put).toHaveBeenCalledWith('/customers/9/stage', { stage: 'ENQUIRY', lead_id: 9, before_id: 10 });
    expect(await screen.findByText('Order updated')).toBeInTheDocument();
  });

  it('highlights the column under the pointer while dragging', async () => {
    render(<MemoryRouter><Pipeline /></MemoryRouter>);
    fireEvent.dragStart((await screen.findByText('Dave Whitfield')).closest('[data-customer-id]'));
    const quoted = document.querySelector('[data-stage="QUOTED"]');
    fireEvent.dragOver(quoted);
    expect(quoted.className).toMatch(/ring/);
  });

  it('toasts the error when a move fails', async () => {
    api.put.mockRejectedValue(new Error('Unknown stage: NOPE'));
    render(<MemoryRouter><Pipeline /></MemoryRouter>);
    fireEvent.dragStart((await screen.findByText('Dave Whitfield')).closest('[data-customer-id]'));
    fireEvent.drop(document.querySelector('[data-stage="PAID"]'));
    expect(await screen.findByText('Unknown stage: NOPE')).toBeInTheDocument();
  });
});

describe('Pipeline lost reason (requirement 2.6)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.get.mockResolvedValue({
      stages: ['ENQUIRY', 'LOST'],
      labels: { ENQUIRY: 'Enquiry', LOST: 'Lost' },
      board: {
        ENQUIRY: [{
          id: 9, name: 'Dave Whitfield', address: '1 Test Road', source: 'website',
          updated_at: '2026-01-01T00:00:00Z', open_tasks: 0,
        }],
        LOST: [],
      },
    });
    api.put.mockResolvedValue({ ok: true });
  });

  it('asks for a reason before moving a card to Lost', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><Pipeline /></MemoryRouter>);
    const card = await screen.findByText('Dave Whitfield');
    fireEvent.dragStart(card.closest('[data-customer-id]'));
    fireEvent.drop(screen.getByRole('heading', { name: 'Lost' }).closest('.flex-shrink-0'));
    expect(await screen.findByText(/why was this lost/i)).toBeInTheDocument();
    expect(api.put).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: /mark lost/i }));
    expect(api.put).toHaveBeenCalledWith('/customers/9/stage', expect.objectContaining({
      stage: 'LOST',
      lead_id: 9,
      lost_reason_code: 'cheaper_quote',
    }));
  });
});

describe('Pipeline filters (requirement 4.4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.get.mockResolvedValue(FULL_BOARD);
  });

  it('sends URL filters to the board endpoint', async () => {
    render(
      <MemoryRouter initialEntries={['/pipeline?source=email&owner_id=unassigned&created_from=2026-01-01&value_min=1000']}>
        <Pipeline />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith(
        '/customers/pipeline/board?source=email&owner_id=unassigned&created_from=2026-01-01&value_min=1000',
      );
    });
    expect(await screen.findByLabelText('Filter by source')).toHaveTextContent('Email');
    expect(screen.getByLabelText('Filter by owner')).toHaveAttribute('data-value', 'unassigned');
    expect(screen.getByLabelText('Filter by customer')).toHaveAttribute('data-value', '');
    expect(screen.getByLabelText('Created from')).toHaveAttribute('data-value', '2026-01-01');
    expect(screen.getByLabelText('Minimum quote value')).toHaveValue(1000);
  });

  it('writes multi-select source and owner into the query string', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/pipeline']}>
        <Pipeline />
      </MemoryRouter>,
    );
    await screen.findByText('Dave Whitfield');
    await user.click(screen.getByLabelText('Filter by source'));
    await user.click(screen.getByRole('option', { name: 'WhatsApp' }));
    await user.click(screen.getByRole('option', { name: 'Email' }));
    await pickSelectOption(user, 'Filter by owner', '2');
    await pickSelectOption(user, 'Filter by customer', '9');
    await waitFor(() => {
      const urls = api.get.mock.calls.map((c) => c[0]);
      expect(urls.some((u) => /source=whatsapp/.test(u) && /source=email/.test(u) && /owner_id=2/.test(u) && /customer_id=9/.test(u))).toBe(true);
    });
  });

  it('does not offer New customer on the pipeline', async () => {
    render(<MemoryRouter><Pipeline /></MemoryRouter>);
    await screen.findByRole('heading', { name: 'Pipeline' });
    expect(screen.queryByRole('button', { name: /new customer/i })).toBeNull();
  });

  it('filters the board by a selected customer', async () => {
    render(
      <MemoryRouter initialEntries={['/pipeline?customer_id=9']}>
        <Pipeline />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/customers/pipeline/board?customer_id=9');
    });
    expect(await screen.findByLabelText('Filter by customer')).toHaveAttribute('data-value', '9');
  });

  it('clears filters from the URL', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/pipeline?source=phone']}>
        <Pipeline />
      </MemoryRouter>,
    );
    await user.click(await screen.findByRole('button', { name: /clear filters/i }));
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/customers/pipeline/board');
    });
  });

  it('sends search text to the board endpoint', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/pipeline']}>
        <Pipeline />
      </MemoryRouter>,
    );
    await screen.findByText('Dave Whitfield');
    await user.type(screen.getByLabelText(/search pipeline/i), 'Dave');
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/customers/pipeline/board?q=Dave');
    });
  });

  it('starts with filters open and can collapse and expand', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/pipeline?q=Dave']}>
        <Pipeline />
      </MemoryRouter>,
    );
    expect(await screen.findByLabelText(/search pipeline/i)).toHaveValue('Dave');
    expect(screen.getByRole('button', { name: /hide filters/i })).toHaveAttribute('aria-expanded', 'true');
    await user.click(screen.getByRole('button', { name: /hide filters/i }));
    expect(screen.queryByLabelText(/search pipeline/i)).toBeNull();
    expect(screen.getByRole('button', { name: /show filters/i })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText(/1 active/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /show filters/i }));
    expect(screen.getByLabelText(/search pipeline/i)).toBeInTheDocument();
  });
});

describe('Pipeline value and stall (requirement 4.5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.get.mockResolvedValue(FULL_BOARD);
  });

  it('shows the board total and Enquiry → Follow-up column totals, not Paid', async () => {
    render(<MemoryRouter><Pipeline /></MemoryRouter>);
    expect(await screen.findByTestId('pipeline-value')).toHaveTextContent('Pipeline value £3776.00');
    expect(document.querySelector('[data-stage-value="ENQUIRY"]')).toHaveTextContent('£2900.00');
    expect(document.querySelector('[data-stage-value="FOLLOW_UP"]')).toHaveTextContent('£876.00');
    expect(document.querySelector('[data-stage-value="PAID"]')).toBeNull();
    expect(document.querySelector('[data-stage-value="LOST"]')).toBeNull();
    expect(screen.getByText('Dave Whitfield').closest('a')).toHaveTextContent('£2400.00');
  });

  it('shows the latest open quote on the card, not the sum of every draft', async () => {
    api.get.mockResolvedValue({
      ...FULL_BOARD,
      board: {
        ...FULL_BOARD.board,
        ENQUIRY: [{
          id: 21, name: 'Priya Nair', address: '8 Oakfield Road, Reading', source: 'facebook',
          latest_quote_total: 120, pipeline_value: 60, stage: 'ENQUIRY',
          updated_at: daysAgoIso(1), open_tasks: 0,
        }],
      },
      totals: {
        board: 60,
        byStage: {
          ...FULL_BOARD.totals.byStage,
          ENQUIRY: 60, FOLLOW_UP: 0,
        },
      },
    });
    render(<MemoryRouter><Pipeline /></MemoryRouter>);
    expect(await screen.findByText('Priya Nair')).toBeInTheDocument();
    expect(screen.getByText('Priya Nair').closest('a')).toHaveTextContent('£60.00');
    expect(screen.getByText('Priya Nair').closest('a')).not.toHaveTextContent('£120.00');
    expect(document.querySelector('[data-stage-value="ENQUIRY"]')).toHaveTextContent('£60.00');
  });

  it('marks amber and red stalls and skips Lost and Paid', async () => {
    render(<MemoryRouter><Pipeline /></MemoryRouter>);
    expect(await screen.findByText('Marcus Reid')).toBeInTheDocument();
    const marcus = screen.getByText('Marcus Reid').closest('a');
    const tom = screen.getByText('Tom Ellery').closest('a');
    const dave = screen.getByText('Dave Whitfield').closest('a');
    const helen = screen.getByText('Helen Ackroyd').closest('a');
    const kevin = screen.getByText('Kevin Postlethwaite').closest('a');
    expect(marcus.textContent).toMatch(/Stalled/);
    expect(marcus.querySelector('.text-amber-700, .text-amber-800')).toBeTruthy();
    expect(tom.textContent).toMatch(/Stalled/);
    expect(tom.querySelector('.text-rose-600, .text-rose-800')).toBeTruthy();
    expect(dave.textContent).not.toMatch(/Stalled/);
    expect(helen.textContent).not.toMatch(/Stalled/);
    expect(kevin.textContent).not.toMatch(/Stalled/);
  });
});

const DAVE_DETAIL = {
  customer: {
    id: 9,
    name: 'Dave Whitfield',
    sites: [{ id: 1, address: '14 Elm Grove', postcode: 'RG1 5AB', is_primary: true }],
    phones: [{ id: 3, value: '07700 900100', type: 'mobile', is_primary: true }],
    emails: [{ id: 4, value: 'dave@example.com', type: 'personal', is_primary: true }],
  },
};

describe('Pipeline book visit (requirement 5.1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.get.mockImplementation((url) => {
      if (String(url) === '/settings/users') {
        return Promise.resolve({ users: [{ id: 3, name: 'Jamie Fisher', role: 'STAFF', active: true }] });
      }
      if (String(url).startsWith('/customers/') && !String(url).includes('pipeline')) {
        return Promise.resolve(DAVE_DETAIL);
      }
      return Promise.resolve(FULL_BOARD);
    });
    api.post.mockResolvedValue({ id: 50 });
  });

  it('opens Book visit from a card, loads the customer, and posts the appointment', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><Pipeline /></MemoryRouter>);
    const dave = await screen.findByText('Dave Whitfield');
    const card = dave.closest('[data-customer-id]');
    await user.click(card.querySelector('button'));
    expect(await screen.findByRole('heading', { name: /book a site visit/i })).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/customers/9');
    expect(await screen.findByLabelText(/^site$/i)).toHaveAttribute('data-value', '1');
    await pickSelectOption(user, /^assigned to$/i, /jamie fisher/i);
    const submit = screen.getAllByRole('button', { name: /^book visit$/i }).find((b) => b.className.includes('btn-primary'));
    await user.click(submit);
    expect(api.post).toHaveBeenCalledWith('/appointments', expect.objectContaining({
      customer_id: 9,
      lead_id: 9,
      site_id: 1,
      assignee_ids: [3],
    }));
    expect(await screen.findByText('Visit booked')).toBeInTheDocument();
  });
});
