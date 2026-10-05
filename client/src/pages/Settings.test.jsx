import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Settings from './Settings.jsx';
import { api } from '../lib/api';

const authState = { user: { id: 1, name: 'Paul', role: 'ADMIN' }, logout: async () => {} };

vi.mock('../lib/auth.jsx', () => ({
  useAuth: () => authState,
}));

vi.mock('../lib/api', () => ({
  api: {
    get: vi.fn(async (path) => {
      if (path === '/settings/integrations') return { integrations: [], events: [] };
      if (path === '/settings/users') return { users: [] };
      if (String(path).startsWith('/settings/security-events')) return { events: [], total: 0, page: 1, limit: 20 };
      return {};
    }),
    post: vi.fn(),
    put: vi.fn(),
    del: vi.fn(),
    upload: vi.fn(),
  },
  fmtTimeAgo: () => '',
  fmtDateTime: (d) => d || '',
  fmtDate: (d) => (d ? String(d).slice(0, 10) : '—'),
  money: (n) => `£${Number(n || 0).toFixed(2)}`,
}));

const STAFF_USERS = [
  {
    id: 1, name: 'Paul Douglas', email: 'paul@pauldouglasroofing.co.uk', phone: '1',
    role: 'ADMIN', skills: [], is_driver: false, active: true, color: '#0f172a', financials_restricted: false,
  },
  {
    id: 2, name: 'Lisa Office', email: 'lisa@pauldouglasroofing.co.uk', phone: '2',
    role: 'OFFICE', skills: [], is_driver: false, active: true, color: '#0369a1', financials_restricted: false,
  },
];

function pickSelectOption(user, label, optionName) {
  return user.click(screen.getByLabelText(label)).then(() => (
    user.click(screen.getByRole('option', { name: optionName }))
  ));
}

describe('Settings staff roles (requirement 1.4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.user = { id: 1, name: 'Paul', role: 'ADMIN' };
    api.get.mockImplementation(async (path) => {
      if (path === '/settings/integrations') return { integrations: [], events: [] };
      if (path === '/settings/users') return { users: [] };
      if (String(path).startsWith('/settings/security-events')) return { events: [], total: 0, page: 1, limit: 20 };
      return {};
    });
  });

  it('offers the three stored roles without renaming UI labels', async () => {
    const user = userEvent.setup();
    render(<Settings />);
    await user.click(screen.getByRole('button', { name: /staff & users/i }));
    await user.click(await screen.findByRole('button', { name: /add user/i }));

    const trigger = screen.getByLabelText(/^role$/i);
    await user.click(trigger);
    const values = screen.getAllByRole('option').map((o) => o.getAttribute('data-value'));
    expect(values).toEqual(['STAFF', 'OFFICE', 'ADMIN']);
    expect(screen.getByRole('option', { name: /field staff — jobs only/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /office — crm, quotes, scheduling/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /owner\/admin — full access/i })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /^director$/i })).toBeNull();
    expect(screen.queryByRole('option', { name: /^operative$/i })).toBeNull();
  });

  it('shows a costing restriction checkbox only for Office (requirement 1.6)', async () => {
    const user = userEvent.setup();
    render(<Settings />);
    await user.click(screen.getByRole('button', { name: /staff & users/i }));
    await user.click(await screen.findByRole('button', { name: /add user/i }));
    expect(screen.queryByText(/restrict job costing/i)).toBeNull();
    await pickSelectOption(user, /^role$/i, /office — crm, quotes, scheduling/i);
    expect(screen.getByRole('checkbox', { name: /restrict job costing and labour-cost figures/i })).toBeInTheDocument();
  });
});

