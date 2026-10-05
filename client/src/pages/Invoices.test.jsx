import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Invoices from './Invoices.jsx';
import { api } from '../lib/api';

vi.mock('../lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), download: vi.fn() },
  money: (n) => `£${n}`,
  fmtDate: () => '25 Sep',
}));

describe('Invoices ready queue (requirement 11.1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.get.mockImplementation(async (path) => {
      if (path.startsWith('/invoices/ready')) {
        return {
          jobs: [{
            id: 9,
            title: 'Moss removal & roof treatment',
            customer_id: 3,
            customer_name: 'Fiona Whitmore',
            value: 548,
            status: 'COMPLETED',
          }],
        };
      }
      if (path.startsWith('/invoices/summary')) {
        return { outstanding: 0, overdue: 0, overdue_count: 0, paid_count: 0 };
      }
      if (path.startsWith('/invoices')) {
        return { invoices: [] };
      }
      return {};
    });
    api.post.mockResolvedValue({ id: 55, ref: 'INV-2026-0001' });
  });

  it('lists completed jobs with no invoice and creates from the row', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Invoices />
      </MemoryRouter>,
    );
    expect(await screen.findByText('Moss removal & roof treatment')).toBeInTheDocument();
    expect(screen.getByText('Fiona Whitmore')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /create invoice for moss removal/i }));
    expect(api.post).toHaveBeenCalledWith('/invoices', { job_id: 9 });
    expect(await screen.findByText(/Invoice INV-2026-0001 created/i)).toBeInTheDocument();
  });
});

describe('Invoices VAT and CIS drawer (requirement 11.2)', () => {
  const invoice = {
    id: 12,
    ref: 'INV-2026-0010',
    customer_id: 3,
    lead_id: 14,
    customer_name: 'Fiona Whitmore',
    total: 657.6,
    due_now: 657.6,
    amount_paid: 0,
    due_date: '2026-10-09',
    status: 'draft',
    vat_treatment: 'standard',
    vat_amount: 109.6,
    cis_applies: false,
    cis_rate: 20,
    cis_deduction: 0,
    reverse_charge_notice: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    api.get.mockImplementation(async (path) => {
      if (path.startsWith('/invoices/ready')) return { jobs: [] };
      if (path.startsWith('/invoices/summary')) {
        return { outstanding: 657.6, overdue: 0, overdue_count: 0, paid_count: 5 };
      }
      if (path.startsWith('/invoices')) return { invoices: [invoice] };
      return {};
    });
  });

  it('shows due now on the list and opens VAT/CIS detail', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Invoices />
      </MemoryRouter>,
    );
    expect(await screen.findByRole('columnheader', { name: /due now/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'INV-2026-0010' }));
    expect(await screen.findByText('Standard')).toBeInTheDocument();
    expect(screen.getByText(/VAT amount/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save vat & cis/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /open lead/i })).toHaveAttribute('href', '/leads/3?from=invoices&lead=14');
  });
});

