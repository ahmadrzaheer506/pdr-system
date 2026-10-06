import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Visits from './Visits.jsx';
import { api } from '../lib/api';
import { pickSelectOption } from '../test/selectMenu.js';

vi.mock('../lib/api', () => ({
  api: { get: vi.fn() },
  fmtDateTime: (d) => `dt:${d}`,
}));

vi.mock('../components/DatePicker.jsx', () => ({
  default: ({ id, label, value, onChange, placeholder }) => (
    <label>
      {label}
      <input
        id={id}
        aria-label={label}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  ),
}));

const SANDRA = {
  id: 50,
  customer_id: 3,
  lead_id: 8,
  title: 'Site visit — Sandra Cole',
  customer_name: 'Sandra Cole',
  lead_ref: 'L-0008',
  lead_name: 'L-0008 - Sandra Cole',
  address: '22 Birch Close, Caversham',
  start: '2026-10-07T09:00:00.000Z',
  visit_type: 'site_visit',
  status: 'booked',
  assignee_name: 'Callum Ashworth',
};

const MARCUS = {
  id: 51,
  customer_id: 4,
  lead_id: 9,
  title: 'Measure — Marcus Reid',
  customer_name: 'Marcus Reid',
  lead_ref: 'L-0009',
  lead_name: 'L-0009 - Marcus Reid',
  address: '5 The Sidings, Woodley',
  start: '2026-10-05T08:30:00.000Z',
  visit_type: 'measure',
  status: 'done',
  assignee_name: null,
};

describe('office Visits list', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.get.mockResolvedValue({
      appointments: [SANDRA, MARCUS],
      counts: { all: 2, booked: 1, done: 1, cancelled: 0 },
    });
  });

  it('renders a table of visits with type, assignee and status', async () => {
    render(<MemoryRouter><Visits /></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'Site visits' })).toBeInTheDocument();
    expect(await screen.findByText('L-0008 - Sandra Cole')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'L-0008 - Sandra Cole' })).toHaveAttribute(
      'href',
      '/leads/3?from=visits&lead=8',
    );
    expect(screen.getByText('Callum Ashworth')).toBeInTheDocument();
    expect(screen.getByText('Measure')).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith(expect.stringMatching(/^\/appointments\?status=ALL/));
  });

  it('filters by booked status', async () => {
    const user = userEvent.setup();
    api.get
      .mockResolvedValueOnce({
        appointments: [SANDRA, MARCUS],
        counts: { all: 2, booked: 1, done: 1, cancelled: 0 },
      })
      .mockResolvedValueOnce({
        appointments: [SANDRA],
        counts: { all: 2, booked: 1, done: 1, cancelled: 0 },
      });
    render(<MemoryRouter><Visits /></MemoryRouter>);
    expect(await screen.findByText('L-0008 - Sandra Cole')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /booked/i }));
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith(expect.stringContaining('status=booked'));
    });
  });

  it('filters by visit type', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><Visits /></MemoryRouter>);
    expect(await screen.findByText('L-0008 - Sandra Cole')).toBeInTheDocument();
    await pickSelectOption(user, /^visit type$/i, 'measure');
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith(expect.stringContaining('visit_type=measure'));
    });
  });
});
