import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Reports from './Reports.jsx';

const auth = { user: { role: 'ADMIN', name: 'Paul' } };

vi.mock('../lib/auth.jsx', () => ({
  useAuth: () => auth,
}));

describe('Reports hub (requirements 14.1–14.3)', () => {
  it('links office reports plus Director profitability, without pipeline value', () => {
    auth.user = { role: 'ADMIN', name: 'Paul' };
    render(<MemoryRouter><Reports /></MemoryRouter>);
    expect(screen.getByRole('link', { name: /lead volume/i })).toHaveAttribute('href', '/reports/lead-volume');
    expect(screen.getByRole('link', { name: /win \/ loss/i })).toHaveAttribute('href', '/reports/win-loss');
    expect(screen.queryByRole('link', { name: /pipeline value/i })).toBeNull();
    expect(screen.getByRole('link', { name: /^customers/i })).toHaveAttribute('href', '/reports/customers');
    expect(screen.getByRole('link', { name: /^jobs/i })).toHaveAttribute('href', '/reports/jobs');
    expect(screen.getByRole('link', { name: /^invoices/i })).toHaveAttribute('href', '/reports/invoices');
    expect(screen.getByRole('link', { name: /job profitability/i })).toHaveAttribute('href', '/reports/profitability');
  });

  it('hides job profitability from office users', () => {
    auth.user = { role: 'OFFICE', name: 'Lisa' };
    render(<MemoryRouter><Reports /></MemoryRouter>);
    expect(screen.queryByRole('link', { name: /job profitability/i })).toBeNull();
    expect(screen.getByRole('link', { name: /lead volume/i })).toBeInTheDocument();
  });
});
