/** Invoice payments and balances (requirement 11.4). */

export function canRecordPayment(status) {
  return status === 'sent' || status === 'part_paid' || status === 'overdue';
}

export function invoiceOutstanding(inv) {
  const n = Math.max(0, Number(inv?.due_now || 0) - Number(inv?.amount_paid || 0));
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function todayDateInput() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
