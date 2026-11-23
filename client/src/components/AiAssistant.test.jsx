import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AiAssistant from './AiAssistant.jsx';
import { api } from '../lib/api';

vi.mock('../lib/api', () => ({
  api: { post: vi.fn(), upload: vi.fn() },
}));

const recorder = {
  start: vi.fn(async () => true),
  stop: vi.fn(async () => new Blob([new Uint8Array(2048)], { type: 'audio/webm' })),
  dispose: vi.fn(),
};

vi.mock('../lib/voiceRecorder', () => ({
  createVoiceRecorder: () => recorder,
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
    api.upload.mockResolvedValue({ available: false });
    recorder.start.mockResolvedValue(true);
    recorder.stop.mockResolvedValue(new Blob([new Uint8Array(2048)], { type: 'audio/webm' }));
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

  it('toasts and hides approve when nothing is waiting to schedule', async () => {
    const user = userEvent.setup();
    const show = vi.fn();
    api.post.mockResolvedValue({
      provider: 'none',
      assignments: [],
      unassigned: [],
      warnings: [],
      errors: [],
      summary: 'No unscheduled jobs waiting - nothing to propose.',
    });
    render(
      <AiAssistant
        proposeDate="2026-10-02"
        setProposeDate={vi.fn()}
        onApproved={vi.fn()}
        show={show}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Propose schedule' }));
    await waitFor(() => {
      expect(show).toHaveBeenCalledWith('No unscheduled jobs waiting. Place a job on the queue first, then propose a schedule.');
    });
    expect(screen.queryByRole('button', { name: /approve & schedule/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/nothing to propose/i)).not.toBeInTheDocument();
    expect(screen.getByText(/place a job on the unscheduled queue first/i)).toBeInTheDocument();
  });

  it('writes live speech into the composer without duplicating phrases', async () => {
    const user = userEvent.setup();
    const instances = [];
    class SpeechRecognition {
      constructor() {
        instances.push(this);
        this.lang = '';
        this.continuous = false;
        this.interimResults = false;
        this.maxAlternatives = 1;
      }
      start() {}
      stop() { this.onend?.(); }
      abort() {}
    }
    window.SpeechRecognition = SpeechRecognition;
    render(
      <AiAssistant
        proposeDate="2026-10-02"
        setProposeDate={vi.fn()}
        onApproved={vi.fn()}
        show={vi.fn()}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Start voice input' }));
    expect(screen.getByRole('button', { name: 'Stop recording' })).toBeInTheDocument();
    const recog = instances[0];
    const phrase = (text, isFinal) => {
      const row = [{ transcript: text, confidence: 0.9 }];
      row.isFinal = isFinal;
      return row;
    };
    act(() => {
      recog.onresult({ results: [phrase('Connor is off', true), phrase(' sick', false)] });
    });
    expect(screen.getByLabelText(/schedule instruction/i)).toHaveValue('Connor is off sick');
    act(() => {
      recog.onresult({ results: [phrase('Connor is off', true), phrase(' sick', true)] });
    });
    expect(screen.getByLabelText(/schedule instruction/i)).toHaveValue('Connor is off sick');
    await user.click(screen.getByRole('button', { name: 'Stop recording' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Start voice input' })).toBeInTheDocument();
    });
    delete window.SpeechRecognition;
  });

  it('replaces live speech with the server transcript when Whisper is available', async () => {
    const user = userEvent.setup();
    class SpeechRecognition {
      constructor() {
        this.lang = '';
        this.continuous = false;
        this.interimResults = false;
        this.maxAlternatives = 1;
      }
      start() {}
      stop() { this.onend?.(); }
      abort() {}
    }
    window.SpeechRecognition = SpeechRecognition;
    api.upload.mockResolvedValue({
      available: true,
      text: 'A simple sentence has one independent clause with a subject and a verb that express one complete thought.',
    });
    render(
      <AiAssistant
        proposeDate="2026-10-02"
        setProposeDate={vi.fn()}
        onApproved={vi.fn()}
        show={vi.fn()}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Start voice input' }));
    await user.click(screen.getByRole('button', { name: 'Stop recording' }));
    await waitFor(() => {
      expect(api.upload).toHaveBeenCalledWith('/jobs/ai/transcribe', expect.any(FormData));
    });
    expect(screen.getByLabelText(/schedule instruction/i)).toHaveValue(
      'A simple sentence has one independent clause with a subject and a verb that express one complete thought.',
    );
    delete window.SpeechRecognition;
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
