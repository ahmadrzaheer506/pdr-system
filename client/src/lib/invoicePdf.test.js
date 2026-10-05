import { describe, it, expect, vi, beforeEach } from 'vitest';
import { canEmailInvoice, downloadInvoicePdf } from './invoicePdf';
import { api } from './api';

vi.mock('./api', () => ({
  api: { post: vi.fn(), download: vi.fn() },
}));

describe('invoicePdf helpers (requirement 11.3)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('allows email on draft and sent only', () => {
    expect(canEmailInvoice('draft')).toBe(true);
    expect(canEmailInvoice('sent')).toBe(true);
    expect(canEmailInvoice('paid')).toBe(false);
    expect(canEmailInvoice('part_paid')).toBe(false);
    expect(canEmailInvoice('overdue')).toBe(false);
  });

  it('generates then downloads without sending', async () => {
    api.post.mockResolvedValue({ pdf: 'inv.pdf' });
    api.download.mockResolvedValue();
    await downloadInvoicePdf({ id: 12, ref: 'INV-2026-0010' });
    expect(api.post).toHaveBeenCalledWith('/invoices/12/pdf');
    expect(api.download).toHaveBeenCalledWith('/files/inv.pdf?download=1', 'INV-2026-0010.pdf');
    expect(api.post).not.toHaveBeenCalledWith('/invoices/12/send');
  });
});
