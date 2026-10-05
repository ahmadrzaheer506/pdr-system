import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import CustomerContacts from './CustomerContacts.jsx';
import { api } from '../lib/api';
import { pickSelectOption } from '../test/selectMenu.js';

vi.mock('../lib/api', () => ({
  api: { post: vi.fn(), put: vi.fn(), del: vi.fn() },
}));

const customer = {
  id: 9,
  sites: [
    { id: 1, address: '14 Elm Grove', postcode: 'RG1 5AB', is_primary: true },
    { id: 2, address: 'Garage roof, 14 Elm Grove', postcode: 'RG1 5AB', is_primary: false },
  ],
  phones: [
    { id: 3, value: '07700 900100', type: 'mobile', is_primary: true },
    { id: 4, value: '0118 123 4567', type: 'landline', is_primary: false },
  ],
  emails: [
    { id: 5, value: 'dave@example.com', type: 'personal', is_primary: true },
  ],
};

describe('CustomerContacts (requirement 2.2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.post.mockResolvedValue({ ok: true });
    api.put.mockResolvedValue({ ok: true });
    api.del.mockResolvedValue({ ok: true });
  });

  it('lists sites, phones, and emails with types and primary flags', () => {
    render(<MemoryRouter><CustomerContacts customer={customer} onChanged={() => {}} onError={() => {}} /></MemoryRouter>);
    expect(screen.getByText('14 Elm Grove, RG1 5AB')).toBeInTheDocument();
    expect(screen.getByText('Landline')).toBeInTheDocument();
    expect(screen.getByText('dave@example.com')).toBeInTheDocument();
    expect(screen.getAllByText('Primary').length).toBeGreaterThanOrEqual(3);
  });

  it('adds a site address without a postcode field', async () => {
    const user = userEvent.setup();
    const onChanged = vi.fn();
    render(<MemoryRouter><CustomerContacts customer={customer} onChanged={onChanged} onError={() => {}} /></MemoryRouter>);
    await user.click(screen.getAllByRole('button', { name: /^add$/i })[0]);
    expect(screen.getByLabelText(/new site address/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/postcode/i)).not.toBeInTheDocument();
    await user.type(screen.getByLabelText(/new site address/i), 'Unit 2, Mill Lane');
    await user.click(screen.getByRole('button', { name: /save site/i }));
    expect(api.post).toHaveBeenCalledWith('/customers/9/sites', { address: 'Unit 2, Mill Lane' });
    expect(onChanged).toHaveBeenCalled();
  });

  it('adds a work phone and can promote a site to primary', async () => {
    const user = userEvent.setup();
    const onChanged = vi.fn();
    render(<MemoryRouter><CustomerContacts customer={customer} onChanged={onChanged} onError={() => {}} /></MemoryRouter>);
    const addButtons = screen.getAllByRole('button', { name: /^add$/i });
    await user.click(addButtons[1]);
    await user.type(screen.getByLabelText(/new phone number/i), '01344 556677');
    await pickSelectOption(user, /new phone type/i, 'work');
    await user.click(screen.getByRole('button', { name: /save phone/i }));
    expect(api.post).toHaveBeenCalledWith('/customers/9/phones', { value: '01344 556677', type: 'work' });
    expect(onChanged).toHaveBeenCalled();

    await user.click(screen.getAllByTitle('Set as primary')[0]);
    expect(api.put).toHaveBeenCalledWith('/customers/9/sites/2', { is_primary: true });
  });

  it('surfaces API errors when a used site cannot be deleted', async () => {
    const user = userEvent.setup();
    const onError = vi.fn();
    api.del.mockRejectedValueOnce(new Error('This record is used on a quote, job, or site visit and cannot be deleted'));
    render(<MemoryRouter><CustomerContacts customer={customer} onChanged={() => {}} onError={onError} /></MemoryRouter>);
    await user.click(screen.getAllByTitle('Remove')[0]);
    expect(onError).toHaveBeenCalledWith('This record is used on a quote, job, or site visit and cannot be deleted');
  });

  it('on 409 shows a link to the customer that already has the phone', async () => {
    const user = userEvent.setup();
    const err = new Error('This phone number is already on Helen Ackroyd. Open that customer instead.');
    err.status = 409;
    err.data = { error: err.message, customer_id: 7, name: 'Helen Ackroyd' };
    api.post.mockRejectedValueOnce(err);
    render(<MemoryRouter><CustomerContacts customer={customer} onChanged={() => {}} onError={() => {}} /></MemoryRouter>);
    await user.click(screen.getAllByRole('button', { name: /^add$/i })[1]);
    await user.type(screen.getByLabelText(/new phone number/i), '07700 900100');
    await user.click(screen.getByRole('button', { name: /save phone/i }));
    expect(await screen.findByRole('link', { name: /open helen ackroyd/i })).toHaveAttribute('href', '/customers/7');
  });
});
