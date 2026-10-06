import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import JobModal from './JobModal.jsx';
import { api } from '../lib/api';
import { pickDate } from '../test/datePicker';

vi.mock('../lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn(), upload: vi.fn() },
  money: (n) => `£${n}`,
  fmtDate: () => '22 Sep',
  fmtDateTime: () => '24 Sep 10:00',
}));

const STAFF = [
  { id: 3, name: 'Jamie Fisher', color: '#16a34a', skills: ['roofer', 'slate'] },
  { id: 4, name: 'Liam Ozturk', color: '#d97706', skills: ['labourer'] },
];

const JOB = {
  id: 8,
  title: 'Porch roof rebuild',
  status: 'IN_PROGRESS',
  priority: 'normal',
  address: '2 Priory Court',
  customer_id: 9,
  lead_id: 41,
  customer_name: 'Helen Ackroyd',
  start_date: '2026-09-22',
  end_date: '2026-09-22',
  day_assignments: [],
  crew: [],
  required_skills: ['slate'],
  sites: [],
  phones: [],
  emails: [],
};

function renderJob(ui) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe('JobModal (requirement 7.2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.get.mockImplementation(async (path) => {
      if (path === '/jobs/checklist-templates') {
        return { templates: [{ id: 'generic', label: 'Generic', items: ['PPE on'] }] };
      }
      if (String(path).startsWith('/jobs/availability')) {
        return { holidays: [], bookings: [] };
      }
      return { job: { ...JOB, material_lines: [], checklist_items: [], files: [], notes: '', variations: [] }, messages: [] };
    });
    api.put.mockResolvedValue({ ok: true, warnings: [] });
    api.post.mockResolvedValue({ ok: true });
  });

  it('blocks going back a status and allows skip ahead', async () => {
    const user = userEvent.setup();
    renderJob(<JobModal jobId={8} onClose={() => {}} onChanged={() => {}} staff={STAFF} />);
    expect(await screen.findByText('Porch roof rebuild')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^pending$/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /^scheduled$/i })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: /^completed$/i }));
    expect(api.put).toHaveBeenCalledWith('/jobs/8/status', { status: 'COMPLETED' });
  });

  it('unschedules in-progress jobs back to the unscheduled queue', async () => {
    const user = userEvent.setup();
    const onChanged = vi.fn();
    renderJob(<JobModal jobId={8} onClose={() => {}} onChanged={onChanged} staff={STAFF} />);
    expect(await screen.findByText('Porch roof rebuild')).toBeInTheDocument();
    const unscheduleBtn = screen.getByRole('button', { name: /unschedule this job/i });
    await user.hover(unscheduleBtn);
    expect(await screen.findByRole('tooltip', { name: /unschedule this job/i })).toBeInTheDocument();
    await user.click(unscheduleBtn);
    expect(api.post).toHaveBeenCalledWith('/jobs/8/unschedule');
    expect(onChanged).toHaveBeenCalled();
  });

  it('hides unschedule once the job is completed', async () => {
    api.get.mockImplementation(async (path) => {
      if (path === '/jobs/checklist-templates') {
        return { templates: [{ id: 'generic', label: 'Generic', items: ['PPE on'] }] };
      }
      if (String(path).startsWith('/jobs/availability')) {
        return { holidays: [], bookings: [] };
      }
      return { job: { ...JOB, status: 'COMPLETED', material_lines: [], checklist_items: [], files: [], notes: '', variations: [] }, messages: [] };
    });
    renderJob(<JobModal jobId={8} onClose={() => {}} onChanged={() => {}} staff={STAFF} />);
    expect(await screen.findByText('Porch roof rebuild')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /unschedule/i })).not.toBeInTheDocument();
  });

  it('opens the enquiry workspace for this job from the modal header', async () => {
    renderJob(<JobModal jobId={8} onClose={() => {}} onChanged={() => {}} staff={STAFF} />);
    const link = await screen.findByRole('link', { name: /open lead/i });
    expect(link).toHaveAttribute('href', '/leads/9?from=schedule&lead=41');
  });

  it('lets office pick required skills and marks matching crew', async () => {
    const user = userEvent.setup();
    renderJob(<JobModal jobId={8} onClose={() => {}} onChanged={() => {}} staff={STAFF} />);
    expect(await screen.findByLabelText(/Jamie Fisher matches required skills/i)).toBeInTheDocument();
    expect(screen.getByText('match')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^felt$/i }));
    await user.click(screen.getByRole('button', { name: /save skills/i }));
    expect(api.put).toHaveBeenCalledWith('/jobs/8', { required_skills: ['slate', 'felt'] });
  });

  it('still lets office assign crew who do not match', async () => {
    const user = userEvent.setup();
    renderJob(<JobModal jobId={8} onClose={() => {}} onChanged={() => {}} staff={STAFF} />);
    expect(await screen.findByText('Porch roof rebuild')).toBeInTheDocument();
    const liam = screen.getByRole('button', { name: /^Liam Ozturk$/i });
    expect(liam).toHaveAttribute('aria-pressed', 'false');
    await user.click(liam);
    expect(liam).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: /save crew/i }));
    expect(api.put).toHaveBeenCalledWith('/jobs/8/assignments', { work_date: '2026-09-22', user_ids: [4] });
  });

  it('lets office pick a day chip then save crew', async () => {
    const user = userEvent.setup();
    api.get.mockImplementation(async (path) => {
      if (path === '/jobs/checklist-templates') {
        return { templates: [{ id: 'generic', label: 'Generic', items: ['PPE on'] }] };
      }
      if (String(path).startsWith('/jobs/availability')) {
        return { holidays: [], bookings: [] };
      }
      return {
        job: {
          ...JOB,
          start_date: '2026-09-22',
          end_date: '2026-09-24',
          material_lines: [],
          checklist_items: [],
          files: [],
          notes: '',
          variations: [],
        },
        messages: [],
      };
    });
    renderJob(<JobModal jobId={8} onClose={() => {}} onChanged={() => {}} staff={STAFF} />);
    expect(await screen.findByLabelText(/^start date$/i)).toHaveAttribute('data-value', '2026-09-22');
    expect(screen.queryByLabelText(/^crew date$/i)).not.toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: /crew for 2026-09-24/i }));
    await user.click(screen.getByRole('button', { name: /^Liam Ozturk$/i }));
    await user.click(screen.getByRole('button', { name: /save crew/i }));
    expect(api.put).toHaveBeenCalledWith('/jobs/8/assignments', { work_date: '2026-09-24', user_ids: [4] });
  });

  it('shows an empty end date when none is stored and lets office set it', async () => {
    const user = userEvent.setup();
    api.get.mockImplementation(async (path) => {
      if (path === '/jobs/checklist-templates') {
        return { templates: [{ id: 'generic', label: 'Generic', items: ['PPE on'] }] };
      }
      if (String(path).startsWith('/jobs/availability')) {
        return { holidays: [], bookings: [] };
      }
      return {
        job: {
          ...JOB,
          end_date: null,
          material_lines: [],
          checklist_items: [],
          files: [],
          notes: '',
          variations: [],
        },
        messages: [],
      };
    });
    renderJob(<JobModal jobId={8} onClose={() => {}} onChanged={() => {}} staff={STAFF} />);
    expect(await screen.findByLabelText(/^end date$/i)).toHaveAttribute('data-value', '');
    await pickDate(user, /^end date$/i, '2026-09-25');
    expect(api.put).toHaveBeenCalledWith('/jobs/8', { end_date: '2026-09-25' });
  });

  it('scrolls to crew assigned when the header date badge is clicked', async () => {
    const user = userEvent.setup();
    const scrollIntoView = vi.fn();
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = scrollIntoView;
    try {
      renderJob(<JobModal jobId={8} onClose={() => {}} onChanged={() => {}} staff={STAFF} />);
      await user.click(await screen.findByRole('button', { name: /show crew dates/i }));
      expect(scrollIntoView).toHaveBeenCalled();
    } finally {
      Element.prototype.scrollIntoView = original;
    }
  });

  it('shows photo groups, documents, and progress notes (requirement 7.4)', async () => {
    renderJob(<JobModal jobId={8} onClose={() => {}} onChanged={() => {}} staff={STAFF} />);
    expect(await screen.findByText('Porch roof rebuild')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^pending$/i })).toBeDisabled();
    expect(screen.getByLabelText(/upload before photo/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/upload during photo/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/upload after photo/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/upload document/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/progress notes/i)).toBeInTheDocument();
  });

  it('shows office variations (requirement 7.5)', async () => {
    api.get.mockImplementation(async (path) => {
      if (path === '/jobs/checklist-templates') {
        return { templates: [{ id: 'generic', label: 'Generic', items: ['PPE on'] }] };
      }
      return {
        job: {
          ...JOB,
          material_lines: [],
          checklist_items: [],
          files: [],
          notes: '',
          variations: [{ id: 3, description: 'Lead soakers', amount: 180 }],
        },
        messages: [],
      };
    });
    renderJob(<JobModal jobId={8} onClose={() => {}} onChanged={() => {}} staff={STAFF} />);
    expect(await screen.findByText('Lead soakers')).toBeInTheDocument();
    expect(screen.getByLabelText(/variation description/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/progress notes/i)).toBeInTheDocument();
  });

  it('asks to confirm before saving crew on holiday or already booked', async () => {
    const user = userEvent.setup();
    api.get.mockImplementation(async (path) => {
      if (path === '/jobs/checklist-templates') {
        return { templates: [{ id: 'generic', label: 'Generic', items: ['PPE on'] }] };
      }
      if (String(path).startsWith('/jobs/availability')) {
        return {
          holidays: [{ id: 9, user_id: 4, user_name: 'Liam Ozturk', start_date: '2026-09-22', end_date: '2026-09-22' }],
          bookings: [{ user_id: 3, name: 'Jamie Fisher', job_id: 9, job_title: 'Guttering', work_date: '2026-09-22' }],
        };
      }
      return { job: { ...JOB, material_lines: [], checklist_items: [], files: [], notes: '', variations: [] }, messages: [] };
    });
    renderJob(<JobModal jobId={8} onClose={() => {}} onChanged={() => {}} staff={STAFF} />);
    expect(await screen.findByLabelText(/Liam Ozturk on holiday/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Jamie Fisher matches required skills already on Guttering/i)).toBeInTheDocument();
    await user.hover(screen.getByRole('button', { name: /Liam Ozturk on holiday/i }));
    expect(await screen.findByRole('tooltip', { name: /Liam Ozturk is on holiday this day\. You can still book/i })).toBeInTheDocument();
    await user.hover(screen.getByRole('button', { name: /Jamie Fisher matches required skills already on Guttering/i }));
    expect(await screen.findByRole('tooltip', { name: /Jamie Fisher is already booked on “Guttering”\. You can still book/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Liam Ozturk on holiday/i }));
    await user.click(screen.getByRole('button', { name: /save crew/i }));
    expect(api.put).not.toHaveBeenCalledWith('/jobs/8/assignments', expect.anything());
    expect(await screen.findByRole('heading', { name: /assign with conflicts/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(screen.queryByRole('heading', { name: /assign with conflicts/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /save crew/i }));
    await user.click(screen.getByRole('button', { name: /assign anyway/i }));
    expect(api.put).toHaveBeenCalledWith('/jobs/8/assignments', {
      work_date: '2026-09-22', user_ids: [4], confirm_conflicts: true,
    });
  });

  it('names assigned crew who are already booked on another job', async () => {
    api.get.mockImplementation(async (path) => {
      if (path === '/jobs/checklist-templates') {
        return { templates: [{ id: 'generic', label: 'Generic', items: ['PPE on'] }] };
      }
      if (String(path).startsWith('/jobs/availability')) {
        return {
          holidays: [],
          bookings: [{ user_id: '3', name: 'Jamie Fisher', job_id: '9', job_title: 'Guttering', work_date: '2026-09-22' }],
        };
      }
      return {
        job: {
          ...JOB,
          day_assignments: [{ work_date: '2026-09-22', user_id: 3, name: 'Jamie' }],
          material_lines: [],
          checklist_items: [],
          files: [],
          notes: '',
          variations: [],
        },
        messages: [],
      };
    });
    renderJob(<JobModal jobId={8} onClose={() => {}} onChanged={() => {}} staff={STAFF} />);
    expect(await screen.findByText('Jamie Fisher is already booked on “Guttering”.')).toBeInTheDocument();
    expect(screen.getByText('These people are already booked. You can still assign them.')).toBeInTheDocument();
  });

  it('names assigned crew booked on an invoiced job the calendar already flags', async () => {
    api.get.mockImplementation(async (path) => {
      if (path === '/jobs/checklist-templates') {
        return { templates: [{ id: 'generic', label: 'Generic', items: ['PPE on'] }] };
      }
      if (String(path).startsWith('/jobs/availability')) {
        return { holidays: [], bookings: [] };
      }
      return {
        job: {
          ...JOB,
          id: 16,
          title: 'eee',
          start_date: '2026-10-04',
          end_date: '2026-10-04',
          day_assignments: [{ work_date: '2026-10-04', user_id: 3, name: 'Jamie' }],
          material_lines: [],
          checklist_items: [],
          files: [],
          notes: '',
          variations: [],
        },
        messages: [],
      };
    });
    renderJob(
      <JobModal
        jobId={16}
        onClose={() => {}}
        onChanged={() => {}}
        staff={STAFF}
        jobs={[{
          id: 10,
          title: 'test',
          status: 'INVOICED',
          start_date: '2026-10-04',
          end_date: '2026-10-04',
          day_assignments: [{ work_date: '2026-10-04', user_id: 3, name: 'Jamie Fisher' }],
        }]}
      />,
    );
    expect(await screen.findByText('Jamie Fisher is already booked on “test”.')).toBeInTheDocument();
    expect(screen.getByText('These people are already booked. You can still assign them.')).toBeInTheDocument();
  });

  it('toggles needs a driver and warns when skills or a driver are missing (requirement 8.3)', async () => {
    const user = userEvent.setup();
    api.get.mockImplementation(async (path) => {
      if (path === '/jobs/checklist-templates') {
        return { templates: [{ id: 'generic', label: 'Generic', items: ['PPE on'] }] };
      }
      if (String(path).startsWith('/jobs/availability')) {
        return { holidays: [], bookings: [] };
      }
      return {
        job: {
          ...JOB,
          required_skills: ['slate'],
          needs_driver: true,
          material_lines: [],
          checklist_items: [],
          files: [],
          notes: '',
          variations: [],
        },
        messages: [],
      };
    });
    renderJob(<JobModal jobId={8} onClose={() => {}} onChanged={() => {}} staff={STAFF} />);
    expect(await screen.findByLabelText(/needs a driver/i)).toBeChecked();
    expect(screen.getByText(/nobody covering: slate/i)).toBeInTheDocument();
    expect(screen.getByText(/needs a driver — nobody assigned can drive/i)).toBeInTheDocument();
    await user.click(screen.getByLabelText(/needs a driver/i));
    expect(api.put).toHaveBeenCalledWith('/jobs/8', { needs_driver: false });
  });

  it('lets office change job priority', async () => {
    const user = userEvent.setup();
    renderJob(<JobModal jobId={8} onClose={() => {}} onChanged={() => {}} staff={STAFF} />);
    expect(await screen.findByText(/^normal$/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^priority$/i)).not.toBeInTheDocument();
    await user.hover(screen.getByRole('button', { name: /change priority/i }));
    expect(await screen.findByRole('tooltip', { name: /change priority/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /change priority/i }));
    const prioritySelect = screen.getByLabelText(/^priority$/i);
    expect(prioritySelect).toHaveAttribute('data-value', 'normal');
    await user.click(prioritySelect);
    await user.click(screen.getByRole('option', { name: /^high$/i }));
    expect(api.put).toHaveBeenCalledWith('/jobs/8', { priority: 'high' });
    expect(await screen.findByRole('button', { name: /change priority/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /edit priority/i })).not.toBeInTheDocument();
  });

  it('lets office create an invoice when the job has none (requirement 11.1)', async () => {
    const user = userEvent.setup();
    let invoiced = false;
    api.get.mockImplementation(async (path) => {
      if (path === '/jobs/checklist-templates') {
        return { templates: [{ id: 'generic', label: 'Generic', items: ['PPE on'] }] };
      }
      if (String(path).startsWith('/jobs/availability')) {
        return { holidays: [], bookings: [] };
      }
      return {
        job: {
          ...JOB,
          material_lines: [],
          checklist_items: [],
          files: [],
          notes: '',
          variations: [],
          invoice_id: invoiced ? 55 : null,
          invoice_ref: invoiced ? 'INV-2026-0001' : null,
        },
        messages: [],
      };
    });
    api.post.mockResolvedValue({ id: 55, ref: 'INV-2026-0001' });
    renderJob(<JobModal jobId={8} onClose={() => {}} onChanged={() => {}} staff={STAFF} />);
    expect(await screen.findByRole('button', { name: /create invoice/i })).toBeInTheDocument();
    invoiced = true;
    await user.click(screen.getByRole('button', { name: /create invoice/i }));
    expect(api.post).toHaveBeenCalledWith('/invoices', { job_id: 8 });
    expect(await screen.findByText(/Invoice INV-2026-0001 created/i)).toBeInTheDocument();
    expect(screen.getByText(/Invoice INV-2026-0001 already exists for this job/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /create invoice/i })).toBeNull();
  });

  it('does not offer a second Create when the job already has an invoice (requirement 11.1)', async () => {
    api.get.mockImplementation(async (path) => {
      if (path === '/jobs/checklist-templates') {
        return { templates: [{ id: 'generic', label: 'Generic', items: ['PPE on'] }] };
      }
      if (String(path).startsWith('/jobs/availability')) {
        return { holidays: [], bookings: [] };
      }
      return {
        job: {
          ...JOB,
          material_lines: [],
          checklist_items: [],
          files: [],
          notes: '',
          variations: [],
          invoice_id: 55,
          invoice_ref: 'INV-2026-0001',
        },
        messages: [],
      };
    });
    renderJob(<JobModal jobId={8} onClose={() => {}} onChanged={() => {}} staff={STAFF} />);
    expect(await screen.findByText(/Invoice INV-2026-0001 already exists for this job/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /create invoice/i })).toBeNull();
  });
});
