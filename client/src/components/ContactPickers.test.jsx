import React, { useState } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import ContactPickers from './ContactPickers.jsx';
import { api } from '../lib/api';

vi.mock('../lib/api', () => ({
  api: { post: vi.fn() },
}));

function Harness({ customer, initial }) {
  const [value, setValue] = useState(initial);
  return (
    <MemoryRouter>
      <ContactPickers
        customer={customer}
        value={value}
        onChange={setValue}
        idPrefix="contact"
        emptyLabel="Select…"
      />
    </MemoryRouter>
  );
}

describe('ContactPickers add contact (requirement 2.2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows Site, Phone and Email dropdowns when the customer has none', () => {
    render(
      <Harness
        customer={{ id: 9, name: 'Dave Whitfield', sites: [], phones: [], emails: [] }}
        initial={{ site_id: '', phone_id: '', email_id: '' }}
      />,
    );
    expect(screen.getByLabelText(/^site$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^phone$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^email$/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add site/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add phone/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add email/i })).toBeInTheDocument();
    expect(screen.queryByLabelText(/^postcode$/i)).not.toBeInTheDocument();
  });

  it('adds a new site on a customer who already has one and selects it', async () => {
    const user = userEvent.setup();
    api.post.mockResolvedValue({ site: { id: 8, address: 'Unit 2, Mill Lane', is_primary: false } });
    render(
      <Harness
        customer={{
          id: 9,
          sites: [{ id: 1, address: '14 Elm Grove', postcode: 'RG1 5AB', is_primary: true }],
          phones: [{ id: 3, value: '07700 900100', type: 'mobile', is_primary: true }],
          emails: [{ id: 4, value: 'dave@example.com', type: 'personal', is_primary: true }],
        }}
        initial={{ site_id: 1, phone_id: 3, email_id: 4 }}
      />,
    );
    await user.click(screen.getByRole('button', { name: /add site/i }));
    await user.type(screen.getByLabelText(/new site address/i), 'Unit 2, Mill Lane');
    await user.click(screen.getByRole('button', { name: /save site/i }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/customers/9/sites', { address: 'Unit 2, Mill Lane' }));
    expect(screen.getByLabelText(/^site$/i)).toHaveAttribute('data-value', '8');
    expect(screen.getByLabelText(/^site$/i)).toHaveTextContent('Unit 2, Mill Lane');
  });

  it('gives new phone and email fields full width of their column', async () => {
    const user = userEvent.setup();
    render(
      <Harness
        customer={{
          id: 9,
          sites: [{ id: 1, address: '14 Elm Grove', is_primary: true }],
          phones: [{ id: 3, value: '07700 900100', type: 'mobile', is_primary: true }],
          emails: [],
        }}
        initial={{ site_id: 1, phone_id: 3, email_id: '' }}
      />,
    );
    await user.click(screen.getByRole('button', { name: /add phone/i }));
    await user.click(screen.getByRole('button', { name: /add email/i }));
    const phone = screen.getByLabelText(/new phone number/i);
    const email = screen.getByLabelText(/new email address/i);
    expect(phone).toHaveClass('input');
    expect(email).toHaveClass('input');
    expect(phone.parentElement).not.toHaveClass('grid-cols-2');
    expect(email.parentElement).not.toHaveClass('grid-cols-2');
    expect(screen.getByLabelText(/new phone type/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/new email type/i)).toBeInTheDocument();
  });
});
