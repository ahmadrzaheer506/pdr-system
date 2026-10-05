import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Layout from './Layout.jsx';
import StaffLayout from './StaffLayout.jsx';

vi.mock('../lib/auth.jsx', () => ({
  useAuth: () => ({
    user: { name: 'Paul Douglas', role: 'ADMIN', color: '#ea580c' },
    logout: vi.fn(),
  }),
}));

vi.mock('../lib/api', () => ({
  api: {
    get: vi.fn(async (path) => {
      if (path === '/notifications/preferences') {
        return {
          kinds: [{ id: 'crew_added', title: 'Assigned to a job', in_app: true, email: true }],
          preferences: { in_app: { crew_added: false }, email: { crew_added: false } },
        };
      }
      return { notifications: [], unread: 0 };
    }),
    put: vi.fn(),
  },
}));

describe('office sidebar', () => {
  it('places Reports in Management after Tasks', () => {
    render(<MemoryRouter><Layout><div>child</div></Layout></MemoryRouter>);
    const reports = screen.getByRole('link', { name: 'Reports' });
    expect(reports).toHaveAttribute('href', '/reports');
    const labels = screen.getAllByRole('link').map((el) => el.textContent.trim());
    expect(labels.indexOf('Lead Inbox')).toBeLessThan(labels.indexOf('Reports'));
    expect(labels.indexOf('Tasks')).toBeLessThan(labels.indexOf('Reports'));
    expect(labels.indexOf('Reports')).toBeLessThan(labels.indexOf('Team Chat'));
  });

  it('includes a Customers tab for admin/office', () => {
    render(<MemoryRouter><Layout><div>child</div></Layout></MemoryRouter>);
    const link = screen.getByRole('link', { name: 'Customers' });
    expect(link).toHaveAttribute('href', '/customers');
    expect(screen.getByRole('link', { name: 'Pipeline' })).toBeInTheDocument();
  });

  it('renders section headers for navigation groups', () => {
    render(<MemoryRouter><Layout><div>child</div></Layout></MemoryRouter>);
    expect(screen.getByText('OVERVIEW')).toBeInTheDocument();
    expect(screen.getByText('MANAGEMENT')).toBeInTheDocument();
    expect(screen.getByText('SETTINGS')).toBeInTheDocument();
  });

  it('renders the persistent app header', () => {
    render(<MemoryRouter><Layout><div>child</div></Layout></MemoryRouter>);
    expect(screen.queryByRole('button', { name: 'Search' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Notifications' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Account menu' })).toBeInTheDocument();
    expect(screen.queryByText('Paul Douglas Roofing')).toBeNull();
    expect(screen.queryByText('Business CRM')).toBeNull();
  });
});

describe('staff sidebar', () => {
  it('includes a Visits tab for field staff', () => {
    render(<MemoryRouter><StaffLayout><div>child</div></StaffLayout></MemoryRouter>);
    const link = screen.getByRole('link', { name: 'Visits' });
    expect(link).toHaveAttribute('href', '/staff/visits');
  });

  it('includes a Tasks tab for field staff', () => {
    render(<MemoryRouter><StaffLayout><div>child</div></StaffLayout></MemoryRouter>);
    const link = screen.getByRole('link', { name: 'Tasks' });
    expect(link).toHaveAttribute('href', '/staff/tasks');
  });

  it('does not include a Customers tab', () => {
    render(<MemoryRouter><StaffLayout><div>child</div></StaffLayout></MemoryRouter>);
    expect(screen.queryByRole('link', { name: 'Customers' })).toBeNull();
  });

  it('links staff profile settings to /staff/profile', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><StaffLayout><div>child</div></StaffLayout></MemoryRouter>);
    await user.click(screen.getByRole('button', { name: /account menu/i }));
    expect(screen.getByRole('link', { name: /profile/i })).toHaveAttribute('href', '/staff/profile');
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
