// ============================================================
// Database layer — better-sqlite3 (file DB, WAL mode).
// Schema for every entity in PRD §13. Postgres-portable SQL.
// ============================================================
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(path.join(DATA_DIR, 'files'), { recursive: true });

const db = new Database(path.join(DATA_DIR, 'pdr.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('ADMIN','OFFICE','STAFF')),
  skills TEXT NOT NULL DEFAULT '[]',
  is_driver INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  holiday_allowance REAL NOT NULL DEFAULT 28,
  color TEXT NOT NULL DEFAULT '#64748b',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  address TEXT,
  postcode TEXT,
  notes TEXT,
  stage TEXT NOT NULL DEFAULT 'ENQUIRY',
  source TEXT NOT NULL DEFAULT 'manual',
  owner_id INTEGER REFERENCES users(id),
  lost_reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_customers_stage ON customers(stage);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);

CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
  source TEXT NOT NULL,               -- phone|email|whatsapp|facebook|facebook_lead|sms|manual|website
  subject TEXT,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'NEW', -- NEW|ACTIONED|CONVERTED|CLOSED
  next_action TEXT,
  meta TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_created ON leads(created_at);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('in','out')),
  channel TEXT NOT NULL,              -- whatsapp|facebook|email|sms|phone|note
  body TEXT NOT NULL,
  meta TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'logged', -- received|sent|simulated|failed|logged
  user_id INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_messages_customer ON messages(customer_id, created_at);

CREATE TABLE IF NOT EXISTS appointments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  start TEXT NOT NULL,
  end TEXT NOT NULL,
  address TEXT,
  notes TEXT,
  gcal_event_id TEXT,
  gcal_status TEXT NOT NULL DEFAULT 'not_synced', -- not_synced|synced|simulated
  status TEXT NOT NULL DEFAULT 'booked',          -- booked|done|cancelled
  stage_advanced INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS quotes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  ref TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  items TEXT NOT NULL DEFAULT '[]',
  subtotal REAL NOT NULL DEFAULT 0,
  vat_rate REAL NOT NULL DEFAULT 20,
  vat_amount REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  valid_until TEXT,
  status TEXT NOT NULL DEFAULT 'draft', -- draft|sent|accepted|declined|expired
  sent_at TEXT,
  sent_via TEXT,
  decided_at TEXT,
  pdf_file TEXT,
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  quote_id INTEGER REFERENCES quotes(id),
  title TEXT NOT NULL,
  description TEXT,
  address TEXT,
  start_date TEXT,
  end_date TEXT,
  start_time TEXT DEFAULT '08:00',
  end_time TEXT DEFAULT '16:30',
  status TEXT NOT NULL DEFAULT 'PENDING', -- PENDING|SCHEDULED|IN_PROGRESS|COMPLETED|INVOICED|PAID
  priority TEXT NOT NULL DEFAULT 'normal', -- low|normal|high|urgent
  required_skills TEXT NOT NULL DEFAULT '[]',
  materials TEXT,
  value REAL,
  notes TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_jobs_dates ON jobs(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);

CREATE TABLE IF NOT EXISTS job_assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(job_id, user_id)
);

CREATE TABLE IF NOT EXISTS job_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS team_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS holiday_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  days REAL NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- pending|approved|declined
  decided_by INTEGER REFERENCES users(id),
  decided_at TEXT,
  decline_reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  job_id INTEGER REFERENCES jobs(id),
  ref TEXT NOT NULL UNIQUE,
  items TEXT NOT NULL DEFAULT '[]',
  subtotal REAL NOT NULL DEFAULT 0,
  vat_rate REAL NOT NULL DEFAULT 20,
  vat_amount REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  amount_paid REAL NOT NULL DEFAULT 0,
  issue_date TEXT,
  due_date TEXT,
  status TEXT NOT NULL DEFAULT 'draft', -- draft|sent|part_paid|paid|overdue
  qbo_id TEXT,
  qbo_synced_at TEXT,
  sent_at TEXT,
  paid_at TEXT,
  pdf_file TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL DEFAULT 'manual', -- system|manual
  rule_key TEXT,
  title TEXT NOT NULL,
  detail TEXT,
  due_date TEXT,
  priority TEXT NOT NULL DEFAULT 'normal', -- low|normal|high
  status TEXT NOT NULL DEFAULT 'open', -- open|done|dismissed
  assignee_id INTEGER REFERENCES users(id),
  entity_type TEXT,
  entity_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  done_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_rule ON tasks(rule_key) WHERE rule_key IS NOT NULL AND status = 'open';
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status, due_date);

