/**
 * Office view of a website enquiry: labeled job fields, not a mashed headline.
 */

const JOB_FIELDS = [
  ['service', 'Job'],
  ['property_type', 'Property type'],
  ['roof_type', 'Roof type'],
  ['urgency', 'Urgency'],
];

function text(value) {
  return value == null ? '' : String(value).trim();
}

export function extractEnquiryDetails(lead) {
  const stored = text(lead?.meta?.enquiry_message);
  if (stored) return stored;

  let raw = text(lead?.message);
  if (!raw) return '';
  raw = raw.replace(/\n+Photos:\s*\d+\s+attached\s*$/i, '').trim();
  const extraAt = raw.search(/\n(?:Preferred contact:|Best time:|Heard about us:)/);
  if (extraAt >= 0) raw = raw.slice(0, extraAt).trim();

  const labeled = raw.match(/^Details:?\s*\n([\s\S]*)$/m);
  if (labeled) return labeled[1].trim();

  const blocks = raw.split(/\n\n+/);
  if (blocks.length >= 2) return blocks.slice(1).join('\n\n').trim();

  const lines = raw.split('\n');
  if (lines[0] && lines[0].includes(' · ')) {
    lines.shift();
    const place = text(lead?.address);
    const postcode = text(lead?.postcode);
    if (lines[0] && ((postcode && lines[0].includes(postcode)) || (place && lines[0].includes(place.split(',')[0])))) {
      lines.shift();
    }
    return lines.join('\n').trim();
  }
  return '';
}

/**
 * @param {object} lead
 * @param {{ hidePlace?: boolean }} [opts] skip address/postcode when they already show in the header
 * @returns {{ rows: Array<{ label: string, value: string }>, details: string }|null}
 */
export function websiteEnquiryView(lead, opts = {}) {
  const meta = lead?.meta && typeof lead.meta === 'object' && !Array.isArray(lead.meta) ? lead.meta : {};
  const structured = Boolean(meta.service || meta.property_type || meta.roof_type || meta.urgency);
  if (lead?.source !== 'website' && lead?.channel !== 'website' && meta.channel !== 'website' && !structured) {
    return null;
  }
  if (!structured) return null;

  const rows = [];
  const websiteRef = text(meta.external_ref || lead?.external_ref);
  if (websiteRef) rows.push({ label: 'Website reference', value: websiteRef });
  for (const [key, label] of JOB_FIELDS) {
    const value = text(meta[key]);
    if (value) rows.push({ label, value });
  }
  const address = text(lead?.address);
  const postcode = text(lead?.postcode || meta.postcode);
  if (!opts.hidePlace) {
    if (address) rows.push({ label: 'Address', value: address });
    if (postcode && !address.toLowerCase().includes(postcode.toLowerCase())) {
      rows.push({ label: 'Postcode', value: postcode });
    }
  }
  const photos = Number(meta.photo_count) || (Array.isArray(meta.photo_file_ids) ? meta.photo_file_ids.length : 0);
  if (photos) rows.push({ label: 'Photos', value: `${photos} attached` });
  const contact = text(meta.contact_pref);
  if (contact) rows.push({ label: 'Preferred contact', value: contact });
  const best = text(meta.best_time);
  if (best) rows.push({ label: 'Best time', value: best });
  const heard = text(meta.heard_from);
  if (heard) rows.push({ label: 'Heard about us', value: heard });

  if (!rows.length) return null;
  return { rows, details: extractEnquiryDetails(lead) };
}
