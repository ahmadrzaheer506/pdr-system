/** Toast copy after emailing an invoice (QuickBooks push is best-effort). */
export function invoiceSentMessage(result) {
  if (result?.qbo?.simulated) {
    return 'Invoice emailed. QuickBooks is not connected, so it stayed in the CRM only.';
  }
  if (result?.qbo?.qboId) return 'Invoice emailed and pushed to QuickBooks.';
  return 'Invoice emailed.';
}

export function isLiveQboId(id) {
  return !!(id && !String(id).startsWith('SIM-'));
}
