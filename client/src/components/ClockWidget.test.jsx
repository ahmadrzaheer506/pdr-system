import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ClockWidget, { ClockOutPhotoPreview } from './ClockWidget.jsx';
import { api } from '../lib/api';

vi.mock('../lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn() },
}));

const idle = {
  active: null,
  on_break: false,
  enabled: true,
  require_location: false,
  require_photo: false,
  week_hours: 0,
  week_shifts: 0,
};

describe('ClockWidget (requirement 9.1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.get.mockResolvedValue(idle);
    api.post.mockResolvedValue({ ok: true, shift: { id: 11, job_id: null } });
  });

  it('clocks in yard / travel with no job', async () => {
    const user = userEvent.setup();
    render(<ClockWidget />);
    expect(await screen.findByRole('button', { name: /clock in \(yard \/ travel\)/i })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: /clock in \(yard \/ travel\)/i }));
    expect(api.post).toHaveBeenCalledWith('/staff/clock/in', {});
  });

  it('clocks in against a job when opened from that job', async () => {
    const user = userEvent.setup();
    render(<ClockWidget jobId={8} jobTitle="Porch roof rebuild" />);
    expect(await screen.findByRole('button', { name: /^clock in$/i })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: /^clock in$/i }));
    expect(api.post).toHaveBeenCalledWith('/staff/clock/in', { job_id: 8 });
  });

  it('sends GPS when the browser allows it', async () => {
    vi.stubGlobal('navigator', {
      geolocation: {
        getCurrentPosition: (ok) => ok({ coords: { latitude: 51.45, longitude: -0.97, accuracy: 12 } }),
      },
    });
    const user = userEvent.setup();
    render(<ClockWidget jobId={8} jobTitle="Porch roof rebuild" />);
    await user.click(await screen.findByRole('button', { name: /^clock in$/i }));
    expect(api.post).toHaveBeenCalledWith('/staff/clock/in', {
      job_id: 8, lat: 51.45, lng: -0.97, accuracy: 12,
    });
    vi.unstubAllGlobals();
  });

  it('still clocks in when GPS is missing', async () => {
    const user = userEvent.setup();
    render(<ClockWidget jobId={8} />);
    await user.click(await screen.findByRole('button', { name: /^clock in$/i }));
    expect(api.post).toHaveBeenCalledWith('/staff/clock/in', { job_id: 8 });
  });

  it('shows a far-from-site warning and keeps the timer running on break', async () => {
    api.get.mockResolvedValue({
      ...idle,
      on_break: true,
      active: {
        id: 11,
        job_id: 8,
        job_title: 'Porch roof rebuild',
        clock_in: new Date(Date.now() - 60 * 60000).toISOString(),
        break_minutes: 10,
        in_distance_m: 1200,
        location_flag: 'far_from_site',
      },
    });
    render(<ClockWidget jobId={8} />);
    expect(await screen.findByText(/on break — still on the clock/i)).toBeInTheDocument();
    expect(screen.getByText(/1200m from the job address/i)).toBeInTheDocument();
    expect(screen.getByText('1:00')).toBeInTheDocument();
  });

  it('keeps the clock-out site photo preview short', () => {
    render(<ClockOutPhotoPreview src="data:image/jpeg;base64,preview" onClear={() => {}} />);
    const img = screen.getByRole('img', { name: /^site$/i });
    expect(img).toHaveClass('h-full', 'object-contain');
    expect(img.parentElement).toHaveClass('h-40', 'overflow-hidden');
  });

  it('disables clock-in and explains when the job invoice is paid in full', async () => {
    render(<ClockWidget jobId={8} jobTitle="Full re-roof" invoicePaid />);
    const button = await screen.findByRole('button', { name: /^clock in$/i });
    expect(button).toBeDisabled();
    expect(screen.getByText(/this job is paid in full, so you cannot clock in/i)).toBeInTheDocument();
    expect(screen.queryByText(/location is recorded/i)).toBeNull();
  });
});