describe('Settings staff lifecycle (requirement 1.7)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.user = { id: 1, name: 'Paul', role: 'ADMIN' };
    api.get.mockImplementation(async (path) => {
      if (path === '/settings/integrations') return { integrations: [], events: [] };
      if (path === '/settings/users') return { users: STAFF_USERS };
      if (String(path).startsWith('/settings/security-events')) return { events: [], total: 0, page: 1, limit: 20 };
      return {};
    });
    api.put.mockResolvedValue({ ok: true });
  });

  it('lets an admin edit name, email, phone, role, costing flag, and send a reset link', async () => {
    const user = userEvent.setup();
    render(<Settings />);
    await user.click(screen.getByRole('button', { name: /staff & users/i }));
    await screen.findByText('Lisa Office');
    await user.click(screen.getByRole('button', { name: /more actions for lisa office/i }));
    await user.click(screen.getByRole('button', { name: /^edit$/i }));
    expect(screen.getByDisplayValue('Lisa Office')).toBeInTheDocument();
    expect(screen.getByDisplayValue('lisa@pauldouglasroofing.co.uk')).toBeInTheDocument();
    expect(screen.queryByLabelText(/new temporary password/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reset password/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^cancel$/i })).toBeInTheDocument();
    await user.clear(screen.getByDisplayValue('Lisa Office'));
    await user.type(screen.getByLabelText(/^name$/i), 'Lisa Updated');
    await user.click(screen.getByRole('button', { name: /save changes/i }));
    expect(api.put).toHaveBeenCalledWith('/settings/users/2', expect.objectContaining({
      name: 'Lisa Updated',
      email: 'lisa@pauldouglasroofing.co.uk',
      role: 'OFFICE',
    }));
    expect(api.put.mock.calls[0][1].password).toBeUndefined();
  });

  it('does not offer deactivate on your own account or the last administrator', async () => {
    const user = userEvent.setup();
    render(<Settings />);
    await user.click(screen.getByRole('button', { name: /staff & users/i }));
    await screen.findByText('Paul Douglas');
    expect(screen.getAllByRole('switch', { name: /^deactivate$/i })).toHaveLength(1);
  });

  it('filters the people list from the search box', async () => {
    const user = userEvent.setup();
    render(<Settings />);
    await user.click(screen.getByRole('button', { name: /staff & users/i }));
    await screen.findByText('Paul Douglas');
    await user.type(screen.getByLabelText(/search people/i), 'lisa');
    expect(screen.getByText('Lisa Office')).toBeInTheDocument();
    expect(screen.queryByText('Paul Douglas')).toBeNull();
  });

  it('lists people newest first by date added', async () => {
    api.get.mockImplementation(async (path) => {
      if (path === '/settings/integrations') return { integrations: [], events: [] };
      if (path === '/settings/users') {
        return {
          users: [
            { ...STAFF_USERS[0], created_at: '2026-09-21T19:11:00.000Z' },
            { ...STAFF_USERS[1], created_at: '2026-09-21T19:11:00.000Z' },
            {
              id: 9, name: 'newtest', email: 'newtest@yopmail.com', phone: '9',
              role: 'STAFF', skills: ['roofer', 'labourer'], is_driver: true, active: true,
              color: '#16a34a', financials_restricted: false, hourly_cost: 10, cis_status: 'none',
              created_at: '2026-10-01T00:00:00.000Z',
            },
          ],
        };
      }
      if (String(path).startsWith('/settings/security-events')) return { events: [], total: 0, page: 1, limit: 20 };
      return {};
    });
    const user = userEvent.setup();
    render(<Settings />);
    await user.click(screen.getByRole('button', { name: /staff & users/i }));
    expect(await screen.findByText('newtest')).toBeInTheDocument();
    const rows = screen.getAllByRole('row').slice(1).map((row) => row.textContent);
    expect(rows[0]).toMatch(/newtest/);
    expect(screen.getByText(/Roofer, Labourer · Driver/)).toBeInTheDocument();
  });

  it('sends a forgot-password email from Edit instead of setting a temporary password', async () => {
    api.post.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<Settings />);
    await user.click(screen.getByRole('button', { name: /staff & users/i }));
    await screen.findByText('Lisa Office');
    await user.click(screen.getByRole('button', { name: /more actions for lisa office/i }));
    await user.click(screen.getByRole('button', { name: /^edit$/i }));
    await user.click(screen.getByRole('button', { name: /reset password/i }));
    expect(api.post).toHaveBeenCalledWith('/settings/users/2/reset-password');
    expect(await screen.findByText(/reset link sent/i)).toBeInTheDocument();
  });
});

