/**
 * Signed-in user profile photos. PNG/JPEG on disk as avatar-{userId}.png|jpg.
 */
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { DATA_DIR } = require('./db');

const ALLOWED_MIME = Object.freeze({
  'image/jpeg': 'jpg',
  'image/png': 'png',
});

const MAX_BYTES = 2 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME[file.mimetype]) {
      cb(new Error('Only PNG and JPEG photos are allowed'));
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

function stemFor(userId) {
  return `avatar-${Number(userId)}`;
}

function uploadedPaths(userId) {
  const stem = stemFor(userId);
  return ['png', 'jpg'].map((ext) => path.join(DATA_DIR, 'files', `${stem}.${ext}`));
}

function resolveAvatarPath(userId, avatarFile) {
  const allowed = uploadedPaths(userId);
  if (avatarFile) {
    const named = path.join(DATA_DIR, 'files', path.basename(String(avatarFile)));
    if (allowed.includes(named) && fs.existsSync(named)) return named;
  }
  return allowed.find((p) => fs.existsSync(p)) || null;
}

function mimeForPath(filePath) {
  if (String(filePath).toLowerCase().endsWith('.jpg') || String(filePath).toLowerCase().endsWith('.jpeg')) {
    return 'image/jpeg';
  }
  return 'image/png';
}

function validateUpload(file) {
  if (!file || !file.buffer || !file.buffer.length) {
    return { error: 'File required', status: 400 };
  }
  const bytes = file.size || file.buffer.length;
  if (bytes > MAX_BYTES) {
    return { error: 'Photo must be 2MB or smaller', status: 400 };
  }
  const ext = ALLOWED_MIME[file.mimetype];
  if (!ext) {
    return { error: 'Only PNG and JPEG photos are allowed', status: 400 };
  }
  return { ok: true, ext, bytes, mime: file.mimetype };
}

/**
 * Replace any previous photo for this user.
 * @param {number} userId
 * @param {object} file multer file
 */
function saveAvatar(userId, file) {
  const check = validateUpload(file);
  if (check.error) return check;
  const dest = path.join(filesDir(), `${stemFor(userId)}.${check.ext}`);
  for (const old of uploadedPaths(userId)) {
    if (old !== dest && fs.existsSync(old)) {
      try { fs.unlinkSync(old); } catch { /* keep writing the new file */ }
    }
  }
  fs.writeFileSync(dest, file.buffer);
  return { ok: true, avatar_file: `${stemFor(userId)}.${check.ext}` };
}

function removeAvatar(userId) {
  for (const old of uploadedPaths(userId)) {
    if (fs.existsSync(old)) {
      try { fs.unlinkSync(old); } catch { /* still clear the column */ }
    }
  }
}

function handleUpload(req, res, next) {
  upload.single('file')(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'Photo must be 2MB or smaller' });
    }
    return res.status(400).json({ error: err.message || 'Upload failed' });
  });
}

function sendAvatar(res, userId, avatarFile) {
  const filePath = resolveAvatarPath(userId, avatarFile);
  if (!filePath) return res.status(404).json({ error: 'Photo not found' });
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', mimeForPath(filePath));
  return res.sendFile(filePath, (err) => {
    if (err && !res.headersSent) res.sendStatus(404);
  });
}

module.exports = {
  ALLOWED_MIME,
  MAX_BYTES,
  validateUpload,
  saveAvatar,
  removeAvatar,
  resolveAvatarPath,
  sendAvatar,
  handleUpload,
};
