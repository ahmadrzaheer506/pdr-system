import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PhotoUploadButton from './PhotoUploadButton.jsx';

describe('PhotoUploadButton', () => {
  it('offers take photo and photo library, then uploads from the library input', async () => {
    const user = userEvent.setup();
    const onFile = vi.fn();
    const file = new File(['img'], 'roof.jpg', { type: 'image/jpeg' });
    render(<PhotoUploadButton ariaLabel="before photo" onFile={onFile}>Upload</PhotoUploadButton>);

    expect(screen.getByLabelText(/take before photo/i)).toHaveAttribute('capture', 'environment');
    expect(screen.getByLabelText(/upload before photo/i)).not.toHaveAttribute('capture');

    await user.click(screen.getByRole('button', { name: /^upload$/i }));
    expect(screen.getByRole('dialog', { name: /add photo/i })).toBeInTheDocument();
    expect(screen.getByText(/take a new picture, or choose one already on this device/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /take photo/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /photo library/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^cancel$/i })).toBeInTheDocument();

    await user.upload(screen.getByLabelText(/upload before photo/i), file);
    expect(onFile).toHaveBeenCalledWith(file);
    expect(screen.queryByRole('dialog', { name: /add photo/i })).not.toBeInTheDocument();
  });
});
