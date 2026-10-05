const crypto = require('crypto');

/** Public reset links expire after one hour (requirement 1.7). */
const RESET_TTL_MS = 60 * 60 * 1000;

function hashResetToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function createResetToken() {
  const token = crypto.randomBytes(32).toString('hex');
  return {
    token,
    hash: hashResetToken(token),
    expires: new Date(Date.now() + RESET_TTL_MS),
  };
}

/**
 * SPA origin for reset links. Local API on :4000 maps to the Vite app on :5173.
 */
function spaOrigin() {
  const app = String(process.env.APP_URL || 'http://localhost:4000').replace(/\/$/, '');
  if (/^https?:\/\/localhost:4000$/i.test(app)) return 'http://localhost:5173';
  return app;
}

function resetLink(token) {
  return `${spaOrigin()}/reset-password?token=${encodeURIComponent(token)}`;
}

module.exports = {
  RESET_TTL_MS,
  hashResetToken,
  createResetToken,
  spaOrigin,
  resetLink,
};
