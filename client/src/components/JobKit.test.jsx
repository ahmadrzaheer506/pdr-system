import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import JobKit from './JobKit.jsx';
import { api } from '../lib/api';

vi.mock('../lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn() },
}));

const TEMPLATES = [
  { id: 'generic', label: 'Generic', items: ['PPE on'] },
  { id: 'guttering', label: 'Guttering', items: ['Water-test the run'] },
];

describe('JobKit (requirement 7.3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.get.mockResolvedValue({ templates: TEMPLATES });
    api.post.mockResolvedValue({ ok: true });
    api.put.mockResolvedValue({ ok: true });
    api.del.mockResolvedValue({ ok: true });
  });

  it('lets office apply a template and tick materials', async () => {
    const user = userEvent.setup();
    const onChanged = vi.fn();
    render(
      <JobKit
        jobId={8}
        apiBase="/jobs"
        materialLines={[{ id: 1, description: 'Slate', qty: 20, unit: 'm²', status: 'needed' }]}
        checklistItems={[]}
        allowTemplates
        onChanged={onChanged}
        onError={() => {}}
      />,
    );
    expect(await screen.findByRole('button', { name: /^generic$/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^guttering$/i }));
    expect(api.post).toHaveBeenCalledWith('/jobs/8/checklist/apply', { template_id: 'guttering' });
    await user.click(screen.getByRole('button', { name: /^packed$/i }));
    expect(api.put).toHaveBeenCalledWith('/jobs/8/materials/1', { status: 'packed' });
  });

  it('shows Qty under the name and scrolls after five materials', () => {
    const lines = Array.from({ length: 6 }, (_, i) => ({
      id: i + 1,
      description: `Item ${i + 1}`,
      qty: i + 1,
      unit: i === 0 ? 'bag' : '',
      status: 'needed',
    }));
    render(
      <JobKit
        jobId={8}
        apiBase="/jobs"
        materialLines={lines}
        checklistItems={[]}
        allowTemplates={false}
        onChanged={() => {}}
        onError={() => {}}
      />,
    );
    expect(screen.getByText('Qty: 1 bag')).toBeInTheDocument();
    expect(screen.getByText('Qty: 2')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: /materials/i })).toHaveClass('overflow-y-auto');
  });

  it('lets staff add and remove lines without template buttons', async () => {
    const user = userEvent.setup();
    render(
      <JobKit
        jobId={8}
        apiBase="/staff/jobs"
        materialLines={[]}
        checklistItems={[{ id: 3, body: 'PPE on', done: false }]}
        allowTemplates={false}
        onChanged={() => {}}
        onError={() => {}}
      />,
    );
    expect(screen.queryByRole('button', { name: /^generic$/i })).toBeNull();
    expect(screen.getByLabelText(/^unit$/i)).toHaveAttribute('placeholder', 'm²');
    await user.type(screen.getByPlaceholderText('Item'), 'EPDM');
    await user.click(screen.getByRole('button', { name: /add material/i }));
    expect(api.post).toHaveBeenCalledWith('/staff/jobs/8/materials', {
      description: 'EPDM', qty: '1', unit: '',
    });
    await user.click(screen.getByRole('checkbox', { name: /ppe on/i }));
    expect(api.put).toHaveBeenCalledWith('/staff/jobs/8/checklist/3', { done: true });
  });
});
