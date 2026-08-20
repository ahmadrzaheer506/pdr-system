#!/usr/bin/env node
// ============================================================
// Interactive setup wizard — asks for each credential and
// writes .env for you. Keys are typed on your own machine and
// never leave it. Run: npm run setup
// Re-runnable: existing values are shown and kept if you press
// Enter, so you can add integrations one at a time as they arrive.
// ============================================================
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const crypto = require('crypto');

const ENV_PATH = path.join(__dirname, '.env');
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

// If stdin closes (Ctrl-D, or answers piped in), every remaining question
// resolves to "" instead of hanging — so the .env still gets written with
// whatever was answered plus existing values.
let inputClosed = false;
rl.on('close', () => { inputClosed = true; });
const ask = (q) =>
  new Promise((res) => {
    if (inputClosed) { process.stdout.write(q + '\n'); return res(''); }
    let done = false;
    const finish = (v) => { if (!done) { done = true; rl.removeListener('close', onClose); res(v); } };
    const onClose = () => finish('');
    rl.once('close', onClose);
    rl.question(q, (a) => finish(String(a).trim()));
  });

const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  orange: '\x1b[38;5;208m', green: '\x1b[32m', cyan: '\x1b[36m', yellow: '\x1b[33m',
};

// ---------- read existing .env ----------
function readEnv() {
  if (!fs.existsSync(ENV_PATH)) return {};
  const out = {};
  for (const line of fs.readFileSync(ENV_PATH, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
  }
  return out;
}

function writeEnv(env) {
  const template = fs.readFileSync(path.join(__dirname, '.env.example'), 'utf8');
  const lines = template.split('\n').map((line) => {
    const m = line.match(/^([A-Z0-9_]+)=/);
    if (!m) return line;
    const key = m[1];
    if (env[key] === undefined || env[key] === '') return `${key}=`;
    const needsQuotes = /[\s"]/.test(env[key]) && !/^".*"$/.test(env[key]);
    return `${key}=${needsQuotes ? `"${env[key]}"` : env[key]}`;
  });
  // any key not in the template (shouldn't happen) gets appended
  for (const [k, v] of Object.entries(env)) {
    if (!template.includes(`${k}=`) && v) lines.push(`${k}=${v}`);
  }
  fs.writeFileSync(ENV_PATH, lines.join('\n'));
}

const mask = (v) => (!v ? '' : v.length <= 8 ? '••••' : `${v.slice(0, 4)}${'•'.repeat(8)}${v.slice(-4)}`);

async function prompt(env, key, label, { secret = false, optional = true, hint = '' } = {}) {
  const current = env[key] || '';
  const shown = current ? `  ${C.dim}[current: ${secret ? mask(current) : current}]${C.reset}` : '';
  if (hint) console.log(`  ${C.dim}${hint}${C.reset}`);
  const answer = await ask(`  ${label}${shown}\n  > `);
  if (answer === '') {
    if (!current && !optional) console.log(`  ${C.yellow}(left blank — you can add it later)${C.reset}`);
    return current;
  }
  if (answer === '-') return ''; // explicit clear
  return answer;
}

async function section(title, blurb) {
  console.log(`\n${C.bold}${C.orange}${title}${C.reset}`);
  if (blurb) console.log(`${C.dim}${blurb}${C.reset}`);
}

async function yesNo(question, defaultYes = true) {
  const a = await ask(`  ${question} ${defaultYes ? '[Y/n]' : '[y/N]'} `);
  if (!a) return defaultYes;
  return /^y/i.test(a);
}

(async () => {
  console.clear();
  console.log(`${C.bold}${C.orange}
  ╔══════════════════════════════════════════════════════════╗
  ║   Paul Douglas Roofing — Business OS · Setup             ║
  ╚══════════════════════════════════════════════════════════╝${C.reset}`);
  console.log(`${C.dim}
  Everything here is optional except the first section. Any integration
  you skip simply stays in simulated mode — the app still works fully.

  Press ENTER to keep an existing value, or type "-" to clear one.
  Nothing you type leaves this computer.${C.reset}`);

  const env = readEnv();

  // ---------- Core ----------
  await section('1. Core settings', 'Required. Sensible defaults are filled in for you.');

  if (!env.JWT_SECRET || env.JWT_SECRET.startsWith('change-me') || env.JWT_SECRET.startsWith('dev-only')) {
    env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
    console.log(`  ${C.green}✓ Generated a secure JWT_SECRET for you${C.reset}`);
  } else {
    console.log(`  ${C.green}✓ JWT_SECRET already set${C.reset}`);
  }

  env.PORT = (await prompt(env, 'PORT', 'Port to run on (Enter for 4000)')) || '4000';
  env.APP_URL = (await prompt(env, 'APP_URL', 'Public address of the app', {
    hint: 'Use http://localhost:' + env.PORT + ' while testing. Once deployed, put the real https:// address here — webhooks and OAuth callbacks are built from it.',
  })) || `http://localhost:${env.PORT}`;
  env.DATA_DIR = env.DATA_DIR || './data';

  // ---------- AI ----------
  await section('2. AI scheduling assistant', 'Optional. Without a key the built-in rule scheduler is used (still respects drivers, skills, holidays).');
  if (await yesNo('Add an AI key now?', false)) {
    console.log(`  ${C.dim}Provide either one. Anthropic recommended; OpenAI also enables server-side voice transcription.${C.reset}`);
    env.ANTHROPIC_API_KEY = await prompt(env, 'ANTHROPIC_API_KEY', 'Anthropic API key (sk-ant-...)', { secret: true });
    env.OPENAI_API_KEY = await prompt(env, 'OPENAI_API_KEY', 'OpenAI API key (sk-...)', { secret: true });
  }

  // ---------- WhatsApp ----------
  await section('3. WhatsApp Business (Meta Cloud API)', 'Powers the WhatsApp inbox, quote sending and automatic follow-ups.');
  if (await yesNo('Configure WhatsApp now?', false)) {
    env.WHATSAPP_ACCESS_TOKEN = await prompt(env, 'WHATSAPP_ACCESS_TOKEN', 'Permanent System User access token', {
      secret: true, hint: 'Business Settings → System Users → Generate token (whatsapp_business_messaging + management). Not the 24h test token.',
    });
    env.WHATSAPP_PHONE_NUMBER_ID = await prompt(env, 'WHATSAPP_PHONE_NUMBER_ID', 'Phone Number ID', { hint: 'WhatsApp → API Setup screen' });
    env.WHATSAPP_BUSINESS_ACCOUNT_ID = await prompt(env, 'WHATSAPP_BUSINESS_ACCOUNT_ID', 'WhatsApp Business Account (WABA) ID');
    env.WHATSAPP_TEMPLATE_QUOTE = (await prompt(env, 'WHATSAPP_TEMPLATE_QUOTE', 'Approved template name for sending quotes')) || 'quote_sent';
    env.WHATSAPP_TEMPLATE_FOLLOWUP = (await prompt(env, 'WHATSAPP_TEMPLATE_FOLLOWUP', 'Approved template name for follow-ups')) || 'quote_followup';
  }

  // ---------- Facebook ----------
  await section('4. Facebook Page (Messenger + Lead Ads)', 'Page messages and lead-form submissions land in the same inbox.');
  if (await yesNo('Configure Facebook now?', false)) {
    env.FB_PAGE_ID = await prompt(env, 'FB_PAGE_ID', 'Facebook Page ID');
    env.FB_PAGE_ACCESS_TOKEN = await prompt(env, 'FB_PAGE_ACCESS_TOKEN', 'Page access token', { secret: true });
  }

  // ---------- Meta shared ----------
  if (env.WHATSAPP_ACCESS_TOKEN || env.FB_PAGE_ACCESS_TOKEN) {
    await section('4b. Meta webhook security', 'Shared by WhatsApp and Facebook.');
    env.META_VERIFY_TOKEN = (await prompt(env, 'META_VERIFY_TOKEN', 'Verify token (you invent this — paste the same value into the Meta console)')) || env.META_VERIFY_TOKEN || crypto.randomBytes(8).toString('hex');
    env.META_APP_SECRET = await prompt(env, 'META_APP_SECRET', 'Meta App Secret', { secret: true, hint: 'App Settings → Basic' });
  } else {
    env.META_VERIFY_TOKEN = env.META_VERIFY_TOKEN || 'pdr-verify-2026';
  }

  // ---------- Email ----------
  await section('5. Email (SMTP)', 'Sends quotes and follow-ups by email. Recommended even if WhatsApp is the main channel — it is the fallback.');
  if (await yesNo('Configure email sending now?', false)) {
    env.SMTP_HOST = await prompt(env, 'SMTP_HOST', 'SMTP host (e.g. smtp.sendgrid.net)');
    env.SMTP_PORT = (await prompt(env, 'SMTP_PORT', 'SMTP port (Enter for 587)')) || '587';
    env.SMTP_USER = await prompt(env, 'SMTP_USER', 'SMTP username');
    env.SMTP_PASS = await prompt(env, 'SMTP_PASS', 'SMTP password / API key', { secret: true });
    env.SMTP_FROM = (await prompt(env, 'SMTP_FROM', 'From address')) || 'Paul Douglas Roofing <office@pauldouglasroofing.co.uk>';
  }
  env.EMAIL_INBOUND_SECRET = env.EMAIL_INBOUND_SECRET && env.EMAIL_INBOUND_SECRET !== 'change-me'
    ? env.EMAIL_INBOUND_SECRET
    : crypto.randomBytes(12).toString('hex');

  // ---------- Google ----------
  await section('6. Google Calendar', 'Site visits booked in the CRM appear in Paul\'s calendar. After adding keys, Paul clicks "Connect" once in Settings.');
  if (await yesNo('Configure Google Calendar now?', false)) {
    env.GOOGLE_CLIENT_ID = await prompt(env, 'GOOGLE_CLIENT_ID', 'Google OAuth Client ID');
    env.GOOGLE_CLIENT_SECRET = await prompt(env, 'GOOGLE_CLIENT_SECRET', 'Google OAuth Client Secret', { secret: true });
    env.GOOGLE_REDIRECT_URI = `${env.APP_URL}/api/integrations/google/callback`;
    console.log(`  ${C.cyan}→ Register this exact redirect URI in Google Cloud Console:${C.reset}\n    ${env.GOOGLE_REDIRECT_URI}`);
  }

  // ---------- QuickBooks ----------
  await section('7. QuickBooks Online (UK)', 'Invoices push to QuickBooks; payment status syncs back. Paul clicks "Connect" once after this.');
  if (await yesNo('Configure QuickBooks now?', false)) {
    env.QBO_CLIENT_ID = await prompt(env, 'QBO_CLIENT_ID', 'Intuit Client ID');
    env.QBO_CLIENT_SECRET = await prompt(env, 'QBO_CLIENT_SECRET', 'Intuit Client Secret', { secret: true });
    const prod = await yesNo('Use PRODUCTION QuickBooks? (No = sandbox for testing)', false);
    env.QBO_ENVIRONMENT = prod ? 'production' : 'sandbox';
    env.QBO_REDIRECT_URI = `${env.APP_URL}/api/integrations/quickbooks/callback`;
    console.log(`  ${C.cyan}→ Register this exact redirect URI at developer.intuit.com:${C.reset}\n    ${env.QBO_REDIRECT_URI}`);
  }
  env.QBO_ENVIRONMENT = env.QBO_ENVIRONMENT || 'sandbox';

  // ---------- Twilio ----------
  await section('8. Phone & SMS capture (Twilio)', 'Optional. Until connected, phone enquiries are logged with the one-tap "Log enquiry" button.');
  if (await yesNo('Configure Twilio now?', false)) {
    env.TWILIO_ACCOUNT_SID = await prompt(env, 'TWILIO_ACCOUNT_SID', 'Twilio Account SID');
    env.TWILIO_AUTH_TOKEN = await prompt(env, 'TWILIO_AUTH_TOKEN', 'Twilio Auth Token', { secret: true });
    env.TWILIO_NUMBER = await prompt(env, 'TWILIO_NUMBER', 'Twilio phone number (+44...)');
  }

  writeEnv(env);

  // ---------- summary ----------
  console.log(`\n${C.bold}${C.green}  ✓ Saved to .env${C.reset}\n`);
  const status = [
    ['AI assistant', env.ANTHROPIC_API_KEY || env.OPENAI_API_KEY],
    ['WhatsApp', env.WHATSAPP_ACCESS_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID],
    ['Facebook', env.FB_PAGE_ACCESS_TOKEN],
    ['Email (SMTP)', env.SMTP_HOST && env.SMTP_USER],
    ['Google Calendar', env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET],
    ['QuickBooks', env.QBO_CLIENT_ID && env.QBO_CLIENT_SECRET],
    ['Twilio', env.TWILIO_ACCOUNT_SID],
  ];
  console.log(`  ${C.bold}Integration status${C.reset}`);
  for (const [name, on] of status) {
    console.log(on ? `  ${C.green}● live${C.reset}      ${name}` : `  ${C.yellow}○ simulated${C.reset} ${name}`);
  }

  const webhooks = [];
  if (env.WHATSAPP_ACCESS_TOKEN) webhooks.push(['WhatsApp', `${env.APP_URL}/api/webhooks/whatsapp`]);
  if (env.FB_PAGE_ACCESS_TOKEN) webhooks.push(['Facebook', `${env.APP_URL}/api/webhooks/facebook`]);
  if (env.SMTP_HOST) webhooks.push(['Inbound email', `${env.APP_URL}/api/webhooks/email?secret=${env.EMAIL_INBOUND_SECRET}`]);
  if (env.TWILIO_ACCOUNT_SID) webhooks.push(['Twilio voice', `${env.APP_URL}/api/webhooks/twilio/voice`], ['Twilio SMS', `${env.APP_URL}/api/webhooks/twilio/sms`]);
  if (webhooks.length) {
    console.log(`\n  ${C.bold}Webhook URLs to paste into each provider${C.reset}`);
    for (const [name, url] of webhooks) console.log(`  ${C.dim}${name}:${C.reset}\n    ${url}`);
    if (env.META_VERIFY_TOKEN) console.log(`  ${C.dim}Meta verify token:${C.reset}\n    ${env.META_VERIFY_TOKEN}`);
  }

  if (env.APP_URL.includes('localhost') && (env.WHATSAPP_ACCESS_TOKEN || env.FB_PAGE_ACCESS_TOKEN)) {
    console.log(`\n  ${C.yellow}Note:${C.reset} APP_URL is localhost, so Meta cannot reach your webhooks yet.`);
    console.log(`  ${C.dim}Outbound sending will work; inbound messages need a public https:// address.${C.reset}`);
  }

  console.log(`\n  ${C.bold}Next:${C.reset} run ${C.cyan}npm run check${C.reset} to test every connection, then ${C.cyan}npm start${C.reset}\n`);
  rl.close();
})().catch((e) => { console.error(e); rl.close(); process.exit(1); });
