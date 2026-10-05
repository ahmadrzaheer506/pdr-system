import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import BrandLogo, { bumpBrandLogo } from './BrandLogo.jsx';

describe('BrandLogo (requirement 17.3)', () => {
  it('loads the public branding endpoint', () => {
    render(<BrandLogo />);
    expect(screen.getByRole('img', { name: /paul douglas roofing/i })).toHaveAttribute(
      'src',
      '/api/branding/logo',
    );
  });

  it('falls back to the seed PNG if the API image fails', () => {
    render(<BrandLogo />);
    fireEvent.error(screen.getByRole('img', { name: /paul douglas roofing/i }));
    expect(screen.getByRole('img', { name: /paul douglas roofing/i })).toHaveAttribute('src', '/logo.png');
  });

  it('retries after the src changes', () => {
    const { rerender } = render(<BrandLogo src="/api/branding/logo?v=1" />);
    fireEvent.error(screen.getByRole('img', { name: /paul douglas roofing/i }));
    expect(screen.getByRole('img', { name: /paul douglas roofing/i })).toHaveAttribute('src', '/logo.png');
    rerender(<BrandLogo src="/api/branding/logo?v=2" />);
    expect(screen.getByRole('img', { name: /paul douglas roofing/i })).toHaveAttribute(
      'src',
      '/api/branding/logo?v=2',
    );
  });

  it('retries after bumpBrandLogo', () => {
    render(<BrandLogo />);
    fireEvent.error(screen.getByRole('img', { name: /paul douglas roofing/i }));
    expect(screen.getByRole('img', { name: /paul douglas roofing/i })).toHaveAttribute('src', '/logo.png');
    act(() => bumpBrandLogo('/api/branding/logo?v=9'));
    expect(screen.getByRole('img', { name: /paul douglas roofing/i })).toHaveAttribute(
      'src',
      '/api/branding/logo?v=9',
    );
  });
});
