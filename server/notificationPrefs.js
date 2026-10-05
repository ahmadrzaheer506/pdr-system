'use strict';

/**
 * Per-user notification preferences (requirement 13.2).
 * Missing keys are off (opt in). Email exists only for field staff on crew add/remove.
 */
const { ROLES } = require('./roles');

const EMAIL_KINDS = Object.freeze(['crew_added', 'crew_removed']);

const OFFICE_IN_APP_KINDS = Object.freeze([
  'new_enquiry',
  'quote_accepted',
  'visit_booked',
  'invoice_overdue',
  'task_reminder',
  'holiday_submitted',
  'crew_added',
  'crew_removed',
]);

const STAFF_IN_APP_KINDS = Object.freeze([
  'crew_added',
  'crew_removed',
  'visit_booked',
  'task_reminder',
  'holiday_approved',
  'holiday_declined',
]);

function kindsForRole(role) {
  return role === ROLES.STAFF ? [...STAFF_IN_APP_KINDS] : [...OFFICE_IN_APP_KINDS];
}

/** Field staff are notified of assigned visits unless they turn this off. */
function defaultInAppOn(kind, role) {
  return role === ROLES.STAFF && kind === 'visit_booked';
}

function emptyPrefs(role) {
  const in_app = {};
  for (const kind of kindsForRole(role)) in_app[kind] = defaultInAppOn(kind, role);
  const email = {};
  if (role === ROLES.STAFF) {
    for (const kind of EMAIL_KINDS) email[kind] = false;
  }
  return { in_app, email };
}

function asBool(value) {
  return value === true;
}

function wantsInApp(prefs, kind, role) {
  const stored = prefs && prefs.in_app ? prefs.in_app[kind] : undefined;
  if (stored === true) return true;
  if (stored === false) return false;
  return defaultInAppOn(kind, role);
}

function wantsEmail(prefs, kind, role) {
  if (role !== ROLES.STAFF || !EMAIL_KINDS.includes(kind)) return false;
  return asBool(prefs && prefs.email && prefs.email[kind]);
}

/**
 * @param {unknown} raw
 * @param {string} role
 * @returns {{ value: { in_app: Record<string, boolean>, email: Record<string, boolean> } }|{ error: string }}
 */
function parsePreferences(raw, role) {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { error: 'Preferences must be an object' };
  }
  const allowedInApp = new Set(kindsForRole(role));
  const in_app = {};
  const incomingInApp = raw.in_app;
  if (incomingInApp != null) {
    if (typeof incomingInApp !== 'object' || Array.isArray(incomingInApp)) {
      return { error: 'in_app must be an object' };
    }
    for (const key of Object.keys(incomingInApp)) {
      if (!allowedInApp.has(key)) return { error: `Unknown in-app notification: ${key}` };
      if (typeof incomingInApp[key] !== 'boolean') return { error: `${key} must be true or false` };
      in_app[key] = incomingInApp[key];
    }
  }
  for (const kind of allowedInApp) {
    if (in_app[kind] === undefined) in_app[kind] = defaultInAppOn(kind, role);
  }

  const email = {};
  const incomingEmail = raw.email;
  if (incomingEmail != null) {
    if (typeof incomingEmail !== 'object' || Array.isArray(incomingEmail)) {
      return { error: 'email must be an object' };
    }
    if (role !== ROLES.STAFF && Object.keys(incomingEmail).length) {
      return { error: 'Email alerts are only for field staff on crew changes' };
    }
    for (const key of Object.keys(incomingEmail)) {
      if (!EMAIL_KINDS.includes(key)) return { error: `Unknown email notification: ${key}` };
      if (typeof incomingEmail[key] !== 'boolean') return { error: `${key} must be true or false` };
      email[key] = incomingEmail[key];
    }
  }
  if (role === ROLES.STAFF) {
    for (const kind of EMAIL_KINDS) {
      if (email[kind] === undefined) email[kind] = false;
    }
  }
  return { value: { in_app, email } };
}

function catalog(role, titles) {
  const emailAllowed = role === ROLES.STAFF;
  return kindsForRole(role).map((id) => ({
    id,
    title: titles[id] || id,
    in_app: true,
    email: emailAllowed && EMAIL_KINDS.includes(id),
  }));
}

module.exports = {
  EMAIL_KINDS,
  OFFICE_IN_APP_KINDS,
  STAFF_IN_APP_KINDS,
  kindsForRole,
  emptyPrefs,
  wantsInApp,
  wantsEmail,
  parsePreferences,
  catalog,
};
