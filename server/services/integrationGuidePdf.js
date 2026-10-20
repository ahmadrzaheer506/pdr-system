/**
 * Client-facing PDF of docs/integration-setup-guide.md — how to create
 * accounts and copy keys for Settings → Integrations.
 */
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const branding = require('../branding');

const NAVY = '#1e293b';
const BRAND_RED = '#dc1114';
const BODY = '#334155';
const RULE = '#cbd5e1';
const LIGHT = '#f1f5f9';
const CODE_BG = '#f8fafc';

const M = 50;
const CONTENT_W = 495;
const BOTTOM = 760;
const LOGO_ASPECT = 300 / 172;

const GUIDE_PATH = path.join(__dirname, '..', '..', 'docs', 'integration-setup-guide.md');
const DOWNLOAD_NAME = 'CRM-integration-setup-guide.pdf';

function stripInline(text) {
  return String(text || '')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => (label === url ? url : `${label} (${url})`))
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\\_/g, '_');
}

function ensureSpace(doc, y, needed) {
  if (y + needed > BOTTOM) {
    doc.addPage();
    return M + 8;
  }
  return y;
}

function splitTableRow(line) {
  const trimmed = line.trim();
  const inner = trimmed.startsWith('|') ? trimmed.slice(1) : trimmed;
  const withoutEnd = inner.endsWith('|') ? inner.slice(0, -1) : inner;
  return withoutEnd.split('|').map((cell) => stripInline(cell.trim()));
}

function isTableSep(line) {
  return splitTableRow(line).every((cell) => /^:?-{3,}:?$/.test(cell));
}

function drawHeader(doc, companyName) {
  const logoFile = branding.resolveLogoPath();
  const bandH = logoFile ? 92 : 78;
  doc.rect(0, 0, doc.page.width, bandH).fill(NAVY);
  doc.rect(0, bandH - 4, doc.page.width, 4).fill(BRAND_RED);

  if (logoFile) {
    try {
      doc.image(logoFile, M, 16, { height: 60, width: 60 * LOGO_ASPECT });
    } catch {
      doc.fill('#ffffff').font('Helvetica-Bold').fontSize(16).text(companyName, M, 22, { width: 280 });
    }
  } else {
    doc.fill('#ffffff').font('Helvetica-Bold').fontSize(16).text(companyName, M, 22, { width: 280 });
  }

  doc.fill('#ffffff').font('Helvetica-Bold').fontSize(13)
    .text('Integration setup guide', M + 250, 24, { width: CONTENT_W - 250, align: 'right' });
  doc.font('Helvetica').fontSize(8.5).fill('#cbd5e1')
    .text('Accounts, keys and Connect steps for office / owners', M + 250, 44, {
      width: CONTENT_W - 250, align: 'right',
    });

  return bandH + 22;
}

function drawFooter(doc, companyName) {
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    const saved = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.font('Helvetica').fontSize(7.5).fill('#94a3b8').text(
      `${companyName}  ·  Integration setup guide  ·  Page ${i + 1} of ${range.count}`,
      M, doc.page.height - 32,
      { width: CONTENT_W, align: 'center', lineBreak: false },
    );
    doc.page.margins.bottom = saved;
  }
}

function paragraph(doc, y, text, opts = {}) {
  const size = opts.size || 9.5;
  const width = opts.width || CONTENT_W;
  const x = opts.x || M;
  const plain = stripInline(text);
  if (!plain) return y;
  doc.font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(size).fill(opts.color || BODY);
  const h = doc.heightOfString(plain, { width });
  y = ensureSpace(doc, y, h + 6);
  doc.text(plain, x, y, { width });
  return y + h + (opts.gap != null ? opts.gap : 8);
}

