/**
 * Shared HTML shell for every outbound CRM email.
 * Callers supply inner copy only; header (logo), brand colours, and footer stay the same.
 */
const BRAND_RED = '#dc1114';
const BRAND_NAVY = '#0f172a';
const LOGO_CID = 'pdr-logo';

const DEFAULT_COMPANY = Object.freeze({
  name: 'Paul Douglas Roofing and Building Ltd',
  address: 'Unit 4, Trade Park, Roofers Lane',
  city: 'United Kingdom',
  phone: '01234 567890',
  email: 'office@pauldouglasroofing.co.uk',
  vat_number: 'GB 000 0000 00',
});

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function firstHttpUrl(text) {
  const match = String(text || '').match(/https?:\/\/[^\s<>"']+/i);
  return match ? match[0] : null;
}

function linkify(escaped) {
  return escaped.replace(/(https?:\/\/[^\s<&]+)/gi, (url) => (
    `<a href="${url}" style="color:${BRAND_RED};word-break:break-all;text-decoration:underline;">${url}</a>`
  ));
}

function bodyToHtml(text) {
  const normalised = escapeHtml(text).replace(/\r\n/g, '\n').trim();
  if (!normalised) return '';
  return normalised
    .split(/\n{2,}/)
    .map((para) => `<p style="margin:0 0 14px;color:${BRAND_NAVY};font-size:15px;line-height:1.6;">${linkify(para).replace(/\n/g, '<br/>')}</p>`)
    .join('');
}

function isContentObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) && !Buffer.isBuffer(value));
}

function companyLines(company) {
  const c = { ...DEFAULT_COMPANY, ...(company || {}) };
  const line1 = [c.address, c.city].filter(Boolean).join(', ');
  const line2 = [c.phone, c.email].filter(Boolean).join(' · ');
  const vat = c.vat_number ? `VAT ${c.vat_number}` : '';
  return { name: c.name || DEFAULT_COMPANY.name, line1, line2, vat, email: c.email || '' };
}

function actionButton(url, label) {
  if (!url) return '';
  const href = escapeHtml(url);
  const text = escapeHtml(label || 'Open');
  return `
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;">
                      <tr>
                        <td align="center" bgcolor="${BRAND_RED}" style="background-color:${BRAND_RED};border-radius:8px;">
                          <a href="${href}" style="display:inline-block;padding:13px 28px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;">${text}</a>
                        </td>
                      </tr>
                    </table>`;
}

function headerBlock(companyName, logoSrc) {
  const name = escapeHtml(companyName);
  const inner = logoSrc
    ? `<img src="${escapeHtml(logoSrc)}" alt="${name}" height="52" style="display:block;margin:0 auto;height:52px;max-width:220px;width:auto;border:0;outline:none;text-decoration:none;" />`
    : `<div style="font-family:Arial,Helvetica,sans-serif;font-size:18px;font-weight:bold;letter-spacing:0.04em;color:#ffffff;">${name}</div>`;
  return `
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td align="center" bgcolor="${BRAND_NAVY}" style="background-color:${BRAND_NAVY};padding:22px 28px;">
                          ${inner}
                        </td>
                      </tr>
                      <tr>
                        <td height="4" bgcolor="${BRAND_RED}" style="background-color:${BRAND_RED};font-size:0;line-height:0;">&nbsp;</td>
                      </tr>
                    </table>`;
}

function footerBlock(company) {
  const { name, line1, line2, vat } = companyLines(company);
  const bits = [escapeHtml(line1), escapeHtml(line2), escapeHtml(vat)].filter(Boolean);
  return `
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td align="center" style="padding:22px 28px;background-color:#f8fafc;border-top:1px solid #e2e8f0;font-family:Arial,Helvetica,sans-serif;color:#64748b;font-size:12px;line-height:1.55;">
                          <div style="font-weight:bold;color:${BRAND_NAVY};font-size:13px;margin-bottom:6px;">${escapeHtml(name)}</div>
                          ${bits.map((b) => `<div>${b}</div>`).join('')}
                          <div style="margin-top:12px;color:#94a3b8;">This email was sent by ${escapeHtml(name)}. If you were not expecting it, you can ignore it.</div>
                        </td>
                      </tr>
                    </table>`;
}

