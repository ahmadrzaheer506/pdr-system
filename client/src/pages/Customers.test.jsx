import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Customers from './Customers.jsx';
import { api } from '../lib/api';
import { pickSelectOption } from '../test/selectMenu.js';
import { pickDate } from '../test/datePicker.js';

vi.mock('../lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn() },
  money: (n) => `£${Number(n || 0).toFixed(2)}`,
  fmtTimeAgo: () => '1h ago',
}));

vi.mock('../components/NewCustomerModal.jsx', () => ({
  default: ({ open }) => (open ? <div>New customer modal</div> : null),
}));

const LIST = {
  customers: [
    {
      id: 9,
      name: 'Dave Whitfield',
      customer_type: 'domestic',
      company_name: null,
      phone: '07700 900100',
      email: 'dave@example.com',
      address: '1 Test Road',
      postcode: 'S1 1AA',
      stage: 'ENQUIRY',
      source: 'whatsapp',
      quoted_value: 1200,
      updated_at: '2026-09-22T10:00:00Z',
    },
    {
      id: 10,
      name: 'Jane Site',
      customer_type: 'commercial',
      company_name: 'Site Roofing Ltd',
      phone: '0118 123 4567',
      email: 'jane@site.co.uk',
      address: 'Unit 4',
      postcode: 'RG1 1AA',
      stage: 'QUOTED',
      source: 'facebook_lead',
      quoted_value: 0,
      updated_at: '2026-09-21T10:00:00Z',
    },
  ],
};

describe('Customers list', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.get.mockResolvedValue(LIST);
  });

  it('renders all customers with type, contact, and source, without a pipeline stage column', async () => {
    render(<MemoryRouter><Customers /></MemoryRouter>);
    expect(await screen.findByRole('link', { name: 'Dave Whitfield' })).toHaveAttribute('href', '/customers/9');
    expect(screen.getByRole('heading', { name: 'Customers' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Jane Site' })).toHaveAttribute('href', '/customers/10');
    expect(screen.getAllByText('Domestic').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Commercial').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Site Roofing Ltd')).toBeInTheDocument();
    expect(screen.getByText('07700 900100')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Source' })).toBeInTheDocument();
    expect(screen.getByText('WhatsApp')).toBeInTheDocument();
    expect(screen.getByText('Facebook Lead')).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Stage' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/filter by stage/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Enquiry')).not.toBeInTheDocument();
  });

  it('loads the list filtered by type and search', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><Customers /></MemoryRouter>);
    await user.click(await screen.findByRole('button', { name: 'Commercial' }));
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith(expect.stringContaining('customer_type=commercial'));
    });
    await user.type(screen.getByLabelText(/search customers/i), 'Dave');
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith(expect.stringMatching(/q=Dave/));
    });
  });

  it('sends source and created-date filters', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><Customers /></MemoryRouter>);
    await screen.findByRole('link', { name: 'Dave Whitfield' });
    expect(screen.queryByLabelText(/filter by postcode/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/filter by company name/i)).not.toBeInTheDocument();
    await pickSelectOption(user, /filter by source/i, 'whatsapp');
    await pickDate(user, /created from/i, '2026-09-01');
    await pickDate(user, /created to/i, '2026-09-22');
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith(expect.stringContaining('source=whatsapp'));
      expect(api.get).toHaveBeenCalledWith(expect.stringContaining('created_from=2026-09-01'));
      expect(api.get).toHaveBeenCalledWith(expect.stringContaining('created_to=2026-09-22'));
    });
    expect(api.get.mock.calls.every(([path]) => !String(path).includes('company_name='))).toBe(true);
    expect(api.get.mock.calls.every(([path]) => !String(path).includes('stage='))).toBe(true);
  });

  it('opens the new customer modal', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><Customers /></MemoryRouter>);
    await screen.findByRole('link', { name: 'Dave Whitfield' });
    await user.click(screen.getByRole('button', { name: /new customer/i }));
    expect(screen.getByText('New customer modal')).toBeInTheDocument();
  });
});
