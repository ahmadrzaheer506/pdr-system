// ============================================================
// Paul Douglas Roofing — Business OS
// Server entry point: Express app, cron jobs, static hosting.
// ============================================================
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const crypto = require('crypto');

const { DATA_DIR, initDb } = require('./db');
const { asyncHandler, requireAuth, forbidStaffPdfs, enforceCsrf } = require('./auth');
const { runAutomationCycle, applyIntervalFromSettings } = require('./automation');

const app = express();
if ((process.env.APP_URL || '').startsWith('https://') || process.env.TRUST_PROXY === '1') {
  app.set('trust proxy', 1);
}
app.use(cors({ origin: true, credentials: true }));
app.use(cookieParser());

// ---------- webhooks need raw JSON before the general body parser in some cases; mount first ----------
app.use('/api/webhooks', require('./routes/webhooks'));

app.use(express.json({ limit: '5mb' }));
app.use('/api', enforceCsrf);

// ---------- signed public file access (WhatsApp/Meta must fetch PDFs without a session) ----------
function fileToken(filename) {
  return crypto.createHmac('sha256', process.env.JWT_SECRET || 'dev-secret-change-me').update(filename).digest('hex').slice(0, 24);
}
app.get('/public-files/:token/:filename', (req, res) => {
  const { token, filename } = req.params;
  if (!/^[\w.\-]+$/.test(filename) || token !== fileToken(filename)) return res.sendStatus(403);
  res.sendFile(path.join(DATA_DIR, 'files', filename), (err) => {
    if (err && !res.headersSent) res.sendStatus(404);
  });
});

// ---------- authenticated file access (PDFs, clock-out photos) ----------
app.get('/api/files/:filename', asyncHandler(requireAuth), forbidStaffPdfs, (req, res) => {
  const { filename } = req.params;
  if (!/^[\w.\-]+$/.test(filename)) return res.sendStatus(400);
  if (req.query.download) {
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  }
  res.sendFile(path.join(DATA_DIR, 'files', filename), (err) => { if (err) res.sendStatus(404); });
});

/** Public company logo for login and chrome (requirement 17.3). */
app.get('/api/branding/logo', (req, res) => {
  require('./branding').sendLogo(res);
});

// ---------- API routes ----------
app.use('/api/auth', require('./routes/auth'));
app.use('/api/leads', require('./routes/leads'));
app.use('/api/customers', require('./routes/customers'));
app.use('/api/appointments', require('./routes/appointments'));
app.use('/api/quotes', require('./routes/quotes'));
app.use('/api/jobs', require('./routes/jobs'));
app.use('/api/holidays', require('./routes/holidays'));
app.use('/api/invoices', require('./routes/invoices'));
app.use('/api/tasks', require('./routes/tasks'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/timesheets', require('./routes/timesheets'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/chat', require('./routes/chat'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/catalogue', require('./routes/catalogue'));
app.use('/api/staff', require('./routes/staff'));
app.use('/api/integrations', require('./routes/integrations'));

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// Static React files are served by the separate PM2 frontend process in production.
// Local `npm start` still serves client/dist from this process unless SERVE_FRONTEND=0.
if (process.env.SERVE_FRONTEND !== '0') {
  const clientDist = path.join(__dirname, '..', 'client', 'dist');
  app.use(express.static(clientDist));
  app.get(/^(?!\/api|\/public-files).*/, (req, res, next) => {
    res.sendFile(path.join(clientDist, 'index.html'), (err) => { if (err) next(); });
  });
}

// ---------- error handler ----------
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Server error', detail: process.env.NODE_ENV === 'production' ? undefined : err.message });
});

const PORT = Number(process.env.PORT) || 4000;
const HOST = process.env.HOST || '0.0.0.0';

async function start() {
  await initDb();
  await applyIntervalFromSettings();
  app.listen(PORT, HOST, () => {
    console.log(`\n  Paul Douglas Roofing — Business OS`);
    console.log(`  Server running on http://${HOST}:${PORT}`);
    console.log(`  Data dir: ${DATA_DIR}\n`);
    setTimeout(runAutomationCycle, 4000);
  });
}

if (require.main === module) {
  start().catch((err) => {
    console.error('[db] failed to start', err);
    process.exit(1);
  });
}

module.exports = app;
