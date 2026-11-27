import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CustomerAttachments from './CustomerAttachments.jsx';
import { api } from '../lib/api';

vi.mock('../lib/api', () => ({
  api: { upload: vi.fn(), del: vi.fn() },
  fmtDateTime: (d) => `dt:${d}`,
}));

describe('CustomerAttachments (requirement 2.4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.upload.mockResolvedValue({ file: { id: 2 } });
  });

  it('lists files and uploads through the customer files endpoint', async () => {
    const user = userEvent.setup();
    const onChanged = vi.fn();
    const file = new File(['pdf-bytes'], 'survey.pdf', { type: 'application/pdf' });
    render(
      <CustomerAttachments
        customerId={9}
        files={[{ id: 1, original_name: 'roof.jpg', mime: 'image/jpeg', size_bytes: 2048, created_at: '2026-01-02T10:00:00Z' }]}
        onChanged={onChanged}
        onError={vi.fn()}
      />,
    );
    expect(screen.getByText('Attachments')).toBeInTheDocument();
    expect(screen.getByText('roof.jpg')).toBeInTheDocument();
    expect(screen.getByText('General')).toBeInTheDocument();
    await user.upload(screen.getByLabelText(/upload attachment/i), file);
    expect(api.upload).toHaveBeenCalled();
    const [path, fd] = api.upload.mock.calls[0];
    expect(path).toBe('/customers/9/files');
    expect(fd).toBeInstanceOf(FormData);
    expect(onChanged).toHaveBeenCalled();
  });

  it('badges landing-page photos as from the customer', () => {
    render(
      <CustomerAttachments
        customerId={9}
        leadId={40}
        files={[{
          id: 1,
          original_name: 'valley.jpg',
          mime: 'image/jpeg',
          size_bytes: 2048,
          created_at: '2026-01-02T10:00:00Z',
          source: 'customer',
        }]}
        onChanged={vi.fn()}
        onError={vi.fn()}
      />,
    );
    expect(screen.getByText('From customer')).toBeInTheDocument();
    expect(screen.getByText('valley.jpg')).toBeInTheDocument();
  });

  it('opens a customer photo in-app and closes it without leaving the page', async () => {
    const user = userEvent.setup();
    render(
      <CustomerAttachments
        customerId={9}
        files={[{
          id: 1,
          original_name: 'valley.jpg',
          mime: 'image/jpeg',
          size_bytes: 2048,
          created_at: '2026-01-02T10:00:00Z',
          source: 'customer',
        }]}
        onChanged={vi.fn()}
        onError={vi.fn()}
      />,
    );
    await user.click(screen.getByRole('button', { name: /open valley.jpg/i }));
    expect(screen.getByRole('dialog', { name: 'valley.jpg' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^close$/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^back$/i }));
    expect(screen.queryByRole('dialog', { name: 'valley.jpg' })).not.toBeInTheDocument();
    expect(screen.getByText('Attachments')).toBeInTheDocument();
  });

  it('slides to the next customer photo without leaving the page', async () => {
    const user = userEvent.setup();
    render(
      <CustomerAttachments
        customerId={9}
        files={[
          {
            id: 1,
            original_name: 'valley.jpg',
            mime: 'image/jpeg',
            size_bytes: 2048,
            created_at: '2026-01-02T10:00:00Z',
            source: 'customer',
          },
          {
            id: 2,
            original_name: 'ridge.png',
            mime: 'image/png',
            size_bytes: 1024,
            created_at: '2026-01-02T10:01:00Z',
            source: 'customer',
          },
        ]}
        onChanged={vi.fn()}
        onError={vi.fn()}
      />,
    );
    await user.click(screen.getByRole('button', { name: /open valley.jpg/i }));
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /next photo/i }));
    expect(screen.getByRole('dialog', { name: 'ridge.png' })).toBeInTheDocument();
    expect(screen.getByText('2 / 2')).toBeInTheDocument();
    expect(screen.getByText('Attachments')).toBeInTheDocument();
  });

  it('badges clock-out site photos', () => {
    render(
      <CustomerAttachments
        customerId={9}
        leadId={40}
        files={[{
          id: 2,
          original_name: 'Clock-out site photo.jpg',
          mime: 'image/jpeg',
          size_bytes: 2048,
          created_at: '2026-01-02T16:00:00Z',
          source: 'clock',
        }]}
        onChanged={vi.fn()}
        onError={vi.fn()}
      />,
    );
    expect(screen.getByText('Clock-out photo')).toBeInTheDocument();
  });

  it('does not scroll attachments when there are three or fewer', () => {
    render(
      <CustomerAttachments
        customerId={9}
        files={[1, 2, 3].map((id) => ({
          id,
          original_name: `file-${id}.pdf`,
          mime: 'application/pdf',
          size_bytes: 1200,
          created_at: '2026-01-02T10:00:00Z',
        }))}
        onChanged={vi.fn()}
        onError={vi.fn()}
      />,
    );
    expect(screen.getByRole('list', { name: 'Attachments' })).not.toHaveClass('overflow-y-auto');
  });

  it('scrolls attachments after three entries', () => {
    render(
      <CustomerAttachments
        customerId={9}
        files={[1, 2, 3, 4].map((id) => ({
          id,
          original_name: `file-${id}.pdf`,
          mime: 'application/pdf',
          size_bytes: 1200,
          created_at: '2026-01-02T10:00:00Z',
        }))}
        onChanged={vi.fn()}
        onError={vi.fn()}
      />,
    );
    expect(screen.getByRole('list', { name: 'Attachments' })).toHaveClass('overflow-y-auto');
  });
});
