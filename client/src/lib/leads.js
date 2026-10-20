/** Inbox / lead-card source labels (requirement 3.1). */
export const LEAD_SOURCE_LABELS = {
  whatsapp: 'WhatsApp',
  facebook: 'Facebook',
  facebook_lead: 'Facebook Lead',
  email: 'Email',
  phone: 'Phone',
  sms: 'SMS',
  manual: 'Manual',
  website: 'Website',
};

export function leadSourceLabel(source) {
  return LEAD_SOURCE_LABELS[source] || String(source || '').replace(/_/g, ' ');
}

function enquiryExternalRef(lead) {
  const fromMeta = lead?.meta && typeof lead.meta === 'object' ? lead.meta.external_ref : '';
  return String(fromMeta || lead?.external_ref || '').trim();
}

/**
 * Inbox / pipeline / workspace title: L-0001 - Customer name (like Q- / INV-).
 * Website enquiries also show the landing-page ENQ- ref when present.
 */
export function leadDisplayName(lead) {
  const name = String(lead?.customer_name || lead?.name || '').trim() || 'Unknown';
  const ref = String(lead?.ref || '').trim();
  const enquiry = enquiryExternalRef(lead);
  const title = ref ? `${ref} - ${name}` : name;
  return enquiry ? `${title} · ${enquiry}` : title;
}