CREATE TABLE IF NOT EXISTS followups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quote_id INTEGER NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  step INTEGER NOT NULL,
  channel TEXT NOT NULL, -- whatsapp|email
  scheduled_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending|sent|stopped|cancelled
  sent_at TEXT,
  message TEXT,
  stop_reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_followups_due ON followups(status, scheduled_at);

CREATE TABLE IF NOT EXISTS activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id),
  kind TEXT NOT NULL,
  detail TEXT,
  entity_type TEXT,
  entity_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_activity_customer ON activity(customer_id, created_at);

CREATE TABLE IF NOT EXISTS stage_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  from_stage TEXT,
  to_stage TEXT NOT NULL,
  user_id INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS integration_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL,
  direction TEXT NOT NULL, -- in|out
  event TEXT NOT NULL,
  payload TEXT,
  status TEXT NOT NULL DEFAULT 'ok', -- ok|simulated|error
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ai_proposals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  for_date TEXT NOT NULL,
  transcript TEXT,
  provider TEXT NOT NULL,
  proposal TEXT NOT NULL,
  warnings TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'proposed', -- proposed|approved|discarded
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  approved_at TEXT
);

CREATE TABLE IF NOT EXISTS oauth_tokens (
  provider TEXT PRIMARY KEY,
  access_token TEXT,
  refresh_token TEXT,
  expires_at TEXT,
  meta TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- Timesheets — clock in / clock out for field staff.
-- One row per shift. GPS captured at both ends and compared to
-- the job address so attendance on site is evidenced.
-- ============================================================
CREATE TABLE IF NOT EXISTS timesheets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id INTEGER REFERENCES jobs(id) ON DELETE SET NULL,
  work_date TEXT NOT NULL,
  clock_in TEXT NOT NULL,
  clock_out TEXT,
  -- breaks
  break_started_at TEXT,              -- set while on break, cleared on resume
  break_minutes REAL NOT NULL DEFAULT 0,
  -- geolocation (nullable — staff may decline permission)
  in_lat REAL, in_lng REAL, in_accuracy REAL,
  out_lat REAL, out_lng REAL, out_accuracy REAL,
  in_distance_m REAL,                 -- metres from the job address at clock-in
  out_distance_m REAL,
  location_flag TEXT,                 -- NULL | 'far_from_site' | 'no_location'
  -- clock-out extras
  photo_file TEXT,
  notes TEXT,
  -- computed on clock-out
  worked_minutes REAL,
  cost_rate REAL,                     -- snapshot of the user's rate at the time
  labour_cost REAL,
  status TEXT NOT NULL DEFAULT 'active', -- active | completed | approved | rejected
  approved_by INTEGER REFERENCES users(id),
  approved_at TEXT,
  edit_reason TEXT,                   -- set if office adjusted the times
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_timesheets_user ON timesheets(user_id, work_date);
CREATE INDEX IF NOT EXISTS idx_timesheets_job ON timesheets(job_id);
CREATE INDEX IF NOT EXISTS idx_timesheets_status ON timesheets(status);
-- A person can only have one shift running at a time.
CREATE UNIQUE INDEX IF NOT EXISTS idx_timesheets_one_active
  ON timesheets(user_id) WHERE status = 'active';
`);

// ============================================================
// Lightweight migrations — additive columns for databases created
// by an earlier version. Safe to run on every boot.
// ============================================================
function addColumnIfMissing(table, column, definition) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    console.log(`[migration] added ${table}.${column}`);
  }
}
addColumnIfMissing('invoices', 'notes', 'TEXT');
addColumnIfMissing('jobs', 'notes', 'TEXT');

// --- Job site coordinates, used to verify clock-ins happened on site.
//     Populated by geocoding the address, or set manually. Null is fine —
//     the distance check simply reports "unknown" rather than guessing. ---
addColumnIfMissing('jobs', 'lat', 'REAL');
addColumnIfMissing('jobs', 'lng', 'REAL');

// --- Job costing: hourly cost rate per staff member (Owner-only field) ---
addColumnIfMissing('users', 'hourly_cost', 'REAL NOT NULL DEFAULT 0');
addColumnIfMissing('users', 'cis_status', "TEXT NOT NULL DEFAULT 'none'"); // none|net20|higher30|gross

// --- UK quoting: VAT treatment, CIS, retention, payment terms ---
// customer_type drives which consumer-law wording appears on the quote.
addColumnIfMissing('customers', 'customer_type', "TEXT NOT NULL DEFAULT 'domestic'"); // domestic|commercial
addColumnIfMissing('customers', 'company_name', 'TEXT');
addColumnIfMissing('customers', 'vat_number', 'TEXT');

for (const t of ['quotes', 'invoices']) {
  // How VAT is handled overall on this document
  addColumnIfMissing(t, 'vat_treatment', "TEXT NOT NULL DEFAULT 'standard'");
  //   standard        — normal VAT charged at per-line rates
  //   reverse_charge  — CIS Domestic Reverse Charge: customer accounts for VAT
  //   not_registered  — business is not VAT registered, no VAT charged
  addColumnIfMissing(t, 'labour_total', 'REAL NOT NULL DEFAULT 0');
  addColumnIfMissing(t, 'materials_total', 'REAL NOT NULL DEFAULT 0');
  addColumnIfMissing(t, 'vat_breakdown', "TEXT NOT NULL DEFAULT '[]'"); // [{rate, net, vat}]
  // CIS (applies when Paul invoices another contractor)
  addColumnIfMissing(t, 'cis_applies', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing(t, 'cis_rate', 'REAL NOT NULL DEFAULT 20');
  addColumnIfMissing(t, 'cis_deduction', 'REAL NOT NULL DEFAULT 0');
  // Retention (common on commercial contracts)
  addColumnIfMissing(t, 'retention_percent', 'REAL NOT NULL DEFAULT 0');
  addColumnIfMissing(t, 'retention_amount', 'REAL NOT NULL DEFAULT 0');
  addColumnIfMissing(t, 'due_now', 'REAL NOT NULL DEFAULT 0'); // total after CIS + retention
}

// Quote-only commercial terms
addColumnIfMissing('quotes', 'payment_schedule', "TEXT NOT NULL DEFAULT '[]'"); // [{label, percent|amount, trigger}]
addColumnIfMissing('quotes', 'exclusions', 'TEXT');
addColumnIfMissing('quotes', 'inclusions', 'TEXT');
addColumnIfMissing('quotes', 'warranty_years', 'INTEGER');
addColumnIfMissing('quotes', 'warranty_text', 'TEXT');
addColumnIfMissing('quotes', 'lead_time', 'TEXT');
addColumnIfMissing('quotes', 'duration_estimate', 'TEXT');
addColumnIfMissing('quotes', 'access_requirements', 'TEXT');
addColumnIfMissing('quotes', 'provisional_sums', "TEXT NOT NULL DEFAULT '[]'");
// Consumer Contracts Regulations 2013 — 14-day cancellation right.
// Recorded per-quote because it only applies to domestic customers
// where the contract was agreed away from the trader's premises.
addColumnIfMissing('quotes', 'cancellation_rights_apply', 'INTEGER NOT NULL DEFAULT 1');
addColumnIfMissing('quotes', 'waiver_signed', 'INTEGER NOT NULL DEFAULT 0'); // customer asked for work to start inside 14 days

// ---------- helpers ----------
const nowIso = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
const todayStr = () => {
  const d = new Date();
  return d.toISOString().slice(0, 10);
};
const j = (v) => JSON.stringify(v);
const pj = (s, fallback) => {
  try { return JSON.parse(s); } catch { return fallback; }
};

// ---------- settings ----------
const DEFAULT_SETTINGS = {
  company: {
    name: 'Paul Douglas Roofing and Building Ltd',
    address: 'Unit 4, Trade Park, Roofers Lane',
    city: 'United Kingdom',
    phone: '01234 567890',
    email: 'office@pauldouglasroofing.co.uk',
    vat_number: 'GB 000 0000 00',
    company_number: '00000000',
    // Shown on quotes — UK customers expect to see these before signing
    public_liability_insurer: '',
    public_liability_cover: '',
    accreditations: [],           // e.g. ['NFRC', 'TrustMark', 'CompetentRoofer']
    bank_name: '',
    bank_account_name: '',
    bank_sort_code: '',
    bank_account_number: '',
  },
  vat_rate: 20,
  currency: 'GBP',
  quote_validity_days: 30,
  invoice_due_days: 14,
  holiday_notice_days: 28,
  holiday_allowance_days: 28,
  working_hours: { start: '08:00', end: '16:30' },

  // ---------- UK trading / tax configuration ----------
  uk: {
    vat_registered: true,
    // Is the business itself in CIS as a subcontractor? Drives whether CIS
    // deduction and the Domestic Reverse Charge can be applied to invoices.
    cis_registered: false,
    cis_utr: '',
    default_cis_rate: 20,          // 20 net, 30 higher, 0 gross
    // Domestic Reverse Charge for building & construction services (since 1 Mar 2021)
    reverse_charge_available: false,
    late_payment_interest: true,   // Late Payment of Commercial Debts (Interest) Act 1998
    late_payment_rate_above_base: 8,
  },

  // ---------- Timesheets / job costing ----------
  timesheets: {
    enabled: true,
    require_location: true,        // ask for GPS at clock in/out
    site_radius_m: 300,            // flag a clock-in further than this from the job
    require_photo_on_clockout: false,
    auto_break_minutes: 0,         // deduct automatically after a long shift (0 = off)
    auto_break_after_hours: 6,
    round_to_minutes: 0,           // 0 = exact, 15 = round to nearest quarter hour
    max_shift_hours: 14,           // safety net: flag/auto-close runaway shifts
  },

  // ---------- Quote defaults ----------
  quote_defaults: {
    warranty_years: 10,
    warranty_text: 'All workmanship guaranteed for {years} years from completion. Manufacturer material warranties passed to the customer where applicable.',
    lead_time: 'Typically 2–4 weeks from acceptance, subject to weather and current workload.',
    inclusions: 'All labour, materials, scaffolding where specified, and removal of all waste arising from the works.',
    exclusions: [
      'Any structural timber repairs found once the covering is stripped (quoted separately if needed)',
      'Asbestos survey, removal or disposal',
      'Internal making good, redecoration or plastering',
      'Works to any area not specifically described above',
      'Parking charges or permits where these apply',
    ].join('\n'),
    payment_schedule: [
      { label: 'Deposit on acceptance', percent: 25, trigger: 'On written acceptance of this quotation' },
      { label: 'Balance on completion', percent: 75, trigger: 'On practical completion of the works' },
    ],
  },
  followups: {
    enabled: true,
    steps: [
      { delay_days: 2, channel: 'whatsapp' },
      { delay_days: 5, channel: 'email' },
    ],
  },
  templates: {
    quote_sent_whatsapp:
      'Hi {name}, thanks for having us out. Your quotation {ref} from Paul Douglas Roofing is attached ({total}). Any questions at all, just reply here. Cheers, Paul',
    quote_followup_1:
      'Hi {name}, just checking you received our quotation {ref} for {title}. How are you getting on with it? Happy to answer any questions.',
    quote_followup_2:
      "Hi {name}, following up one last time on quotation {ref}. If you'd like us to adjust anything or talk it through, just let us know — otherwise we'll leave it with you.",
    quote_email_subject: 'Your quotation {ref} from Paul Douglas Roofing',
    quote_email_body:
      'Hi {name},\n\nThank you for the opportunity to quote. Please find attached quotation {ref} for {title}, totalling {total} inc. VAT.\n\nThe quote is valid until {valid_until}. If you have any questions or would like to go ahead, just reply to this email or give us a call.\n\nBest regards,\nPaul Douglas Roofing and Building Ltd',
    followup_email_subject: 'How did you get on with our quotation {ref}?',
    invoice_email_subject: 'Invoice {ref} from Paul Douglas Roofing',
    invoice_email_body:
      'Hi {name},\n\nPlease find attached invoice {ref} for {title}, totalling {total} inc. VAT, due by {due_date}.\n\nThank you for your business.\n\nPaul Douglas Roofing and Building Ltd',
  },
};

function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  if (row) return pj(row.value, null);
  return DEFAULT_SETTINGS[key] !== undefined ? DEFAULT_SETTINGS[key] : null;
}
function setSetting(key, value) {
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, j(value));
}
function allSettings() {
  const out = { ...DEFAULT_SETTINGS };
  for (const row of db.prepare('SELECT key, value FROM settings').all()) {
    out[row.key] = pj(row.value, out[row.key]);
  }
  return out;
}

// ---------- reference generators (Q-2026-0001 / INV-2026-0001) ----------
function nextRef(kind) {
  const table = kind === 'quote' ? 'quotes' : 'invoices';
  const prefix = kind === 'quote' ? 'Q' : 'INV';
  const year = new Date().getFullYear();
  const row = db
    .prepare(`SELECT COUNT(*) AS c FROM ${table} WHERE ref LIKE ?`)
    .get(`${prefix}-${year}-%`);
  return `${prefix}-${year}-${String(row.c + 1).padStart(4, '0')}`;
}

const money = (n) => `£${Number(n || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

module.exports = { db, DATA_DIR, nowIso, todayStr, j, pj, getSetting, setSetting, allSettings, nextRef, money, DEFAULT_SETTINGS };
