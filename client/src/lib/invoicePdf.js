import { api } from './api';

/** Draft and sent invoices can be emailed (requirement 11.3). */
export function canEmailInvoice(status) {
  return status === 'draft' || status === 'sent';
}

/**
 * Generate or regenerate the branded invoice PDF and download it. Does not send.
 * @param {{ id: number, ref: string }} inv
 */
export async function downloadInvoicePdf(inv) {
  const { pdf } = await api.post(`/invoices/${inv.id}/pdf`);
  await api.download(`/files/${encodeURIComponent(pdf)}?download=1`, `${inv.ref}.pdf`);
}