describe('Invoices PDF and email (requirement 11.3)', () => {
  const invoice = {
    id: 12,
    ref: 'INV-2026-0010',
    customer_id: 3,
    customer_name: 'Fiona Whitmore',
    total: 657.6,
    due_now: 657.6,
    amount_paid: 0,
    due_date: '2026-10-09',
    status: 'draft',
    vat_treatment: 'standard',
    vat_amount: 109.6,
    cis_applies: false,
    cis_rate: 20,
    cis_deduction: 0,
    reverse_charge_notice: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    api.get.mockImplementation(async (path) => {
      if (path.startsWith('/invoices/ready')) return { jobs: [] };
      if (path.startsWith('/invoices/summary')) {
        return { outstanding: 657.6, overdue: 0, overdue_count: 0, paid_count: 5 };
      }
      if (path.startsWith('/invoices')) return { invoices: [invoice] };
      return {};
    });
    api.post.mockImplementation(async (path) => {
      if (String(path).endsWith('/pdf')) return { pdf: 'inv.pdf' };
      if (String(path).endsWith('/send')) return { ok: true };
      return {};
    });
    api.download.mockResolvedValue();
  });

  it('downloads a PDF from the list without sending', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Invoices />
      </MemoryRouter>,
    );
    await user.click(await screen.findByRole('button', { name: /download pdf for inv-2026-0010/i }));
    expect(api.post).toHaveBeenCalledWith('/invoices/12/pdf');
    expect(api.download).toHaveBeenCalledWith('/files/inv.pdf?download=1', 'INV-2026-0010.pdf');
    expect(api.post).not.toHaveBeenCalledWith('/invoices/12/send');
  });

  it('sends email from the list while draft or sent', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Invoices />
      </MemoryRouter>,
    );
    await user.click(await screen.findByRole('button', { name: /^send$/i }));
    expect(api.post).toHaveBeenCalledWith('/invoices/12/send');
  });

  it('hides Send on paid invoices but still offers PDF', async () => {
    api.get.mockImplementation(async (path) => {
      if (path.startsWith('/invoices/ready')) return { jobs: [] };
      if (path.startsWith('/invoices/summary')) {
        return { outstanding: 0, overdue: 0, overdue_count: 0, paid_count: 1 };
      }
      if (path.startsWith('/invoices')) return { invoices: [{ ...invoice, status: 'paid' }] };
      return {};
    });
    render(
      <MemoryRouter>
        <Invoices />
      </MemoryRouter>,
    );
    expect(await screen.findByRole('button', { name: /download pdf for inv-2026-0010/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^send$/i })).toBeNull();
  });
});

describe('Invoices balances and payments (requirement 11.4)', () => {
  const invoice = {
    id: 12,
    ref: 'INV-2026-0010',
    customer_id: 3,
    customer_name: 'Fiona Whitmore',
    total: 657.6,
    due_now: 548,
    amount_paid: 0,
    outstanding: 548,
    due_date: '2026-10-09',
    status: 'sent',
    vat_treatment: 'standard',
    vat_amount: 109.6,
    cis_applies: true,
    cis_rate: 20,
    cis_deduction: 109.6,
    reverse_charge_notice: null,
    payments: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    api.get.mockImplementation(async (path) => {
      if (path.startsWith('/invoices/ready')) return { jobs: [] };
      if (path.startsWith('/invoices/summary')) {
        return { outstanding: 1200, overdue: 400, overdue_count: 2, paid_count: 5 };
      }
      if (path.startsWith('/invoices')) return { invoices: [invoice] };
      return {};
    });
    api.post.mockResolvedValue({
      ok: true,
      status: 'part_paid',
      invoice: { ...invoice, amount_paid: 200, outstanding: 348, status: 'part_paid' },
    });
  });

  it('shows outstanding, overdue and paid-in-full totals', async () => {
    render(
      <MemoryRouter>
        <Invoices />
      </MemoryRouter>,
    );
    expect(await screen.findByText('Outstanding')).toBeInTheDocument();
    expect(screen.getByText('£1200')).toBeInTheDocument();
    expect(screen.getByText('Overdue')).toBeInTheDocument();
    expect(screen.getByText('£400')).toBeInTheDocument();
    expect(screen.getByText('2 invoices')).toBeInTheDocument();
    expect(screen.getByText('Paid in full')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('records a payment from the list with date, amount and note', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Invoices />
      </MemoryRouter>,
    );
    await user.click(await screen.findByRole('button', { name: /record payment/i }));
    const dialog = await screen.findByRole('dialog');
    await user.clear(within(dialog).getByLabelText(/amount received/i));
    await user.type(within(dialog).getByLabelText(/amount received/i), '200');
    await user.type(within(dialog).getByLabelText(/note/i), 'BACS');
    await user.click(within(dialog).getByRole('button', { name: /^record payment$/i }));
    expect(api.post).toHaveBeenCalledWith('/invoices/12/payment', expect.objectContaining({
      amount: 200,
      note: 'BACS',
    }));
  });
});
