import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SkillsSettings from './SkillsSettings.jsx';
import { api } from '../lib/api';

vi.mock('../lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    del: vi.fn(),
  },
}));

const SKILLS = [
  { id: 1, slug: 'roofing', name: 'Roofing', sort_order: 0 },
  { id: 3, slug: 'lead_work', name: 'Lead Work', sort_order: 2 },
];

describe('SkillsSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.get.mockImplementation(async (path) => {
      if (path === '/skills') return { skills: SKILLS, levels: [] };
      if (path === '/job-types') {
        return {
          job_types: [{
            id: 7,
            name: 'Re-roof',
            required_skills: [{ skill_id: 1, level: 'advanced' }],
          }],
        };
      }
      return {};
    });
    api.post.mockResolvedValue({ skill: { id: 19, name: 'Solar' } });
    api.put.mockResolvedValue({ skill: { id: 1, name: 'Pitched Roofing' } });
    api.del.mockResolvedValue({ ok: true });
  });

  it('lists skills and job types from Settings', async () => {
    render(<SkillsSettings canEdit />);
    expect(await screen.findByRole('heading', { name: /^skills$/i })).toBeInTheDocument();
    expect(screen.getByText('Roofing')).toBeInTheDocument();
    expect(screen.getByText('Lead Work')).toBeInTheDocument();
    expect(screen.getByText('Re-roof')).toBeInTheDocument();
  });

  it('creates a skill', async () => {
    const user = userEvent.setup();
    render(<SkillsSettings canEdit />);
    await user.click(await screen.findByRole('button', { name: /add skill/i }));
    await user.type(screen.getByLabelText(/^name$/i), 'Solar');
    await user.click(screen.getByRole('button', { name: /^save$/i }));
    expect(api.post).toHaveBeenCalledWith('/skills', { name: 'Solar' });
  });

  it('renames a skill', async () => {
    const user = userEvent.setup();
    render(<SkillsSettings canEdit />);
    await user.click(await screen.findByRole('button', { name: /edit roofing/i }));
    const name = screen.getByLabelText(/^name$/i);
    await user.clear(name);
    await user.type(name, 'Pitched Roofing');
    await user.click(screen.getByRole('button', { name: /^save$/i }));
    expect(api.put).toHaveBeenCalledWith('/skills/1', { name: 'Pitched Roofing' });
  });
});
