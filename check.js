#!/usr/bin/env node
// ============================================================
// Connection doctor — tests every configured integration and
// reports exactly what's wrong, WITHOUT ever printing a key.
// Safe to paste the output of this anywhere for help.
// Run: npm run check
// ============================================================
const path = require('path');
try {
  require(path.join(__dirname, 'server/node_modules/dotenv')).config({ path: path.join(__dirname, '.env') });
} catch {
  console.error('\n  Dependencies are not installed yet. Run this first:\n    npm run install:all\n');
  process.exit(1);
}

const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  green: '\x1b[32m', red: '\x1b[31m', yellow: '\x1b[33m', cyan: '\x1b[36m', orange: '\x1b[38;5;208m',
};
const OK = `${C.green}✓ PASS${C.reset}`;
const BAD = `${C.red}✗ FAIL${C.reset}`;
const SKIP = `${C.yellow}○ not configured${C.reset}`;

let failures = [];

function line(status, name, detail = '') {
  console.log(`  ${status}  ${name}${detail ? `\n         ${C.dim}${detail}${C.reset}` : ''}`);
}
function fail(name, detail, fix) {
  line(BAD, name, detail);
  if (fix) console.log(`         ${C.cyan}Fix: ${fix}${C.reset}`);
  failures.push(name);
}

// Never let a token reach the console, even inside an error message.
function scrub(text) {
  let s = String(text);
  for (const v of Object.values(process.env)) {
    if (v && v.length > 12 && /^[A-Za-z0-9_\-.:]+$/.test(v)) s = s.split(v).join('«hidden»');
  }
  return s.slice(0, 300);
}

