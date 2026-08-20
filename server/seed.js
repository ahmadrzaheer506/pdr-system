// ============================================================
// Demo seed data — realistic UK roofing business, spread over
// the past ~5 weeks so the dashboard trend/pipeline look real.
// Run: npm run seed        (skips if already seeded)
//      npm run seed:clean  (wipes all data first)
// ============================================================
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { db, j, nextRef, setSetting } = require('./db');
const { hashPassword } = require('./auth');

const CLEAN = process.argv.includes('--clean');

// Order matters: children before parents so foreign keys stay satisfied.
// Every table the seed writes to MUST be listed here, or `seed:clean`
// silently leaves rows behind and duplicates them on the next run.
const TABLES = [
  'ai_proposals', 'oauth_tokens', 'integration_events', 'stage_history', 'activity',
  'followups', 'tasks', 'timesheets', 'invoices', 'job_messages', 'job_assignments', 'jobs',
  'quotes', 'appointments', 'messages', 'leads', 'holiday_requests', 'team_messages',
  'customers', 'users', 'settings',
];

if (CLEAN) {
  console.log('Cleaning existing data...');
  db.pragma('foreign_keys = OFF');
  for (const t of TABLES) db.prepare(`DELETE FROM ${t}`).run();
  // Reset AUTOINCREMENT counters so a reseeded database is byte-identical
  // every time (otherwise IDs keep climbing across reseeds).
  try { db.prepare('DELETE FROM sqlite_sequence').run(); } catch { /* no sequence table yet */ }
  db.pragma('foreign_keys = ON');

  // Safety net: if a new table is added to the schema but forgotten here,
  // the clean would silently leave rows behind and the next reseed would
  // duplicate everything. Fail loudly instead.
  const leftovers = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
    .all()
    .map((t) => ({ name: t.name, rows: db.prepare(`SELECT COUNT(*) c FROM "${t.name}"`).get().c }))
    .filter((t) => t.rows > 0);
  if (leftovers.length) {
    console.error(`\n  Clean incomplete — these tables still hold rows: ${leftovers.map((t) => `${t.name} (${t.rows})`).join(', ')}`);
    console.error('  Add them to the TABLES list in server/seed.js.\n');
    process.exit(1);
  }
}

const already = db.prepare('SELECT COUNT(*) c FROM users').get().c;
if (already > 0 && !CLEAN) {
  console.log(`Database already has ${already} user(s) — skipping seed. Run "npm run seed:clean" to reset and reseed.`);
  process.exit(0);
}

// ---------- time helpers ----------
function iso(d) { return d.toISOString().replace('T', ' ').slice(0, 19); }
function at(daysOffset, hour = 9, min = 0) {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  d.setHours(hour, min, 0, 0);
  return iso(d);
}
function dateOnly(daysOffset) { return at(daysOffset).slice(0, 10); }

// ---------- settings ----------
setSetting('company', {
  name: 'Paul Douglas Roofing and Building Ltd',
  address: 'Unit 4, Trade Park, Roofers Lane',
  city: 'United Kingdom',
  phone: '01234 567890',
  email: 'office@pauldouglasroofing.co.uk',
  vat_number: 'GB 123 4567 89',
  company_number: '09876543',
});

console.log('Creating staff...');
// ---------- users ----------
function addUser({ name, email, phone, password, role, skills = [], is_driver = 0, color, holiday_allowance = 28, hourly_cost = 0 }) {
  const r = db.prepare(
    `INSERT INTO users (name, email, phone, password_hash, role, skills, is_driver, color, holiday_allowance, hourly_cost) VALUES (?,?,?,?,?,?,?,?,?,?)`
  ).run(name, email, phone, hashPassword(password), role, j(skills), is_driver, color, holiday_allowance, hourly_cost);
  return r.lastInsertRowid;
}

const paul = addUser({ name: 'Paul Douglas', email: 'paul@pauldouglasroofing.co.uk', phone: '07700 900001', password: 'password123', role: 'ADMIN', color: '#ea580c' });
const lisa = addUser({ name: 'Lisa Grant', email: 'lisa@pauldouglasroofing.co.uk', phone: '07700 900002', password: 'password123', role: 'OFFICE', color: '#0891b2' });

const jamie = addUser({ hourly_cost: 24.50, name: 'Jamie Fisher', email: 'jamie@pauldouglasroofing.co.uk', phone: '07700 900011', password: 'password123', role: 'STAFF', skills: ['roofer', 'slate', 'lead_work'], is_driver: 1, color: '#16a34a' });
const connor = addUser({ hourly_cost: 23.00, name: 'Connor Blake', email: 'connor@pauldouglasroofing.co.uk', phone: '07700 900012', password: 'password123', role: 'STAFF', skills: ['roofer', 'flat_roof', 'felt'], is_driver: 0, color: '#7c3aed' });
const liam = addUser({ hourly_cost: 16.50, name: 'Liam Ozturk', email: 'liam@pauldouglasroofing.co.uk', phone: '07700 900013', password: 'password123', role: 'STAFF', skills: ['labourer', 'guttering'], is_driver: 1, color: '#d97706' });
const ryan = addUser({ hourly_cost: 25.00, name: 'Ryan Kaczmarek', email: 'ryan@pauldouglasroofing.co.uk', phone: '07700 900014', password: 'password123', role: 'STAFF', skills: ['roofer', 'slate', 'chimney'], is_driver: 1, color: '#2563eb' });
const callum = addUser({ hourly_cost: 15.75, name: 'Callum Ashworth', email: 'callum@pauldouglasroofing.co.uk', phone: '07700 900015', password: 'password123', role: 'STAFF', skills: ['labourer', 'flat_roof'], is_driver: 0, color: '#db2777' });
const nathan = addUser({ hourly_cost: 21.00, name: 'Nathan Wren', email: 'nathan@pauldouglasroofing.co.uk', phone: '07700 900016', password: 'password123', role: 'STAFF', skills: ['roofer', 'felt', 'guttering'], is_driver: 0, color: '#0d9488' });

