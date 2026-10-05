import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import DatePicker from './DatePicker.jsx';
import { pickDate } from '../test/datePicker.js';

function Harness({ min, required } = {}) {
  const [value, setValue] = useState('2026-09-21');
  return (
    <DatePicker
      id="demo-date"
      label="Start date"
      value={value}
      onChange={setValue}
      min={min}
      required={required}
    />
  );
}

describe('DatePicker', () => {
  it('opens a calendar and keeps YYYY-MM-DD on the trigger', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const trigger = screen.getByLabelText(/^start date$/i);
    expect(trigger).toHaveAttribute('data-value', '2026-09-21');
    expect(trigger).toHaveTextContent('21 Sep 2026');
    await pickDate(user, trigger, '2026-09-29');
    expect(screen.getByLabelText(/^start date$/i)).toHaveAttribute('data-value', '2026-09-29');
    expect(screen.queryByRole('dialog', { name: /start date/i })).toBeNull();
  });

  it('exposes min on the labelled trigger the same way native inputs did', () => {
    render(<Harness min="2026-10-20" required />);
    expect(screen.getByLabelText(/^start date$/i)).toHaveAttribute('min', '2026-10-20');
  });

  it('disables days before min so they cannot be picked', async () => {
    const user = userEvent.setup();
    render(<Harness min="2026-09-25" />);
    await user.click(screen.getByLabelText(/^start date$/i));
    expect(await screen.findByRole('button', { name: '24 Sep 2026' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '25 Sep 2026' })).toBeEnabled();
  });
});
