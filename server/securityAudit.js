const { SecurityEvent } = require('./models');

/** Action names stored in security_events.action (requirement 1.9). */
const SECURITY_ACTIONS = Object.freeze({
  LOGIN_SUCCESS: 'login_success',
  LOGIN_FAILURE: 'login_failure',
  LOGOUT: 'logout',
  USER_CREATE: 'user_create',
  ROLE_CHANGE: 'role_change',
  DEACTIVATE: 'deactivate',
  REACTIVATE: 'reactivate',
  PASSWORD_CHANGE: 'password_change',
  ADMIN_TEMP_PASSWORD: 'admin_temp_password',
  FORGOT_PASSWORD: 'forgot_password',
  PASSWORD_RESET: 'password_reset',
});

function nextTokenVersion(user) {
  return (Number(user && user.token_version) || 0) + 1;
}

/**
 * Append a security audit row. Never pass passwords or reset tokens in `detail`.
 * Fail-open: a logging error must not block the triggering action.
 * @param {{ actorUserId?: number|null, targetUserId?: number|null, action: string, detail?: string|null }} evt
 */
async function logSecurityEvent(evt) {
  if (!evt || !evt.action) return;
  try {
    if (!SecurityEvent || typeof SecurityEvent.create !== 'function') return;
    await SecurityEvent.create({
      actor_user_id: evt.actorUserId || null,
      target_user_id: evt.targetUserId || null,
      action: evt.action,
      detail: evt.detail || null,
    });
  } catch (err) {
    console.error('[security_events]', err.message);
  }
}

module.exports = {
  SECURITY_ACTIONS,
  nextTokenVersion,
  logSecurityEvent,
};
