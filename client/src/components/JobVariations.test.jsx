import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import JobVariations from './JobVariations.jsx';
import { api } from '../lib/api';

vi.mock('../lib/api', () => ({
  api: { post: vi.fn(), del: vi.fn() },
  money: (n) => `£${Number(n).toFixed(2)}`,
}));

describe('JobVariations (requirement 7.5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.post.mockResolvedValue({ ok: true });
    api.del.mockResolvedValue({ ok: true });
  });

  it('lets office add and remove a priced line', async () => {
    const user = userEvent.setup();
    const onChanged = vi.fn();
    render(
      <JobVariations
        jobId={8}
        lines={[{ id: 3, description: 'Lead soakers', amount: 180 }]}
        onChanged={onChanged}
        onError={() => {}}
      />,
    );
    expect(screen.getByText('Lead soakers')).toBeInTheDocument();
    expect(screen.getAllByText('£180.00').length).toBeGreaterThanOrEqual(1);
    await user.type(screen.getByLabelText(/variation description/i), 'Extra flashing');
    await user.type(screen.getByLabelText(/variation amount/i), '95');
    await user.click(screen.getByRole('button', { name: /add variation/i }));
    expect(api.post).toHaveBeenCalledWith('/jobs/8/variations', {
      description: 'Extra flashing',
      amount: '95',
    });
    await user.click(screen.getByLabelText(/remove lead soakers/i));
    expect(api.del).toHaveBeenCalledWith('/jobs/8/variations/3');
  });

  it('scrolls the list when there are more than four variations', () => {
    const lines = [1, 2, 3, 4, 5].map((n) => ({ id: n, description: `Line ${n}`, amount: 10 }));
    const { container } = render(
      <JobVariations jobId={8} lines={lines} onChanged={() => {}} onError={() => {}} />,
    );
    expect(container.querySelector('ul').className).toMatch(/overflow-y-auto/);
  });
});
