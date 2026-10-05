import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from './App.jsx';

const auth = { user: null, loading: false };

vi.mock('./lib/auth.jsx', () => ({
  useAuth: () => auth,
}));

vi.mock('./components/ui.jsx', () => ({
  PageLoading: () => <div>Loading</div>,
}));

vi.mock('./components/Layout.jsx', () => ({
  default: ({ children }) => <div data-testid="office-shell">{children}</div>,
}));

vi.mock('./components/StaffLayout.jsx', () => ({
  default: ({ children }) => <div data-testid="staff-shell">{children}</div>,
}));

vi.mock('./pages/Login.jsx', () => ({ default: () => <div>Login page</div> }));
vi.mock('./pages/ForgotPassword.jsx', () => ({ default: () => <div>Forgot password page</div> }));
vi.mock('./pages/ResetPassword.jsx', () => ({ default: () => <div>Reset password page</div> }));
vi.mock('./pages/Dashboard.jsx', () => ({ default: () => <div>Dashboard page</div> }));
vi.mock('./pages/Reports.jsx', () => ({ default: () => <div>Reports page</div> }));
vi.mock('./pages/ReportDetail.jsx', () => ({ default: () => <div>Report detail page</div> }));
vi.mock('./pages/Inbox.jsx', () => ({ default: () => <div>Inbox page</div> }));
vi.mock('./pages/Pipeline.jsx', () => ({ default: () => <div>Pipeline page</div> }));
vi.mock('./pages/Customers.jsx', () => ({ default: () => <div>Customers page</div> }));
vi.mock('./pages/CustomerDetail.jsx', () => ({ default: () => <div>Lead workspace page</div> }));
vi.mock('./pages/CustomerRecord.jsx', () => ({ default: () => <div>Customer record page</div> }));
vi.mock('./pages/Quotes.jsx', () => ({ default: () => <div>Quotes page</div> }));
vi.mock('./pages/Schedule.jsx', () => ({ default: () => <div>Schedule page</div> }));
vi.mock('./pages/Invoices.jsx', () => ({ default: () => <div>Invoices page</div> }));
vi.mock('./pages/Holidays.jsx', () => ({ default: () => <div>Office holidays page</div> }));
vi.mock('./pages/Tasks.jsx', () => ({ default: () => <div>Tasks page</div> }));
vi.mock('./pages/Timesheets.jsx', () => ({ default: () => <div>Timesheets page</div> }));
vi.mock('./pages/TeamChat.jsx', () => ({ default: () => <div>Office chat page</div> }));
vi.mock('./pages/Settings.jsx', () => ({ default: () => <div>Settings page</div> }));
vi.mock('./pages/Profile.jsx', () => ({ default: () => <div>Profile page</div> }));
vi.mock('./pages/staff/StaffJobs.jsx', () => ({ default: () => <div>Staff jobs page</div> }));
vi.mock('./pages/staff/StaffJobDetail.jsx', () => ({ default: () => <div>Staff job detail</div> }));
vi.mock('./pages/staff/StaffHolidays.jsx', () => ({ default: () => <div>Staff holidays page</div> }));
vi.mock('./pages/staff/StaffHours.jsx', () => ({ default: () => <div>Staff hours page</div> }));
vi.mock('./pages/staff/StaffChat.jsx', () => ({ default: () => <div>Staff chat page</div> }));
vi.mock('./pages/staff/StaffTasks.jsx', () => ({ default: () => <div>Staff tasks page</div> }));
vi.mock('./pages/staff/StaffVisits.jsx', () => ({ default: () => <div>Staff visits page</div> }));
vi.mock('./pages/staff/StaffVisitDetail.jsx', () => ({ default: () => <div>Staff visit detail</div> }));

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>
  );
}

