import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Timesheets from './Timesheets.jsx';
import { api } from '../lib/api';
import { formatClockTime } from '../lib/clockTime';
import { pickDate } from '../test/datePicker.js';
import { pickSelectOption } from '../test/selectMenu.js';

const auth = { user: { id: 2, name: 'Lisa', role: 'OFFICE', financials_restricted: false } };
let live = { work_date: '2026-09-25', active: [], not_clocked_in: [] };
const defaultReviewRows = [{
  id: 1, status: 'completed', labour_cost: 196, worked_minutes: 480, user_id: 3, user_name: 'Liam', color: '#000',
  work_date: '2026-09-21', clock_in: '2026-09-21T08:00:00', clock_out: '2026-09-21T16:00:00', job_title: 'Re-roof',
}];
let reviewRows = defaultReviewRows;
const staffUsers = [
  { id: 3, name: 'Liam', role: 'STAFF', active: true },
  { id: 4, name: 'Jamie', role: 'STAFF', active: true },
];
const defaultTotalsRows = [
  { user_id: 3, name: 'Liam', color: '#000', hours: 8, cost: 132, hourly_cost: 16.5, shifts: 1, awaiting_approval: 0, flagged: 0 },
  { user_id: 4, name: 'Jamie', color: '#111', hours: 4, cost: 80, hourly_cost: 20, shifts: 2, awaiting_approval: 1, flagged: 2 },
  { user_id: 5, name: 'Ryan', color: '#222', hours: 0, cost: 0, hourly_cost: 18, shifts: 0, awaiting_approval: 0, flagged: 0 },
];
let totalsRows = defaultTotalsRows;

vi.mock('../lib/auth.jsx', () => ({
  useAuth: () => auth,
}));

vi.mock('../lib/api', () => ({
  api: {
    get: vi.fn(async (path) => {
      if (path.startsWith('/timesheets/live')) return live;
      if (path.startsWith('/timesheets/totals')) {
        return { totals: totalsRows };
      }
      if (path.startsWith('/timesheets/costing')) return { jobs: [] };
      if (path.startsWith('/settings/users')) return { users: staffUsers };
      if (path.startsWith('/timesheets')) {
        const query = new URL(path, 'http://local.test').searchParams;
        const userId = query.get('user_id');
        const list = userId ? reviewRows.filter((row) => String(row.user_id) === userId) : reviewRows;
        return { timesheets: list, counts: { awaiting: list.filter((r) => r.status === 'completed').length, flagged: 0 } };
      }
      return {};
    }),
    post: vi.fn(async () => ({ ok: true })),
    put: vi.fn(),
  },
  money: (n) => `£${n}`,
  fmtDate: () => '21 Sep',
}));

describe('Timesheets labour-cost UI (requirement 1.6)', () => {
  beforeEach(() => {
    auth.user = { id: 2, name: 'Lisa', role: 'OFFICE', financials_restricted: false };
    live = { work_date: '2026-09-25', active: [], not_clocked_in: [] };
    reviewRows = defaultReviewRows;
    totalsRows = defaultTotalsRows;
  });

  it('shows costing tab and cost column when unrestricted', async () => {
    const user = userEvent.setup();
    render(<Timesheets />);
    expect(await screen.findByRole('button', { name: /job profitability/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /review & approve/i }));
    expect(await screen.findByRole('columnheader', { name: /^cost$/i })).toBeInTheDocument();
  });

  it('hides costing tab and cost column when restricted', async () => {
    auth.user = { id: 2, name: 'Lisa', role: 'OFFICE', financials_restricted: true };
    const user = userEvent.setup();
    render(<Timesheets />);
    await user.click(await screen.findByRole('button', { name: /review & approve/i }));
    expect(await screen.findByRole('columnheader', { name: /^hours$/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /job profitability/i })).toBeNull();
    expect(screen.queryByRole('columnheader', { name: /^cost$/i })).toBeNull();
    await user.click(screen.getByRole('button', { name: /weekly totals/i }));
    expect(await screen.findByRole('columnheader', { name: /^rate$/i })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: /labour cost/i })).toBeNull();
  });
});

