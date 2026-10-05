import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SelectMenu from './SelectMenu.jsx';
import { useState } from 'react';

function Harness() {
  const [value, setValue] = useState('labour');
  return (
    <SelectMenu
      id="demo-kind"
      label="Kind"
      value={value}
      onChange={setValue}
      options={[
        { value: 'labour', label: 'Labour' },
        { value: 'materials', label: 'Materials' },
        { value: 'both', label: 'Both' },
      ]}
    />
  );
}

describe('SelectMenu', () => {
  it('opens the catalogue-style list and selects an option', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(screen.getByLabelText(/^kind$/i)).toHaveTextContent('Labour');
    await user.click(screen.getByLabelText(/^kind$/i));
    await user.click(screen.getByRole('option', { name: /^materials$/i }));
    expect(screen.getByLabelText(/^kind$/i)).toHaveTextContent('Materials');
    expect(screen.queryByRole('listbox')).toBeNull();
  });
});
