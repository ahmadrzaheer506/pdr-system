import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import UnscheduledQueue from './UnscheduledQueue.jsx';
import { api } from '../lib/api';
import { pickDate } from '../test/datePicker.js';
import { addIsoDays, localIsoDate } from '../lib/schedule';

vi.mock('../lib/api', () => ({
  api: { put: vi.fn() },
}));

describe('UnscheduledQueue (requirement 8.1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.put.mockResolvedValue({ ok: true });
  });

  it('places a PENDING job with start and optional end date', async () => {
    const user = userEvent.setup();
    const onPlaced = vi.fn();
    render(
      <UnscheduledQueue
        jobs={[{ id: 12, title: 'Guttering', customer_name: 'Helen', priority: 'high' }]}
        onPlaced={onPlaced}
        onError={() => {}}
        onOpen={() => {}}
      />,
    );
    const start = localIsoDate();
    const end = addIsoDays(start, 1);
    expect(screen.getByLabelText(/start date for guttering/i)).toHaveAttribute('min', start);
    expect(screen.getByLabelText(/end date for guttering/i)).toHaveAttribute('min', start);
    await pickDate(user, /start date for guttering/i, start);
    await pickDate(user, /end date for guttering/i, end);
    await user.click(screen.getByRole('button', { name: /place guttering/i }));
    expect(api.put).toHaveBeenCalledWith('/jobs/12', {
      start_date: start,
      end_date: end,
    });
    expect(onPlaced).toHaveBeenCalled();
  });
});
