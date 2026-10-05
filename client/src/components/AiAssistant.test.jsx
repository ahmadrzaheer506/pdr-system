import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AiAssistant from './AiAssistant.jsx';
import { api } from '../lib/api';

vi.mock('../lib/api', () => ({
  api: { post: vi.fn() },
}));

const proposal = {
  proposal_id: 7,
  provider: 'builtin',
  summary: 'Connor off. Fitch first.',
  assignments: [
    { job_id: 3, user_ids: [4], start_time: '08:00', end_time: '12:00', note: 'Priority' },
  ],
  unassigned: [],
  warnings: [],
  errors: [],
  context: {
    unscheduledJobs: [{ id: 3, title: 'Fitch guttering', customer_name: 'Fitch' }],
    staff: [{ id: 4, name: 'Ryan Cole', available: true, color: '#0f172a' }],
  },
};

describe('AiAssistant', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps the composer labels and posts the same propose payload', async () => {
    const user = userEvent.setup();
    const show = vi.fn();
    api.post.mockResolvedValue(proposal);
    render(
      <AiAssistant
        proposeDate="2026-10-02"
        setProposeDate={vi.fn()}
        onApproved={vi.fn()}
        show={show}
      />,
    );
    expect(screen.getByRole('heading', { name: 'AI Scheduling Assistant' })).toBeInTheDocument();
    expect(screen.getByText('Scheduling for')).toBeInTheDocument();
    expect(screen.getByLabelText('Scheduling for')).toHaveAttribute('data-value', '2026-10-02');
    expect(screen.getByRole('button', { name: 'Start voice input' })).toBeInTheDocument();
    await user.type(
      screen.getByPlaceholderText(/connor's off sick/i),
      "Connor's off sick",
    );
    await user.click(screen.getByRole('button', { name: 'Propose schedule' }));
    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/jobs/ai/propose', {
        date: '2026-10-02',
        transcript: "Connor's off sick",
      });
    });
    expect(await screen.findByText('Connor off. Fitch first.')).toBeInTheDocument();
    expect(screen.getByText('Fitch guttering')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /approve & schedule/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /discard/i })).toBeInTheDocument();
  });

  it('approves with the edited crew and proposal id', async () => {
    const user = userEvent.setup();
    const onApproved = vi.fn();
    api.post.mockResolvedValueOnce(proposal).mockResolvedValueOnce({ ok: true });
    render(
      <AiAssistant
        proposeDate="2026-10-02"
        setProposeDate={vi.fn()}
        onApproved={onApproved}
        show={vi.fn()}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Propose schedule' }));
    await screen.findByText('Fitch guttering');
    await user.click(screen.getByRole('button', { name: /approve & schedule/i }));
    await waitFor(() => {
      expect(api.post).toHaveBeenLastCalledWith('/jobs/ai/approve', {
        proposal_id: 7,
        date: '2026-10-02',
        assignments: [{ job_id: 3, user_ids: [4], start_time: '08:00', end_time: '12:00' }],
      });
    });
    expect(onApproved).toHaveBeenCalled();
  });

  it('asks to confirm before scheduling someone on holiday', async () => {
    const user = userEvent.setup();
    api.post.mockResolvedValueOnce({
      ...proposal,
      context: {
        unscheduledJobs: [{ id: 3, title: 'Fitch guttering', customer_name: 'Fitch' }],
        staff: [{ id: 4, name: 'Ryan Cole', available: false, on_holiday: true, busy_on: [], color: '#0f172a' }],
      },
    }).mockResolvedValueOnce({ ok: true });
    render(
      <AiAssistant
        proposeDate="2026-10-02"
        setProposeDate={vi.fn()}
        onApproved={vi.fn()}
        show={vi.fn()}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Propose schedule' }));
    await screen.findByText('Fitch guttering');
    await user.click(screen.getByRole('button', { name: /approve & schedule/i }));
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('heading', { name: /assign with conflicts/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /schedule anyway/i }));
    await waitFor(() => {
      expect(api.post).toHaveBeenLastCalledWith('/jobs/ai/approve', expect.objectContaining({
        confirm_conflicts: true,
      }));
    });
  });
});
