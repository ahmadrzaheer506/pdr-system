'use strict';

const DEFAULT_INTERVAL_MINUTES = 5;
const MIN_INTERVAL_MINUTES = 1;
const MAX_INTERVAL_MINUTES = 60;

function cronExpression(minutes) {
  const n = Number(minutes);
  if (!Number.isInteger(n) || n < MIN_INTERVAL_MINUTES) return '*/5 * * * *';
  if (n === 1) return '* * * * *';
  return `*/${n} * * * *`;
}

/**
 * Settings `automation.interval_minutes` (requirement 12.3).
 * @param {unknown} raw
 * @returns {{ value: { interval_minutes: number } }|{ error: string }}
 */
function parseAutomation(raw) {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { error: 'Automation settings must be an object' };
  }
  const n = Number(raw.interval_minutes);
  if (!Number.isInteger(n) || n < MIN_INTERVAL_MINUTES || n > MAX_INTERVAL_MINUTES) {
    return { error: `Automation interval must be a whole number of minutes from ${MIN_INTERVAL_MINUTES} to ${MAX_INTERVAL_MINUTES}` };
  }
  return { value: { interval_minutes: n } };
}

function intervalFromSetting(raw) {
  const n = Number(raw && raw.interval_minutes);
  if (!Number.isInteger(n) || n < MIN_INTERVAL_MINUTES || n > MAX_INTERVAL_MINUTES) {
    return DEFAULT_INTERVAL_MINUTES;
  }
  return n;
}

module.exports = {
  DEFAULT_INTERVAL_MINUTES,
  MIN_INTERVAL_MINUTES,
  MAX_INTERVAL_MINUTES,
  cronExpression,
  parseAutomation,
  intervalFromSetting,
};
