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