describe('Settings staff skills, driver, and pay rates (requirement 1.8)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.user = { id: 1, name: 'Paul', role: 'ADMIN' };
    api.get.mockImplementation(async (path) => {
      if (path === '/settings/integrations') return { integrations: [], events: [] };
      if (path === '/settings/users') {
        return {
          users: [
            ...STAFF_USERS,
            {
              id: 3, name: 'Jamie Staff', email: 'jamie@pauldouglasroofing.co.uk', phone: '3',
              role: 'STAFF', skills: ['roofer'], is_driver: true, active: true, color: '#16a34a',
              financials_restricted: false, hourly_cost: 24.5, cis_status: 'net20',
            },
          ],
        };
      }
      if (String(path).startsWith('/settings/security-events')) return { events: [], total: 0, page: 1, limit: 20 };
      return {};
    });
    api.put.mockResolvedValue({ ok: true });
    api.post.mockResolvedValue({ id: 99 });
  });

  it('shows hourly cost and CIS on create for every role, and skills only for field staff', async () => {
    const user = userEvent.setup();
    render(<Settings />);
    await user.click(screen.getByRole('button', { name: /staff & users/i }));
    await user.click(await screen.findByRole('button', { name: /add user/i }));
    expect(screen.getByLabelText(/hourly cost/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/cis status/i)).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /can drive/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^roofer$/i })).toBeInTheDocument();
    await pickSelectOption(user, /^role$/i, /owner\/admin — full access/i);
    expect(screen.queryByRole('checkbox', { name: /can drive/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^roofer$/i })).toBeNull();
    expect(screen.getByLabelText(/hourly cost/i)).toBeInTheDocument();
  });

  it('lets an admin edit skills, driver, hourly cost, and CIS on a field staff user', async () => {
    const user = userEvent.setup({ delay: null });
    render(<Settings />);
    await user.click(screen.getByRole('button', { name: /staff & users/i }));
    expect(await screen.findByText('£24.50/h')).toBeInTheDocument();
    expect(screen.getByText('20%')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /more actions for jamie staff/i }));
    await user.click(screen.getByRole('button', { name: /^edit$/i }));
    expect(screen.getByDisplayValue('Jamie Staff')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /can drive/i })).toBeChecked();
    await user.click(screen.getByRole('button', { name: /^slate$/i }));
    await user.clear(screen.getByLabelText(/hourly cost/i));
    await user.type(screen.getByLabelText(/hourly cost/i), '26');
    await pickSelectOption(user, /cis status/i, /gross status \(0%\)/i);
    await user.click(screen.getByRole('button', { name: /save changes/i }));
    expect(api.put).toHaveBeenCalledWith('/settings/users/3', expect.objectContaining({
      skills: expect.arrayContaining(['roofer', 'slate']),
      is_driver: true,
      hourly_cost: 26,
      cis_status: 'gross',
      role: 'STAFF',
    }));
  });
});

