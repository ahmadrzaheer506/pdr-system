import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CatalogueItemInput from './CatalogueItemInput.jsx';
import { useState } from 'react';

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
    expect(screen.getByText(/no catalogue match/i)).toBeInTheDocument();
    expect(screen.getByText(/custom flashing/i)).toBeInTheDocument();
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
  });
});
