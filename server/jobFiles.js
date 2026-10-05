/**
 * Job photos (before/during/after) and PDF documents (requirement 7.4).
 * Files live in DATA_DIR/files, stay on the job, and are never emailed or WhatsApped.
 * Completing a job does not require photos. Not customer (2.4) attachments.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const { JobFile, User } = require('./models');
const { DATA_DIR, plain } = require('./db');

const PHOTO_STAGES = Object.freeze(['before', 'during', 'after']);

const ALLOWED_MIME = Object.freeze({
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
});

const IMAGE_MIME = Object.freeze(['image/jpeg', 'image/png', 'image/webp']);
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

/**
 * Photos must be tagged before / during / after. PDFs have no stage.
 * @param {unknown} mime
 * @param {unknown} raw
 */
function resolveStage(mime, raw) {
  const tagged = raw != null && String(raw).trim() !== '';
  if (mime === 'application/pdf') {
    if (tagged) return { error: 'PDFs cannot be tagged before, during, or after', status: 400 };
    return { stage: null };
  }
  if (!IMAGE_MIME.includes(mime)) {
    return { error: 'Only JPEG, PNG, WebP, and PDF files are allowed', status: 400 };
  }
  const stage = String(raw || '').trim();
  if (!PHOTO_STAGES.includes(stage)) {
    return { error: 'Photos must be tagged before, during, or after', status: 400 };
  }
  return { stage };
}

function storedName(jobId, ext) {
  const rand = crypto.randomBytes(8).toString('hex');
  return `jfile-${jobId}-${Date.now()}-${rand}.${ext}`;
}

function diskPath(stored_name) {
  if (!stored_name || !/^[\w.\-]+$/.test(stored_name)) return null;
  return path.join(filesDir(), stored_name);
}

/**
 * @param {unknown} raw
 * @returns {string|null}
 */
function normaliseJobNotes(raw) {
  if (raw == null) return null;
  const text = String(raw).trim();
  return text || null;
}

/**
 * @param {number} jobId
 */
async function listFiles(jobId) {
  const rows = await JobFile.findAll({
    where: { job_id: jobId },
    include: [{ model: User, attributes: ['name'] }],
    order: [['created_at', 'ASC'], ['id', 'ASC']],
  });
  return rows.map(mapFile);
}

/**
 * Attach files onto a job JSON payload.
 * @param {Record<string, unknown>} jobJson
 */
async function attachJobFiles(jobJson) {
  return { ...jobJson, files: await listFiles(jobJson.id) };
}

/**
 * @param {number} jobId
 * @param {number} userId
 * @param {object} file multer file
 * @param {unknown} stageRaw
 */
async function addFile(jobId, userId, file, stageRaw) {
  const check = validateUpload(file);
  if (check.error) return check;
  const staged = resolveStage(check.mime, stageRaw);
  if (staged.error) return staged;
  const stored_name = storedName(jobId, check.ext);
  fs.writeFileSync(path.join(filesDir(), stored_name), file.buffer);
  const created = await JobFile.create({
    job_id: jobId,
    stored_name,
    original_name: check.original_name,
    mime: check.mime,
    size_bytes: check.bytes,
    stage: staged.stage,
    user_id: userId || null,
  });
  const row = await JobFile.findByPk(created.id, {
    include: [{ model: User, attributes: ['name'] }],
  });
  return { file: mapFile(row) };
}

/**
 * @param {number} jobId
 * @param {number} fileId
 */
async function getFileRow(jobId, fileId) {
  return JobFile.findOne({ where: { id: fileId, job_id: jobId } });
}

/**
 * Move a photo between before / during / after. PDFs cannot be tagged.
 * @param {number} jobId
 * @param {number} fileId
 * @param {unknown} stageRaw
 */
async function updateStage(jobId, fileId, stageRaw) {
  const row = await getFileRow(jobId, fileId);
  if (!row) return { error: 'File not found', status: 404 };
  const staged = resolveStage(row.mime, stageRaw);
  if (staged.error) return staged;
  await row.update({ stage: staged.stage });
  const fresh = await JobFile.findByPk(row.id, {
    include: [{ model: User, attributes: ['name'] }],
  });
  return { file: mapFile(fresh) };
}

/**
 * @param {number} jobId
 * @param {number} fileId
 */
async function removeFile(jobId, fileId) {
  const row = await getFileRow(jobId, fileId);
  if (!row) return { error: 'File not found', status: 404 };
  const filePath = diskPath(row.stored_name);
  if (filePath && fs.existsSync(filePath)) {
    try { fs.unlinkSync(filePath); } catch { /* leave the row deletion to proceed */ }
  }
  await row.destroy();
  return { ok: true };
}

/**
 * Stream a stored job file. Caller must already have authorised the job.
 * @param {import('express').Response} res
 * @param {{ stored_name: string, mime: string, original_name: string }} row
 * @param {boolean} download
 */
function sendStoredFile(res, row, download) {
  const disk = diskPath(row.stored_name);
  if (!disk || !fs.existsSync(disk)) return { error: 'File not found', status: 404 };
  res.setHeader('Content-Type', row.mime);
  res.setHeader(
    'Content-Disposition',
    `${download ? 'attachment' : 'inline'}; filename="${String(row.original_name).replace(/"/g, '')}"`,
  );
  res.sendFile(disk, (err) => { if (err && !res.headersSent) res.sendStatus(404); });
  return { sent: true };
}

function sendResult(res, result) {
  if (result.sent) return undefined;
  if (result.error) return res.status(result.status || 400).json({ error: result.error });
  return res.json(result);
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
  PHOTO_STAGES,
  ALLOWED_MIME,
  MAX_BYTES,
  validateUpload,
  resolveStage,
  normaliseJobNotes,
  listFiles,
  attachJobFiles,
  addFile,
  getFileRow,
  updateStage,
  removeFile,
  diskPath,
  sendStoredFile,
  sendResult,
  handleUpload,
};
