import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TemplateSettings from './TemplateSettings.jsx';
import { api } from '../lib/api';

vi.mock('../lib/api', () => ({
  api: { get: vi.fn(), put: vi.fn() },
}));

const SETTINGS = {
  settings: {
    templates: {
      quote_sent_whatsapp: 'Hi {name}',
      quote_email_subject: 'Quote {ref}',
      quote_email_body: 'Body',
      invoice_email_subject: 'Inv {ref}',
      invoice_email_body: 'Inv body',
      custom: [],
    },
    checklist_templates: [
      { id: 'generic', label: 'Generic', items: ['PPE on', 'Photos'] },
      { id: 'felt', label: 'Felt / flat roof', items: ['Prime'] },
    ],
  },
};

describe('TemplateSettings (requirement 17.2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.get.mockResolvedValue(SETTINGS);
    api.put.mockResolvedValue({ ok: true });
  });

  it('lets an admin add a named template and delete a checklist seed', async () => {
    const user = userEvent.setup({ delay: null });
    render(<TemplateSettings canEdit />);
    expect(await screen.findByLabelText(/quote sent \(whatsapp\)/i)).toHaveValue('Hi {name}');
    await user.type(screen.getByLabelText(/new template key/i), 'site_visit_confirm');
    fireEvent.change(screen.getByLabelText(/new template body/i), {
      target: { value: 'See you tomorrow {name}' },
    });
    await user.click(screen.getByRole('button', { name: /add named template/i }));
    await user.click(screen.getAllByRole('button', { name: /delete template/i })[0]);
    await user.click(screen.getByRole('button', { name: /save templates/i }));
    expect(api.put).toHaveBeenCalledWith('/settings', expect.objectContaining({
      templates: expect.objectContaining({
        custom: [expect.objectContaining({ key: 'site_visit_confirm', body: 'See you tomorrow {name}' })],
      }),
      checklist_templates: [expect.objectContaining({ id: 'felt' })],
    }));
  });

  it('hides save from office users and still shows templates', async () => {
    render(<TemplateSettings canEdit={false} />);
    expect(await screen.findByLabelText(/quote sent \(whatsapp\)/i)).toBeDisabled();
    expect(screen.queryByRole('button', { name: /save templates/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /add named template/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /add checklist template/i })).toBeNull();
  });

  it('does not show legacy follow-up templates', async () => {
    render(<TemplateSettings canEdit />);
    expect(await screen.findByLabelText(/quote sent \(whatsapp\)/i)).toBeInTheDocument();
    expect(screen.queryByText(/legacy follow-ups/i)).toBeNull();
    expect(screen.queryByLabelText(/legacy follow-up 1/i)).toBeNull();
    expect(screen.queryByLabelText(/legacy follow-up email subject/i)).toBeNull();
  });

  it('lets an admin add a job checklist template', async () => {
    const user = userEvent.setup({ delay: null });
    render(<TemplateSettings canEdit />);
    expect(await screen.findByLabelText(/new checklist label/i)).toBeInTheDocument();
    await user.type(screen.getByLabelText(/new checklist label/i), 'Chimney');
    fireEvent.change(screen.getByLabelText(/new checklist items/i), {
      target: { value: 'Scaffold check\nProtect garden' },
    });
    await user.click(screen.getByRole('button', { name: /add checklist template/i }));
    expect(await screen.findByDisplayValue('Chimney')).toBeInTheDocument();
    expect(screen.getByText('chimney')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /save templates/i }));
    expect(api.put).toHaveBeenCalledWith('/settings', expect.objectContaining({
      checklist_templates: expect.arrayContaining([
        expect.objectContaining({
          id: 'chimney',
          label: 'Chimney',
          items: ['Scaffold check', 'Protect garden'],
        }),
      ]),
    }));
  });
});
