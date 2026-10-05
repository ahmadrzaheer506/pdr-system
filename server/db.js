// ============================================================
// Database layer — PostgreSQL via Sequelize.
// Schema lives in migrations/; models in models/.
// Settings helpers and reference generators stay here so routes
// keep a single import for DATA_DIR / getSetting / nextRef.
// ============================================================
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const path = require('path');
const fs = require('fs');
const { Umzug, SequelizeStorage } = require('umzug');
const { Sequelize } = require('sequelize');
const { sequelize, Setting, Quote, Invoice } = require('./models');
const { DEFAULT_VAT_RATES, mergeVatRates } = require('./services/ukTax');

const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(__dirname, '..', process.env.DATA_DIR)
  : path.join(__dirname, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(path.join(DATA_DIR, 'files'), { recursive: true });

const todayStr = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

/**
 * Defensive JSON parse. JSONB columns already arrive as objects;
 * leftover TEXT JSON (e.g. notes) may still be a string.
 */
const pj = (s, fallback) => {
  if (s == null) return fallback;
  if (typeof s !== 'string') return s;
  try { return JSON.parse(s); } catch { return fallback; }
};

const money = (n) => `£${Number(n || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Flatten a Sequelize instance (or array) to a plain object. */
function plain(row) {
  if (row == null) return null;
  if (Array.isArray(row)) return row.map(plain);
  return typeof row.toJSON === 'function' ? row.toJSON() : { ...row };
}

/**
 * Lift nested include fields onto the parent (e.g. Customer.name → customer_name).
 */
function flattenInclude(row, nestedKey, aliases) {
  const o = plain(row);
  const nested = o[nestedKey];
  if (nested) {
    for (const [src, dest] of Object.entries(aliases)) {
      if (o[dest] === undefined) o[dest] = nested[src];
    }
    delete o[nestedKey];
  }
  return o;
}

const DEFAULT_SETTINGS = {
  company: {
    name: 'Paul Douglas Roofing and Building Ltd',
    address: 'Unit 4, Trade Park, Roofers Lane',
    city: 'United Kingdom',
    phone: '01234 567890',
    email: 'office@pauldouglasroofing.co.uk',
    vat_number: 'GB 000 0000 00',
    company_number: '00000000',
    public_liability_insurer: '',
    public_liability_cover: '',
    accreditations: [],
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
  automation: { interval_minutes: 5 },
  working_hours: { start: '08:00', end: '16:30' },
  uk: {
    vat_registered: true,
    cis_registered: false,
    cis_utr: '',
    default_cis_rate: 20,
    reverse_charge_available: false,
    late_payment_interest: true,
    late_payment_rate_above_base: 8,
    vat_rates: DEFAULT_VAT_RATES.map((r) => ({ ...r })),
  },
  timesheets: {
    enabled: true,
    require_location: true,
    site_radius_m: 300,
    require_photo_on_clockout: false,
    auto_break_minutes: 0,
    auto_break_after_hours: 6,
    round_to_minutes: 0,
    max_shift_hours: 14,
  },
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
    email_subject: 'How did you get on with our quotation {ref}?',
    steps: [
      {
        delay_days: 2,
        channel: 'whatsapp',
        body: 'Hi {name}, just checking you received our quotation {ref} for {title}. How are you getting on with it? Happy to answer any questions.',
      },
      {
        delay_days: 5,
        channel: 'email',
        body: "Hi {name}, following up one last time on quotation {ref}. If you'd like us to adjust anything or talk it through, just let us know — otherwise we'll leave it with you.",
      },
    ],
  },
  templates: {
    quote_sent_whatsapp:
      'Hi {name}, thanks for having us out. Your quotation {ref} from Paul Douglas Roofing is attached ({total}). Any questions at all, just reply here. Cheers, Paul',
    quote_email_subject: 'Your quotation {ref} from Paul Douglas Roofing',
    quote_email_body:
      'Hi {name},\n\nThank you for the opportunity to quote. Please find attached quotation {ref} for {title}, totalling {total} inc. VAT.\n\nThe quote is valid until {valid_until}. If you have any questions or would like to go ahead, just reply to this email or give us a call.\n\nBest regards,\nPaul Douglas Roofing and Building Ltd',
    invoice_email_subject: 'Invoice {ref} from Paul Douglas Roofing',
    invoice_email_body:
      'Hi {name},\n\nPlease find attached invoice {ref} for {title}, totalling {total} inc. VAT, due by {due_date}.\n\nThank you for your business.\n\nPaul Douglas Roofing and Building Ltd',
    custom: [],
  },
  branding: { logo_file: null },
};

async function getSetting(key) {
  const row = await Setting.findByPk(key);
  const fallback = DEFAULT_SETTINGS[key] !== undefined ? DEFAULT_SETTINGS[key] : null;
  if (!row) return fallback;
  if (key === 'uk') {
    const value = row.value || {};
    return {
      ...fallback,
      ...value,
      vat_rates: mergeVatRates(value.vat_rates),
    };
  }
  if (key === 'company') {
    return { ...fallback, ...(row.value || {}) };
  }
  if (key === 'templates') {
    const value = row.value || {};
    const custom = Array.isArray(value.custom) ? value.custom : [];
    return require('./messageTemplates').stripRetiredTemplateKeys({ ...fallback, ...value, custom });
  }
  if (key === 'timesheets') {
    return { ...fallback, ...(row.value || {}) };
  }
  if (key === 'branding') {
    return { ...fallback, ...(row.value || {}) };
  }
  return row.value;
}

async function setSetting(key, value) {
  await Setting.upsert({ key, value });
}

async function allSettings() {
  const out = { ...DEFAULT_SETTINGS };
  const rows = await Setting.findAll();
  for (const row of rows) {
    out[row.key] = row.value;
  }
  if (out.uk) {
    out.uk = {
      ...DEFAULT_SETTINGS.uk,
      ...out.uk,
      vat_rates: mergeVatRates(out.uk.vat_rates),
    };
  }
  if (out.company) {
    out.company = { ...DEFAULT_SETTINGS.company, ...out.company };
  }
  if (out.templates) {
    const custom = Array.isArray(out.templates.custom) ? out.templates.custom : [];
    out.templates = require('./messageTemplates').stripRetiredTemplateKeys({
      ...DEFAULT_SETTINGS.templates,
      ...out.templates,
      custom,
    });
  }
  if (out.timesheets) {
    out.timesheets = { ...DEFAULT_SETTINGS.timesheets, ...out.timesheets };
  }
  if (out.branding) {
    out.branding = { ...DEFAULT_SETTINGS.branding, ...out.branding };
  }
  const storedKeys = new Set(rows.map((row) => row.key));
  if (!storedKeys.has('checklist_templates')) {
    out.checklist_templates = require('./jobChecklists').publicTemplates();
  }
  return out;
}

/**
 * Sequential document refs: Q-2026-0001 / INV-2026-0001.
 * Uses the highest existing number for the year so deleted rows do not
 * reuse a live ref (count + 1 collides when the sequence has gaps).
 */
async function nextRef(kind) {
  const Model = kind === 'quote' ? Quote : Invoice;
  const prefix = kind === 'quote' ? 'Q' : 'INV';
  const year = new Date().getFullYear();
  const rows = await Model.findAll({
    where: { ref: { [Sequelize.Op.like]: `${prefix}-${year}-%` } },
    attributes: ['ref'],
    raw: true,
  });
  let max = 0;
  for (const row of rows) {
    const match = String(row?.ref || '').match(/-(\d+)$/);
    if (match) max = Math.max(max, parseInt(match[1], 10));
  }
  return `${prefix}-${year}-${String(max + 1).padStart(4, '0')}`;
}

async function runMigrations() {
  const umzug = new Umzug({
    migrations: {
      glob: ['*.js', { cwd: path.join(__dirname, 'migrations') }],
      resolve: ({ name, path: migrationPath }) => {
        const migration = require(migrationPath);
        return {
          name,
          up: async () => migration.up(sequelize.getQueryInterface(), Sequelize),
          down: async () => migration.down(sequelize.getQueryInterface(), Sequelize),
        };
      },
    },
    context: sequelize.getQueryInterface(),
    storage: new SequelizeStorage({ sequelize }),
    logger: console,
  });
  const pending = await umzug.pending();
  if (pending.length) {
    console.log(`[db] running ${pending.length} migration(s)`);
    await umzug.up();
  }
}

/**
 * Authenticate, apply pending Sequelize migrations, then return the connection.
 */
async function initDb() {
  await sequelize.authenticate();
  await runMigrations();
  return sequelize;
}

module.exports = {
  sequelize,
  DATA_DIR,
  todayStr,
  pj,
  getSetting,
  setSetting,
  allSettings,
  nextRef,
  money,
  DEFAULT_SETTINGS,
  initDb,
  plain,
  flattenInclude,
};