async function main() {
  console.log(`\n${C.bold}${C.orange}  Connection check — Paul Douglas Roofing Business OS${C.reset}`);
  console.log(`${C.dim}  No keys are printed. This output is safe to share.${C.reset}\n`);

  // ---------- Core ----------
  console.log(`${C.bold}  Core${C.reset}`);
  const secret = process.env.JWT_SECRET || '';
  if (!secret || secret.startsWith('change-me') || secret.startsWith('dev-only')) {
    fail('JWT_SECRET', 'Still the placeholder value — everyone\'s login sessions are insecure.', 'Run: npm run setup   (it generates one automatically)');
  } else if (secret.length < 32) {
    fail('JWT_SECRET', 'Too short to be secure.', 'Run: npm run setup');
  } else line(OK, 'JWT_SECRET', 'set and strong');

  const appUrl = process.env.APP_URL || '';
  if (!appUrl) fail('APP_URL', 'Not set.', 'Run: npm run setup');
  else if (appUrl.includes('localhost')) line(`${C.yellow}○ local${C.reset}`, 'APP_URL', `${appUrl} — fine for testing. Inbound webhooks need a public https:// address.`);
  else if (!appUrl.startsWith('https://')) fail('APP_URL', `${appUrl} is not https — Meta and Google will refuse it.`, 'Put the real https:// address in .env');
  else line(OK, 'APP_URL', appUrl);

  // ---------- AI ----------
  console.log(`\n${C.bold}  AI scheduling assistant${C.reset}`);
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5', max_tokens: 8, messages: [{ role: 'user', content: 'hi' }] }),
      });
      if (res.ok) line(OK, 'Anthropic', `model ${process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5'} responded`);
      else {
        const b = await res.text();
        if (res.status === 401) fail('Anthropic', 'Key rejected (401).', 'Check the key at console.anthropic.com → API Keys');
        else if (res.status === 404) fail('Anthropic', 'Model name not found (404).', 'Check ANTHROPIC_MODEL in .env matches a model your account can use');
        else if (res.status === 400 && /credit|balance/i.test(b)) fail('Anthropic', 'No credit on the account.', 'Add billing at console.anthropic.com');
        else fail('Anthropic', `HTTP ${res.status}: ${scrub(b)}`);
      }
    } catch (e) { fail('Anthropic', `Could not reach the API: ${scrub(e.message)}`, 'Check internet / firewall'); }
  } else if (process.env.OPENAI_API_KEY) {
    try {
      const res = await fetch('https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` } });
      if (res.ok) line(OK, 'OpenAI', 'key accepted');
      else if (res.status === 401) fail('OpenAI', 'Key rejected (401).', 'Check the key at platform.openai.com');
      else fail('OpenAI', `HTTP ${res.status}`);
    } catch (e) { fail('OpenAI', `Could not reach the API: ${scrub(e.message)}`); }
  } else {
    line(SKIP, 'AI', 'Using the built-in rule scheduler — drivers, skills and holidays still respected.');
  }

  // ---------- WhatsApp ----------
  console.log(`\n${C.bold}  WhatsApp Business${C.reset}`);
  if (process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID) {
    try {
      const res = await fetch(`https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}?fields=display_phone_number,verified_name,quality_rating`, {
        headers: { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}` },
      });
      const data = await res.json();
      if (res.ok) {
        line(OK, 'WhatsApp number', `${data.verified_name || ''} ${data.display_phone_number || ''}`.trim() || 'reachable');
      } else {
        const msg = data.error?.message || `HTTP ${res.status}`;
        if (/expired|session/i.test(msg)) fail('WhatsApp', 'Token has expired.', 'You are using a temporary token. Generate a permanent System User token (Business Settings → System Users).');
        else if (res.status === 401 || res.status === 403) fail('WhatsApp', `Rejected: ${scrub(msg)}`, 'Check the token has whatsapp_business_messaging + whatsapp_business_management scopes');
        else if (res.status === 404) fail('WhatsApp', 'Phone Number ID not found.', 'Copy the Phone Number ID (not the phone number itself) from WhatsApp → API Setup');
        else fail('WhatsApp', scrub(msg));
      }
    } catch (e) { fail('WhatsApp', `Could not reach Meta: ${scrub(e.message)}`); }

    // templates
    if (process.env.WHATSAPP_BUSINESS_ACCOUNT_ID) {
      try {
        const res = await fetch(`https://graph.facebook.com/v21.0/${process.env.WHATSAPP_BUSINESS_ACCOUNT_ID}/message_templates?fields=name,status&limit=100`, {
          headers: { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}` },
        });
        const data = await res.json();
        if (res.ok) {
          const byName = Object.fromEntries((data.data || []).map((t) => [t.name, t.status]));
          for (const [envKey, label] of [['WHATSAPP_TEMPLATE_QUOTE', 'quote'], ['WHATSAPP_TEMPLATE_FOLLOWUP', 'follow-up']]) {
            const name = process.env[envKey];
            const st = byName[name];
            if (st === 'APPROVED') line(OK, `Template "${name}"`, `approved — ${label} messages can be sent`);
            else if (!st) fail(`Template "${name}"`, 'Not found in this WhatsApp account.', `Create it in WhatsApp Manager → Message Templates (see INTEGRATIONS.md §3 for the wording)`);
            else fail(`Template "${name}"`, `Status is ${st}, not APPROVED.`, st === 'PENDING' ? 'Meta is still reviewing — usually minutes to 48h.' : 'Reword and resubmit it in WhatsApp Manager.');
          }
        }
      } catch { /* non-fatal */ }
    } else {
      line(SKIP, 'Template check', 'WHATSAPP_BUSINESS_ACCOUNT_ID not set — cannot verify templates.');
    }
  } else line(SKIP, 'WhatsApp', 'Messages are recorded in the CRM but not delivered.');

  // ---------- Facebook ----------
  console.log(`\n${C.bold}  Facebook Page${C.reset}`);
  if (process.env.FB_PAGE_ACCESS_TOKEN) {
    try {
      const res = await fetch(`https://graph.facebook.com/v21.0/me?fields=name,id&access_token=${process.env.FB_PAGE_ACCESS_TOKEN}`);
      const data = await res.json();
      if (res.ok) line(OK, 'Facebook Page', `connected to "${data.name}"`);
      else fail('Facebook Page', scrub(data.error?.message || `HTTP ${res.status}`), 'Regenerate the page token in Meta → Messenger → Settings');
    } catch (e) { fail('Facebook Page', `Could not reach Meta: ${scrub(e.message)}`); }
  } else line(SKIP, 'Facebook', 'Use the in-app simulator to test Facebook enquiries.');

  // ---------- Email ----------
  console.log(`\n${C.bold}  Email${C.reset}`);
  if (process.env.SMTP_HOST && process.env.SMTP_USER) {
    try {
      const nodemailer = require('./server/node_modules/nodemailer');
      const t = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: Number(process.env.SMTP_PORT) === 465,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      });
      await t.verify();
      line(OK, 'SMTP', `${process.env.SMTP_HOST} accepted the login`);
    } catch (e) {
      const m = String(e.message);
      if (/auth|credentials|535|password/i.test(m)) fail('SMTP', 'Username or password rejected.', 'For Gmail/Microsoft 365 you need an app password, not the normal one.');
      else if (/ENOTFOUND|EAI_AGAIN/i.test(m)) fail('SMTP', 'Host not found.', 'Check SMTP_HOST is spelled correctly.');
      else if (/ETIMEDOUT|ECONNREFUSED/i.test(m)) fail('SMTP', 'Could not connect.', 'Check the port (587 usually, 465 for SSL) and that your network allows it.');
      else fail('SMTP', scrub(m));
    }
  } else line(SKIP, 'Email', 'Emails are recorded in the CRM but not delivered.');

  // ---------- Google ----------
  console.log(`\n${C.bold}  Google Calendar${C.reset}`);
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    line(OK, 'Google keys', 'present');
    const expected = `${appUrl}/api/integrations/google/callback`;
    if (process.env.GOOGLE_REDIRECT_URI && process.env.GOOGLE_REDIRECT_URI !== expected) {
      fail('Google redirect URI', `.env says ${process.env.GOOGLE_REDIRECT_URI} but APP_URL implies ${expected}`, 'Make them match, and register that exact URI in Google Cloud Console.');
    } else {
      console.log(`         ${C.dim}Register this redirect URI in Google Cloud Console:${C.reset}\n         ${expected}`);
    }
    try {
      const { db } = require('./server/db');
      const tok = db.prepare("SELECT provider FROM oauth_tokens WHERE provider = 'google'").get();
      if (tok) line(OK, 'Google connection', 'Paul has completed the Connect step');
      else line(`${C.yellow}○ pending${C.reset}`, 'Google connection', 'Keys are set — now open Settings → Integrations in the app and click Connect.');
    } catch { /* db not ready */ }
  } else line(SKIP, 'Google Calendar', 'Site visits are tracked in-app only.');

  // ---------- QuickBooks ----------
  console.log(`\n${C.bold}  QuickBooks Online${C.reset}`);
  if (process.env.QBO_CLIENT_ID && process.env.QBO_CLIENT_SECRET) {
    line(OK, 'QuickBooks keys', `present (${process.env.QBO_ENVIRONMENT || 'sandbox'} mode)`);
    const expected = `${appUrl}/api/integrations/quickbooks/callback`;
    if (process.env.QBO_REDIRECT_URI && process.env.QBO_REDIRECT_URI !== expected) {
      fail('QuickBooks redirect URI', `.env says ${process.env.QBO_REDIRECT_URI} but APP_URL implies ${expected}`, 'Make them match, and register that exact URI at developer.intuit.com.');
    } else {
      console.log(`         ${C.dim}Register this redirect URI at developer.intuit.com:${C.reset}\n         ${expected}`);
    }
    try {
      const { db } = require('./server/db');
      const tok = db.prepare("SELECT provider FROM oauth_tokens WHERE provider = 'quickbooks'").get();
      if (tok) line(OK, 'QuickBooks connection', 'Paul has completed the Connect step');
      else line(`${C.yellow}○ pending${C.reset}`, 'QuickBooks connection', 'Keys are set — now open Settings → Integrations in the app and click Connect.');
    } catch { /* db not ready */ }
    if (process.env.QBO_ENVIRONMENT === 'sandbox') {
      console.log(`         ${C.yellow}Sandbox mode — invoices go to Intuit's test company, not the real accounts.${C.reset}`);
    }
  } else line(SKIP, 'QuickBooks', 'Invoices are tracked in-app only.');

  // ---------- Twilio ----------
  console.log(`\n${C.bold}  Phone & SMS (Twilio)${C.reset}`);
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    try {
      const auth = Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64');
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}.json`, { headers: { Authorization: `Basic ${auth}` } });
      if (res.ok) line(OK, 'Twilio', 'credentials accepted');
      else if (res.status === 401) fail('Twilio', 'Credentials rejected.', 'Check Account SID and Auth Token at twilio.com/console');
      else fail('Twilio', `HTTP ${res.status}`);
    } catch (e) { fail('Twilio', `Could not reach Twilio: ${scrub(e.message)}`); }
  } else line(SKIP, 'Twilio', 'Phone enquiries are logged with the "Log enquiry" button.');

  // ---------- summary ----------
  console.log('');
  if (failures.length === 0) {
    console.log(`${C.green}${C.bold}  Everything configured is working.${C.reset}`);
    console.log(`${C.dim}  Anything marked "not configured" simply runs in simulated mode — the app works fully either way.${C.reset}\n`);
  } else {
    console.log(`${C.red}${C.bold}  ${failures.length} problem${failures.length > 1 ? 's' : ''} to fix: ${failures.join(', ')}${C.reset}`);
    console.log(`${C.dim}  The app still runs — affected integrations fall back to simulated mode.${C.reset}\n`);
  }
  process.exit(0);
}

main().catch((e) => { console.error(scrub(e.stack || e.message)); process.exit(1); });