describe('App route enforcement (requirement 1.5)', () => {
  beforeEach(() => {
    auth.user = null;
    auth.loading = false;
  });

  it('sends operatives on office URLs to /staff', () => {
    auth.user = { role: 'STAFF', name: 'Jamie' };
    renderAt('/quotes');
    expect(screen.getByTestId('staff-shell')).toBeInTheDocument();
    expect(screen.getByText('Staff jobs page')).toBeInTheDocument();
    expect(screen.queryByTestId('office-shell')).toBeNull();
  });

  it('keeps operatives on staff routes', () => {
    auth.user = { role: 'STAFF', name: 'Jamie' };
    renderAt('/staff/hours');
    expect(screen.getByTestId('staff-shell')).toBeInTheDocument();
    expect(screen.getByText('Staff hours page')).toBeInTheDocument();
  });

  it('sends ADMIN away from /staff to the office app', () => {
    auth.user = { role: 'ADMIN', name: 'Paul' };
    renderAt('/staff');
    expect(screen.getByTestId('office-shell')).toBeInTheDocument();
    expect(screen.getByText('Dashboard page')).toBeInTheDocument();
    expect(screen.queryByTestId('staff-shell')).toBeNull();
  });

  it('lets OFFICE open reports', () => {
    auth.user = { role: 'OFFICE', name: 'Lisa' };
    renderAt('/reports');
    expect(screen.getByTestId('office-shell')).toBeInTheDocument();
    expect(screen.getByText('Reports page')).toBeInTheDocument();
  });

  it('lets OFFICE use the office app', () => {
    auth.user = { role: 'OFFICE', name: 'Lisa' };
    renderAt('/invoices');
    expect(screen.getByTestId('office-shell')).toBeInTheDocument();
    expect(screen.getByText('Invoices page')).toBeInTheDocument();
  });

  it('lets ADMIN and OFFICE open the customers list', () => {
    auth.user = { role: 'ADMIN', name: 'Paul' };
    renderAt('/customers');
    expect(screen.getByTestId('office-shell')).toBeInTheDocument();
    expect(screen.getByText('Customers page')).toBeInTheDocument();
  });

  it('opens the customer master record and the lead workspace on separate routes', () => {
    auth.user = { role: 'ADMIN', name: 'Paul' };
    const first = renderAt('/customers/37');
    expect(screen.getByText('Customer record page')).toBeInTheDocument();
    first.unmount();
    renderAt('/leads/44');
    expect(screen.getByText('Lead workspace page')).toBeInTheDocument();
  });

  it('sends operatives away from the lead inbox', () => {
    auth.user = { role: 'STAFF', name: 'Jamie' };
    renderAt('/inbox');
    expect(screen.getByTestId('staff-shell')).toBeInTheDocument();
    expect(screen.queryByText('Inbox page')).toBeNull();
  });

  it('lets ADMIN open the profile page', () => {
    auth.user = { role: 'ADMIN', name: 'Paul' };
    renderAt('/profile');
    expect(screen.getByTestId('office-shell')).toBeInTheDocument();
    expect(screen.getByText('Profile page')).toBeInTheDocument();
  });

  it('lets operatives open staff visits', () => {
    auth.user = { role: 'STAFF', name: 'Jamie' };
    renderAt('/staff/visits');
    expect(screen.getByTestId('staff-shell')).toBeInTheDocument();
    expect(screen.getByText('Staff visits page')).toBeInTheDocument();
  });

  it('lets operatives open staff tasks', () => {
    auth.user = { role: 'STAFF', name: 'Jamie' };
    renderAt('/staff/tasks');
    expect(screen.getByTestId('staff-shell')).toBeInTheDocument();
    expect(screen.getByText('Staff tasks page')).toBeInTheDocument();
  });

  it('lets operatives open the staff profile page', () => {
    auth.user = { role: 'STAFF', name: 'Jamie' };
    renderAt('/staff/profile');
    expect(screen.getByTestId('staff-shell')).toBeInTheDocument();
    expect(screen.getByText('Profile page')).toBeInTheDocument();
  });

  it('exposes public forgot and reset password routes', () => {
    renderAt('/forgot-password');
    expect(screen.getByText('Forgot password page')).toBeInTheDocument();
    renderAt('/reset-password');
    expect(screen.getByText('Reset password page')).toBeInTheDocument();
  });
});
