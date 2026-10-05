'use strict';

const cron = require('node-cron');
const { getSetting } = require('./db');
const { setStage, logActivity } = require('./services/pipeline');
const { runAllScans } = require('./services/taskEngine');
const { processDue } = require('./services/followups');
const gcal = require('./integrations/gcal');
const quickbooks = require('./integrations/quickbooks');
const { cronExpression, intervalFromSetting, DEFAULT_INTERVAL_MINUTES } = require('./automationSchedule');

let job = null;
let currentExpr = null;

async function runAutomationCycle() {
  try {
    await runAllScans({ setStage, logActivity });
  } catch (err) { console.error('[cron] task scans failed', err.message); }
  try {
    const sent = await processDue();
    if (sent) console.log(`[cron] sent ${sent} follow-up(s)`);
  } catch (err) { console.error('[cron] follow-up processing failed', err.message); }
  try {
    await gcal.pollChanges();
  } catch (err) { console.error('[cron] google calendar poll failed', err.message); }
  try {
    await quickbooks.pollPayments();
  } catch (err) { console.error('[cron] quickbooks payment poll failed', err.message); }
}

function startAutomation(minutes = DEFAULT_INTERVAL_MINUTES) {
  const expr = cronExpression(minutes);
  if (job && currentExpr === expr) return expr;
  if (job) {
    job.stop();
    job = null;
  }
  currentExpr = expr;
  job = cron.schedule(expr, runAutomationCycle);
  return expr;
}

async function applyIntervalFromSettings() {
  const minutes = intervalFromSetting(await getSetting('automation'));
  return startAutomation(minutes);
}

module.exports = {
  runAutomationCycle,
  startAutomation,
  applyIntervalFromSettings,
};
