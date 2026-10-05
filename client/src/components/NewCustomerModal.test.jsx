import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import NewCustomerModal from './NewCustomerModal.jsx';
import { api } from '../lib/api';

vi.mock('../lib/api', () => ({
  api: { post: vi.fn() },
}));

describe('NewCustomerModal duplicates (requirement 2.5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('blocks create on 409 and links to the existing customer', async () => {
    const user = userEvent.setup();
    const err = new Error('This phone number is already on Helen Ackroyd. Open that customer instead.');
    err.status = 409;
    err.data = { error: err.message, customer_id: 7, name: 'Helen Ackroyd' };
    api.post.mockRejectedValue(err);

    render(
      <MemoryRouter>
        <NewCustomerModal open onClose={() => {}} />
      </MemoryRouter>,
    );
    await user.type(screen.getByLabelText(/^name$/i), 'Someone New');
    await user.type(screen.getByLabelText(/^phone$/i), '07700 900100');
    expect(screen.queryByLabelText(/^postcode$/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /create customer/i }));

    expect(await screen.findByRole('link', { name: /open helen ackroyd/i })).toHaveAttribute('href', '/customers/7');
    expect(screen.getByRole('alert')).toHaveTextContent(/Helen Ackroyd/);
  });
});
