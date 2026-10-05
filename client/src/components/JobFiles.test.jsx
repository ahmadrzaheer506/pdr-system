import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import JobFiles from './JobFiles.jsx';
import { api } from '../lib/api';

vi.mock('../lib/api', () => ({
  api: { upload: vi.fn(), put: vi.fn(), del: vi.fn() },
  fmtDateTime: (d) => `dt:${d}`,
}));

describe('JobFiles (requirement 7.4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.upload.mockResolvedValue({ file: { id: 9 } });
    api.put.mockResolvedValue({ ok: true });
    api.del.mockResolvedValue({ ok: true });
  });

  it('uploads a tagged photo and a PDF document', async () => {
    const user = userEvent.setup();
    const onChanged = vi.fn();
    const photo = new File(['img'], 'before.jpg', { type: 'image/jpeg' });
    const pdf = new File(['pdf'], 'spec.pdf', { type: 'application/pdf' });
    render(
      <JobFiles
        jobId={8}
        apiBase="/jobs"
        files={[]}
        notes=""
        onChanged={onChanged}
        onError={() => {}}
      />,
    );
    await user.upload(screen.getByLabelText(/upload before photo/i), photo);
    expect(api.upload).toHaveBeenCalled();
    const [photoPath, photoFd] = api.upload.mock.calls[0];
    expect(photoPath).toBe('/jobs/8/files');
    expect(photoFd).toBeInstanceOf(FormData);
    expect(photoFd.get('stage')).toBe('before');

    await user.upload(screen.getByLabelText(/upload document/i), pdf);
    const [, docFd] = api.upload.mock.calls[1];
    expect(docFd.get('stage')).toBeNull();
    expect(onChanged).toHaveBeenCalled();
  });

  it('lets staff retag, delete, and save progress notes', async () => {
    const user = userEvent.setup();
    render(
      <JobFiles
        jobId={8}
        apiBase="/staff/jobs"
        files={[{ id: 4, stage: 'before', mime: 'image/jpeg', original_name: 'porch.jpg', size_bytes: 1200, created_at: '2026-09-24T10:00:00Z' }]}
        notes="Access via side gate"
        onChanged={() => {}}
        onError={() => {}}
      />,
    );
    expect(screen.getByText('porch.jpg')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^during$/i }));
    expect(api.put).toHaveBeenCalledWith('/staff/jobs/8/files/4', { stage: 'during' });
    await user.click(screen.getByLabelText(/delete porch.jpg/i));
    expect(api.del).toHaveBeenCalledWith('/staff/jobs/8/files/4');

    const box = screen.getByLabelText(/progress notes/i);
    await user.clear(box);
    await user.type(box, 'Ridge tiles on');
    await user.click(screen.getByRole('button', { name: /save notes/i }));
    expect(api.put).toHaveBeenCalledWith('/staff/jobs/8', { notes: 'Ridge tiles on' });
  });
});