// ---------- helpers for building customer + full history ----------
function addCustomer({ name, phone, email, address, postcode, stage, source, createdAt, updatedAt, lostReason }) {
  const r = db.prepare(
    `INSERT INTO customers (name, phone, email, address, postcode, stage, source, lost_reason, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`
  ).run(name, phone || null, email || null, address, postcode || null, stage, source, lostReason || null, createdAt, updatedAt || createdAt);
  return r.lastInsertRowid;
}
function addActivity(customerId, userId, kind, detail, createdAt, entityType = null, entityId = null) {
  db.prepare('INSERT INTO activity (customer_id, user_id, kind, detail, entity_type, entity_id, created_at) VALUES (?,?,?,?,?,?,?)')
    .run(customerId, userId, kind, detail, entityType, entityId, createdAt);
}
function addStageHistory(customerId, from, to, userId, createdAt) {
  db.prepare('INSERT INTO stage_history (customer_id, from_stage, to_stage, user_id, created_at) VALUES (?,?,?,?,?)')
    .run(customerId, from, to, userId, createdAt);
}
function addLead(customerId, source, subject, message, status, createdAt, nextAction = null) {
  db.prepare('INSERT INTO leads (customer_id, source, subject, message, status, next_action, created_at) VALUES (?,?,?,?,?,?,?)')
    .run(customerId, source, subject, message, status, nextAction, createdAt);
}
function addMessage(customerId, direction, channel, body, status, createdAt, userId = null) {
  db.prepare('INSERT INTO messages (customer_id, direction, channel, body, status, user_id, created_at) VALUES (?,?,?,?,?,?,?)')
    .run(customerId, direction, channel, body, status, userId, createdAt);
}
function addAppointment(customerId, title, start, end, address, status, gcalStatus, createdBy, createdAt, stageAdvanced = 0) {
  const r = db.prepare(
    `INSERT INTO appointments (customer_id, title, start, end, address, status, gcal_status, stage_advanced, created_by, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`
  ).run(customerId, title, start, end, address, status, gcalStatus, stageAdvanced, createdBy, createdAt);
  return r.lastInsertRowid;
}
function addQuote({ customerId, title, items, status, createdAt, sentAt, sentVia, decidedAt, validUntil, notes }) {
  const subtotal = items.reduce((s, it) => s + it.qty * it.unit_price, 0);
  const vat = +(subtotal * 0.2).toFixed(2);
  const total = +(subtotal + vat).toFixed(2);
  const ref = nextRef('quote');
  const r = db.prepare(
    `INSERT INTO quotes (customer_id, ref, title, items, subtotal, vat_rate, vat_amount, total, valid_until, status, sent_at, sent_via, decided_at, notes, created_by, created_at, updated_at)
     VALUES (?,?,?,?,?,20,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(customerId, ref, title, j(items), subtotal, vat, total, validUntil, status, sentAt || null, sentVia || null, decidedAt || null, notes || null, lisa, createdAt, decidedAt || sentAt || createdAt);
  return { id: r.lastInsertRowid, ref, total, subtotal, vat_amount: vat };
}
function addJob({ customerId, quoteId, title, description, address, status, priority = 'normal', requiredSkills = [], materials, value, startDate, endDate, startTime = '08:00', endTime = '16:30', createdAt, crew = [], completedAt }) {
  const r = db.prepare(
    `INSERT INTO jobs (customer_id, quote_id, title, description, address, status, priority, required_skills, materials, value, start_date, end_date, start_time, end_time, completed_at, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(customerId, quoteId || null, title, description || null, address, status, priority, j(requiredSkills), materials || null, value || null, startDate || null, endDate || null, startTime, endTime, completedAt || null, createdAt, createdAt);
  const jobId = r.lastInsertRowid;
  for (const uid of crew) db.prepare('INSERT INTO job_assignments (job_id, user_id) VALUES (?,?)').run(jobId, uid);
  return jobId;
}
function addInvoice({ customerId, jobId, items, status, issueDate, dueDate, sentAt, paidAt, amountPaid = 0, createdAt, qboId }) {
  const subtotal = items.reduce((s, it) => s + it.qty * it.unit_price, 0);
  const vat = +(subtotal * 0.2).toFixed(2);
  const total = +(subtotal + vat).toFixed(2);
  const ref = nextRef('invoice');
  const r = db.prepare(
    `INSERT INTO invoices (customer_id, job_id, ref, items, subtotal, vat_rate, vat_amount, total, amount_paid, issue_date, due_date, status, sent_at, paid_at, qbo_id, created_at)
     VALUES (?,?,?,?,?,20,?,?,?,?,?,?,?,?,?,?)`
  ).run(customerId, jobId || null, ref, j(items), subtotal, vat, total, amountPaid, issueDate, dueDate, status, sentAt || null, paidAt || null, qboId || null, createdAt);
  return { id: r.lastInsertRowid, ref, total };
}

console.log('Creating customers across the full pipeline...');

// ===================== 1-2: fresh ENQUIRY (today, unactioned) =====================
{
  const id = addCustomer({ name: 'Dave Whitfield', phone: '+447911223344', email: null, address: '14 Elm Grove, Reading', stage: 'ENQUIRY', source: 'whatsapp', createdAt: at(0, 8, 12) });
  addLead(id, 'whatsapp', null, 'Hiya, got a leak coming through the bedroom ceiling after last night\'s rain. Can someone come take a look this week?', 'NEW', at(0, 8, 12), 'Review & respond');
  addMessage(id, 'in', 'whatsapp', 'Hiya, got a leak coming through the bedroom ceiling after last night\'s rain. Can someone come take a look this week?', 'received', at(0, 8, 12));
  addActivity(id, null, 'customer_created', 'New customer created from whatsapp enquiry', at(0, 8, 12));
  addActivity(id, null, 'inbound', 'Inbound whatsapp message', at(0, 8, 12));
}
{
  const id = addCustomer({ name: 'Priya Nair', phone: null, email: 'priya.nair@example.co.uk', address: '8 Oakfield Road, Reading', stage: 'ENQUIRY', source: 'facebook', createdAt: at(0, 10, 40) });
  addLead(id, 'facebook', null, 'Hi! Saw your page — need a quote for a full re-roof on a 1930s semi. Can you help?', 'NEW', at(0, 10, 40), 'Review & respond');
  addMessage(id, 'in', 'facebook', 'Hi! Saw your page — need a quote for a full re-roof on a 1930s semi. Can you help?', 'received', at(0, 10, 40));
  addActivity(id, null, 'customer_created', 'New customer created from facebook enquiry', at(0, 10, 40));
}

// ===================== 3: SITE_VISIT_BOOKED (visit tomorrow) =====================
{
  const id = addCustomer({ name: 'Sandra Cole', phone: '+447922334455', email: 'sandra.cole@example.co.uk', address: '22 Birch Close, Caversham', stage: 'SITE_VISIT_BOOKED', source: 'phone', createdAt: at(-2, 9, 0), updatedAt: at(-1, 14, 0) });
  addLead(id, 'phone', null, 'Called about guttering pulling away from the fascia on the back of the house.', 'ACTIONED', at(-2, 9, 0));
  addMessage(id, 'in', 'phone', 'Called about guttering pulling away from the fascia on the back of the house.', 'logged', at(-2, 9, 0));
  addActivity(id, null, 'customer_created', 'New customer created from phone enquiry', at(-2, 9, 0));
  addStageHistory(id, 'ENQUIRY', 'SITE_VISIT_BOOKED', paul, at(-1, 14, 0));
  addActivity(id, paul, 'appointment_booked', `Site visit booked for ${at(1, 10, 0)} (in Google Calendar)`, at(-1, 14, 0));
  addAppointment(id, 'Site visit — Sandra Cole', at(1, 10, 0), at(1, 11, 0), '22 Birch Close, Caversham', 'booked', 'simulated', paul, at(-1, 14, 0));
}

// ===================== 4: QUOTE_PENDING (visit done, quote not yet made — has an open task) =====================
{
  const id = addCustomer({ name: 'Marcus Reid', phone: '+447933445566', email: 'marcus.reid@example.co.uk', address: '5 The Sidings, Woodley', stage: 'QUOTE_PENDING', source: 'email', createdAt: at(-6, 9, 15), updatedAt: at(-1, 16, 0) });
  addLead(id, 'email', 'Roof enquiry', 'Good morning, we have some slipped tiles after the recent storm and would like a quote to make good. Regards, Marcus', 'ACTIONED', at(-6, 9, 15));
  addMessage(id, 'in', 'email', 'Good morning, we have some slipped tiles after the recent storm and would like a quote to make good. Regards, Marcus', 'received', at(-6, 9, 15));
  addStageHistory(id, 'ENQUIRY', 'SITE_VISIT_BOOKED', lisa, at(-5, 11, 0));
  addAppointment(id, 'Site visit — Marcus Reid', at(-1, 9, 30), at(-1, 10, 30), '5 The Sidings, Woodley', 'done', 'simulated', lisa, at(-5, 11, 0), 1);
  addStageHistory(id, 'SITE_VISIT_BOOKED', 'QUOTE_PENDING', null, at(-1, 10, 30));
  addActivity(id, null, 'stage_change', 'Site visit completed — quote needed', at(-1, 10, 30));
}

// ===================== 5-6: QUOTED (awaiting reply, follow-up not due yet) =====================
{
  const id = addCustomer({ name: 'Grace Bowman', phone: '+447944556677', email: 'grace.bowman@example.co.uk', address: '31 Kennet Side, Reading', stage: 'QUOTED', source: 'whatsapp', createdAt: at(-5, 13, 0), updatedAt: at(-1, 9, 0) });
  addStageHistory(id, 'ENQUIRY', 'SITE_VISIT_BOOKED', paul, at(-5, 13, 30));
  addAppointment(id, 'Site visit — Grace Bowman', at(-3, 14, 0), at(-3, 15, 0), '31 Kennet Side, Reading', 'done', 'simulated', paul, at(-5, 13, 30), 1);
  addStageHistory(id, 'SITE_VISIT_BOOKED', 'QUOTE_PENDING', null, at(-3, 15, 0));
  const q = addQuote({
    customerId: id, title: 'Flat roof felt replacement — rear extension',
    items: [{ description: 'Strip existing felt covering', qty: 1, unit_price: 180 }, { description: 'Supply & fit new torch-on felt system (3-layer)', qty: 18, unit_price: 42 }, { description: 'New GRP box gutter trim', qty: 1, unit_price: 220 }],
    status: 'sent', createdAt: at(-2, 9, 0), sentAt: at(-1, 9, 0), sentVia: 'whatsapp', validUntil: dateOnly(28),
  });
  addStageHistory(id, 'QUOTE_PENDING', 'QUOTED', lisa, at(-1, 9, 0));
  addMessage(id, 'out', 'whatsapp', `Hi Grace, thanks for having us out. Your quotation ${q.ref} from Paul Douglas Roofing is attached (£${q.total.toFixed(2)}). Any questions at all, just reply here. Cheers, Paul`, 'simulated', at(-1, 9, 0), lisa);
  addActivity(id, lisa, 'quote_sent', `Quote ${q.ref} (£${q.total.toFixed(2)}) sent via whatsapp`, at(-1, 9, 0), 'quote', q.id);
  db.prepare('INSERT INTO followups (quote_id, customer_id, step, channel, scheduled_at, status) VALUES (?,?,?,?,?,?)').run(q.id, id, 1, 'whatsapp', at(1, 9, 0), 'pending');
  db.prepare('INSERT INTO followups (quote_id, customer_id, step, channel, scheduled_at, status) VALUES (?,?,?,?,?,?)').run(q.id, id, 2, 'email', at(4, 9, 0), 'pending');
}

// ===================== 7: FOLLOW_UP (first chase already sent) =====================
{
  const id = addCustomer({ name: 'Tom Ellery', phone: '+447955667788', email: 'tom.ellery@example.co.uk', address: '9 Mill Lane, Tilehurst', stage: 'FOLLOW_UP', source: 'facebook_lead', createdAt: at(-9, 10, 0), updatedAt: at(-2, 9, 0) });
  addStageHistory(id, 'ENQUIRY', 'SITE_VISIT_BOOKED', paul, at(-9, 15, 0));
  addAppointment(id, 'Site visit — Tom Ellery', at(-7, 13, 0), at(-7, 14, 0), '9 Mill Lane, Tilehurst', 'done', 'simulated', paul, at(-9, 15, 0), 1);
  addStageHistory(id, 'SITE_VISIT_BOOKED', 'QUOTE_PENDING', null, at(-7, 14, 0));
  const q = addQuote({
    customerId: id, title: 'Chimney repointing & new lead flashing',
    items: [{ description: 'Repoint chimney stack (all sides)', qty: 1, unit_price: 380 }, { description: 'Supply & fit new code 4 lead flashing', qty: 1, unit_price: 260 }, { description: 'Fit chimney cowl', qty: 2, unit_price: 45 }],
    status: 'sent', createdAt: at(-6, 9, 0), sentAt: at(-5, 9, 0), sentVia: 'whatsapp', validUntil: dateOnly(25),
  });
  addStageHistory(id, 'QUOTE_PENDING', 'QUOTED', lisa, at(-5, 9, 0));
  addActivity(id, lisa, 'quote_sent', `Quote ${q.ref} (£${q.total.toFixed(2)}) sent via whatsapp`, at(-5, 9, 0), 'quote', q.id);
  addStageHistory(id, 'QUOTED', 'FOLLOW_UP', null, at(-2, 9, 0));
  addMessage(id, 'out', 'whatsapp', `Hi Tom, just checking you received our quotation ${q.ref} for Chimney repointing & new lead flashing. How are you getting on with it? Happy to answer any questions.`, 'simulated', at(-2, 9, 0), null);
  addActivity(id, null, 'followup_sent', `Automatic follow-up 1/2 sent for quote ${q.ref} via whatsapp`, at(-2, 9, 0));
  db.prepare('INSERT INTO followups (quote_id, customer_id, step, channel, scheduled_at, status, sent_at, message) VALUES (?,?,?,?,?,?,?,?)')
    .run(q.id, id, 1, 'whatsapp', at(-2, 9, 0), 'sent', at(-2, 9, 0), 'Follow-up 1 sent');
  db.prepare('INSERT INTO followups (quote_id, customer_id, step, channel, scheduled_at, status) VALUES (?,?,?,?,?,?)').run(q.id, id, 2, 'email', at(1, 9, 0), 'pending');
}

// ===================== 8: WON (quote accepted, job not yet dated — open task) =====================
{
  const id = addCustomer({ name: 'Helen Ackroyd', phone: '+447966778899', email: 'helen.ackroyd@example.co.uk', address: '2 Priory Court, Reading', stage: 'WON', source: 'whatsapp', createdAt: at(-12, 9, 0), updatedAt: at(-1, 11, 0) });
  addStageHistory(id, 'ENQUIRY', 'SITE_VISIT_BOOKED', paul, at(-12, 9, 30));
  addAppointment(id, 'Site visit — Helen Ackroyd', at(-10, 10, 0), at(-10, 11, 0), '2 Priory Court, Reading', 'done', 'simulated', paul, at(-12, 9, 30), 1);
  addStageHistory(id, 'SITE_VISIT_BOOKED', 'QUOTE_PENDING', null, at(-10, 11, 0));
  const q = addQuote({
    customerId: id, title: 'Porch roof rebuild', status: 'accepted',
    items: [{ description: 'Remove existing porch roof covering', qty: 1, unit_price: 150 }, { description: 'Supply & fit new EPDM rubber roof covering', qty: 8, unit_price: 65 }, { description: 'New timber fascia & soffit', qty: 1, unit_price: 210 }],
    createdAt: at(-9, 9, 0), sentAt: at(-8, 9, 0), sentVia: 'whatsapp', decidedAt: at(-1, 11, 0), validUntil: dateOnly(20),
  });
  addStageHistory(id, 'QUOTE_PENDING', 'QUOTED', lisa, at(-8, 9, 0));
  addStageHistory(id, 'QUOTED', 'WON', paul, at(-1, 11, 0));
  addActivity(id, paul, 'quote_accepted', `Quote ${q.ref} accepted — job created`, at(-1, 11, 0), 'quote', q.id);
  addJob({ customerId: id, quoteId: q.id, title: 'Porch roof rebuild', address: '2 Priory Court, Reading', status: 'PENDING', value: q.total, createdAt: at(-1, 11, 0) });
}

// ===================== 9: LOST =====================
{
  const id = addCustomer({ name: 'Kevin Postlethwaite', phone: '+447977889900', email: null, address: '17 Wensley Road, Reading', stage: 'LOST', source: 'phone', createdAt: at(-15, 9, 0), updatedAt: at(-4, 15, 0), lostReason: 'Went with a cheaper local quote' });
  addStageHistory(id, 'ENQUIRY', 'SITE_VISIT_BOOKED', lisa, at(-15, 9, 20));
  addAppointment(id, 'Site visit — Kevin Postlethwaite', at(-13, 11, 0), at(-13, 12, 0), '17 Wensley Road, Reading', 'done', 'simulated', lisa, at(-15, 9, 20), 1);
  addStageHistory(id, 'SITE_VISIT_BOOKED', 'QUOTE_PENDING', null, at(-13, 12, 0));
  const q = addQuote({
    customerId: id, title: 'Re-roof — garage', status: 'declined',
    items: [{ description: 'Strip and re-roof garage (interlocking tiles)', qty: 1, unit_price: 1450 }],
    createdAt: at(-12, 9, 0), sentAt: at(-11, 9, 0), sentVia: 'email', decidedAt: at(-4, 15, 0), validUntil: dateOnly(-1),
  });
  addStageHistory(id, 'QUOTE_PENDING', 'QUOTED', lisa, at(-11, 9, 0));
  addStageHistory(id, 'QUOTED', 'LOST', paul, at(-4, 15, 0));
  addActivity(id, paul, 'quote_declined', `Quote ${q.ref} declined — Went with a cheaper local quote`, at(-4, 15, 0), 'quote', q.id);
}

// ===================== 10-11: SCHEDULED (jobs dated this week) =====================
{
  const id = addCustomer({ name: 'Alan & Denise Fitch', phone: '+447988990011', email: 'fitch.family@example.co.uk', address: '44 Sherwood Rise, Woodley', stage: 'SCHEDULED', source: 'whatsapp', createdAt: at(-18, 9, 0), updatedAt: at(-3, 10, 0) });
  addStageHistory(id, 'ENQUIRY', 'SITE_VISIT_BOOKED', paul, at(-18, 9, 15));
  addAppointment(id, 'Site visit — Fitch', at(-16, 9, 0), at(-16, 10, 0), '44 Sherwood Rise, Woodley', 'done', 'simulated', paul, at(-18, 9, 15), 1);
  addStageHistory(id, 'SITE_VISIT_BOOKED', 'QUOTE_PENDING', null, at(-16, 10, 0));
  const q = addQuote({
    customerId: id, title: 'Guttering & fascia replacement — full run', status: 'accepted',
    items: [{ description: 'Remove old cast iron guttering', qty: 1, unit_price: 220 }, { description: 'Supply & fit new UPVC guttering (16m)', qty: 16, unit_price: 28 }, { description: 'New UPVC fascia & soffit boards', qty: 16, unit_price: 34 }],
    createdAt: at(-15, 9, 0), sentAt: at(-14, 9, 0), sentVia: 'whatsapp', decidedAt: at(-6, 14, 0), validUntil: dateOnly(-2),
  });
  addStageHistory(id, 'QUOTE_PENDING', 'QUOTED', lisa, at(-14, 9, 0));
  addStageHistory(id, 'QUOTED', 'WON', paul, at(-6, 14, 0));
  const jobId = addJob({ customerId: id, quoteId: q.id, title: 'Guttering & fascia replacement', description: 'Full run — front & rear, UPVC', address: '44 Sherwood Rise, Woodley', status: 'SCHEDULED', priority: 'normal', requiredSkills: ['guttering'], materials: '16m UPVC guttering, 16m fascia/soffit board, brackets, silicone', value: q.total, startDate: dateOnly(1), endDate: dateOnly(1), createdAt: at(-6, 14, 0), crew: [liam, nathan] });
  addStageHistory(id, 'WON', 'SCHEDULED', paul, at(-3, 10, 0));
  addActivity(id, paul, 'job_scheduled', 'Guttering & fascia replacement scheduled for tomorrow', at(-3, 10, 0), 'job', jobId);
}
{
  const id = addCustomer({ name: 'Community Hall Trust', phone: '+447999001122', email: 'trust@communityhallreading.example.org', address: 'Reading Community Hall, Northfield Rd', stage: 'SCHEDULED', source: 'email', createdAt: at(-20, 9, 0), updatedAt: at(-5, 10, 0) });
  addStageHistory(id, 'ENQUIRY', 'SITE_VISIT_BOOKED', lisa, at(-20, 9, 30));
  addAppointment(id, 'Site visit — Community Hall Trust', at(-18, 9, 0), at(-18, 10, 30), 'Reading Community Hall, Northfield Rd', 'done', 'simulated', lisa, at(-20, 9, 30), 1);
  addStageHistory(id, 'SITE_VISIT_BOOKED', 'QUOTE_PENDING', null, at(-18, 10, 30));
  const q = addQuote({
    customerId: id, title: 'Flat roof overlay — hall extension', status: 'accepted',
    items: [{ description: 'Overlay existing flat roof with GRP fibreglass system', qty: 42, unit_price: 58 }, { description: 'New roof edge trims', qty: 1, unit_price: 340 }],
    createdAt: at(-17, 9, 0), sentAt: at(-16, 9, 0), sentVia: 'email', decidedAt: at(-9, 14, 0), validUntil: dateOnly(-4),
  });
  addStageHistory(id, 'QUOTE_PENDING', 'QUOTED', lisa, at(-16, 9, 0));
  addStageHistory(id, 'QUOTED', 'WON', paul, at(-9, 14, 0));
  const jobId = addJob({ customerId: id, quoteId: q.id, title: 'Flat roof overlay — hall extension', description: 'GRP fibreglass overlay, full extension roof', address: 'Reading Community Hall, Northfield Rd', status: 'SCHEDULED', priority: 'high', requiredSkills: ['flat_roof'], materials: 'GRP resin kit x3, matting, edge trim 24m', value: q.total, startDate: dateOnly(2), endDate: dateOnly(3), createdAt: at(-9, 14, 0), crew: [connor, callum, jamie] });
  addStageHistory(id, 'WON', 'SCHEDULED', paul, at(-5, 10, 0));
  addActivity(id, paul, 'job_scheduled', 'Flat roof overlay scheduled — 2 day job', at(-5, 10, 0), 'job', jobId);
}

// ===================== 12: IN_PROGRESS (job started today) =====================
{
  const id = addCustomer({ name: 'Owen Marsh', phone: '+447900112233', email: 'owen.marsh@example.co.uk', address: '6 Foxglove Way, Lower Earley', stage: 'IN_PROGRESS', source: 'whatsapp', createdAt: at(-22, 9, 0), updatedAt: at(0, 8, 0) });
  addStageHistory(id, 'ENQUIRY', 'SITE_VISIT_BOOKED', paul, at(-22, 9, 15));
  addAppointment(id, 'Site visit — Owen Marsh', at(-20, 9, 0), at(-20, 10, 0), '6 Foxglove Way, Lower Earley', 'done', 'simulated', paul, at(-22, 9, 15), 1);
  addStageHistory(id, 'SITE_VISIT_BOOKED', 'QUOTE_PENDING', null, at(-20, 10, 0));
  const q = addQuote({
    customerId: id, title: 'Full re-roof — semi-detached', status: 'accepted',
    items: [{ description: 'Strip existing tiles & felt', qty: 1, unit_price: 620 }, { description: 'Supply & fit new interlocking concrete tiles', qty: 65, unit_price: 24 }, { description: 'New breathable roofing felt & battens', qty: 65, unit_price: 8 }, { description: 'Ridge & hip tiles (dry fix)', qty: 1, unit_price: 480 }],
    createdAt: at(-19, 9, 0), sentAt: at(-18, 9, 0), sentVia: 'whatsapp', decidedAt: at(-11, 14, 0), validUntil: dateOnly(-6),
  });
  addStageHistory(id, 'QUOTE_PENDING', 'QUOTED', lisa, at(-18, 9, 0));
  addStageHistory(id, 'QUOTED', 'WON', paul, at(-11, 14, 0));
  const jobId = addJob({ customerId: id, quoteId: q.id, title: 'Full re-roof — semi-detached', description: 'Strip & re-roof, concrete interlocking tiles', address: '6 Foxglove Way, Lower Earley', status: 'IN_PROGRESS', priority: 'high', requiredSkills: ['roofer', 'slate'], materials: 'Concrete interlocking tiles x65, felt, battens, dry-fix ridge kit', value: q.total, startDate: dateOnly(0), endDate: dateOnly(2), createdAt: at(-6, 10, 0), crew: [ryan, jamie, connor] });
  addStageHistory(id, 'WON', 'SCHEDULED', paul, at(-6, 10, 0));
  addStageHistory(id, 'SCHEDULED', 'IN_PROGRESS', null, at(0, 8, 0));
  addActivity(id, null, 'job_status', 'Job "Full re-roof — semi-detached" → IN_PROGRESS', at(0, 8, 0), 'job', jobId);
}

// ===================== 13: COMPLETED (needs invoicing — open task) =====================
{
  const id = addCustomer({ name: 'Fiona Whitmore', phone: '+447900223344', email: 'fiona.whitmore@example.co.uk', address: '3 Chestnut Ave, Caversham', stage: 'COMPLETED', source: 'facebook', createdAt: at(-25, 9, 0), updatedAt: at(-1, 16, 0) });
  addStageHistory(id, 'ENQUIRY', 'SITE_VISIT_BOOKED', lisa, at(-25, 9, 15));
  addAppointment(id, 'Site visit — Fiona Whitmore', at(-23, 9, 0), at(-23, 10, 0), '3 Chestnut Ave, Caversham', 'done', 'simulated', lisa, at(-25, 9, 15), 1);
  addStageHistory(id, 'SITE_VISIT_BOOKED', 'QUOTE_PENDING', null, at(-23, 10, 0));
  const q = addQuote({
    customerId: id, title: 'Moss removal & roof treatment', status: 'accepted',
    items: [{ description: 'Full roof moss removal (soft wash)', qty: 1, unit_price: 340 }, { description: 'Anti-fungal roof treatment', qty: 1, unit_price: 120 }, { description: 'Replace 4 cracked tiles', qty: 4, unit_price: 22 }],
    createdAt: at(-22, 9, 0), sentAt: at(-21, 9, 0), sentVia: 'whatsapp', decidedAt: at(-14, 14, 0), validUntil: dateOnly(-9),
  });
  addStageHistory(id, 'QUOTE_PENDING', 'QUOTED', lisa, at(-21, 9, 0));
  addStageHistory(id, 'QUOTED', 'WON', paul, at(-14, 14, 0));
  const jobId = addJob({ customerId: id, quoteId: q.id, title: 'Moss removal & roof treatment', address: '3 Chestnut Ave, Caversham', status: 'COMPLETED', requiredSkills: [], value: q.total, startDate: dateOnly(-1), endDate: dateOnly(-1), createdAt: at(-7, 10, 0), crew: [nathan, callum], completedAt: at(-1, 15, 30) });
  addStageHistory(id, 'WON', 'SCHEDULED', paul, at(-7, 10, 0));
  addStageHistory(id, 'SCHEDULED', 'IN_PROGRESS', null, at(-1, 8, 0));
  addStageHistory(id, 'IN_PROGRESS', 'COMPLETED', jamie, at(-1, 16, 0));
  addActivity(id, jamie, 'job_status', 'Job "Moss removal & roof treatment" → COMPLETED', at(-1, 16, 0), 'job', jobId);
}

// ===================== 14: INVOICED (payment overdue — will get flagged by cron) =====================
{
  const id = addCustomer({ name: 'Bracknell Retail Park Ltd', phone: '01344 556677', email: 'facilities@bracknellretail.example.com', address: 'Unit 12, Bracknell Retail Park', stage: 'INVOICED', source: 'email', createdAt: at(-40, 9, 0), updatedAt: at(-20, 10, 0) });
  addStageHistory(id, 'ENQUIRY', 'SITE_VISIT_BOOKED', paul, at(-40, 9, 15));
  addAppointment(id, 'Site visit — Bracknell Retail Park', at(-38, 9, 0), at(-38, 11, 0), 'Unit 12, Bracknell Retail Park', 'done', 'simulated', paul, at(-40, 9, 15), 1);
  addStageHistory(id, 'SITE_VISIT_BOOKED', 'QUOTE_PENDING', null, at(-38, 11, 0));
  const q = addQuote({
    customerId: id, title: 'Commercial flat roof repair — unit 12', status: 'accepted',
    items: [{ description: 'Locate & repair roof membrane splits', qty: 1, unit_price: 890 }, { description: 'New rainwater outlet', qty: 2, unit_price: 165 }],
    createdAt: at(-37, 9, 0), sentAt: at(-36, 9, 0), sentVia: 'email', decidedAt: at(-30, 14, 0), validUntil: dateOnly(-23),
  });
  addStageHistory(id, 'QUOTE_PENDING', 'QUOTED', lisa, at(-36, 9, 0));
  addStageHistory(id, 'QUOTED', 'WON', paul, at(-30, 14, 0));
  const jobId = addJob({ customerId: id, quoteId: q.id, title: 'Commercial flat roof repair', address: 'Unit 12, Bracknell Retail Park', status: 'INVOICED', value: q.total, startDate: dateOnly(-22), endDate: dateOnly(-21), createdAt: at(-25, 10, 0), crew: [ryan, connor], completedAt: at(-21, 16, 0) });
  addStageHistory(id, 'WON', 'SCHEDULED', paul, at(-25, 10, 0));
  addStageHistory(id, 'SCHEDULED', 'IN_PROGRESS', null, at(-22, 8, 0));
  addStageHistory(id, 'IN_PROGRESS', 'COMPLETED', ryan, at(-21, 16, 0));
  const inv = addInvoice({ customerId: id, jobId, items: q ? [{ description: 'Commercial flat roof repair — unit 12 (per quote)', qty: 1, unit_price: q.subtotal }] : [], status: 'overdue', issueDate: dateOnly(-20), dueDate: dateOnly(-6), sentAt: at(-20, 10, 0), createdAt: at(-20, 10, 0) });
  addStageHistory(id, 'COMPLETED', 'INVOICED', lisa, at(-20, 10, 0));
  addActivity(id, lisa, 'invoice_sent', `Invoice ${inv.ref} sent (QuickBooks simulated)`, at(-20, 10, 0), 'invoice', inv.id);
  addActivity(id, null, 'invoice_overdue', `Invoice ${inv.ref} is overdue`, at(-6, 9, 0));
}

// ===================== 15-16: PAID (closed won, full circle) =====================
{
  const id = addCustomer({ name: 'Rebecca & James Doyle', phone: '+447900334455', email: 'doyle.family@example.co.uk', address: '19 Hawthorn Drive, Earley', stage: 'PAID', source: 'whatsapp', createdAt: at(-50, 9, 0), updatedAt: at(-25, 10, 0) });
  addStageHistory(id, 'ENQUIRY', 'SITE_VISIT_BOOKED', paul, at(-50, 9, 15));
  addAppointment(id, 'Site visit — Doyle', at(-48, 9, 0), at(-48, 10, 0), '19 Hawthorn Drive, Earley', 'done', 'simulated', paul, at(-50, 9, 15), 1);
  addStageHistory(id, 'SITE_VISIT_BOOKED', 'QUOTE_PENDING', null, at(-48, 10, 0));
  const q = addQuote({ customerId: id, title: 'Velux window replacement + roof repair', status: 'accepted', items: [{ description: 'Supply & fit replacement Velux window', qty: 1, unit_price: 640 }, { description: 'Re-tile surrounding area', qty: 1, unit_price: 180 }], createdAt: at(-47, 9, 0), sentAt: at(-46, 9, 0), sentVia: 'whatsapp', decidedAt: at(-42, 14, 0), validUntil: dateOnly(-27) });
  addStageHistory(id, 'QUOTE_PENDING', 'QUOTED', lisa, at(-46, 9, 0));
  addStageHistory(id, 'QUOTED', 'WON', paul, at(-42, 14, 0));
  const jobId = addJob({ customerId: id, quoteId: q.id, title: 'Velux window replacement', address: '19 Hawthorn Drive, Earley', status: 'PAID', value: q.total, startDate: dateOnly(-35), endDate: dateOnly(-35), createdAt: at(-40, 10, 0), crew: [jamie], completedAt: at(-35, 15, 0) });
  addStageHistory(id, 'WON', 'SCHEDULED', paul, at(-40, 10, 0));
  addStageHistory(id, 'SCHEDULED', 'IN_PROGRESS', null, at(-35, 8, 0));
  addStageHistory(id, 'IN_PROGRESS', 'COMPLETED', jamie, at(-35, 15, 0));
  const inv = addInvoice({ customerId: id, jobId, items: [{ description: 'Velux window replacement + roof repair (per quote)', qty: 1, unit_price: q.subtotal }], status: 'paid', issueDate: dateOnly(-34), dueDate: dateOnly(-20), sentAt: at(-34, 10, 0), paidAt: at(-25, 10, 0), amountPaid: q.total, createdAt: at(-34, 10, 0), qboId: 'SIM-DEMO-001' });
  addStageHistory(id, 'COMPLETED', 'INVOICED', lisa, at(-34, 10, 0));
  addStageHistory(id, 'INVOICED', 'PAID', null, at(-25, 10, 0));
  addActivity(id, null, 'payment_recorded', `Payment of £${q.total.toFixed(2)} recorded against ${inv.ref}`, at(-25, 10, 0), 'invoice', inv.id);
}
{
  const id = addCustomer({ name: 'St. Aldhelm\'s Primary School', phone: '01189 887766', email: 'office@staldhelms.example.sch.uk', address: 'Church Road, Reading', stage: 'PAID', source: 'email', createdAt: at(-60, 9, 0), updatedAt: at(-33, 11, 0) });
  addStageHistory(id, 'ENQUIRY', 'SITE_VISIT_BOOKED', lisa, at(-60, 9, 15));
  addAppointment(id, 'Site visit — St Aldhelm\'s', at(-58, 9, 0), at(-58, 10, 30), 'Church Road, Reading', 'done', 'simulated', lisa, at(-60, 9, 15), 1);
  addStageHistory(id, 'SITE_VISIT_BOOKED', 'QUOTE_PENDING', null, at(-58, 10, 30));
  const q = addQuote({ customerId: id, title: 'Classroom block flat roof — full recover', status: 'accepted', items: [{ description: 'Strip and recover flat roof (single-ply membrane)', qty: 85, unit_price: 46 }, { description: 'New insulation upgrade', qty: 85, unit_price: 18 }], createdAt: at(-57, 9, 0), sentAt: at(-56, 9, 0), sentVia: 'email', decidedAt: at(-50, 14, 0), validUntil: dateOnly(-45) });
  addStageHistory(id, 'QUOTE_PENDING', 'QUOTED', lisa, at(-56, 9, 0));
  addStageHistory(id, 'QUOTED', 'WON', paul, at(-50, 14, 0));
  const jobId = addJob({ customerId: id, quoteId: q.id, title: 'Classroom block flat roof recover', address: 'Church Road, Reading', status: 'PAID', value: q.total, startDate: dateOnly(-44), endDate: dateOnly(-40), createdAt: at(-48, 10, 0), crew: [connor, callum, nathan], completedAt: at(-40, 16, 0) });
  addStageHistory(id, 'WON', 'SCHEDULED', paul, at(-48, 10, 0));
  addStageHistory(id, 'SCHEDULED', 'IN_PROGRESS', null, at(-44, 8, 0));
  addStageHistory(id, 'IN_PROGRESS', 'COMPLETED', connor, at(-40, 16, 0));
  const inv = addInvoice({ customerId: id, jobId, items: [{ description: 'Classroom block flat roof — full recover (per quote)', qty: 1, unit_price: q.subtotal }], status: 'paid', issueDate: dateOnly(-39), dueDate: dateOnly(-25), sentAt: at(-39, 10, 0), paidAt: at(-33, 11, 0), amountPaid: q.total, createdAt: at(-39, 10, 0), qboId: 'SIM-DEMO-002' });
  addStageHistory(id, 'COMPLETED', 'INVOICED', lisa, at(-39, 10, 0));
  addStageHistory(id, 'INVOICED', 'PAID', null, at(-33, 11, 0));
}

// A few more plain ENQUIRY/older leads so lead-source charts have volume
const extra = [
  ['Neil Draper', 'phone', dateOnly(-3)], ['Amy Considine', 'email', dateOnly(-7)], ['Rob & Sheila Pang', 'whatsapp', dateOnly(-10)],
  ['Faisal Rahman', 'facebook', dateOnly(-14)], ['Julie Marchant', 'phone', dateOnly(-17)], ['Craig Osei', 'whatsapp', dateOnly(-21)],
];
extra.forEach(([name, source, d], i) => {
  const ts = `${d} ${9 + i}:00:00`;
  const id = addCustomer({ name, phone: source !== 'email' ? `+44790${1000000 + i * 37}` : null, email: source === 'email' ? `${name.split(' ')[0].toLowerCase()}@example.co.uk` : null, address: 'Reading area', stage: 'LOST', source, createdAt: ts, updatedAt: ts, lostReason: 'No response after follow-up' });
  addLead(id, source, null, 'Enquiry — did not proceed', 'CLOSED', ts);
  addStageHistory(id, 'ENQUIRY', 'LOST', null, ts);
});

console.log('Adding holiday requests...');
// pending request needing Paul's decision
db.prepare('INSERT INTO holiday_requests (user_id, start_date, end_date, days, reason, status, created_at) VALUES (?,?,?,?,?,?,?)')
  .run(connor, dateOnly(35), dateOnly(39), 5, 'Family holiday', 'pending', at(-1, 16, 0));
// approved, overlapping this week (shows on schedule as unavailable)
db.prepare('INSERT INTO holiday_requests (user_id, start_date, end_date, days, reason, status, decided_by, decided_at, created_at) VALUES (?,?,?,?,?,?,?,?,?)')
  .run(callum, dateOnly(3), dateOnly(5), 3, null, 'approved', paul, at(-10, 10, 0), at(-12, 9, 0));
// approved, further out
db.prepare('INSERT INTO holiday_requests (user_id, start_date, end_date, days, reason, status, decided_by, decided_at, created_at) VALUES (?,?,?,?,?,?,?,?,?)')
  .run(ryan, dateOnly(50), dateOnly(56), 5, 'Family holiday', 'approved', paul, at(-5, 10, 0), at(-8, 9, 0));
// declined (too little notice at time of request)
db.prepare('INSERT INTO holiday_requests (user_id, start_date, end_date, days, reason, status, decided_by, decided_at, decline_reason, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
  .run(nathan, dateOnly(-20), dateOnly(-18), 3, 'Personal', 'declined', paul, at(-25, 10, 0), 'Less than 4 weeks notice given at the time — please rebook further out', at(-26, 9, 0));

console.log('Adding team chat & manual tasks...');
const chat = [
  [paul, 'Morning all — forecast says rain from Thursday so let\'s try and get the Fitch guttering job done tomorrow while it\'s dry.', -1],
  [jamie, 'Sounds good, I\'ll bring the extra ladder.', -1],
  [lisa, 'Community Hall job — client asked if we can start slightly later, 9:30 instead of 9. Fine to confirm?', 0],
  [paul, 'Yep that\'s fine, confirmed.', 0],
];
chat.forEach(([uid, body, dayOffset], i) => {
  db.prepare('INSERT INTO team_messages (user_id, body, created_at) VALUES (?,?,?)').run(uid, body, at(dayOffset, 7 + i, 30));
});

db.prepare(`INSERT INTO tasks (type, title, detail, due_date, priority, assignee_id, created_at) VALUES ('manual', ?, ?, ?, ?, ?, ?)`)
  .run('Order more dry-fix ridge kits', 'Down to last 2 — order before the Owen Marsh job needs more.', dateOnly(1), 'normal', paul, at(-1, 9, 0));
db.prepare(`INSERT INTO tasks (type, title, detail, due_date, priority, assignee_id, created_at) VALUES ('manual', ?, ?, ?, ?, ?, ?)`)
  .run('Call insurance re: Bracknell Retail Park', 'They mentioned it might be a partial insurance claim — check before chasing payment further.', dateOnly(0), 'high', lisa, at(-2, 11, 0));


console.log('Adding timesheets (clock in / out history)...');
// ------------------------------------------------------------
// Timesheets. Built from the jobs already seeded so job costing
// has something real to show. Deliberately includes a couple of
// awkward cases: one shift flagged as off-site, one still
// running, and a few awaiting approval.
// ------------------------------------------------------------
function addShift({ userId, jobId, dayOffset, inH, inM = 0, outH, outM = 0, breakMin = 30, notes = null, flag = null, distance = null, status = 'approved' }) {
  const clockIn = at(dayOffset, inH, inM);
  const clockOut = outH === null ? null : at(dayOffset, outH, outM);
  const rate = db.prepare('SELECT hourly_cost FROM users WHERE id = ?').get(userId).hourly_cost;
  let worked = null, cost = null;
  if (clockOut) {
    worked = Math.max(0, ((new Date(clockOut.replace(' ', 'T') + 'Z') - new Date(clockIn.replace(' ', 'T') + 'Z')) / 60000) - breakMin);
    cost = Math.round((worked / 60) * rate * 100) / 100;
  }
  db.prepare(
    `INSERT INTO timesheets (user_id, job_id, work_date, clock_in, clock_out, break_minutes,
        in_distance_m, location_flag, notes, worked_minutes, cost_rate, labour_cost, status,
        approved_by, approved_at, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(userId, jobId, clockIn.slice(0, 10), clockIn, clockOut, breakMin, distance, flag, notes,
    worked, clockOut ? rate : null, cost, status,
    status === 'approved' ? paul : null, status === 'approved' ? at(dayOffset, 18, 0) : null, clockIn);
}

// Look up the seeded jobs by title so this stays correct if ids shift
const jobBy = (t) => (db.prepare('SELECT id FROM jobs WHERE title LIKE ? LIMIT 1').get(`%${t}%`) || {}).id || null;
const jobReroof = jobBy('Full re-roof');
const jobGutter = jobBy('Guttering & fascia');
const jobHall = jobBy('Flat roof overlay');
const jobMoss = jobBy('Moss removal');
const jobCommercial = jobBy('Commercial flat roof');

// --- last week, all approved (a clean payroll week) ---
[[-7, 8, 16], [-6, 8, 16], [-5, 8, 17], [-4, 8, 16]].forEach(([d, i, o]) => {
  addShift({ userId: ryan, jobId: jobCommercial, dayOffset: d, inH: i, outH: o, notes: null });
  addShift({ userId: connor, jobId: jobCommercial, dayOffset: d, inH: i, outH: o });
});

// --- moss removal job, completed yesterday, awaiting approval ---
addShift({ userId: nathan, jobId: jobMoss, dayOffset: -1, inH: 8, outH: 15, outM: 30, breakMin: 30,
  notes: 'Soft washed both slopes, treated and replaced the 4 cracked tiles. All good.', status: 'completed' });
addShift({ userId: callum, jobId: jobMoss, dayOffset: -1, inH: 8, outH: 15, outM: 30, breakMin: 30,
  notes: 'Cleared gutters of the moss run-off before we left.', status: 'completed' });

// --- an off-site clock-in for the office to query ---
addShift({ userId: liam, jobId: jobGutter, dayOffset: -2, inH: 9, inM: 20, outH: 16, breakMin: 45,
  notes: 'Started late, went to the wrong address first.', flag: 'far_from_site', distance: 2400, status: 'completed' });

// --- the big re-roof, in progress: yesterday done, today still running ---
[jamie, ryan, connor].forEach((u) => {
  addShift({ userId: u, jobId: jobReroof, dayOffset: -1, inH: 7, inM: 45, outH: 16, outM: 30, breakMin: 45,
    notes: null, status: 'completed' });
});
// two lads currently on the clock (one on a break)
db.prepare(
  `INSERT INTO timesheets (user_id, job_id, work_date, clock_in, break_minutes, status, created_at)
   VALUES (?,?,?,?,?, 'active', ?)`
).run(jamie, jobReroof, dateOnly(0), at(0, 7, 50), 0, at(0, 7, 50));
db.prepare(
  `INSERT INTO timesheets (user_id, job_id, work_date, clock_in, break_started_at, break_minutes, status, created_at)
   VALUES (?,?,?,?,?,?, 'active', ?)`
).run(ryan, jobReroof, dateOnly(0), at(0, 7, 55), at(0, 12, 15), 0, at(0, 7, 55));

console.log('Seeding a few historical integration events (so the log isn\'t empty)...');
const events = [
  ['whatsapp', 'in', 'message.received', 'simulated'], ['whatsapp', 'out', 'template.simulated', 'simulated'],
  ['email', 'out', 'email.simulated', 'simulated'], ['facebook', 'in', 'leadgen.received', 'simulated'],
  ['google', 'out', 'event.simulated', 'simulated'], ['quickbooks', 'out', 'invoice.simulated', 'simulated'],
  ['ai', 'out', 'schedule.proposed', 'ok'],
];
events.forEach(([provider, direction, event, status], i) => {
  db.prepare('INSERT INTO integration_events (provider, direction, event, payload, status, created_at) VALUES (?,?,?,?,?,?)')
    .run(provider, direction, event, j({ demo: true }), status, at(-1, 8 + i, 0));
});

console.log('\nSeed complete.');
console.log('  Owner/Admin login:  paul@pauldouglasroofing.co.uk / password123');
console.log('  Office login:       lisa@pauldouglasroofing.co.uk / password123');
console.log('  Field staff login:  jamie@pauldouglasroofing.co.uk / password123  (any of jamie/connor/liam/ryan/callum/nathan)');
