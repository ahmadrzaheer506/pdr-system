export const PHONE_TYPES = [
  { value: 'mobile', label: 'Mobile' },
  { value: 'landline', label: 'Landline' },
  { value: 'work', label: 'Work' },
];

export const EMAIL_TYPES = [
  { value: 'personal', label: 'Personal' },
  { value: 'work', label: 'Work' },
];

export function formatSite(site) {
  if (!site) return '';
  return [site.address, site.postcode].filter(Boolean).join(', ');
}

export function primaryOf(list) {
  if (!Array.isArray(list) || !list.length) return null;
  return list.find((row) => row.is_primary) || list[0];
}

/** Ids of the customer's primary site, phone and email (empty string when missing). */
export function primaryContactIds(customer) {
  return {
    site_id: primaryOf(customer?.sites)?.id || '',
    phone_id: primaryOf(customer?.phones)?.id || '',
    email_id: primaryOf(customer?.emails)?.id || '',
  };
}

export function findContact(list, id) {
  if (id == null || id === '' || !Array.isArray(list)) return null;
  const n = Number(id);
  return list.find((row) => row.id === id || row.id === n) || null;
}

/** One site/phone/email stored on the enquiry. */
export function contactIdsFromLead(lead) {
  const meta = lead?.meta && typeof lead.meta === 'object' ? lead.meta : {};
  const pick = (column, key) => column || meta[key] || '';
  return {
    site_id: pick(lead?.site_id, 'site_id'),
    phone_id: pick(lead?.phone_id, 'phone_id'),
    email_id: pick(lead?.email_id, 'email_id'),
  };
}

/** Auto-pick a contact only when the customer has exactly one of that type. */
export function soleContactId(list) {
  if (!Array.isArray(list) || list.length !== 1) return '';
  return list[0].id ?? '';
}

export function contactsFromSingleOptions(customer) {
  return {
    site_id: soleContactId(customer?.sites),
    phone_id: soleContactId(customer?.phones),
    email_id: soleContactId(customer?.emails),
  };
}

export function typeLabel(types, value) {
  return types.find((t) => t.value === value)?.label || value || '';
}

/** Same rule as the server: local@host.tld, and it must include @. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Email is optional. When present it must include @ and a domain.
 * @param {unknown} value
 * @returns {string} empty when valid or blank
 */
export function emailFormatError(value) {
  const email = String(value || '').trim();
  if (!email) return '';
  if (!EMAIL_RE.test(email)) return 'Enter a valid email address';
  return '';
}
