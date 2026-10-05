import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import StaffJobDetail from './StaffJobDetail.jsx';
import { api } from '../../lib/api';

vi.mock('../../lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn(), upload: vi.fn() },
  fmtDate: () => '22 Sep',
  fmtDateTime: () => '24 Sep 10:00',
}));

vi.mock('../../components/ClockWidget.jsx', () => ({ default: () => null }));

const JOB = {
  id: 8,
  title: 'Porch roof rebuild',
  priority: 'normal',
  address: '2 Priory Court',
  customer_name: 'Helen Ackroyd',
  customer_phone: '+447966778899',
  start_date: '2026-09-22',
  end_date: '2026-09-22',
  start_time: '08:00',
  end_time: '16:30',
  materials: 'EPDM offcut',
  material_lines: [],
  checklist_items: [],
  files: [],
  notes: '',
  crew: [{ id: 3, name: 'Jamie Fisher' }],
};

describe('StaffJobDetail (requirement 7.3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.get.mockResolvedValue({ job: JOB, messages: [] });
  });

  it('shows the fallback materials note and lets staff add a line', async () => {
    render(
      <MemoryRouter initialEntries={['/staff/jobs/8']}>
        <Routes>
          <Route path="/staff/jobs/:id" element={<StaffJobDetail />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText('EPDM offcut')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Item')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^generic$/i })).toBeNull();
    expect(screen.getByLabelText(/upload before photo/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/progress notes/i)).toBeInTheDocument();
    expect(screen.queryByText(/variations/i)).toBeNull();
  });

  it('does not show variation amounts even if they leak on the payload (requirement 7.5)', async () => {
    api.get.mockResolvedValue({
      job: { ...JOB, variations: [{ id: 9, description: 'Lead soakers', amount: 180 }] },
      messages: [],
    });
    render(
      <MemoryRouter initialEntries={['/staff/jobs/8']}>
        <Routes>
          <Route path="/staff/jobs/:id" element={<StaffJobDetail />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText('Porch roof rebuild')).toBeInTheDocument();
    expect(screen.queryByText('Lead soakers')).toBeNull();
    expect(screen.queryByText(/£180/)).toBeNull();
  });
});
