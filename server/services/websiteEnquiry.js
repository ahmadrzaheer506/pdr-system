/**
 * Public website enquiry → CRM inbox. The landing form may send email-style
 * fields (from/to/received); those are ignored. CRM `source` is always
 * `website`. "How did you hear about us?" is stored as heard_from.
 *
 * Photos are uploaded as multipart files (`photos`) or JSON `{ filename, mime, data }`
 * (base64). They are stored on the customer in the CRM — do not send public URLs.
 */
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const customerFiles = require('../customerFiles');

const SOURCE = 'website';
const PHOTO_MAX_BYTES = 8 * 1024 * 1024;
const PHOTO_MAX_COUNT = 4;
const PHOTO_MIME = Object.freeze({
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
});

const CONSENT_OK = new Set(['yes', 'true', '1', 'y', 'on']);

function trim(value) {
  if (value == null) return '';
  return String(value).trim();
}

function consentGiven(value) {
  if (value === true) return true;
  return CONSENT_OK.has(trim(value).toLowerCase());
}

function displayName(body) {
  const first = trim(body.first_name);
  const last = trim(body.last_name);
  const joined = [first, last].filter(Boolean).join(' ');
  return joined || trim(body.name);
}

function sniffImageMime(buffer, claimed) {
  if (buffer && buffer.length >= 12) {
    if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) return 'image/jpeg';
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) return 'image/png';
    if (buffer.slice(0, 4).toString('ascii') === 'RIFF' && buffer.slice(8, 12).toString('ascii') === 'WEBP') {
      return 'image/webp';
    }
    if (buffer.slice(4, 8).toString('ascii') === 'ftyp') return 'image/heic';
  }
  return String(claimed || '').toLowerCase();
}

function decodePhotoData(item) {
  const raw = item.data || item.base64 || item.content || item.file || '';
  if (!raw || typeof raw !== 'string') return { error: 'Photo data is missing' };
  const match = raw.match(/^data:([^;]+);base64,(.+)$/i);
  const mime = match ? match[1] : item.mime || item.type || '';
  const b64 = match ? match[2] : raw.replace(/\s/g, '');
  try {
    const buffer = Buffer.from(b64, 'base64');
    if (!buffer.length) return { error: 'Photo data is empty' };
    return { buffer, mime };
  } catch {
    return { error: 'Photo data is not valid base64' };
  }
}

function normalizePhotoFile(file) {
  const buffer = file.buffer;
  const mime = sniffImageMime(buffer, file.mimetype || file.mime);
  if (mime === 'image/heic' || mime === 'image/heif') {
    return { error: `${file.originalname || 'Photo'}: please send JPEG or PNG (HEIC is not stored)` };
  }
  const mapped = { ...file, mimetype: PHOTO_MIME[mime] ? (mime === 'image/jpg' ? 'image/jpeg' : mime) : mime, buffer };
  if (mapped.mimetype === 'image/jpg') mapped.mimetype = 'image/jpeg';
  const check = customerFiles.validateUpload({
    buffer,
    mimetype: mapped.mimetype,
    originalname: file.originalname || file.filename || 'photo.jpg',
    size: file.size || (buffer && buffer.length),
  });
  if (check.error) {
    const name = file.originalname || 'Photo';
    if (/10MB/i.test(check.error)) return { error: `${name}: each photo must be 8MB or smaller` };
    if (/JPEG, PNG/i.test(check.error)) return { error: `${name}: photos must be JPEG, PNG or WebP` };
    return { error: `${name}: ${check.error}` };
  }
  if ((file.size || buffer.length) > PHOTO_MAX_BYTES) {
    return { error: `${file.originalname || 'Photo'}: each photo must be 8MB or smaller` };
  }
  return {
    file: {
      buffer,
      mimetype: check.mime,
      originalname: check.original_name,
      size: check.bytes,
    },
  };
}

function enquiryBodyFromRequest(req) {
  const raw = req.body || {};
  if (typeof raw.enquiry === 'string' && raw.enquiry.trim()) {
    try {
      return JSON.parse(raw.enquiry);
    } catch {
      return { __parseError: 'Invalid enquiry JSON' };
    }
  }
  return raw;
}

/**
 * Multipart files named `photos` plus optional JSON `{ filename, mime, data }`.
 * String URLs/filenames are ignored — photos live in this CRM.
 */
function collectEnquiryPhotos(req) {
  const warnings = [];
  const files = [];
  const uploaded = [...(Array.isArray(req.files) ? req.files : []), ...(req.file ? [req.file] : [])];
  for (const f of uploaded) {
    const next = normalizePhotoFile(f);
    if (next.error) warnings.push(next.error);
    else files.push(next.file);
  }
  const body = enquiryBodyFromRequest(req);
  const extras = Array.isArray(body.photos) ? body.photos : [];
  for (const item of extras) {
    if (!item || typeof item === 'string') continue;
    if (!(item.data || item.base64 || item.content)) continue;
    const decoded = decodePhotoData(item);
    if (decoded.error) {
      warnings.push(decoded.error);
      continue;
    }
    const next = normalizePhotoFile({
      buffer: decoded.buffer,
      mimetype: decoded.mime || item.mime || item.type,
      originalname: item.filename || item.name || 'photo.jpg',
      size: decoded.buffer.length,
    });
    if (next.error) warnings.push(next.error);
    else files.push(next.file);
  }
  if (files.length > PHOTO_MAX_COUNT) {
    warnings.push(`Please send at most ${PHOTO_MAX_COUNT} photos`);
  }
  return { files: files.slice(0, PHOTO_MAX_COUNT), warnings };
}

