// ============================================================
// PDF generation for quotations and invoices — built to UK
// construction-trade standards, not a generic "subtotal + VAT".
//
// A quotation includes, where applicable:
//   · VAT breakdown by rate (20 / 5 / 0 / exempt)
//   · Domestic Reverse Charge statutory wording (VATA 1994 s.55A)
//   · CIS deduction shown against the labour element only
//   · Labour / materials split
//   · Staged payment schedule
//   · Retention
//   · What's included / excluded / provisional sums
//   · Workmanship warranty and insurance & accreditations
//   · The 14-day cancellation notice required by the Consumer
//     Contracts Regulations 2013 for contracts agreed at the
//     customer's home, plus the statutory cancellation form.
// ============================================================
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { DATA_DIR, getSetting, money, pj } = require('../db');
const ukTax = require('./ukTax');

const NAVY = '#1e293b';
const ORANGE = '#ea580c';
const GREY = '#64748b';
const LIGHT = '#f1f5f9';
const RULE = '#cbd5e1';

const M = 50;               // page margin
const CONTENT_W = 495;      // A4 width (595) minus margins
const BOTTOM = 780;         // start a new page beyond this y

function gbp(n) {
  return `£${Number(n || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Ensure there's room for `needed` points; start a new page if not. */
function ensureSpace(doc, y, needed) {
  if (y + needed > BOTTOM) {
    doc.addPage();
    return M;
  }
  return y;
}

function sectionHeading(doc, y, text) {
  y = ensureSpace(doc, y, 40);
  doc.font('Helvetica-Bold').fontSize(10).fill(NAVY).text(text.toUpperCase(), M, y);
  y += 14;
  doc.moveTo(M, y).lineTo(M + CONTENT_W, y).strokeColor(RULE).lineWidth(0.5).stroke();
  return y + 10;
}

function paragraph(doc, y, text, opts = {}) {
  const size = opts.size || 9;
  const width = opts.width || CONTENT_W;
  doc.font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(size).fill(opts.color || '#334155');
  const h = doc.heightOfString(text, { width });
  y = ensureSpace(doc, y, h + 6);
  doc.text(text, M, y, { width });
  return y + h + (opts.gap !== undefined ? opts.gap : 8);
}

function bulletList(doc, y, text) {
  const lines = String(text).split('\n').map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    const clean = line.replace(/^[-•·*]\s*/, '');
    const h = doc.font('Helvetica').fontSize(9).heightOfString(clean, { width: CONTENT_W - 14 });
    y = ensureSpace(doc, y, h + 4);
    doc.fill('#334155').text('•', M + 2, y);
    doc.text(clean, M + 14, y, { width: CONTENT_W - 14 });
    y += h + 4;
  }
  return y + 4;
}

// ---------- header / party blocks ----------

function docHeader(doc, company, kindLabel, ref) {
  const nameW = 330;
  // Shrink the company name until it fits on one line, so a long trading
  // name can never overlap the address block beneath it.
  let nameSize = 19;
  doc.font('Helvetica-Bold');
  while (nameSize > 12 && doc.fontSize(nameSize).widthOfString(company.name) > nameW) nameSize -= 0.5;
  const nameH = doc.fontSize(nameSize).heightOfString(company.name, { width: nameW });

  const detailLines = [
    `${company.address}${company.city ? `, ${company.city}` : ''}`,
    `${company.phone}  ·  ${company.email}`,
    [company.vat_number ? `VAT Reg: ${company.vat_number}` : null,
     company.company_number ? `Co. No: ${company.company_number}` : null].filter(Boolean).join('   '),
  ].filter(Boolean);

  const top = 26;
  const bandH = Math.max(112, top + nameH + 6 + detailLines.length * 12 + 14);
  doc.rect(0, 0, doc.page.width, bandH).fill(NAVY);

  doc.fill('#ffffff').font('Helvetica-Bold').fontSize(nameSize).text(company.name, M, top, { width: nameW });
  let dy = top + nameH + 6;
  doc.font('Helvetica').fontSize(8.5).fill('#cbd5e1');
  for (const line of detailLines) {
    doc.text(line, M, dy, { width: nameW });
    dy += 12;
  }

  doc.font('Helvetica-Bold').fontSize(23).fill(ORANGE)
    .text(kindLabel.toUpperCase(), 0, top + 6, { align: 'right', width: doc.page.width - M });
  doc.font('Helvetica').fontSize(11).fill('#e2e8f0')
    .text(ref, 0, top + 36, { align: 'right', width: doc.page.width - M });
  doc.fill('#000000');
  return bandH;
}

function partyBlock(doc, customer, rightRows, startY = 138) {
  const y = startY;
  doc.font('Helvetica-Bold').fontSize(8).fill(GREY).text('PREPARED FOR', M, y);
  doc.font('Helvetica-Bold').fontSize(12).fill('#0f172a')
    .text(customer.company_name || customer.name, M, y + 13, { width: 260 });
  doc.font('Helvetica').fontSize(9).fill('#334155');
  let cy = y + 30;
  const lines = [
    customer.company_name ? customer.name : null,
    customer.address, customer.postcode, customer.phone, customer.email,
    customer.vat_number ? `VAT Reg: ${customer.vat_number}` : null,
  ].filter(Boolean);
  for (const line of lines) {
    doc.text(line, M, cy, { width: 260 });
    cy += 12;
  }
  let ry = y;
  for (const [label, value] of rightRows) {
    doc.font('Helvetica-Bold').fontSize(8).fill(GREY).text(label, 350, ry, { width: 100 });
    doc.font('Helvetica').fontSize(9.5).fill('#0f172a').text(String(value), 440, ry - 1, { width: 105, align: 'right' });
    ry += 16;
  }
  return Math.max(cy, ry) + 16;
}

// ---------- line items ----------

const VAT_TAG = { standard: '20%', reduced: '5%', zero: '0%', exempt: 'Exempt' };

function itemsTable(doc, y, lines, { showVatColumn, showKind }) {
  y = ensureSpace(doc, y, 60);
  const colDesc = M + 8;
  const wDesc = showVatColumn ? 250 : 285;
  const xQty = M + 8 + wDesc + 6;
  const xUnit = xQty + 42;
  const xVat = xUnit + 74;
  const xTotal = showVatColumn ? xVat + 44 : xUnit + 74;

  doc.rect(M, y, CONTENT_W, 20).fill(NAVY);
  doc.fill('#ffffff').font('Helvetica-Bold').fontSize(8);
  doc.text('DESCRIPTION', colDesc, y + 6.5, { width: wDesc });
  doc.text('QTY', xQty, y + 6.5, { width: 36, align: 'right' });
  doc.text('UNIT £', xUnit, y + 6.5, { width: 68, align: 'right' });
  if (showVatColumn) doc.text('VAT', xVat, y + 6.5, { width: 38, align: 'right' });
  doc.text('TOTAL £', xTotal, y + 6.5, { width: 63, align: 'right' });
  y += 20;

  lines.forEach((it, i) => {
    doc.font('Helvetica').fontSize(9);
    const descH = doc.heightOfString(it.description || '', { width: wDesc });
    const kindLabel = showKind && it.kind && it.kind !== 'both'
      ? (it.kind === 'labour' ? 'Labour' : 'Materials') : null;
    const rowH = Math.max(20, descH + (kindLabel ? 20 : 10));

    y = ensureSpace(doc, y, rowH);
    if (i % 2 === 1) doc.rect(M, y, CONTENT_W, rowH).fill(LIGHT);

    doc.fill('#0f172a').font('Helvetica').fontSize(9)
      .text(it.description || '', colDesc, y + 5, { width: wDesc });
    if (kindLabel) {
      doc.font('Helvetica').fontSize(7.5).fill(GREY)
        .text(kindLabel, colDesc, y + 5 + descH + 1, { width: wDesc });
    }
    doc.font('Helvetica').fontSize(9).fill('#0f172a')
      .text(String(it.qty), xQty, y + 5, { width: 36, align: 'right' })
      .text(Number(it.unit_price).toLocaleString('en-GB', { minimumFractionDigits: 2 }), xUnit, y + 5, { width: 68, align: 'right' });
    if (showVatColumn) {
      doc.fontSize(8).fill(GREY).text(VAT_TAG[it.vat_code] || '20%', xVat, y + 5.5, { width: 38, align: 'right' });
    }
    doc.fontSize(9).fill('#0f172a')
      .text(Number(it.net).toLocaleString('en-GB', { minimumFractionDigits: 2 }), xTotal, y + 5, { width: 63, align: 'right' });
    y += rowH;
  });

  doc.moveTo(M, y).lineTo(M + CONTENT_W, y).strokeColor(RULE).lineWidth(0.5).stroke();
  return y + 10;
}

// ---------- totals ----------

function totalsBlock(doc, y, calc, opts = {}) {
  const rows = [];
  rows.push(['Subtotal (excluding VAT)', gbp(calc.subtotal)]);

  if (calc.labour_total > 0 && calc.materials_total > 0 && opts.showSplit) {
    rows.push([`  of which labour`, gbp(calc.labour_total)]);
    rows.push([`  of which materials`, gbp(calc.materials_total)]);
  }

  if (calc.vat_treatment === 'standard') {
    for (const g of calc.vat_breakdown) {
      if (g.net <= 0) continue;
      rows.push([`VAT ${g.rate}% on ${gbp(g.net)}`, gbp(g.vat)]);
    }
  } else if (calc.vat_treatment === 'reverse_charge') {
    rows.push(['VAT — reverse charge (see note)', gbp(0)]);
  } else {
    rows.push(['VAT — not registered', gbp(0)]);
  }

  const boxH = rows.length * 15 + 34 +
    (calc.cis_deduction > 0 ? 15 : 0) + (calc.retention_amount > 0 ? 15 : 0) +
    ((calc.cis_deduction > 0 || calc.retention_amount > 0) ? 26 : 0);
  y = ensureSpace(doc, y, boxH + 10);

  const boxX = M + CONTENT_W - 250;
  for (const [label, value] of rows) {
    doc.font('Helvetica').fontSize(9).fill(GREY).text(label, boxX, y, { width: 165 });
    doc.fill('#0f172a').text(value, boxX + 165, y, { width: 85, align: 'right' });
    y += 15;
  }

  // Headline total
  doc.rect(boxX, y + 2, 250, 26).fill(ORANGE);
  doc.font('Helvetica-Bold').fontSize(11).fill('#ffffff')
    .text(opts.totalLabel || 'TOTAL', boxX + 10, y + 9.5, { width: 120 })
    .text(gbp(calc.total), boxX + 130, y + 9.5, { width: 110, align: 'right' });
  y += 34;

  // Deductions after the headline
  if (calc.cis_deduction > 0) {
    doc.font('Helvetica').fontSize(9).fill('#b91c1c')
      .text(`Less CIS deduction @ ${calc.cis_rate}% (labour only)`, boxX, y, { width: 165 })
      .text(`-${gbp(calc.cis_deduction)}`, boxX + 165, y, { width: 85, align: 'right' });
    y += 15;
  }
  if (calc.retention_amount > 0) {
    doc.font('Helvetica').fontSize(9).fill('#b91c1c')
      .text(`Less retention @ ${calc.retention_percent}%`, boxX, y, { width: 165 })
      .text(`-${gbp(calc.retention_amount)}`, boxX + 165, y, { width: 85, align: 'right' });
    y += 15;
  }
  if (calc.cis_deduction > 0 || calc.retention_amount > 0) {
    doc.moveTo(boxX, y + 2).lineTo(boxX + 250, y + 2).strokeColor(RULE).stroke();
    doc.font('Helvetica-Bold').fontSize(10.5).fill(NAVY)
      .text('Payable now', boxX, y + 8, { width: 165 })
      .text(gbp(calc.due_now), boxX + 165, y + 8, { width: 85, align: 'right' });
    y += 26;
  }
  return y + 12;
}

// ---------- rebuild calc from a stored record ----------

function calcFromRecord(record) {
  const items = pj(record.items, []);
  return ukTax.calculate(items, {
    vat_treatment: record.vat_treatment || 'standard',
    cis_applies: !!record.cis_applies,
    cis_rate: record.cis_rate ?? 20,
    retention_percent: record.retention_percent || 0,
    payment_schedule: pj(record.payment_schedule, []),
  });
}

// ============================================================
// QUOTATION
// ============================================================
function buildQuote(doc, quote, customer, company) {
  const calc = calcFromRecord(quote);
  const uk = getSetting('uk') || {};

  const bandH = docHeader(doc, company, 'Quotation', quote.ref);
  let y = partyBlock(doc, customer, [
    ['DATE', (quote.created_at || '').slice(0, 10)],
    ['VALID UNTIL', quote.valid_until || '—'],
    ['REFERENCE', quote.ref],
  ], bandH + 26);

  doc.font('Helvetica-Bold').fontSize(13).fill('#0f172a').text(quote.title, M, y, { width: CONTENT_W });
  y += doc.heightOfString(quote.title, { width: CONTENT_W }) + 12;

  // Scope of works
  y = sectionHeading(doc, y, 'Scope of works');
  y = itemsTable(doc, y, calc.lines, {
    showVatColumn: calc.vat_breakdown.length > 1,
    showKind: calc.cis_applies,
  });
  y = totalsBlock(doc, y, calc, { showSplit: calc.cis_applies, totalLabel: 'QUOTED TOTAL' });

  // Statutory VAT / CIS notices
  if (calc.vat_treatment === 'reverse_charge') {
    y = ensureSpace(doc, y, 50);
    doc.rect(M, y, CONTENT_W, 34).fill('#fef3c7');
    doc.font('Helvetica-Bold').fontSize(8.5).fill('#92400e').text('VAT REVERSE CHARGE APPLIES', M + 10, y + 7);
    doc.font('Helvetica').fontSize(8).fill('#78350f')
      .text(ukTax.reverseChargeNotice(calc.reverse_charge_vat), M + 10, y + 18, { width: CONTENT_W - 20 });
    y += 44;
  }
  if (calc.cis_applies && calc.cis_deduction > 0) {
    y = paragraph(doc, y, ukTax.cisNotice(calc.cis_rate, calc.labour_total, calc.cis_deduction), { size: 8, color: GREY });
  }

  // Payment schedule
  if (calc.payment_schedule.length) {
    y = sectionHeading(doc, y, 'Payment schedule');
    for (const stage of calc.payment_schedule) {
      y = ensureSpace(doc, y, 16);
      doc.font('Helvetica-Bold').fontSize(9).fill('#0f172a').text(`${stage.order}. ${stage.label}`, M, y, { width: 300 });
      doc.font('Helvetica').fontSize(9).fill('#0f172a').text(gbp(stage.amount), M + 380, y, { width: 115, align: 'right' });
      y += 12;
      if (stage.trigger) {
        doc.font('Helvetica').fontSize(8).fill(GREY).text(stage.trigger, M + 12, y, { width: 360 });
        y += doc.heightOfString(stage.trigger, { width: 360 }) + 4;
      }
    }
    y += 6;
  }

  // What's included / excluded
  if (quote.inclusions) {
    y = sectionHeading(doc, y, 'What is included');
    y = bulletList(doc, y, quote.inclusions);
  }
  if (quote.exclusions) {
    y = sectionHeading(doc, y, 'What is not included');
    y = bulletList(doc, y, quote.exclusions);
  }

  const provisional = pj(quote.provisional_sums, []);
  if (provisional.length) {
    y = sectionHeading(doc, y, 'Provisional sums');
    y = paragraph(doc, y, 'These are estimates for work that cannot be fully priced until opened up. They will be confirmed with you in writing before the work proceeds, and only charged if required.', { size: 8, color: GREY });
    for (const ps of provisional) {
      y = ensureSpace(doc, y, 14);
      doc.font('Helvetica').fontSize(9).fill('#0f172a').text(`• ${ps.description}`, M + 2, y, { width: 380 });
      doc.text(gbp(ps.amount), M + 380, y, { width: 115, align: 'right' });
      y += 14;
    }
    y += 4;
  }

  // Timing & access
  if (quote.lead_time || quote.duration_estimate || quote.access_requirements) {
    y = sectionHeading(doc, y, 'Timing and access');
    if (quote.lead_time) y = paragraph(doc, y, `Lead time: ${quote.lead_time}`, { gap: 4 });
    if (quote.duration_estimate) y = paragraph(doc, y, `Estimated duration on site: ${quote.duration_estimate}`, { gap: 4 });
    if (quote.access_requirements) y = paragraph(doc, y, `Access required: ${quote.access_requirements}`, { gap: 4 });
    y += 4;
  }

  // Warranty & insurance
  y = sectionHeading(doc, y, 'Guarantee and insurance');
  if (quote.warranty_text) {
    const text = String(quote.warranty_text).replace('{years}', quote.warranty_years || 10);
    y = paragraph(doc, y, text, { gap: 4 });
  }
  const insLines = [];
  if (company.public_liability_insurer) {
    insLines.push(`Public liability insurance: ${company.public_liability_insurer}${company.public_liability_cover ? ` — ${company.public_liability_cover} cover` : ''}.`);
  }
  const accreds = Array.isArray(company.accreditations) ? company.accreditations.filter(Boolean) : [];
  if (accreds.length) insLines.push(`Accreditations: ${accreds.join(', ')}.`);
  insLines.push('All works carried out in accordance with current British Standards and Building Regulations where applicable.');
  y = paragraph(doc, y, insLines.join(' '), { size: 8.5, color: GREY });

  // Notes
  if (quote.notes) {
    y = sectionHeading(doc, y, 'Additional notes');
    y = paragraph(doc, y, quote.notes);
  }

  // Terms
  y = sectionHeading(doc, y, 'Terms');
  const terms = [
    `This quotation is valid until ${quote.valid_until || 'the date shown above'} and is based on the scope described. Any change to that scope will be quoted separately and agreed in writing before proceeding.`,
    'Acceptance may be given by reply to the message this quotation was sent with, by email, or in writing.',
  ];
  if (customer.customer_type === 'commercial' && (uk.late_payment_interest !== false)) {
    terms.push(ukTax.latePaymentNotice(uk.late_payment_rate_above_base || 8));
  }
  y = paragraph(doc, y, terms.join('\n\n'), { size: 8.5, color: GREY });

  // Bank details
  if (company.bank_account_number) {
    y = paragraph(doc, y,
      `Payment by bank transfer to ${company.bank_account_name || company.name}, sort code ${company.bank_sort_code}, account ${company.bank_account_number}${company.bank_name ? ` (${company.bank_name})` : ''}, quoting reference ${quote.ref}.`,
      { size: 8.5, color: GREY });
  }

  // ---- Consumer cancellation rights (legally required for domestic) ----
  if (quote.cancellation_rights_apply) {
    doc.addPage();
    let cy = M;
    const notice = ukTax.cancellationNotice(company.name, company.address, company.email, company.phone);

    doc.rect(M, cy, CONTENT_W, 24).fill(NAVY);
    doc.font('Helvetica-Bold').fontSize(11).fill('#ffffff').text(notice.heading.toUpperCase(), M + 10, cy + 7);
    cy += 34;

    cy = paragraph(doc, cy, 'This notice is given to you under the Consumer Contracts (Information, Cancellation and Additional Charges) Regulations 2013.', { size: 8, color: GREY });
    for (const para of notice.body) cy = paragraph(doc, cy, para, { size: 9, gap: 8 });

    if (quote.waiver_signed) {
      cy = ensureSpace(doc, cy, 46);
      doc.rect(M, cy, CONTENT_W, 40).fill('#fef3c7');
      doc.font('Helvetica-Bold').fontSize(8.5).fill('#92400e').text('EARLY START REQUESTED', M + 10, cy + 7);
      doc.font('Helvetica').fontSize(8).fill('#78350f').text(
        'You have asked us to begin work before the 14-day cancellation period ends. You keep your right to cancel, but if you do cancel after work has begun you must pay for what has already been carried out.',
        M + 10, cy + 18, { width: CONTENT_W - 20 }
      );
      cy += 50;
    }

    // Statutory model cancellation form
    cy = sectionHeading(doc, cy, 'Model cancellation form');
    cy = paragraph(doc, cy, '(Complete and return this form only if you wish to withdraw from the contract.)', { size: 8, color: GREY });
    const form = [
      `To: ${company.name}, ${company.address}${company.email ? `, ${company.email}` : ''}`,
      '',
      'I/We hereby give notice that I/We cancel my/our contract for the supply of the following service:',
      '',
      `Quotation reference: ${quote.ref}`,
      `Description: ${quote.title}`,
      '',
      'Ordered on / received on: ......................................................',
      'Name of consumer(s): ..........................................................',
      'Address of consumer(s): .......................................................',
      '                        .......................................................',
      'Signature of consumer(s): ..................................  (only if this form is notified on paper)',
      'Date: ...............................',
    ].join('\n');
    doc.font('Helvetica').fontSize(9).fill('#334155');
    const fh = doc.heightOfString(form, { width: CONTENT_W - 20, lineGap: 3 });
    cy = ensureSpace(doc, cy, fh + 20);
    doc.rect(M, cy, CONTENT_W, fh + 16).strokeColor(RULE).lineWidth(0.5).stroke();
    doc.text(form, M + 10, cy + 8, { width: CONTENT_W - 20, lineGap: 3 });
  }
}

// ============================================================
// INVOICE
// ============================================================
function buildInvoice(doc, invoice, customer, company) {
  const calc = calcFromRecord(invoice);
  const uk = getSetting('uk') || {};

  const bandH = docHeader(doc, company, 'Invoice', invoice.ref);
  let y = partyBlock(doc, customer, [
    ['ISSUE DATE', invoice.issue_date || '—'],
    ['DUE DATE', invoice.due_date || '—'],
    ['REFERENCE', invoice.ref],
  ], bandH + 26);

  y = itemsTable(doc, y, calc.lines, {
    showVatColumn: calc.vat_breakdown.length > 1,
    showKind: calc.cis_applies,
  });
  y = totalsBlock(doc, y, calc, { showSplit: calc.cis_applies, totalLabel: 'INVOICE TOTAL' });

  if (Number(invoice.amount_paid) > 0) {
    doc.font('Helvetica').fontSize(9).fill('#059669')
      .text(`Received to date: ${gbp(invoice.amount_paid)}`, M + CONTENT_W - 250, y, { width: 250, align: 'right' });
    y += 14;
    doc.font('Helvetica-Bold').fontSize(10).fill(NAVY)
      .text(`Balance outstanding: ${gbp(calc.due_now - Number(invoice.amount_paid))}`, M + CONTENT_W - 250, y, { width: 250, align: 'right' });
    y += 20;
  }

  if (calc.vat_treatment === 'reverse_charge') {
    y = ensureSpace(doc, y, 50);
    doc.rect(M, y, CONTENT_W, 34).fill('#fef3c7');
    doc.font('Helvetica-Bold').fontSize(8.5).fill('#92400e').text('VAT REVERSE CHARGE APPLIES', M + 10, y + 7);
    doc.font('Helvetica').fontSize(8).fill('#78350f')
      .text(ukTax.reverseChargeNotice(calc.reverse_charge_vat), M + 10, y + 18, { width: CONTENT_W - 20 });
    y += 44;
  }
  if (calc.cis_applies && calc.cis_deduction > 0) {
    y = paragraph(doc, y, ukTax.cisNotice(calc.cis_rate, calc.labour_total, calc.cis_deduction), { size: 8, color: GREY });
  }

  y = sectionHeading(doc, y, 'Payment');
  const pay = [];
  if (company.bank_account_number) {
    pay.push(`Please pay by bank transfer to ${company.bank_account_name || company.name}, sort code ${company.bank_sort_code}, account ${company.bank_account_number}${company.bank_name ? ` (${company.bank_name})` : ''}.`);
  }
  pay.push(`Please quote reference ${invoice.ref} with your payment. Payment is due by ${invoice.due_date || 'the date shown above'}.`);
  if (customer.customer_type === 'commercial' && uk.late_payment_interest !== false) {
    pay.push(ukTax.latePaymentNotice(uk.late_payment_rate_above_base || 8));
  }
  y = paragraph(doc, y, pay.join(' '), { size: 9 });

  if (invoice.notes) {
    y = sectionHeading(doc, y, 'Notes');
    y = paragraph(doc, y, invoice.notes);
  }
}

// ---------- entry points ----------

function generate(kind, record, customer) {
  const company = getSetting('company');
  const filename = `${kind}-${record.ref}.pdf`;
  const filePath = path.join(DATA_DIR, 'files', filename);

  const doc = new PDFDocument({ size: 'A4', margin: M, bufferPages: true });
  const stream = fs.createWriteStream(filePath);
  doc.pipe(stream);

  if (kind === 'quote') buildQuote(doc, record, customer, company);
  else buildInvoice(doc, record, customer, company);

  // Page numbers + footer on every page.
  // The bottom margin must be dropped first: writing below it makes pdfkit
  // auto-insert a fresh page, which is how blank trailing pages appear.
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    const saved = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.font('Helvetica').fontSize(7.5).fill('#94a3b8')
      .text(
        `${company.name}  ·  ${record.ref}  ·  Page ${i + 1} of ${range.count}`,
        M, doc.page.height - 34, { width: CONTENT_W, align: 'center', lineBreak: false }
      );
    doc.page.margins.bottom = saved;
  }

  doc.end();
  return filename;
}

const quotePdf = (quote, customer) => generate('quote', quote, customer);
const invoicePdf = (invoice, customer) => generate('invoice', invoice, customer);

module.exports = { quotePdf, invoicePdf, calcFromRecord };
