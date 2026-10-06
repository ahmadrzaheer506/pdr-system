/** Inbox / lead-card source labels (requirement 3.1). */
export const LEAD_SOURCE_LABELS = {
  whatsapp: 'WhatsApp',
  facebook: 'Facebook',
  facebook_lead: 'Facebook Lead',
  email: 'Email',
  phone: 'Phone',
  sms: 'SMS',
  manual: 'Manual',
};

export function leadSourceLabel(source) {
  return LEAD_SOURCE_LABELS[source] || String(source || '').replace(/_/g, ' ');
}

/**
 * Inbox / pipeline / workspace title: L-0001 - Customer name (like Q- / INV-).
 */
export function leadDisplayName(lead) {
  const name = String(lead?.customer_name || lead?.name || '').trim() || 'Unknown';
  const ref = String(lead?.ref || '').trim();
  return ref ? `${ref} - ${name}` : name;
}