function isoDayLocal(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function lastSevenDaysLocal() {
  const to = new Date();
  const from = new Date(to.getFullYear(), to.getMonth(), to.getDate() - 6);
  return { from: isoDayLocal(from), to: isoDayLocal(to) };
}

function mockSecurityEvents(handler) {
  api.get.mockImplementation(async (path) => {
    if (path === '/settings/integrations') return { integrations: [], events: [] };
    if (path === '/settings/users') return { users: [] };
    if (String(path).startsWith('/settings/security-events')) return handler(path);
    return {};
  });
}

describe('Settings security log (requirement 1.9)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.user = { id: 1, name: 'Paul', role: 'ADMIN' };
    mockSecurityEvents(() => ({
      events: [
        {
          id: 11,
          action: 'role_change',
          detail: 'STAFF → OFFICE',
          created_at: '2026-09-21T12:00:00.000Z',
          actor: { id: 1, name: 'Paul Douglas', email: 'paul@pauldouglasroofing.co.uk' },
          target: { id: 3, name: 'Jamie Staff', email: 'jamie@pauldouglasroofing.co.uk' },
        },
      ],
      total: 1,
      page: 1,
      limit: 20,
    }));
  });

  it('lets an admin open the security log', async () => {
    const user = userEvent.setup();
    const range = lastSevenDaysLocal();
    render(<Settings />);
    await user.click(screen.getByRole('button', { name: /security log/i }));
    expect(await screen.findByRole('heading', { name: /^security logs$/i })).toBeInTheDocument();
    expect(await screen.findByText('Role change')).toBeInTheDocument();
    expect(screen.getByText('Paul Douglas')).toBeInTheDocument();
    expect(screen.getByText('Jamie Staff')).toBeInTheDocument();
    expect(screen.getByText('STAFF → OFFICE')).toBeInTheDocument();
    expect(screen.getByLabelText(/^start date$/i)).toHaveAttribute('data-value', range.from);
    expect(screen.getByLabelText(/^end date$/i)).toHaveAttribute('data-value', range.to);
    expect(screen.getByRole('columnheader', { name: /^date$/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /^time$/i })).toBeInTheDocument();
    expect(screen.getByText('2026-09-21')).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith(
      `/settings/security-events?from=${range.from}&to=${range.to}&page=1&limit=20`,
    );
  });

  it('paginates the security log instead of loading every row', async () => {
    const user = userEvent.setup();
    mockSecurityEvents((path) => {
      const qs = new URLSearchParams(path.split('?')[1] || '');
      const page = Number(qs.get('page') || 1);
      const events = page === 1
        ? [{
          id: 11,
          action: 'role_change',
          detail: 'STAFF → OFFICE',
          created_at: '2026-09-21T12:00:00.000Z',
          actor: { id: 1, name: 'Paul Douglas' },
          target: { id: 3, name: 'Jamie Staff' },
        }]
        : [{
          id: 12,
          action: 'login_success',
          detail: null,
          created_at: '2026-09-20T10:00:00.000Z',
          actor: { id: 1, name: 'Paul Douglas' },
          target: { id: 1, name: 'Paul Douglas' },
        }];
      return { events, total: 21, page, limit: 20 };
    });
    render(<Settings />);
    await user.click(screen.getByRole('button', { name: /security log/i }));
    expect(await screen.findByText(/showing 1–20 of 21/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /previous/i })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: /next/i }));
    expect(await screen.findByText(/showing 21–21 of 21/i)).toBeInTheDocument();
    expect(screen.getByText('Login success')).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith(expect.stringContaining('page=2&limit=20'));
  });

  it('lets an admin change how many security log rows load', async () => {
    const user = userEvent.setup();
    mockSecurityEvents((path) => {
      const qs = new URLSearchParams(path.split('?')[1] || '');
      const page = Number(qs.get('page') || 1);
      const limit = Number(qs.get('limit') || 20);
      return {
        events: [{
          id: 11,
          action: 'role_change',
          detail: 'STAFF → OFFICE',
          created_at: '2026-09-21T12:00:00.000Z',
          actor: { id: 1, name: 'Paul Douglas' },
          target: { id: 3, name: 'Jamie Staff' },
        }],
        total: 85,
        page,
        limit,
      };
    });
    render(<Settings />);
    await user.click(screen.getByRole('button', { name: /security log/i }));
    expect(await screen.findByText(/showing 1–20 of 85/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/rows per page/i)).toHaveAttribute('data-value', '20');
    await pickSelectOption(user, /rows per page/i, '50');
    expect(await screen.findByText(/showing 1–50 of 85/i)).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith(expect.stringContaining('page=1&limit=50'));
    await user.click(screen.getByRole('button', { name: /next/i }));
    expect(await screen.findByText(/showing 51–85 of 85/i)).toBeInTheDocument();
    await pickSelectOption(user, /rows per page/i, '100');
    expect(await screen.findByText(/showing 1–85 of 85/i)).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith(expect.stringContaining('page=1&limit=100'));
  });

  it('hides the security log tab from office users', () => {
    authState.user = { id: 2, name: 'Lisa', role: 'OFFICE' };
    render(<Settings />);
    expect(screen.queryByRole('button', { name: /security log/i })).toBeNull();
    expect(api.get.mock.calls.some(([path]) => String(path).startsWith('/settings/security-events'))).toBe(false);
  });
});

describe('Settings Google Calendar (requirement 5.2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('open', vi.fn());
    authState.user = { id: 2, name: 'Lisa', role: 'OFFICE' };
    api.get.mockImplementation(async (path) => {
      if (path === '/settings/integrations') {
        return {
          integrations: [{
            id: 'google',
            name: 'Google Calendar',
            configured: true,
            connected: false,
            mode: 'simulated',
            detail: 'Keys present — connect your Google Calendar here.',
            env_needed: ['GOOGLE_CLIENT_ID'],
          }],
          events: [],
        };
      }
      if (path === '/integrations/google/connect') return { url: 'https://accounts.google.com/o/oauth2' };
      return { users: [], events: [] };
    });
  });

  it('lets an office user Connect their own calendar', async () => {
    const user = userEvent.setup();
    render(<Settings />);
    await user.click(await screen.findByRole('button', { name: /^integrations$/i }));
    await user.click(await screen.findByRole('button', { name: /^connect$/i }));
    expect(api.get).toHaveBeenCalledWith('/integrations/google/connect');
    expect(window.open).toHaveBeenCalledWith('https://accounts.google.com/o/oauth2', '_blank');
  });
});