describe('Timesheets live board (requirement 9.3)', () => {
  beforeEach(() => {
    auth.user = { id: 2, name: 'Lisa', role: 'OFFICE', financials_restricted: false };
    live = { work_date: '2026-09-25', active: [], not_clocked_in: [] };
    reviewRows = defaultReviewRows;
    totalsRows = defaultTotalsRows;
    api.post.mockClear();
  });

  it('opens as a full On the clock tab and still shows when empty', async () => {
    render(<Timesheets />);
    expect(await screen.findByRole('heading', { name: /on the clock \(0\)/i })).toBeInTheDocument();
    expect(screen.getByText(/nobody on the clock/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /not clocked in \(0\)/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /csv/i })).toBeNull();
  });

  it('shows date range and CSV on Review, not on the live tab', async () => {
    const user = userEvent.setup();
    render(<Timesheets />);
    await screen.findByText(/nobody on the clock/i);
    expect(screen.queryByRole('link', { name: /csv/i })).toBeNull();
    await user.click(screen.getByRole('button', { name: /review & approve/i }));
    expect(await screen.findByRole('link', { name: /csv/i })).toBeInTheDocument();
  });

  it('shows elapsed time, on-break, far-from-site, no-location, and missing crew', async () => {
    live = {
      work_date: '2026-09-25',
      active: [
        {
          id: 11,
          user_name: 'Jamie',
          color: '#111',
          job_title: 'Hall roof',
          clock_in: new Date(Date.now() - 90 * 60000).toISOString(),
          break_started_at: '2026-09-25T10:00:00',
          location_flag: 'far_from_site',
          in_distance_m: 420,
        },
        {
          id: 12,
          user_name: 'Liam',
          color: '#222',
          job_title: null,
          clock_in: new Date(Date.now() - 15 * 60000).toISOString(),
          break_started_at: null,
          location_flag: 'no_location',
        },
      ],
      not_clocked_in: [
        { user_id: 5, user_name: 'Ryan', color: '#333', jobs: ['Hall roof', 'Garage'] },
      ],
    };
    render(<Timesheets />);
    expect(await screen.findByText('Jamie')).toBeInTheDocument();
    expect(screen.getByText('1:30')).toBeInTheDocument();
    expect(screen.getByText(/on break/i)).toBeInTheDocument();
    expect(screen.getByText(/420m off site/i)).toBeInTheDocument();
    expect(screen.getByText('Liam')).toBeInTheDocument();
    expect(screen.getByText(/yard \/ travel/i)).toBeInTheDocument();
    expect(screen.getByText(/no location/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /not clocked in \(1\)/i })).toBeInTheDocument();
    expect(screen.getByText('Ryan')).toBeInTheDocument();
    expect(screen.getByText('Hall roof · Garage')).toBeInTheDocument();
  });

  it('shows live clock-in time in local time, not UTC ISO digits', async () => {
    const clockIn = '2026-10-02T14:29:00.000Z';
    live = {
      work_date: '2026-10-02',
      active: [{
        id: 11,
        user_name: 'Jamie',
        color: '#111',
        job_title: 'yard / travel',
        clock_in: clockIn,
      }],
      not_clocked_in: [],
    };
    render(<Timesheets />);
    expect(await screen.findByText(`since ${formatClockTime(clockIn)}`)).toBeInTheDocument();
  });

  it('lets office force clock-out from a live card', async () => {
    live = {
      work_date: '2026-09-25',
      active: [{
        id: 11,
        user_name: 'Jamie',
        color: '#111',
        job_title: 'Hall roof',
        clock_in: new Date(Date.now() - 60000).toISOString(),
      }],
      not_clocked_in: [],
    };
    const user = userEvent.setup();
    render(<Timesheets />);
    await user.click(await screen.findByRole('button', { name: /clock out jamie/i }));
    expect(api.post).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent(/clock jamie out now/i);
    expect(dialog).toHaveTextContent(/hall roof/i);
    await user.click(screen.getByRole('button', { name: /confirm clock out/i }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/timesheets/11/force-clockout'));
  });

  it('does not clock out if office cancels the confirm modal', async () => {
    live = {
      work_date: '2026-09-25',
      active: [{
        id: 11,
        user_name: 'Jamie',
        color: '#111',
        job_title: 'Hall roof',
        clock_in: new Date(Date.now() - 60000).toISOString(),
      }],
      not_clocked_in: [],
    };
    const user = userEvent.setup();
    render(<Timesheets />);
    await user.click(await screen.findByRole('button', { name: /clock out jamie/i }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^cancel$/i }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });
});

describe('Timesheets review (requirement 9.4)', () => {
  beforeEach(() => {
    auth.user = { id: 2, name: 'Lisa', role: 'OFFICE', financials_restricted: false };
    live = { work_date: '2026-09-25', active: [], not_clocked_in: [] };
    reviewRows = defaultReviewRows;
    totalsRows = defaultTotalsRows;
    api.post.mockClear();
    api.put.mockClear();
    api.get.mockClear();
  });

  it('lets office approve and reject completed shifts, and edit completed or approved', async () => {
    reviewRows = [
      {
        id: 1, status: 'completed', labour_cost: 196, worked_minutes: 480, user_name: 'Liam', color: '#000',
        work_date: '2026-09-21', clock_in: '2026-09-21T08:00:00', clock_out: '2026-09-21T16:00:00', job_title: 'Re-roof',
      },
      {
        id: 2, status: 'approved', labour_cost: 80, worked_minutes: 240, user_name: 'Jamie', color: '#111',
        work_date: '2026-09-21', clock_in: '2026-09-21T08:00:00', clock_out: '2026-09-21T12:00:00', job_title: 'Hall',
      },
      {
        id: 3, status: 'active', labour_cost: null, worked_minutes: null, user_name: 'Ryan', color: '#222',
        work_date: '2026-09-25', clock_in: '2026-09-25T08:00:00', clock_out: null, job_title: 'Garage',
      },
    ];
    const user = userEvent.setup();
    render(<Timesheets />);
    await user.click(await screen.findByRole('button', { name: /review & approve/i }));
    expect(await screen.findByRole('button', { name: /^approve$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^reject$/i })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^edit$/i })).toHaveLength(2);
    expect(screen.getByText('Ryan').closest('tr').textContent).not.toMatch(/Edit/);
    const liamButtons = [...screen.getByText('Liam').closest('tr').querySelector('td:last-child').querySelectorAll('button')]
      .map((btn) => btn.textContent.replace(/\s+/g, ' ').trim());
    expect(liamButtons).toEqual(['Edit', 'Approve', 'Reject']);
  });

  it('shows location and office-edit icons beside status, with detail on hover', async () => {
    reviewRows = [
      {
        id: 1, status: 'completed', labour_cost: 196, worked_minutes: 480, user_name: 'Liam', color: '#000',
        work_date: '2026-09-21', clock_in: '2026-09-21T08:00:00', clock_out: '2026-09-21T16:00:00', job_title: 'Re-roof',
        location_flag: 'far_from_site', in_distance_m: 420,
      },
      {
        id: 2, status: 'approved', labour_cost: 80, worked_minutes: 240, user_name: 'Jamie', color: '#111',
        work_date: '2026-09-21', clock_in: '2026-09-21T08:00:00', clock_out: '2026-09-21T12:00:00', job_title: 'Hall',
        location_flag: 'no_location',
      },
      {
        id: 3, status: 'approved', labour_cost: 40, worked_minutes: 120, user_name: 'Ryan', color: '#222',
        work_date: '2026-09-21', clock_in: '2026-09-21T08:00:00', clock_out: '2026-09-21T10:00:00', job_title: 'Garage',
        edit_reason: 'Forgot to clock out',
      },
    ];
    const user = userEvent.setup();
    render(<Timesheets />);
    await user.click(await screen.findByRole('button', { name: /review & approve/i }));
    const offSite = await screen.findByRole('button', { name: /off site/i });
    const noLocation = screen.getByRole('button', { name: /no location/i });
    const edited = screen.getByRole('button', { name: /edited/i });
    expect(screen.queryByText('no location')).toBeNull();
    expect(screen.queryByText('edited')).toBeNull();
    await user.hover(noLocation);
    expect(screen.getByRole('tooltip')).toHaveTextContent(/GPS was not captured/i);
    await user.hover(offSite);
    expect(screen.getByRole('tooltip')).toHaveTextContent(/420m off site/i);
    await user.hover(edited);
    expect(screen.getByRole('tooltip')).toHaveTextContent(/Office correction: Forgot to clock out/i);
  });

  it('shows the reject reason instead of an edit control on rejected shifts', async () => {
    reviewRows = [
      {
        id: 9, status: 'rejected', labour_cost: 0.03, worked_minutes: 0, user_name: 'newtest1122', color: '#000',
        work_date: '2026-10-02', clock_in: '2026-10-02T19:40:00', clock_out: '2026-10-02T19:40:00', job_title: null,
        edit_reason: 'tes',
      },
    ];
    const user = userEvent.setup();
    render(<Timesheets />);
    await user.click(await screen.findByRole('button', { name: /review & approve/i }));
    expect(await screen.findByText("Can't edit")).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^edit$/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /edited/i })).toBeNull();
    const why = screen.getByRole('button', { name: /why it was rejected/i });
    expect(why).toHaveTextContent('tes');
    await user.hover(why);
    expect(screen.getByRole('tooltip')).toHaveTextContent(/why it was rejected/i);
    expect(screen.getByRole('tooltip')).toHaveTextContent('tes');
    expect(screen.getByRole('tooltip')).not.toHaveTextContent(/office correction/i);
  });

  it('filters the table and CSV by status and staff', async () => {
    reviewRows = [
      {
        id: 1, status: 'completed', labour_cost: 196, worked_minutes: 480, user_id: 3, user_name: 'Liam', color: '#000',
        work_date: '2026-09-21', clock_in: '2026-09-21T08:00:00', clock_out: '2026-09-21T16:00:00', job_title: 'Re-roof',
      },
      {
        id: 2, status: 'approved', labour_cost: 80, worked_minutes: 240, user_id: 4, user_name: 'Jamie', color: '#111',
        work_date: '2026-09-21', clock_in: '2026-09-21T08:00:00', clock_out: '2026-09-21T12:00:00', job_title: 'Hall',
      },
    ];
    const user = userEvent.setup();
    render(<Timesheets />);
    await user.click(await screen.findByRole('button', { name: /review & approve/i }));
    expect(await screen.findByText('Liam')).toBeInTheDocument();
    expect(await screen.findByText('Jamie')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /approved only/i })).toBeNull();
    expect(screen.getByRole('link', { name: /csv/i }).getAttribute('href')).not.toContain('status=approved');

    await user.click(screen.getByRole('button', { name: '1 Approved' }));
    expect(screen.getByText('Jamie')).toBeInTheDocument();
    expect(screen.queryByText('Liam')).toBeNull();
    expect(screen.getByRole('link', { name: /csv/i }).getAttribute('href')).toContain('status=approved');

    await pickSelectOption(user, 'Status', /all statuses/i);
    expect(screen.getByText('Liam')).toBeInTheDocument();
    await pickSelectOption(user, 'Staff', 'Liam');
    expect(api.get).toHaveBeenCalledWith(expect.stringContaining('user_id=3'));
    expect(screen.queryByText('Jamie')).toBeNull();
    expect(screen.getByRole('link', { name: /csv/i }).getAttribute('href')).toContain('user_id=3');
  });

  it('rejects a completed shift with a required reason', async () => {
    const user = userEvent.setup();
    render(<Timesheets />);
    await user.click(await screen.findByRole('button', { name: /review & approve/i }));
    await user.click(await screen.findByRole('button', { name: /^reject$/i }));
    await user.type(screen.getByLabelText(/reason \(required\)/i), 'Wrong job');
    await user.click(screen.getByRole('button', { name: /reject timesheet/i }));
    expect(api.post).toHaveBeenCalledWith('/timesheets/1/reject', { reason: 'Wrong job' });
  });

  it('lets office change clock times with date and time pickers', async () => {
    api.put.mockResolvedValue({});
    const user = userEvent.setup();
    render(<Timesheets />);
    await user.click(await screen.findByRole('button', { name: /review & approve/i }));
    await user.click(await screen.findByRole('button', { name: /^edit$/i }));
    expect(await screen.findByLabelText(/^clock in date$/i)).toHaveAttribute('data-value', '2026-09-21');
    expect(screen.getByLabelText(/^clock in time$/i)).toHaveValue('08:00');
    expect(screen.getByLabelText(/^clock out date$/i)).toHaveAttribute('data-value', '2026-09-21');
    expect(screen.getByLabelText(/^clock out time$/i)).toHaveValue('16:00');
    await pickDate(user, /^clock out date$/i, '2026-09-22');
    const outTime = screen.getByLabelText(/^clock out time$/i);
    await user.clear(outTime);
    await user.type(outTime, '17:00');
    await user.type(screen.getByPlaceholderText(/forgot to clock out/i), 'Confirmed finish with Liam');
    await user.click(screen.getByRole('button', { name: /save changes/i }));
    await waitFor(() => expect(api.put).toHaveBeenCalled());
    expect(api.put).toHaveBeenCalledWith('/timesheets/1', expect.objectContaining({
      clock_in: new Date(2026, 8, 21, 8, 0).toISOString(),
      clock_out: new Date(2026, 8, 22, 17, 0).toISOString(),
      edit_reason: 'Confirmed finish with Liam',
    }));
  });
});

