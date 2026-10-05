'use strict';

/**
 * RFC 4180-style CSV for report downloads (requirement 14.2).
 * @param {unknown} value
 */
function csvEscape(value) {
  if (value == null) return '';
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/**
 * @param {unknown[]} header
 * @param {unknown[][]} rows
 */
function toCsv(header, rows) {
  const lines = [header.map(csvEscape).join(',')];
  for (const row of rows) lines.push(row.map(csvEscape).join(','));
  return `${lines.join('\r\n')}\r\n`;
}

/**
 * @param {import('express').Response} res
 * @param {string} filename
 * @param {unknown[]} header
 * @param {unknown[][]} rows
 */
function sendCsv(res, filename, header, rows) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(toCsv(header, rows));
}

function isoDay(value) {
  if (!value) return '';
  return String(value).slice(0, 10);
}

module.exports = { csvEscape, toCsv, sendCsv, isoDay };
