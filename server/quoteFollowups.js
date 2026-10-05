'use strict';

/**
 * Quote follow-up sequence config (requirement 12.1).
 * Delays are days from quote send, not from the previous step.
 * `{name}`, `{ref}`, `{title}`, `{total}` are substituted when a step is sent.
 */

const CHANNELS = Object.freeze(['whatsapp', 'email']);
const MAX_STEPS = 10;
const MAX_BODY = 4000;
const MAX_SUBJECT = 200;

const DEFAULT_STEP_BODIES = Object.freeze([
  'Hi {name}, just checking you received our quotation {ref} for {title}. How are you getting on with it? Happy to answer any questions.',
  "Hi {name}, following up one last time on quotation {ref}. If you'd like us to adjust anything or talk it through, just let us know — otherwise we'll leave it with you.",
]);

const DEFAULT_EMAIL_SUBJECT = 'How did you get on with our quotation {ref}?';

function defaultFollowups() {
  return {
    enabled: true,
    email_subject: DEFAULT_EMAIL_SUBJECT,
    steps: [
      { delay_days: 2, channel: 'whatsapp', body: DEFAULT_STEP_BODIES[0] },
      { delay_days: 5, channel: 'email', body: DEFAULT_STEP_BODIES[1] },
    ],
  };
}

/**
 * Body stored on a scheduled step: Company follow-up step body only.
 * Empty body means skip that step — Templates no longer supply fallback copy.
 */
function stepBody(s) {
  return s && s.body != null ? String(s.body).trim() : '';
}

/**
 * @param {unknown} raw
 * @returns {{ value: object }|{ error: string }}
 */
function parseFollowups(raw) {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { error: 'Follow-ups settings must be an object' };
  }
  if (!Array.isArray(raw.steps)) {
    return { error: 'Follow-up steps must be an array' };
  }
  if (raw.steps.length > MAX_STEPS) {
    return { error: `At most ${MAX_STEPS} follow-up steps` };
  }
  const steps = [];
  for (let i = 0; i < raw.steps.length; i++) {
    const s = raw.steps[i] || {};
    const delay = Number(s.delay_days);
    if (!Number.isInteger(delay) || delay < 0 || delay > 365) {
      return { error: `Step ${i + 1}: delay must be a whole number of days from 0 to 365` };
    }
    const channel = String(s.channel || '').toLowerCase();
    if (!CHANNELS.includes(channel)) {
      return { error: `Step ${i + 1}: channel must be WhatsApp or email` };
    }
    const body = String(s.body == null ? '' : s.body).trim();
    if (!body) {
      return { error: `Step ${i + 1}: body template is required` };
    }
    if (body.length > MAX_BODY) {
      return { error: `Step ${i + 1}: body template is too long` };
    }
    steps.push({ delay_days: delay, channel, body });
  }
  const value = { enabled: raw.enabled !== false, steps };
  if (raw.email_subject != null) {
    const subject = String(raw.email_subject).trim();
    if (subject.length > MAX_SUBJECT) {
      return { error: 'Follow-up email subject is too long' };
    }
    value.email_subject = subject || DEFAULT_EMAIL_SUBJECT;
  }
  return { value };
}

module.exports = {
  CHANNELS,
  MAX_STEPS,
  DEFAULT_STEP_BODIES,
  DEFAULT_EMAIL_SUBJECT,
  defaultFollowups,
  parseFollowups,
  stepBody,
};