function normaliseContent(subject, payload) {
  if (isContentObject(payload)) {
    const body = payload.body != null ? String(payload.body) : String(payload.text || '');
    const greeting = payload.greeting ? String(payload.greeting) : '';
    const actionUrl = payload.actionUrl || null;
    const note = payload.note ? String(payload.note) : '';
    const textParts = [greeting, body, actionUrl, note].filter(Boolean);
    return {
      title: payload.title || subject,
      greeting,
      bodyHtml: payload.html || bodyToHtml(body),
      bodyText: payload.text || textParts.join('\n\n'),
      actionUrl,
      actionLabel: payload.actionLabel || (actionUrl ? 'Open' : null),
      note,
    };
  }

  const text = String(payload == null ? '' : payload);
  const resetUrl = /reset-password/i.test(text) ? firstHttpUrl(text) : null;
  return {
    title: subject,
    greeting: '',
    bodyHtml: bodyToHtml(text),
    bodyText: text,
    actionUrl: resetUrl,
    actionLabel: resetUrl ? 'Reset password' : null,
    note: '',
  };
}

/**
 * @param {{ subject: string, payload: string|object, company?: object, logoSrc?: string|null }} opts
 * @returns {{ html: string, text: string }}
 */
function renderBrandedEmail({ subject, payload, company, logoSrc }) {
  const content = normaliseContent(subject, payload);
  const co = { ...DEFAULT_COMPANY, ...(company || {}) };
  const { name } = companyLines(co);
  const greetingHtml = content.greeting
    ? `<p style="margin:0 0 16px;color:${BRAND_NAVY};font-size:15px;line-height:1.6;">${escapeHtml(content.greeting)}</p>`
    : '';
  const titleHtml = content.title
    ? `<h1 style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:1.3;color:${BRAND_NAVY};font-weight:bold;">${escapeHtml(content.title)}</h1>`
    : '';
  const noteHtml = content.note
    ? `<p style="margin:8px 0 0;color:#64748b;font-size:13px;line-height:1.55;">${escapeHtml(content.note)}</p>`
    : '';
  const preheader = String(content.bodyText || content.title || '').replace(/\s+/g, ' ').trim().slice(0, 90);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta http-equiv="x-ua-compatible" content="ie=edge" />
  <title>${escapeHtml(subject || name)}</title>
</head>
<body style="margin:0;padding:0;background-color:#eef2f7;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${escapeHtml(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#eef2f7;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background-color:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
          <tr>
            <td>
              ${headerBlock(name, logoSrc)}
            </td>
          </tr>
          <tr>
            <td style="padding:32px 28px 12px;font-family:Arial,Helvetica,sans-serif;">
              ${titleHtml}
              ${greetingHtml}
              ${content.bodyHtml}
              ${actionButton(content.actionUrl, content.actionLabel)}
              ${noteHtml}
            </td>
          </tr>
          <tr>
            <td>
              ${footerBlock(co)}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const footerText = [
    name,
    [co.address, co.city].filter(Boolean).join(', '),
    [co.phone, co.email].filter(Boolean).join(' · '),
  ].filter(Boolean).join('\n');

  const textParts = [content.bodyText];
  if (content.actionUrl && !String(content.bodyText || '').includes(content.actionUrl)) {
    textParts.push(content.actionUrl);
  }
  textParts.push('', '—', footerText);
  const text = textParts.join('\n').replace(/\n{3,}/g, '\n\n').trim();

  return { html, text };
}

module.exports = {
  BRAND_RED,
  BRAND_NAVY,
  LOGO_CID,
  DEFAULT_COMPANY,
  escapeHtml,
  firstHttpUrl,
  isContentObject,
  normaliseContent,
  renderBrandedEmail,
};
