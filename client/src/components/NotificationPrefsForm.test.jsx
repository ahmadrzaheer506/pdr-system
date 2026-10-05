import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NotificationPrefsForm from './NotificationPrefsForm.jsx';
import { api } from '../lib/api';

vi.mock('../lib/api', () => ({
  api: { get: vi.fn(), put: vi.fn() },
}));

const OFFICE_PAYLOAD = {
  kinds: [
    { id: 'new_enquiry', title: 'New enquiry', in_app: true, email: false },
    { id: 'crew_added', title: 'Assigned to a job', in_app: true, email: false },
  ],
  preferences: {
    in_app: { new_enquiry: false, crew_added: false },
    email: {},
  },
};

const STAFF_PAYLOAD = {
  kinds: [
    { id: 'crew_added', title: 'Assigned to a job', in_app: true, email: true },
    { id: 'visit_booked', title: 'Site visit booked', in_app: true, email: false },
    { id: 'task_reminder', title: 'Task reminder', in_app: true, email: false },
  ],
  preferences: {
    in_app: { crew_added: false, visit_booked: false, task_reminder: false },
    email: { crew_added: false, crew_removed: false },
  },
};

describe('NotificationPrefsForm (requirement 13.2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('office list is off by default and has no email switch', async () => {
    api.get.mockResolvedValue(OFFICE_PAYLOAD);
    render(<NotificationPrefsForm />);
    const enquiry = await screen.findByRole('checkbox', { name: /new enquiry in-app/i });
    expect(enquiry).not.toBeChecked();
    expect(screen.queryByRole('checkbox', { name: /email/i })).toBeNull();
  });

  it('puts the title with the switches on one compact row', async () => {
    api.get.mockResolvedValue(STAFF_PAYLOAD);
    render(<NotificationPrefsForm />);
    const emailBox = await screen.findByRole('checkbox', { name: /assigned to a job email/i });
    const row = emailBox.closest('li');
    expect(row).toHaveTextContent('Assigned to a job');
    expect(row).toHaveTextContent('When you are put on a job.');
    expect(screen.getByRole('checkbox', { name: /assigned to a job in-app/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save preferences/i })).toBeInTheDocument();
  });

  it('staff can opt into crew email independently of in-app', async () => {
    api.get.mockResolvedValue(STAFF_PAYLOAD);
    api.put.mockResolvedValue({
      ...STAFF_PAYLOAD,
      preferences: {
        in_app: { crew_added: false, task_reminder: false },
        email: { crew_added: true, crew_removed: false },
      },
    });
    const user = userEvent.setup();
    render(<NotificationPrefsForm />);
    const emailBox = await screen.findByRole('checkbox', { name: /assigned to a job email/i });
    expect(emailBox).not.toBeChecked();
    await user.click(emailBox);
    await user.click(screen.getByRole('button', { name: /save preferences/i }));
    expect(api.put).toHaveBeenCalledWith('/notifications/preferences', expect.objectContaining({
      email: expect.objectContaining({ crew_added: true }),
      in_app: expect.objectContaining({ crew_added: false }),
    }));
    expect(await screen.findByText('Notification preferences saved')).toBeInTheDocument();
  });

  it('lets field staff opt into visit assignment alerts', async () => {
    api.get.mockResolvedValue(STAFF_PAYLOAD);
    render(<NotificationPrefsForm />);
    const visit = await screen.findByRole('checkbox', { name: /site visit booked in-app/i });
    expect(visit).not.toBeChecked();
    expect(screen.getByText(/when a site visit is booked, or when you are assigned to one/i)).toBeInTheDocument();
  });
});