async function saveEnquiryPhotos(customerId, files) {
  const saved = [];
  const warnings = [];
  for (const file of files) {
    const result = await customerFiles.addFile(customerId, null, file);
    if (result.error) warnings.push(result.error);
    else saved.push(result.file);
  }
  return { saved, warnings };
}

const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: PHOTO_MAX_BYTES, files: PHOTO_MAX_COUNT, fields: 40 },
}).array('photos', PHOTO_MAX_COUNT);

function handleWebsiteUpload(req, res, next) {
  const type = String(req.get('content-type') || '');
  if (!type.includes('multipart/form-data')) {
    return expressJson(req, res, next);
  }
  photoUpload(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'Each photo must be 8MB or smaller' });
    }
    if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({ error: `Please send at most ${PHOTO_MAX_COUNT} photos as the photos field` });
    }
    return res.status(400).json({ error: err.message || 'Upload failed' });
  });
}

const expressJson = express.json({ limit: '2mb' });

function customerType(body) {
  if (trim(body.customer_type) === 'commercial' || trim(body.company_name)) {
    return 'commercial';
  }
  return 'domestic';
}

function pushLabel(lines, label, value) {
  const v = trim(value);
  if (v) lines.push(`${label}: ${v}`);
}

/**
 * Build the inbox message from form fields so office sees labeled job details.
 */
function buildBody(body) {
  const lines = [];
  pushLabel(lines, 'Job', body.service);
  pushLabel(lines, 'Property type', body.property_type);
  pushLabel(lines, 'Roof type', body.roof_type);
  pushLabel(lines, 'Urgency', body.urgency);
  pushLabel(lines, 'Address', body.address);
  pushLabel(lines, 'Postcode', body.postcode);
  const notes = trim(body.message);
  if (notes) {
    if (lines.length) lines.push('');
    lines.push('Details:');
    lines.push(notes);
  }
  const extras = [];
  pushLabel(extras, 'Preferred contact', body.contact_pref);
  pushLabel(extras, 'Best time', body.best_time);
  const heard = trim(body.heard_from || (body.source && body.source !== SOURCE ? body.source : ''));
  pushLabel(extras, 'Heard about us', heard);
  if (extras.length) {
    if (lines.length) lines.push('');
    lines.push(...extras);
  }
  return lines.join('\n').slice(0, 2000);
}

function readSecret(req) {
  const header = trim(req.get('x-enquiry-secret') || '');
  if (header) return header;
  const auth = trim(req.get('authorization') || '');
  if (/^bearer\s+/i.test(auth)) return auth.replace(/^bearer\s+/i, '').trim();
  return trim(req.query?.secret || '');
}

function secretConfigured() {
  const expected = trim(process.env.WEBSITE_ENQUIRY_SECRET);
  return expected && expected !== 'change-me';
}

function secretMatches(req) {
  const expected = trim(process.env.WEBSITE_ENQUIRY_SECRET);
  if (!secretConfigured()) return false;
  const provided = readSecret(req);
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * @returns {{ error: string, status?: number }|{ value: object }}
 */
function parseWebsiteEnquiry(body = {}) {
  if (!consentGiven(body.consent)) {
    return { error: 'Consent is required to send this enquiry', status: 400 };
  }
  const name = displayName(body);
  const phone = trim(body.phone);
  const email = trim(body.email);
  if (!name) return { error: 'Name is required', status: 400 };
  if (!phone && !email) return { error: 'Phone or email is required', status: 400 };

  const address = trim(body.address);
  const postcode = trim(body.postcode);
  const heard = trim(body.heard_from || (body.source && !['website', 'web'].includes(String(body.source).toLowerCase())
    ? body.source
    : ''));
  const type = customerType(body);
  const company_name = type === 'commercial' ? (trim(body.company_name) || name) : null;

  const message = buildBody(body);
  const subject = trim(body.service) ? `Website enquiry — ${trim(body.service)}` : 'Website enquiry';

  return {
    value: {
      source: SOURCE,
      channel: SOURCE,
      name,
      phone: phone || null,
      email: email || null,
      address: address || postcode || null,
      postcode: postcode || null,
      customer_type: type,
      company_name,
      body: message,
      subject,
      enquiry_message: trim(body.message) || null,
      forceNewLead: true,
      meta: {
        channel: SOURCE,
        external_ref: trim(body.ref) || null,
        service: trim(body.service) || null,
        property_type: trim(body.property_type) || null,
        roof_type: trim(body.roof_type) || null,
        urgency: trim(body.urgency) || null,
        heard_from: heard || null,
        contact_pref: trim(body.contact_pref) || null,
        best_time: trim(body.best_time) || null,
        page: trim(body.page) || null,
        enquiry_message: trim(body.message) || null,
        consent: true,
        photo_count: 0,
        photo_file_ids: [],
      },
    },
  };
}

module.exports = {
  SOURCE,
  PHOTO_MAX_BYTES,
  PHOTO_MAX_COUNT,
  parseWebsiteEnquiry,
  enquiryBodyFromRequest,
  collectEnquiryPhotos,
  saveEnquiryPhotos,
  handleWebsiteUpload,
  secretConfigured,
  secretMatches,
  buildBody,
  sniffImageMime,
};