describe('Timesheets weekly totals filters', () => {
  beforeEach(() => {
    auth.user = { id: 2, name: 'Lisa', role: 'OFFICE', financials_restricted: false };
    live = { work_date: '2026-09-25', active: [], not_clocked_in: [] };
    totalsRows = defaultTotalsRows;
  });

  it('filters by staff and pending flags, and keeps CSV in range', async () => {
    const user = userEvent.setup();
    render(<Timesheets />);
    await user.click(await screen.findByRole('button', { name: /weekly totals/i }));
    expect(await screen.findByText('Liam')).toBeInTheDocument();
    expect(screen.getByText('Jamie')).toBeInTheDocument();
    expect(screen.getByText('Ryan')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /csv/i }).getAttribute('href')).not.toContain('user_id=');

    await pickSelectOption(user, 'Staff', 'Jamie');
    expect(screen.queryByText('Liam')).toBeNull();
    expect(screen.queryByText('Ryan')).toBeNull();
    expect(screen.getByRole('link', { name: /csv/i }).getAttribute('href')).toContain('user_id=4');
    expect(screen.getAllByText('4.00h').length).toBeGreaterThan(0);

    await pickSelectOption(user, 'Staff', 'All staff');
    await pickSelectOption(user, 'Show', /pending approval/i);
    expect(screen.getByText('Jamie')).toBeInTheDocument();
    expect(screen.queryByText('Liam')).toBeNull();
    expect(screen.queryByText('Ryan')).toBeNull();

    await pickSelectOption(user, 'Show', /worked this period/i);
    expect(screen.getByText('Liam')).toBeInTheDocument();
    expect(screen.getByText('Jamie')).toBeInTheDocument();
    expect(screen.queryByText('Ryan')).toBeNull();
  });
});
