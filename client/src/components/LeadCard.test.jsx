import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import LeadCard from './LeadCard.jsx';

vi.mock('../lib/api', () => ({
  fmtTimeAgo: () => '1h ago',
}));

const lead = {
  id: 1,
  customer_id: 9,
  customer_name: 'Dave Whitfield',
  source: 'whatsapp',
  status: 'NEW',
  message: 'Leak in the bedroom',
  phone: '07700 900100',
  next_action: 'Review & respond',
  created_at: '2026-09-22T10:00:00Z',
};

function renderCard(props = {}) {
  return render(
    <MemoryRouter>
      <LeadCard lead={lead} onBookVisit={vi.fn()} onMarkActioned={vi.fn()} {...props} />
    </MemoryRouter>,
  );
}

describe('LeadCard', () => {
  it('shows the enquiry like a task row with source, time and contact chips', () => {
    renderCard();
    expect(screen.getByRole('link', { name: 'Dave Whitfield' })).toHaveAttribute('href', '/leads/9?from=inbox&lead=1');
    expect(screen.getByText('WhatsApp')).toBeInTheDocument();
    expect(screen.getByText('1h ago')).toBeInTheDocument();
    expect(screen.getByText('07700 900100')).toBeInTheDocument();
    expect(screen.getByText('Next: Review & respond')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /open/i })).toHaveAttribute('href', '/leads/9?from=inbox&lead=1');
  });

  it('lets office book a visit and mark the lead actioned', async () => {
    const user = userEvent.setup();
    const onBookVisit = vi.fn();
    const onMarkActioned = vi.fn();
    renderCard({ onBookVisit, onMarkActioned });
    await user.click(screen.getByRole('button', { name: /book visit/i }));
    expect(onBookVisit).toHaveBeenCalledWith(lead);
    await user.click(screen.getByRole('button', { name: /mark actioned/i }));
    expect(onMarkActioned).toHaveBeenCalledWith(lead);
  });

  it('shows Won and Lost instead of Converted and Closed', () => {
    const won = render(
      <MemoryRouter>
        <LeadCard lead={{ ...lead, status: 'CONVERTED', stage: 'WON' }} />
      </MemoryRouter>,
    );
    expect(screen.getByText('Won')).toBeInTheDocument();
    expect(screen.queryByText('Converted')).toBeNull();
    won.unmount();
    render(
      <MemoryRouter>
        <LeadCard lead={{ ...lead, customer_name: 'Neil Draper', status: 'CLOSED', stage: 'LOST' }} />
      </MemoryRouter>,
    );
    expect(screen.getByText('Lost')).toBeInTheDocument();
    expect(screen.queryByText('Closed')).toBeNull();
  });
});
