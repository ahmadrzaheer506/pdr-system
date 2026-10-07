const { IntegrationEvent } = require('../models');
const { plain } = require('../db');
const whatsapp = require('./whatsapp');
const email = require('./email');
const meta = require('./meta');
const gcal = require('./gcal');
const quickbooks = require('./quickbooks');
const ai = require('./ai');

function telephonyStatus() {
  const configured = !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN);
  return {
    id: 'telephony',
    name: 'Phone & SMS capture (Twilio — optional)',
    configured,
    connected: configured,
    mode: configured ? 'live' : 'simulated',
    env_needed: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_NUMBER'],
    webhook_url: `${process.env.APP_URL || 'http://localhost:4000'}/api/webhooks/twilio/voice (+ /sms)`,
    detail: configured
      ? 'Live — calls/SMS to the tracked number create leads automatically'
      : 'Optional. Until connected, phone enquiries are logged with the one-tap "Log enquiry" button.',
  };
}

async function all(userId) {
  return [
    await gcal.status(userId),
    await quickbooks.status(),
    email.status(),
    whatsapp.status(),
    ai.status(),
    meta.status(),
    telephonyStatus(),
  ];
}

async function recentEvents(limit = 50) {
  const rows = await IntegrationEvent.findAll({ order: [['id', 'DESC']], limit });
  return plain(rows);
}

module.exports = { all, recentEvents };
