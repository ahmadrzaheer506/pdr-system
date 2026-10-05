import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ReportDetail from './ReportDetail.jsx';
import { api } from '../lib/api';
import { isoRange } from '../lib/reports.js';
import { pickDate } from '../test/datePicker.js';

vi.mock('../lib/api', () => ({
  api: { get: vi.fn(), download: vi.fn() },
  money: (n) => `£${Number(n || 0).toFixed(2)}`,
  fmtDate: (d) => d || '',
}));

const auth = { user: { role: 'ADMIN', name: 'Paul' } };

vi.mock('../lib/auth.jsx', () => ({
  useAuth: () => auth,
}));

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }) => <div>{children}</div>,
  AreaChart: () => null,
  Area: () => null,
  BarChart: () => null,
  Bar: () => null,
  PieChart: () => null,
  Pie: () => null,
  Cell: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  CartesianGrid: () => null,
}));

function renderType(type) {
  return render(
    <MemoryRouter initialEntries={[`/reports/${type}`]}>
      <Routes>
        <Route path="/reports/:type" element={<ReportDetail />} />
        <Route path="/reports" element={<div>Reports hub</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ReportDetail (requirements 14.1 / 14.2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.download.mockResolvedValue();
    auth.user = { role: 'ADMIN', name: 'Paul' };
  });

  it('loads win/loss with customer stages, not quote status', async () => {
    api.get.mockResolvedValue({
      won: 1,
      lost: 1,
      winRate: 50,
      byReason: [{ reason: 'No response', count: 1 }],
      customers: [
        { id: 7, name: 'Helen Ackroyd', stage: 'WON', lost_reason: null, updated_at: '2026-09-20' },
        { id: 8, name: 'Dave Whitfield', stage: 'LOST', lost_reason: 'No response', updated_at: '2026-09-21' },
      ],
    });
    renderType('win-loss');
    expect(await screen.findByText('Helen Ackroyd')).toBeInTheDocument();
    expect(screen.getByText('Dave Whitfield')).toBeInTheDocument();
    expect(screen.getAllByText('No response').length).toBeGreaterThan(0);
    expect(api.get).toHaveBeenCalledWith(expect.stringMatching(/^\/reports\/win-loss\?from=/));
  });

  it('loads pipeline value without a date query and exports the live CSV', async () => {
    api.get.mockResolvedValue({
      pipelineValue: 900,
      pipelineCount: 2,
      byStage: [{ stage: 'ENQUIRY', label: 'Enquiry', value: 900 }],
    });
    const user = userEvent.setup();
    renderType('pipeline-value');
    expect(await screen.findByText(/not filtered by 7\/30\/90/i)).toBeInTheDocument();
    expect(screen.queryByLabelText('From')).toBeNull();
    expect(api.get).toHaveBeenCalledWith('/reports/pipeline-value');
    await user.click(screen.getByRole('button', { name: /download csv/i }));
    expect(api.download).toHaveBeenCalledWith('/reports/pipeline-value.csv', 'pipeline-value-live.csv');
  });

  it('opens customers on 30d with dates filled and the list loaded', async () => {
    api.get.mockResolvedValue({
      customers: [{
        id: 7, name: 'Helen Ackroyd', customer_type: 'domestic', stage: 'ENQUIRY',
        source: 'phone', lost_reason: null, created_at: '2026-09-10',
      }],
    });
    const user = userEvent.setup();
    const range = isoRange(30);
    renderType('customers');
    expect(await screen.findByText('Helen Ackroyd')).toBeInTheDocument();
    expect(screen.getByLabelText('From')).toHaveAttribute('data-value', range.from);
    expect(screen.getByLabelText('To')).toHaveAttribute('data-value', range.to);
    expect(screen.getByRole('button', { name: '30d' })).toHaveAttribute('aria-pressed', 'true');
    expect(api.get).toHaveBeenCalledWith(`/reports/customers?from=${range.from}&to=${range.to}`);

    await pickDate(user, 'From', '2026-09-01');
    await pickDate(user, 'To', '2026-09-28');
    await user.click(screen.getByRole('button', { name: /^generate$/i }));
    expect(api.get).toHaveBeenCalledWith('/reports/customers?from=2026-09-01&to=2026-09-28');

    await user.click(screen.getByRole('button', { name: /download csv/i }));
    expect(api.download).toHaveBeenCalledWith(
      '/reports/customers.csv?from=2026-09-01&to=2026-09-28',
      'customers-2026-09-01-to-2026-09-28.csv',
    );
  });

  it('lists inbox leads instead of a graph, with 30d dates filled', async () => {
    const range = isoRange(30);
    api.get.mockResolvedValue({
      total: 1,
      bySource: [{ source: 'phone', count: 1 }],
      trend: [],
      leads: [{
        id: 4,
        customer_id: 7,
        customer_name: 'Helen Ackroyd',
        source: 'phone',
        message: 'Need a quote',
        status: 'NEW',
        created_at: '2026-09-21',
      }],
    });
    const user = userEvent.setup();
    renderType('lead-volume');
    expect(await screen.findByText('Helen Ackroyd')).toBeInTheDocument();
    expect(screen.getByText('Need a quote')).toBeInTheDocument();
    expect(screen.queryByText('Leads over time')).toBeNull();
    expect(screen.getByLabelText('From')).toHaveAttribute('data-value', range.from);
    expect(screen.getByLabelText('To')).toHaveAttribute('data-value', range.to);
    expect(screen.getByRole('button', { name: '30d' })).toHaveAttribute('aria-pressed', 'true');
    api.get.mockClear();
    await pickDate(user, 'From', '2026-01-01');
    await pickDate(user, 'To', '2026-01-31');
    expect(await screen.findByText(/new inbox lead/i)).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/reports/lead-volume?from=2026-01-01&to=2026-01-31');
  });

  it('hides invoice total and amount due when include_totals is false', async () => {
    api.get.mockResolvedValue({
      include_totals: false,
      invoices: [{
        id: 9, ref: 'INV-2026-0010', status: 'sent', customer_id: 7,
        customer_name: 'Helen Ackroyd', created_at: '2026-09-12',
      }],
    });
    const user = userEvent.setup();
    const range = isoRange(30);
    renderType('invoices');
    await screen.findByLabelText('From');
    expect(screen.getByLabelText('From')).toHaveAttribute('data-value', range.from);
    await pickDate(user, 'From', '2026-09-01');
    await pickDate(user, 'To', '2026-09-28');
    await user.click(screen.getByRole('button', { name: /^generate$/i }));
    expect(await screen.findByText('INV-2026-0010')).toBeInTheDocument();
    expect(screen.queryByText('Total')).toBeNull();
    expect(screen.queryByText('Amount due')).toBeNull();
    expect(screen.queryByText(/£/)).toBeNull();
  });

  it('generates Director profitability with jobs and labour, then exports both CSVs', async () => {
    api.get.mockResolvedValue({
      jobs: [{
        id: 3, title: 'Rear slope', customer_id: 7, customer_name: 'Helen Ackroyd',
        net_value: 1000, actual_hours: 8, actual_labour_cost: 196, gross_profit: 804,
        margin_percent: 80.4, underquoted: false,
      }],
      labour: [{ user_id: 4, name: 'Jamie Fisher', hours: 8, labour_cost: 196 }],
    });
    const user = userEvent.setup();
    const range = isoRange(30);
    renderType('profitability');
    expect(await screen.findByText('Rear slope')).toBeInTheDocument();
    expect(screen.getByLabelText('From')).toHaveAttribute('data-value', range.from);
    expect(screen.getByLabelText('To')).toHaveAttribute('data-value', range.to);
    expect(screen.getByRole('button', { name: '30d' })).toHaveAttribute('aria-pressed', 'true');
    expect(api.get).toHaveBeenCalledWith(`/reports/profitability?from=${range.from}&to=${range.to}`);
    expect(screen.getByText('Jamie Fisher')).toBeInTheDocument();
    expect(screen.getByText('Labour by operative')).toBeInTheDocument();

    await pickDate(user, 'From', '2026-09-01');
    await pickDate(user, 'To', '2026-09-28');
    await user.click(screen.getByRole('button', { name: /^generate$/i }));
    expect(api.get).toHaveBeenCalledWith('/reports/profitability?from=2026-09-01&to=2026-09-28');

    await user.click(screen.getByRole('button', { name: /download jobs csv/i }));
    expect(api.download).toHaveBeenCalledWith(
      '/reports/profitability.csv?from=2026-09-01&to=2026-09-28',
      'profitability-2026-09-01-to-2026-09-28.csv',
    );
    await user.click(screen.getByRole('button', { name: /download labour csv/i }));
    expect(api.download).toHaveBeenCalledWith(
      '/reports/profitability-labour.csv?from=2026-09-01&to=2026-09-28',
      'profitability-labour-2026-09-01-to-2026-09-28.csv',
    );
  });

  it('sends office users away from the Director report', () => {
    auth.user = { role: 'OFFICE', name: 'Lisa' };
    renderType('profitability');
    expect(screen.getByText('Reports hub')).toBeInTheDocument();
    expect(api.get).not.toHaveBeenCalled();
  });
});
