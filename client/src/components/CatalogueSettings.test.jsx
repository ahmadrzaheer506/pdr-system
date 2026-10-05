import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CatalogueSettings from './CatalogueSettings.jsx';
import { api } from '../lib/api';

vi.mock('../lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn() },
  money: (n) => `£${Number(n || 0).toFixed(2)}`,
}));

const ROW = {
  id: 'felt_3layer',
  description: 'Supply & fit 3-layer torch-on felt system',
  unit: 'm²',
  unit_price: 42,
  vat_code: 'standard',
  kind: 'materials',
};

describe('CatalogueSettings (requirement 17.2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.get.mockResolvedValue({ items: [ROW] });
    api.post.mockResolvedValue({ item: ROW });
    api.put.mockResolvedValue({ item: ROW });
  });

  it('lets an admin search and add a catalogue item', async () => {
    const user = userEvent.setup({ delay: null });
    render(<CatalogueSettings canEdit />);
    expect(await screen.findByText(/3-layer torch-on felt/i)).toBeInTheDocument();
    await user.type(screen.getByLabelText(/^search$/i), 'felt');
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith(expect.stringContaining('/catalogue?q=felt'));
    });
    await user.click(screen.getByRole('button', { name: /add item/i }));
    await user.type(screen.getByLabelText(/^sku$/i), 'ridge_vent');
    await user.type(screen.getByLabelText(/^description$/i), 'Ridge vent');
    await user.clear(screen.getByLabelText(/unit price/i));
    await user.type(screen.getByLabelText(/unit price/i), '18');
    await user.click(screen.getByRole('button', { name: /save item/i }));
    expect(api.post).toHaveBeenCalledWith('/catalogue', expect.objectContaining({
      id: 'ridge_vent',
      description: 'Ridge vent',
    }));
  });

  it('hides add and edit from office users', async () => {
    render(<CatalogueSettings canEdit={false} />);
    expect(await screen.findByText(/3-layer torch-on felt/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add item/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /edit /i })).toBeNull();
  });

  it('filters by kind with the same menu as other Settings fields', async () => {
    const user = userEvent.setup();
    render(<CatalogueSettings canEdit />);
    expect(await screen.findByText(/3-layer torch-on felt/i)).toBeInTheDocument();
    await user.click(screen.getByLabelText(/^kind$/i));
    await user.click(screen.getByRole('option', { name: /^labour$/i }));
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/catalogue?kind=labour');
    });
  });

  it('lists Settings VAT rates in add and edit catalogue item', async () => {
    const user = userEvent.setup();
    api.get.mockImplementation(async (url) => {
      if (String(url).startsWith('/catalogue')) return { items: [ROW] };
      if (url === '/quotes/meta/options') {
        return {
          vat_rates: [
            { code: 'standard', rate: 20, short: '20%', label: 'Standard 20%' },
            { code: 'high', rate: 50, short: '50%', label: 'High 50%' },
          ],
        };
      }
      return {};
    });
    render(<CatalogueSettings canEdit />);
    expect(await screen.findByText(/3-layer torch-on felt/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/quotes/meta/options');
    });
    await user.click(screen.getByRole('button', { name: /add item/i }));
    await user.click(screen.getByLabelText(/^vat code$/i));
    expect(screen.getByRole('option', { name: /high 50%/i })).toBeInTheDocument();
    await user.click(screen.getByRole('option', { name: /high 50%/i }));
    await user.click(screen.getByRole('button', { name: /save item/i }));
    expect(api.post).toHaveBeenCalledWith('/catalogue', expect.objectContaining({
      vat_code: 'high',
    }));
  });
});
