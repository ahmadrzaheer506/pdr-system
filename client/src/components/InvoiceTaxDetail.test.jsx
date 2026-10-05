import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import InvoiceTaxDetail from './InvoiceTaxDetail.jsx';
import { api } from '../lib/api';
import { pickSelectOption } from '../test/selectMenu.js';

vi.mock('../lib/api', () => ({
  api: { put: vi.fn(), post: vi.fn(), download: vi.fn() },
  money: (n) => `£${n}`,
  fmtDate: (d) => d || '',
}));

const DRAFT = {
  id: 12,
  ref: 'INV-2026-0010',
  status: 'draft',
  customer_id: 25,
  lead_id: 14,
  customer_name: 'Fiona Whitmore',
  vat_treatment: 'reverse_charge',
  vat_amount: 0,
  cis_applies: true,
  cis_rate: 20,
  cis_deduction: 109.6,
  due_now: 548,
  reverse_charge_vat: 109.6,
  reverse_charge_notice: 'Reverse charge: VAT Act 1994 Section 55A applies. Customer to pay the VAT to HMRC. VAT to be accounted for by the customer: £109.60.',
};

function renderDetail(ui) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe('InvoiceTaxDetail (requirement 11.2)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('opens the enquiry workspace for this invoice from the modal header', () => {
    renderDetail(<InvoiceTaxDetail invoice={DRAFT} from="invoices" onClose={() => {}} onSaved={() => {}} onError={() => {}} />);
    const link = screen.getByRole('link', { name: /open lead/i });
    expect(link).toHaveAttribute('href', '/leads/25?from=invoices&lead=14');
  });

  it('shows VAT, CIS, due now and the reverse-charge notice', () => {
    renderDetail(<InvoiceTaxDetail invoice={DRAFT} onClose={() => {}} onSaved={() => {}} onError={() => {}} />);
    expect(screen.getByText('Reverse charge')).toBeInTheDocument();
    expect(screen.getByText('£0')).toBeInTheDocument();
    expect(screen.getByText(/20% · £109.6/)).toBeInTheDocument();
    expect(screen.getByText('£548')).toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent(/VAT Act 1994 Section 55A/);
    expect(screen.getByRole('button', { name: /save vat & cis/i })).toBeInTheDocument();
  });

  it('saves treatment on a draft', async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    api.put.mockResolvedValue({
      invoice: { ...DRAFT, vat_treatment: 'standard', vat_amount: 109.6, reverse_charge_notice: null },
    });
    renderDetail(<InvoiceTaxDetail invoice={DRAFT} onClose={() => {}} onSaved={onSaved} onError={() => {}} />);
    await pickSelectOption(user, /vat treatment/i, 'standard');
    await user.click(screen.getByRole('button', { name: /save vat & cis/i }));
    expect(api.put).toHaveBeenCalledWith('/invoices/12/tax', {
      vat_treatment: 'standard',
      cis_applies: true,
      cis_rate: 20,
    });
    expect(onSaved).toHaveBeenCalled();
  });

  it('does not offer save when the invoice is sent', () => {
    renderDetail(
      <InvoiceTaxDetail
        invoice={{ ...DRAFT, status: 'sent' }}
        onClose={() => {}}
        onSaved={() => {}}
        onError={() => {}}
      />,
    );
    expect(screen.getByText(/frozen on sent and paid/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /save vat & cis/i })).toBeNull();
  });

  it('downloads a PDF from the drawer without sending (requirement 11.3)', async () => {
    const user = userEvent.setup();
    api.post.mockResolvedValue({ pdf: 'inv.pdf' });
    api.download.mockResolvedValue();
    renderDetail(<InvoiceTaxDetail invoice={DRAFT} onClose={() => {}} onSaved={() => {}} onError={() => {}} />);
    await user.click(screen.getByRole('button', { name: /download pdf/i }));
    expect(api.post).toHaveBeenCalledWith('/invoices/12/pdf');
    expect(api.download).toHaveBeenCalledWith('/files/inv.pdf?download=1', 'INV-2026-0010.pdf');
    expect(api.post).not.toHaveBeenCalledWith('/invoices/12/send');
  });

  it('emails from the drawer and calls onSent (requirement 11.3)', async () => {
    const user = userEvent.setup();
    const onSent = vi.fn();
    api.post.mockResolvedValue({ ok: true });
    renderDetail(
      <InvoiceTaxDetail invoice={DRAFT} onClose={() => {}} onSaved={() => {}} onError={() => {}} onSent={onSent} />,
    );
    await user.click(screen.getByRole('button', { name: /send email/i }));
    expect(api.post).toHaveBeenCalledWith('/invoices/12/send');
    expect(onSent).toHaveBeenCalled();
  });

  it('shows sending until the email request finishes', async () => {
    let resolvePost;
    api.post.mockImplementation(() => new Promise((resolve) => { resolvePost = resolve; }));
    const user = userEvent.setup();
    renderDetail(
      <InvoiceTaxDetail invoice={DRAFT} onClose={() => {}} onSaved={() => {}} onError={() => {}} />,
    );
    await user.click(screen.getByRole('button', { name: /send email/i }));
    expect(await screen.findByText('Sending…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send email/i })).toBeDisabled();
    resolvePost({ ok: true });
    await waitFor(() => expect(screen.queryByText('Sending…')).not.toBeInTheDocument());
  });

  it('offers resend on sent invoices but not paid (requirement 11.3)', () => {
    const { unmount } = renderDetail(
      <InvoiceTaxDetail invoice={{ ...DRAFT, status: 'sent' }} onClose={() => {}} onSaved={() => {}} onError={() => {}} />,
    );
    expect(screen.getByRole('button', { name: /send email/i })).toBeInTheDocument();
    unmount();
    renderDetail(
      <InvoiceTaxDetail invoice={{ ...DRAFT, status: 'paid' }} onClose={() => {}} onSaved={() => {}} onError={() => {}} />,
    );
    expect(screen.queryByRole('button', { name: /send email/i })).toBeNull();
    expect(screen.getByRole('button', { name: /download pdf/i })).toBeInTheDocument();
  });

  it('records a ledger payment from the drawer (requirement 11.4)', async () => {
    const user = userEvent.setup();
    const onPaid = vi.fn();
    api.post.mockResolvedValue({
      invoice: { ...DRAFT, status: 'part_paid', amount_paid: 200, outstanding: 348, payments: [{ id: 1, amount: 200, paid_at: '2026-09-20', note: 'BACS' }] },
    });
    renderDetail(
      <InvoiceTaxDetail
        invoice={{ ...DRAFT, status: 'sent', amount_paid: 0, outstanding: 548, payments: [] }}
        onClose={() => {}}
        onSaved={() => {}}
        onError={() => {}}
        onPaid={onPaid}
      />,
    );
    expect(screen.getByText('No payments recorded.')).toBeInTheDocument();
    await user.clear(screen.getByLabelText(/amount received/i));
    await user.type(screen.getByLabelText(/amount received/i), '200');
    await user.type(screen.getByLabelText(/note/i), 'BACS');
    await user.click(screen.getByRole('button', { name: /^record payment$/i }));
    expect(api.post).toHaveBeenCalledWith('/invoices/12/payment', expect.objectContaining({
      amount: 200,
      note: 'BACS',
    }));
    expect(onPaid).toHaveBeenCalled();
  });
});
