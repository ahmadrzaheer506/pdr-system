import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CatalogueItemInput from './CatalogueItemInput.jsx';
import { useState } from 'react';
import { api } from '../lib/api';

vi.mock('../lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn() },
}));

const CATALOGUE = [
  { id: 'felt_3layer', description: 'Supply & fit 3-layer torch-on felt system', unit: 'm²', unit_price: 42 },
  { id: 'ridge', description: 'Dry-fix ridge and hip', unit: 'lin m', unit_price: 38 },
];

function Harness({ onPick = () => {} }) {
  const [value, setValue] = useState('');
  return (
    <CatalogueItemInput
      label="Item 1"
      value={value}
      onChange={setValue}
      onPick={(row) => {
        setValue(row.description);
        onPick(row);
      }}
      catalogue={CATALOGUE}
    />
  );
}

describe('CatalogueItemInput', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fills from a catalogue match', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(<Harness onPick={onPick} />);
    const input = screen.getByLabelText(/^item 1$/i);
    await user.click(input);
    await user.type(input, 'ridge');
    await user.click(screen.getByRole('option', { name: /dry-fix ridge and hip/i }));
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ id: 'ridge' }));
    expect(input).toHaveValue('Dry-fix ridge and hip');
  });

  it('keeps the typed name when nothing matches', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const input = screen.getByLabelText(/^item 1$/i);
    await user.click(input);
    await user.type(input, 'Custom flashing');
    expect(input).toHaveValue('Custom flashing');
    expect(screen.getByText(/nothing in the catalogue matches/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create catalogue item .custom flashing./i })).toBeInTheDocument();
    expect(screen.getByText(/save this name to the catalogue/i)).toBeInTheDocument();
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
  });

  it('opens the catalogue form from an unmatched name and applies the saved row', async () => {
    const user = userEvent.setup();
    api.post.mockResolvedValue({
      item: {
        id: 'custom_flashing',
        description: 'Custom flashing',
        unit: 'lin m',
        unit_price: 40,
        vat_code: 'standard',
        kind: 'materials',
      },
    });
    const onPick = vi.fn();
    render(<Harness onPick={onPick} />);
    const input = screen.getByLabelText(/^item 1$/i);
    await user.click(input);
    await user.type(input, 'Custom flashing');
    await user.click(screen.getByRole('button', { name: /create catalogue item/i }));
    expect(screen.getByRole('heading', { name: /add catalogue item/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/^sku$/i)).toHaveValue('custom_flashing');
    expect(screen.getByLabelText(/^description$/i)).toHaveValue('Custom flashing');
    await user.click(screen.getByRole('button', { name: /save item/i }));
    expect(api.post).toHaveBeenCalledWith('/catalogue', expect.objectContaining({
      id: 'custom_flashing',
      description: 'Custom flashing',
    }));
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ id: 'custom_flashing' }));
    expect(input).toHaveValue('Custom flashing');
  });
});