function heading(doc, y, level, text) {
  const sizes = { 1: 16, 2: 13, 3: 11 };
  const size = sizes[level] || 11;
  const gapBefore = level === 1 ? 10 : 12;
  y += gapBefore;
  const title = stripInline(text);
  doc.font('Helvetica-Bold').fontSize(size);
  const h = doc.heightOfString(title, { width: CONTENT_W });
  y = ensureSpace(doc, y, h + 16);
  if (level === 1) {
    doc.fill(BRAND_RED).text(title, M, y, { width: CONTENT_W });
    y += h + 4;
    doc.moveTo(M, y).lineTo(M + CONTENT_W, y).strokeColor(BRAND_RED).lineWidth(1.5).stroke();
    return y + 12;
  }
  if (level === 2) {
    doc.fill(NAVY).text(title, M, y, { width: CONTENT_W });
    y += h + 3;
    doc.moveTo(M, y).lineTo(M + CONTENT_W, y).strokeColor(RULE).lineWidth(0.6).stroke();
    return y + 10;
  }
  doc.fill('#0f172a').text(title, M, y, { width: CONTENT_W });
  return y + h + 8;
}

function table(doc, y, rows) {
  if (!rows.length) return y;
  const cols = Math.max(...rows.map((r) => r.length));
  const colW = CONTENT_W / cols;
  rows.forEach((row, ri) => {
    const cells = [];
    let rowH = 16;
    for (let c = 0; c < cols; c++) {
      const text = row[c] || '';
      doc.font(ri === 0 ? 'Helvetica-Bold' : 'Helvetica').fontSize(8);
      const h = doc.heightOfString(text, { width: colW - 12 }) + 10;
      cells.push(text);
      rowH = Math.max(rowH, h);
    }
    y = ensureSpace(doc, y, rowH + 2);
    if (ri === 0) {
      doc.rect(M, y, CONTENT_W, rowH).fill(NAVY);
    } else if (ri % 2 === 0) {
      doc.rect(M, y, CONTENT_W, rowH).fill(LIGHT);
    }
    for (let c = 0; c < cols; c++) {
      doc.font(ri === 0 ? 'Helvetica-Bold' : 'Helvetica').fontSize(8)
        .fill(ri === 0 ? '#ffffff' : BODY)
        .text(cells[c], M + c * colW + 6, y + 5, { width: colW - 12 });
    }
    y += rowH;
  });
  return y + 10;
}

function codeBlock(doc, y, text) {
  const body = String(text || '').replace(/\s+$/, '');
  doc.font('Courier').fontSize(7.5);
  const h = doc.heightOfString(body, { width: CONTENT_W - 16 }) + 16;
  if (y + h > BOTTOM) {
    doc.addPage();
    y = M + 8;
  }
  if (y + h > BOTTOM) {
    for (const line of body.split('\n')) {
      y = paragraph(doc, y, line || ' ', { size: 7.5, gap: 2, color: '#0f172a' });
    }
    return y + 6;
  }
  doc.roundedRect(M, y, CONTENT_W, h, 4).fill(CODE_BG);
  doc.fill('#0f172a').font('Courier').fontSize(7.5).text(body, M + 8, y + 8, { width: CONTENT_W - 16 });
  return y + h + 10;
}

function listItem(doc, y, marker, text) {
  const plain = stripInline(text);
  doc.font('Helvetica').fontSize(9.5);
  const h = doc.heightOfString(plain, { width: CONTENT_W - 22 });
  y = ensureSpace(doc, y, h + 4);
  doc.font('Helvetica-Bold').fontSize(9.5).fill(NAVY).text(marker, M, y, { width: 18 });
  doc.font('Helvetica').fill(BODY).text(plain, M + 20, y, { width: CONTENT_W - 22 });
  return y + h + 5;
}

function indentNote(doc, y, text) {
  const plain = stripInline(text.replace(/^`+|`+$/g, ''));
  doc.font('Courier').fontSize(8);
  const h = doc.heightOfString(plain, { width: CONTENT_W - 16 });
  y = ensureSpace(doc, y, h + 8);
  doc.rect(M, y - 2, CONTENT_W, h + 8).fill(CODE_BG);
  doc.fill('#0f172a').text(plain, M + 8, y + 2, { width: CONTENT_W - 16 });
  return y + h + 10;
}

