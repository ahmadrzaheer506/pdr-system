import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusBadge } from './ui.jsx';

describe('StatusBadge', () => {
  it('title-cases lowercase and uppercase statuses', () => {
    const { rerender } = render(<StatusBadge status="booked" />);
    expect(screen.getByText('Booked')).toBeInTheDocument();
    rerender(<StatusBadge status="accepted" />);
    expect(screen.getByText('Accepted')).toBeInTheDocument();
    rerender(<StatusBadge status="PENDING" />);
    expect(screen.getByText('Pending')).toBeInTheDocument();
    rerender(<StatusBadge status="IN_PROGRESS" />);
    expect(screen.getByText('In Progress')).toBeInTheDocument();
    rerender(<StatusBadge status="cancelled" />);
    expect(screen.getByText('Cancelled')).toBeInTheDocument();
    rerender(<StatusBadge status="done" />);
    expect(screen.getByText('Done')).toBeInTheDocument();
  });
});
