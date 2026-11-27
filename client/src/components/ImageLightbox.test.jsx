import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ImageLightbox from './ImageLightbox.jsx';

const ITEMS = [
  { src: '/a.jpg', alt: 'first.jpg' },
  { src: '/b.jpg', alt: 'second.jpg' },
  { src: '/c.jpg', alt: 'third.jpg' },
];

describe('ImageLightbox', () => {
  it('has no bottom Close bar and moves between photos', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<ImageLightbox open items={ITEMS} index={0} onClose={onClose} />);
    expect(screen.getByRole('dialog', { name: 'first.jpg' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^close$/i })).not.toBeInTheDocument();
    expect(screen.getByText('1 / 3')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /next photo/i }));
    expect(screen.getByRole('dialog', { name: 'second.jpg' })).toBeInTheDocument();
    expect(screen.getByText('2 / 3')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /previous photo/i }));
    expect(screen.getByRole('dialog', { name: 'first.jpg' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /close photo/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