describe('Settings VAT rates (requirement 6.3)', () => {
  const COMPANY_SETTINGS = {
    company: {
      name: 'Paul Douglas Roofing', address: 'Unit 4', phone: '01234', email: 'office@example.com',
      vat_number: 'GB1', company_number: '1',
    },
    vat_rate: 20,
    quote_validity_days: 30,
    invoice_due_days: 14,
    holiday_notice_days: 28,
    uk: {
      vat_registered: true,
      vat_rates: [
        { code: 'standard', rate: 20, short: '20%', label: 'Standard 20%' },
        { code: 'reduced', rate: 5, short: '5%', label: 'Reduced 5%' },
        { code: 'zero', rate: 0, short: '0%', label: 'Zero rated' },
        { code: 'exempt', rate: 0, short: 'Ex', label: 'Exempt' },
      ],
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    authState.user = { id: 1, name: 'Paul', role: 'ADMIN' };
    api.get.mockImplementation(async (path) => {
      if (path === '/settings') return { settings: COMPANY_SETTINGS };
      if (path === '/settings/integrations') return { integrations: [], events: [] };
      if (path === '/settings/users') return { users: [] };
      return {};
    });
    api.put.mockResolvedValue({ ok: true });
  });

  it('lets an admin add and update VAT rates used on quotes and invoices', async () => {
    const user = userEvent.setup();
    render(<Settings />);
    await user.click(screen.getByRole('button', { name: /company/i }));
    expect(await screen.findByRole('heading', { name: /VAT rates/i })).toBeInTheDocument();
    const standardRate = screen.getByRole('spinbutton', { name: 'VAT rate 1' });
    expect(standardRate).toHaveValue(20);
    await user.clear(standardRate);
    await user.type(standardRate, '21');
    await user.click(screen.getByRole('button', { name: /add vat rate/i }));
    await user.type(screen.getByLabelText(/VAT code 5/i), 'green');
    const extraRate = screen.getByRole('spinbutton', { name: 'VAT rate 5' });
    await user.clear(extraRate);
    await user.type(extraRate, '5');
    await user.click(screen.getByRole('button', { name: /save changes/i }));
    expect(api.put).toHaveBeenCalledWith('/settings', expect.objectContaining({
      uk: expect.objectContaining({
        vat_rates: expect.arrayContaining([
          expect.objectContaining({ code: 'standard', rate: 21 }),
          expect.objectContaining({ code: 'green', rate: 5 }),
        ]),
      }),
    }));
  });
});

describe('Settings quote follow-ups (requirement 12.1)', () => {
  const COMPANY_SETTINGS = {
    company: {
      name: 'Paul Douglas Roofing', address: 'Unit 4', phone: '01234', email: 'office@example.com',
      vat_number: 'GB1', company_number: '1',
    },
    vat_rate: 20,
    quote_validity_days: 30,
    invoice_due_days: 14,
    holiday_notice_days: 28,
    uk: { vat_registered: true, vat_rates: [] },
    followups: {
      enabled: true,
      email_subject: 'How did you get on with our quotation {ref}?',
      steps: [
        { delay_days: 2, channel: 'whatsapp', body: 'Hi {name} — {ref}' },
        { delay_days: 5, channel: 'email', body: 'Checking {title}' },
      ],
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    authState.user = { id: 1, name: 'Paul', role: 'ADMIN' };
    api.get.mockImplementation(async (path) => {
      if (path === '/settings') return { settings: COMPANY_SETTINGS };
      if (path === '/settings/integrations') return { integrations: [], events: [] };
      if (path === '/settings/users') return { users: [] };
      return {};
    });
    api.put.mockResolvedValue({ ok: true });
  });

  it('lets an admin add a step with delay, channel, and body template', async () => {
    const user = userEvent.setup();
    render(<Settings />);
    await user.click(screen.getByRole('button', { name: /company/i }));
    expect(await screen.findByRole('heading', { name: /quote follow-ups/i })).toBeInTheDocument();
    const bodies = screen.getAllByLabelText('Message template');
    expect(bodies[0]).toHaveValue('Hi {name} — {ref}');
    await user.click(screen.getByRole('button', { name: /add step/i }));
    const afterAdd = screen.getAllByLabelText('Message template');
    await user.type(afterAdd[2], 'Last nudge on this quote');
    await user.click(screen.getByRole('button', { name: /save changes/i }));
    expect(api.put).toHaveBeenCalledWith('/settings', expect.objectContaining({
      followups: expect.objectContaining({
        enabled: true,
        steps: expect.arrayContaining([
          expect.objectContaining({ delay_days: 2, channel: 'whatsapp', body: 'Hi {name} — {ref}' }),
          expect.objectContaining({ delay_days: 7, channel: 'email', body: 'Last nudge on this quote' }),
        ]),
      }),
    }));
  });
});

