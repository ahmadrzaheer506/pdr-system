/**
 * Company logo upload (requirement 17.3). PNG/JPEG on disk; PDFs and chrome
 * prefer the uploaded file, then the static seed logo.
 */
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { DATA_DIR, setSetting } = require('./db');

const ALLOWED_MIME = Object.freeze({
  'image/jpeg': 'jpg',
  'image/png': 'png',
});

const MAX_BYTES = 2 * 1024 * 1024;
const STEM = 'brand-logo';

const FALLBACK_PATHS = Object.freeze([
  path.join(__dirname, 'assets', 'logo.png'),
  path.join(__dirname, '..', 'client', 'public', 'logo.png'),
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME[file.mimetype]) {
      cb(new Error('Only PNG and JPEG logos are allowed'));
      return;
    }
    cb(null, true);
  },
});

function filesDir() {
  const dir = path.join(DATA_DIR, 'files');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function uploadedPaths() {
  return ['png', 'jpg'].map((ext) => path.join(DATA_DIR, 'files', `${STEM}.${ext}`));
}

/**
 * Uploaded logo if present, otherwise the static seed file.
 * @returns {string|null}
 */
function resolveLogoPath() {
  return [...uploadedPaths(), ...FALLBACK_PATHS].find((p) => fs.existsSync(p)) || null;
}

function mimeForPath(filePath) {
  if (String(filePath).toLowerCase().endsWith('.jpg') || String(filePath).toLowerCase().endsWith('.jpeg')) {
    return 'image/jpeg';
  }
  return 'image/png';
}

function hasUploadedLogo() {
  return uploadedPaths().some((p) => fs.existsSync(p));
}

function validateUpload(file) {
  if (!file || !file.buffer || !file.buffer.length) {
    return { error: 'File required', status: 400 };
  }
  const bytes = file.size || file.buffer.length;
  if (bytes > MAX_BYTES) {
    return { error: 'Logo must be 2MB or smaller', status: 400 };
  }
  const ext = ALLOWED_MIME[file.mimetype];
  if (!ext) {
    return { error: 'Only PNG and JPEG logos are allowed', status: 400 };
  }
  return { ok: true, ext, bytes, mime: file.mimetype };
}

/**
 * Replace any previous upload with this file and record the stored name.
 * @param {object} file multer file
 */
async function saveLogo(file) {
  const check = validateUpload(file);
  if (check.error) return check;
  const dest = path.join(filesDir(), `${STEM}.${check.ext}`);
  for (const old of uploadedPaths()) {
    if (old !== dest && fs.existsSync(old)) {
      try { fs.unlinkSync(old); } catch { /* keep writing the new file */ }
    }
  }
  fs.writeFileSync(dest, file.buffer);
  const logo_file = `${STEM}.${check.ext}`;
  await setSetting('branding', { logo_file });
  return { branding: { logo_file, uploaded: true } };
}

function handleUpload(req, res, next) {
  upload.single('file')(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'Logo must be 2MB or smaller' });
    }
    return res.status(400).json({ error: err.message || 'Upload failed' });
  });
}

function sendLogo(res) {
  const filePath = resolveLogoPath();
  if (!filePath) return res.status(404).json({ error: 'Logo not found' });
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', mimeForPath(filePath));
  return res.sendFile(filePath, (err) => {
    if (err && !res.headersSent) res.sendStatus(404);
  });
}

module.exports = {
  ALLOWED_MIME,
  MAX_BYTES,
  FALLBACK_PATHS,
  resolveLogoPath,
  hasUploadedLogo,
  validateUpload,
  saveLogo,
  handleUpload,
  sendLogo,
};
