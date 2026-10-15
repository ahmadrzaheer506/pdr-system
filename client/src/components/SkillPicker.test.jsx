import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SkillPicker from './SkillPicker.jsx';

const CATALOGUE = [
  { id: 1, slug: 'roofing', name: 'Roofing' },
  { id: 2, slug: 'lead_work', name: 'Lead Work' },
];

describe('SkillPicker', () => {
  it('selects a skill at Competent and lets the level change', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(
      <SkillPicker catalogue={CATALOGUE} value={[]} onChange={onChange} />,
    );

    await user.click(screen.getByRole('button', { name: /^roofing$/i }));
    expect(onChange).toHaveBeenCalledWith([{ skill_id: 1, level: 'competent' }]);

    rerender(
      <SkillPicker
        catalogue={CATALOGUE}
        value={[{ skill_id: 1, level: 'competent' }]}
        onChange={onChange}
      />,
    );
    expect(screen.getByRole('button', { name: /roofing advanced/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /roofing advanced/i }));
    expect(onChange).toHaveBeenLastCalledWith([{ skill_id: 1, level: 'advanced' }]);
  });
});