describe('Settings automation interval (requirement 12.3)', () => {
  const COMPANY_SETTINGS = {
    company: {
      name: 'Paul Douglas Roofing', address: 'Unit 4', phone: '01234', email: 'office@example.com',
      vat_number: 'GB1', company_number: '1',
    },
    vat_rate: 20,
    quote_validity_days: 30,
    invoice_due_days: 14,
    holiday_notice_days: 28,
    uk: { vat_registered: true, vat_rates: [] },
    automation: { interval_minutes: 5 },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    authState.user = { id: 1, name: 'Paul', role: 'ADMIN' };
    api.get.mockImplementation(async (path) => {
      if (path === '/settings') return { settings: COMPANY_SETTINGS };
      if (path === '/settings/integrations') return { integrations: [], events: [] };
      if (path === '/settings/users') return { users: [] };
      return {};
    });
    api.put.mockResolvedValue({ ok: true });
  });

  it('lets an admin change the automation interval in minutes', async () => {
    const user = userEvent.setup();
    render(<Settings />);
    await user.click(screen.getByRole('button', { name: /company/i }));
    const input = await screen.findByLabelText(/automation interval/i);
    expect(input).toHaveValue(5);
    await user.clear(input);
    await user.type(input, '10');
    await user.click(screen.getByRole('button', { name: /save changes/i }));
    expect(api.put).toHaveBeenCalledWith('/settings', expect.objectContaining({
      automation: { interval_minutes: 10 },
    }));
  });
});

describe('Settings company profile, tax, and bank (requirement 17.1)', () => {
  const COMPANY_SETTINGS = {
    company: {
      name: 'Paul Douglas Roofing',
      address: 'Unit 4',
      city: 'United Kingdom',
      phone: '01234',
      email: 'office@example.com',
      vat_number: 'GB1',
      company_number: '1',
      bank_name: '',
      bank_account_name: '',
      bank_sort_code: '',
      bank_account_number: '',
    },
    vat_rate: 20,
    quote_validity_days: 30,
    invoice_due_days: 14,
    holiday_notice_days: 28,
    uk: {
      vat_registered: true,
      cis_registered: false,
      cis_utr: '',
      default_cis_rate: 20,
      vat_rates: [],
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    authState.user = { id: 1, name: 'Paul', role: 'ADMIN' };
    api.get.mockImplementation(async (path) => {
      if (path === '/settings') return { settings: COMPANY_SETTINGS };
      if (path === '/settings/integrations') return { integrations: [], events: [] };
      if (path === '/settings/users') return { users: [] };
      return {};
    });
    api.put.mockResolvedValue({ ok: true });
  });

  it('lets an admin save city, VAT/CIS flags, and bank details', async () => {
    const user = userEvent.setup({ delay: null });
    render(<Settings />);
    await user.click(screen.getByRole('button', { name: /^company$/i }));
    const city = await screen.findByLabelText(/^city$/i);
    expect(city).toHaveValue('United Kingdom');
    await user.clear(city);
    await user.type(city, 'Leeds');
    expect(screen.getByRole('checkbox', { name: /vat registered/i })).toBeChecked();
    await user.click(screen.getByRole('checkbox', { name: /cis registered/i }));
    await user.type(screen.getByLabelText(/cis utr/i), '1234567890');
    await pickSelectOption(user, /default cis rate/i, /0% — gross payment status/i);
    await user.type(screen.getByLabelText(/^bank name$/i), 'Barclays');
    await user.type(screen.getByLabelText(/^account name$/i), 'Paul Douglas Roofing');
    await user.type(screen.getByLabelText(/^sort code$/i), '20-00-00');
    await user.type(screen.getByLabelText(/^account number$/i), '12345678');
    await user.click(screen.getByRole('button', { name: /save changes/i }));
    expect(api.put).toHaveBeenCalledWith('/settings', expect.objectContaining({
      company: expect.objectContaining({
        city: 'Leeds',
        bank_name: 'Barclays',
        bank_account_name: 'Paul Douglas Roofing',
        bank_sort_code: '20-00-00',
        bank_account_number: '12345678',
      }),
      uk: expect.objectContaining({
        vat_registered: true,
        cis_registered: true,
        cis_utr: '1234567890',
        default_cis_rate: 0,
      }),
    }));
  });

  it('hides bank fields from office users and leaves tax fields read-only', async () => {
    authState.user = { id: 2, name: 'Lisa', role: 'OFFICE' };
    const officeCompany = { ...COMPANY_SETTINGS.company };
    delete officeCompany.bank_name;
    delete officeCompany.bank_account_name;
    delete officeCompany.bank_sort_code;
    delete officeCompany.bank_account_number;
    api.get.mockImplementation(async (path) => {
      if (path === '/settings') return { settings: { ...COMPANY_SETTINGS, company: officeCompany } };
      if (path === '/settings/integrations') return { integrations: [], events: [] };
      if (path === '/settings/users') return { users: [] };
      return {};
    });
    const user = userEvent.setup();
    render(<Settings />);
    await user.click(screen.getByRole('button', { name: /^company$/i }));
    expect(await screen.findByLabelText(/^city$/i)).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: /vat registered/i })).toBeDisabled();
    expect(screen.getByRole('heading', { name: /vat rates/i })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /bank details/i })).toBeNull();
    expect(screen.queryByLabelText(/^account number$/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /save changes/i })).toBeNull();
  });
});

