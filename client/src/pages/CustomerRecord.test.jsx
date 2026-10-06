import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import CustomerRecord from './CustomerRecord.jsx';
import { api } from '../lib/api';
import { pickSelectOption } from '../test/selectMenu.js';

vi.mock('../lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn() },
  fmtTimeAgo: () => '2h ago',
}));

const DETAIL = {
  customer: {
    id: 37,
    name: 'Helen Ackroyd',
    notes: 'Prefers mornings',
    stage: 'WON',
    customer_type: 'domestic',
    company_name: null,
    vat_number: null,
    owner_id: 1,
    owner_name: 'Paul Douglas',
    phones: [{ id: 1, value: '07700 900100', type: 'mobile', is_primary: true }],
    emails: [{ id: 2, value: 'helen@example.com', type: 'personal', is_primary: true }],
    sites: [{ id: 3, address: '2 Priory Court', postcode: 'RG1 1AA', is_primary: true }],
  },
  leads: [
    {
      id: 11, ref: 'L-0011', source: 'whatsapp', status: 'CONVERTED', message: 'Leak in the porch',
      next_action: null, created_at: '2026-09-01T09:00:00Z',
    },
    {
      id: 22, ref: 'L-0022', source: 'phone', status: 'NEW', message: 'Called about a garage roof',
      next_action: 'Review & respond', created_at: '2026-09-20T10:00:00Z',
    },
  ],
};

function renderRecord(path = '/customers/37') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/customers/:id" element={<CustomerRecord />} />
        <Route path="/leads/:id" element={<div>Lead workspace</div>} />
        <Route path="/customers" element={<div>Customers list</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('Customer master record', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.get.mockImplementation((path) => {
      if (String(path).includes('/settings/users')) {
        return Promise.resolve({
          users: [
            { id: 1, name: 'Paul Douglas', role: 'ADMIN', active: true },
            { id: 2, name: 'Lisa Grant', role: 'OFFICE', active: true },
          ],
        });
      }
      return Promise.resolve(DETAIL);
    });
    api.put.mockResolvedValue({ ok: true });
  });

  it('shows the customer form, contacts, and every lead', async () => {
    renderRecord();
    expect(await screen.findByRole('heading', { name: 'Helen Ackroyd' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Customer details' })).toBeInTheDocument();
    expect(screen.getByLabelText(/^name$/i)).toHaveValue('Helen Ackroyd');
    expect(screen.getByRole('button', { name: /^update$/i })).toBeDisabled();
    expect(screen.getByText('Sites, phones & emails')).toBeInTheDocument();
    expect(screen.getAllByText('2 Priory Court, RG1 1AA').length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { name: 'Leads' })).toBeInTheDocument();
    expect(screen.getByText('2 leads')).toBeInTheDocument();
    expect(screen.getByText('Leak in the porch')).toBeInTheDocument();
    expect(screen.getByText('Called about a garage roof')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'L-0011 - Helen Ackroyd' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'L-0022 - Helen Ackroyd' })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /^open$/i })[0]).toHaveAttribute('href', '/leads/37?from=customer&lead=11');
  });

  it('saves identity fields with Update', async () => {
    const user = userEvent.setup({ delay: null });
    renderRecord();
    const name = await screen.findByLabelText(/^name$/i);
    await user.clear(name);
    await user.type(name, 'Helen A');
    await user.click(screen.getByRole('button', { name: /^update$/i }));
    expect(api.put).toHaveBeenCalledWith('/customers/37', expect.objectContaining({
      name: 'Helen A',
      customer_type: 'domestic',
    }));
  });

  it('switches a domestic customer to commercial with a company name', async () => {
    const user = userEvent.setup({ delay: null });
    renderRecord();
    expect(await screen.findByLabelText(/^customer type$/i)).toHaveAttribute('data-value', 'domestic');
    await pickSelectOption(user, /^customer type$/i, 'commercial');
    await user.type(screen.getByLabelText(/company name/i), 'Whitfield Roofing');
    await user.click(screen.getByRole('button', { name: /^update$/i }));
    expect(api.put).toHaveBeenCalledWith('/customers/37', expect.objectContaining({
      customer_type: 'commercial',
      company_name: 'Whitfield Roofing',
      vat_number: null,
    }));
  });

  it('lets office reassign the owner (requirement 4.4)', async () => {
    const user = userEvent.setup({ delay: null });
    renderRecord();
    expect(await screen.findByLabelText(/^owner$/i)).toHaveAttribute('data-value', '1');
    await pickSelectOption(user, /^owner$/i, '2');
    await user.click(screen.getByRole('button', { name: /^update$/i }));
    expect(api.put).toHaveBeenCalledWith('/customers/37', expect.objectContaining({ owner_id: 2 }));
  });

  it('redirects legacy inbox query strings onto the lead workspace', async () => {
    renderRecord('/customers/37?from=inbox');
    expect(await screen.findByText('Lead workspace')).toBeInTheDocument();
  });

  it('shows an empty leads state when the customer has none', async () => {
    api.get.mockImplementation((path) => {
      if (String(path).includes('/settings/users')) {
        return Promise.resolve({ users: [] });
      }
      return Promise.resolve({ ...DETAIL, leads: [] });
    });
    renderRecord();
    expect(await screen.findByText(/no leads yet/i)).toBeInTheDocument();
  });
});
