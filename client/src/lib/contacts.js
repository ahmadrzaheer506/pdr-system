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
