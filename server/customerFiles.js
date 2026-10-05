/**
 * Customer-only photo/PDF attachments (requirement 2.4).
 * Files live in DATA_DIR/files and are never emailed or WhatsApped.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const { CustomerFile, User } = require('./models');
const { DATA_DIR, plain } = require('./db');

const ALLOWED_MIME = Object.freeze({
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
});

const MAX_BYTES = 10 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME[file.mimetype]) {
      cb(new Error('Only JPEG, PNG, WebP, and PDF files are allowed'));
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

function mapFile(row) {
  const o = plain(row);
  o.user_name = o.User?.name || null;
  delete o.User;
  delete o.stored_name;
  return o;
}

/**
 * Validate a multer file before writing it to disk.
 * @param {{ buffer?: Buffer, mimetype?: string, originalname?: string, size?: number }|undefined} file
 */
function validateUpload(file) {
  if (!file || !file.buffer || !file.buffer.length) {
    return { error: 'File required', status: 400 };
  }
  const bytes = file.size || file.buffer.length;
  if (bytes > MAX_BYTES) {
    return { error: 'File must be 10MB or smaller', status: 400 };
  }
  const ext = ALLOWED_MIME[file.mimetype];
  if (!ext) {
    return { error: 'Only JPEG, PNG, WebP, and PDF files are allowed', status: 400 };
  }
  const original_name = path.basename(file.originalname || 'file') || 'file';
  return { ok: true, ext, bytes, original_name, mime: file.mimetype };
}

function storedName(customerId, ext) {
  const rand = crypto.randomBytes(8).toString('hex');
  return `cfile-${customerId}-${Date.now()}-${rand}.${ext}`;
}

/**
 * @param {number} customerId
 */
async function listFiles(customerId) {
  const rows = await CustomerFile.findAll({
    where: { customer_id: customerId },
    include: [{ model: User, attributes: ['name'] }],
    order: [['created_at', 'DESC'], ['id', 'DESC']],
  });
  return rows.map(mapFile);
}

/**
 * @param {number} customerId
 * @param {number} userId
 * @param {object} file multer file
 */
async function addFile(customerId, userId, file) {
  const check = validateUpload(file);
  if (check.error) return check;
  const stored_name = storedName(customerId, check.ext);
  fs.writeFileSync(path.join(filesDir(), stored_name), file.buffer);
  const created = await CustomerFile.create({
    customer_id: customerId,
    stored_name,
    original_name: check.original_name,
    mime: check.mime,
    size_bytes: check.bytes,
    user_id: userId || null,
  });
  const row = await CustomerFile.findByPk(created.id, {
    include: [{ model: User, attributes: ['name'] }],
  });
  return { file: mapFile(row) };
}

/**
 * @param {number} customerId
 * @param {number} fileId
 */
async function getFileRow(customerId, fileId) {
  return CustomerFile.findOne({ where: { id: fileId, customer_id: customerId } });
}

function diskPath(stored_name) {
  if (!stored_name || !/^[\w.\-]+$/.test(stored_name)) return null;
  return path.join(filesDir(), stored_name);
}

/**
 * @param {number} customerId
 * @param {number} fileId
 */
async function removeFile(customerId, fileId) {
  const row = await getFileRow(customerId, fileId);
  if (!row) return { error: 'File not found', status: 404 };
  const filePath = diskPath(row.stored_name);
  if (filePath && fs.existsSync(filePath)) {
    try { fs.unlinkSync(filePath); } catch { /* leave the row deletion to proceed */ }
  }
  await row.destroy();
  return { ok: true };
}

function handleUpload(req, res, next) {
  upload.single('file')(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File must be 10MB or smaller' });
    }
    return res.status(400).json({ error: err.message || 'Upload failed' });
  });
}

module.exports = {
  ALLOWED_MIME,
  MAX_BYTES,
  validateUpload,
  listFiles,
  addFile,
  getFileRow,
  diskPath,
  removeFile,
  handleUpload,
};