describe('Settings notification preferences (requirement 13.2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.user = { id: 1, name: 'Paul', role: 'ADMIN' };
    api.get.mockImplementation(async (path) => {
      if (path === '/settings/integrations') return { integrations: [], events: [] };
      if (path === '/notifications/preferences') {
        return {
          kinds: [{ id: 'new_enquiry', title: 'New enquiry', in_app: true, email: false }],
          preferences: { in_app: { new_enquiry: false }, email: {} },
        };
      }
      return {};
    });
    api.put.mockResolvedValue({
      kinds: [{ id: 'new_enquiry', title: 'New enquiry', in_app: true, email: false }],
      preferences: { in_app: { new_enquiry: true }, email: {} },
    });
  });

  it('lets an office user opt in from the Notifications tab', async () => {
    const user = userEvent.setup();
    render(<Settings />);
    await user.click(screen.getByRole('button', { name: /^notifications$/i }));
    const box = await screen.findByRole('checkbox', { name: /new enquiry in-app/i });
    expect(box).not.toBeChecked();
    await user.click(box);
    await user.click(screen.getByRole('button', { name: /save preferences/i }));
    expect(api.put).toHaveBeenCalledWith('/notifications/preferences', expect.objectContaining({
      in_app: expect.objectContaining({ new_enquiry: true }),
    }));
  });
});

describe('Settings catalogue and templates tabs (requirement 17.2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.user = { id: 1, name: 'Paul', role: 'ADMIN' };
    api.get.mockImplementation(async (path) => {
      if (path === '/settings/integrations') return { integrations: [], events: [] };
      if (path === '/settings/users') return { users: [] };
      if (path === '/settings') {
        return {
          settings: {
            templates: { quote_sent_whatsapp: 'Hi {name}', custom: [] },
            checklist_templates: [{ id: 'generic', label: 'Generic', items: ['PPE on'] }],
          },
        };
      }
      if (String(path).startsWith('/catalogue')) return { items: [] };
      return {};
    });
  });

  it('opens Catalogue and Templates tabs', async () => {
    const user = userEvent.setup({ delay: null });
    render(<Settings />);
    await user.click(screen.getByRole('button', { name: /^catalogue$/i }));
    expect(await screen.findByRole('heading', { name: /service catalogue/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^templates$/i }));
    expect(await screen.findByRole('heading', { name: /message templates/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /job checklist templates/i })).toBeInTheDocument();
    expect(screen.queryByText(/legacy follow-ups/i)).toBeNull();
  });
});

const RULES_SETTINGS = {
  company: {
    name: 'Paul Douglas Roofing', address: 'Unit 4', phone: '01234', email: 'office@example.com',
    vat_number: 'GB1', company_number: '1',
  },
  vat_rate: 20,
  quote_validity_days: 30,
  invoice_due_days: 14,
  holiday_notice_days: 28,
  holiday_allowance_days: 28,
  uk: { vat_registered: true, vat_rates: [] },
  timesheets: {
    enabled: true,
    require_location: true,
    site_radius_m: 300,
    require_photo_on_clockout: false,
    auto_break_minutes: 0,
    auto_break_after_hours: 6,
    round_to_minutes: 0,
    max_shift_hours: 14,
  },
  branding: { logo_file: null, uploaded: false },
};

