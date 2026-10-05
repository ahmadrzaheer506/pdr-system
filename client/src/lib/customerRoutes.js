/**
 * Office CRM has two customer surfaces:
 * - `/leads/:id` — enquiry / job workspace (quotes, visits, timeline)
 * - `/customers/:id` — master record (details, sites, contacts, lead list)
 */
export function customerPath(customerId) {
  return `/customers/${customerId}`;
}

export function leadPath(customerId, from, leadId) {
  const path = `/leads/${customerId}`;
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (leadId != null && leadId !== '') params.set('lead', String(leadId));
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

export function leadBackLink(from, customerId) {
  if (from === 'inbox') return { to: '/inbox', label: 'Back to inbox' };
  if (from === 'pipeline') return { to: '/pipeline', label: 'Back to pipeline' };
  if (from === 'quotes') return { to: '/quotes', label: 'Back to quotes' };
  if (from === 'tasks') return { to: '/tasks', label: 'Back to tasks' };
  if (from === 'schedule') return { to: '/schedule', label: 'Back to schedule' };
  if (from === 'invoices') return { to: '/invoices', label: 'Back to invoices' };
  return { to: customerPath(customerId), label: 'Back to customer' };
}
