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
const cron = require('node-cron');

const { db, DATA_DIR } = require('./db');
const { setStage, logActivity } = require('./services/pipeline');
const { runAllScans } = require('./services/taskEngine');
const { processDue } = require('./services/followups');
const gcal = require('./integrations/gcal');
const quickbooks = require('./integrations/quickbooks');

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(cookieParser());

// ---------- webhooks need raw JSON before the general body parser in some cases; mount first ----------
app.use('/api/webhooks', require('./routes/webhooks'));

app.use(express.json({ limit: '5mb' }));

// ---------- signed public file access (WhatsApp/Meta must fetch PDFs without a session) ----------
function fileToken(filename) {
  return crypto.createHmac('sha256', process.env.JWT_SECRET || 'dev-secret-change-me').update(filename).digest('hex').slice(0, 24);
}
app.get('/public-files/:token/:filename', (req, res) => {
  const { token, filename } = req.params;
  if (!/^[\w.\-]+$/.test(filename) || token !== fileToken(filename)) return res.sendStatus(403);
  res.sendFile(path.join(DATA_DIR, 'files', filename));
});

// ---------- authenticated file access (PDFs, clock-out photos) ----------
const { requireAuth } = require('./auth');
app.get('/api/files/:filename', requireAuth, (req, res) => {
  const { filename } = req.params;
  if (!/^[\w.\-]+$/.test(filename)) return res.sendStatus(400);
  res.sendFile(path.join(DATA_DIR, 'files', filename), (err) => { if (err) res.sendStatus(404); });
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
app.use('/api/timesheets', require('./routes/timesheets'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/chat', require('./routes/chat'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/staff', require('./routes/staff'));
app.use('/api/integrations', require('./routes/integrations'));

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// ---------- serve the built React app (production) ----------
const clientDist = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDist));
app.get(/^(?!\/api|\/public-files).*/, (req, res, next) => {
  res.sendFile(path.join(clientDist, 'index.html'), (err) => { if (err) next(); });
});

// ---------- error handler ----------
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Server error', detail: process.env.NODE_ENV === 'production' ? undefined : err.message });
});

// ============================================================
// Cron: the automation heartbeat. Every 5 minutes covers all
// time-sensitive rules (PRD §9.3, §10.2, §10.3, §10.4) without
// hammering external APIs.
// ============================================================
async function runAutomationCycle() {
  try {
    runAllScans({ setStage, logActivity });
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

cron.schedule('*/5 * * * *', runAutomationCycle);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`\n  Paul Douglas Roofing — Business OS`);
  console.log(`  Server running on http://localhost:${PORT}`);
  console.log(`  Data dir: ${DATA_DIR}\n`);
  // run once shortly after boot so demo data shows tasks immediately
  setTimeout(runAutomationCycle, 4000);
});

module.exports = app;