describe('Settings timesheet rules, holiday allowance, and branding (requirement 17.3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.user = { id: 1, name: 'Paul', role: 'ADMIN' };
    api.get.mockImplementation(async (path) => {
      if (path === '/settings') return { settings: RULES_SETTINGS };
      if (path === '/settings/integrations') return { integrations: [], events: [] };
      if (path === '/settings/users') {
        return {
          users: [{
            id: 3, name: 'Jamie Staff', email: 'jamie@example.com', phone: '3',
            role: 'STAFF', skills: [], is_driver: false, active: true, color: '#16a34a',
            financials_restricted: false, hourly_cost: 0, cis_status: 'none', holiday_allowance: 28,
          }],
        };
      }
      return {};
    });
    api.put.mockResolvedValue({ ok: true });
    api.post.mockResolvedValue({ id: 99 });
    api.upload.mockResolvedValue({ ok: true, branding: { logo_file: 'brand-logo.png', uploaded: true } });
  });

  it('lets an admin save timesheet rules and the company default allowance', async () => {
    const user = userEvent.setup({ delay: null });
    render(<Settings />);
    await user.click(screen.getByRole('button', { name: /^company$/i }));
    expect(await screen.findByRole('heading', { name: /timesheet rules/i })).toBeInTheDocument();
    const radius = screen.getByLabelText(/site radius/i);
    expect(radius).toHaveValue(300);
    await user.clear(radius);
    await user.type(radius, '250');
    const allowance = screen.getByLabelText(/default holiday allowance/i);
    await user.clear(allowance);
    await user.type(allowance, '30');
    await user.click(screen.getByRole('button', { name: /save changes/i }));
    expect(api.put).toHaveBeenCalledWith('/settings', expect.objectContaining({
      holiday_allowance_days: 30,
      timesheets: expect.objectContaining({ site_radius_m: 250, enabled: true }),
    }));
    const payload = api.put.mock.calls.find((c) => c[0] === '/settings')[1];
    expect(payload.templates).toBeUndefined();
    expect(payload.checklist_templates).toBeUndefined();
    expect(payload.working_hours).toBeUndefined();
    expect(payload.branding).toBeUndefined();
  });

  it('lets office view timesheet rules and the logo but not upload', async () => {
    authState.user = { id: 2, name: 'Lisa', role: 'OFFICE' };
    const user = userEvent.setup({ delay: null });
    render(<Settings />);
    await user.click(screen.getByRole('button', { name: /^company$/i }));
    expect(await screen.findByRole('heading', { name: /timesheet rules/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/site radius/i)).toBeDisabled();
    expect(screen.getByRole('heading', { name: /^branding$/i })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /company logo/i })).toBeInTheDocument();
    expect(screen.queryByLabelText(/upload company logo/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /save changes/i })).toBeNull();
  });

  it('creates staff without an allowance so the server inherits the company default', async () => {
    const user = userEvent.setup({ delay: null });
    render(<Settings />);
    await user.click(screen.getByRole('button', { name: /staff & users/i }));
    await user.click(await screen.findByRole('button', { name: /add user/i }));
    expect(screen.getByLabelText(/holiday allowance/i)).toBeInTheDocument();
    await user.type(screen.getByLabelText(/^name$/i), 'New Hand');
    await user.type(screen.getByLabelText(/email/i), 'new@example.com');
    await user.type(screen.getByLabelText(/temporary password/i), 'password123');
    await user.click(screen.getAllByRole('button', { name: /^add user$/i }).at(-1));
    expect(api.post).toHaveBeenCalledWith('/settings/users', expect.objectContaining({
      name: 'New Hand',
      email: 'new@example.com',
    }));
    const body = api.post.mock.calls.find((c) => c[0] === '/settings/users')[1];
    expect(body.holiday_allowance).toBeUndefined();
  });

  it('sends holiday allowance when editing a user', async () => {
    const user = userEvent.setup({ delay: null });
    render(<Settings />);
    await user.click(screen.getByRole('button', { name: /staff & users/i }));
    await screen.findByText('Jamie Staff');
    await user.click(screen.getByRole('button', { name: /more actions for jamie staff/i }));
    await user.click(screen.getByRole('button', { name: /^edit$/i }));
    const field = screen.getByLabelText(/holiday allowance/i);
    expect(field).toHaveValue(28);
    await user.clear(field);
    await user.type(field, '22');
    await user.click(screen.getByRole('button', { name: /save changes/i }));
    expect(api.put).toHaveBeenCalledWith('/settings/users/3', expect.objectContaining({
      holiday_allowance: 22,
    }));
  });

  it('lets an admin upload a PNG logo', async () => {
    const user = userEvent.setup({ delay: null });
    render(<Settings />);
    await user.click(screen.getByRole('button', { name: /^company$/i }));
    const input = await screen.findByLabelText(/upload company logo/i);
    const file = new File(['png'], 'mark.png', { type: 'image/png' });
    await user.upload(input, file);
    expect(api.upload).toHaveBeenCalled();
    const [path, fd] = api.upload.mock.calls[0];
    expect(path).toBe('/settings/logo');
    expect(fd.get('file')).toBe(file);
  });
});