function isBlockStart(line) {
  const t = line.trim();
  if (!t) return true;
  if (t === '---') return true;
  if (t.startsWith('```')) return true;
  if (t.startsWith('|')) return true;
  if (/^#{1,3}\s/.test(t)) return true;
  if (/^\d+\.\s/.test(t)) return true;
  if (/^[-*]\s/.test(t)) return true;
  return false;
}

function consume(doc, startY, markdown) {
  const lines = String(markdown).replace(/\r\n/g, '\n').split('\n');
  let y = startY;
  let i = 0;
  let skippedCoverTitle = false;
  while (i < lines.length) {
    const raw = lines[i];
    const trim = raw.trim();

    if (!trim) {
      i += 1;
      continue;
    }
    if (trim === '---') {
      y = ensureSpace(doc, y + 6, 12);
      doc.moveTo(M, y).lineTo(M + CONTENT_W, y).strokeColor(RULE).lineWidth(0.5).stroke();
      y += 12;
      i += 1;
      continue;
    }
    if (trim.startsWith('```')) {
      const buf = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        buf.push(lines[i]);
        i += 1;
      }
      i += 1;
      y = codeBlock(doc, y, buf.join('\n'));
      continue;
    }
    if (trim.startsWith('|')) {
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        if (!isTableSep(lines[i])) rows.push(splitTableRow(lines[i]));
        i += 1;
      }
      y = table(doc, y, rows);
      continue;
    }
    const headingMatch = trim.match(/^(#{1,3})\s+(.*)$/);
    if (headingMatch) {
      if (!skippedCoverTitle && headingMatch[1].length === 1) {
        skippedCoverTitle = true;
        i += 1;
        continue;
      }
      y = heading(doc, y, headingMatch[1].length, headingMatch[2]);
      i += 1;
      continue;
    }
    const ol = trim.match(/^(\d+)\.\s+(.*)$/);
    if (ol) {
      y = listItem(doc, y, `${ol[1]}.`, ol[2]);
      i += 1;
      while (i < lines.length) {
        const next = lines[i];
        if (/^ {2,}\S/.test(next)) {
          y = indentNote(doc, y, next.trim());
          i += 1;
          continue;
        }
        if (!next.trim()) {
          const peek = lines[i + 1] || '';
          if (/^ {2,}\S/.test(peek)) {
            i += 1;
            continue;
          }
          break;
        }
        break;
      }
      continue;
    }
    const ul = trim.match(/^[-*]\s+(.*)$/);
    if (ul) {
      y = listItem(doc, y, '•', ul[1]);
      i += 1;
      continue;
    }
    const para = [trim];
    i += 1;
    while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) {
      para.push(lines[i].trim());
      i += 1;
    }
    const joined = para.join(' ');
    const boldLead = /^(What it does|What you need|Permanent token|Before you start):/i.test(stripInline(joined));
    y = paragraph(doc, y, joined, { bold: boldLead, color: boldLead ? NAVY : BODY });
  }
  return y;
}

/**
 * @param {{ name?: string }} [company]
 * @returns {Promise<Buffer>}
 */
function buildIntegrationGuidePdf(company = {}) {
  const companyName = company.name || 'Paul Douglas Roofing';
  if (!fs.existsSync(GUIDE_PATH)) {
    return Promise.reject(new Error('Integration setup guide is missing'));
  }
  const markdown = fs.readFileSync(GUIDE_PATH, 'utf8');

  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new PDFDocument({
      size: 'A4',
      margin: M,
      bufferPages: true,
      info: {
        Title: 'Integration setup guide',
        Author: companyName,
        Subject: 'How to create accounts and copy keys for CRM integrations',
      },
    });
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const startY = drawHeader(doc, companyName);
    consume(doc, startY, markdown);
    drawFooter(doc, companyName);
    doc.end();
  });
}

module.exports = {
  GUIDE_PATH,
  DOWNLOAD_NAME,
  buildIntegrationGuidePdf,
};
