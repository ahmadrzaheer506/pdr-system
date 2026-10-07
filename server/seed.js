// ============================================================
// Demo seed — realistic UK roofing CRM data for a fresh Postgres DB
// (local default: DATABASE_URL …/roofing_crm).
// Run after migrations:  npm run seed
// Reset and reseed:      npm run seed:clean
// Pipeline cards are per enquiry (Lead.stage / board_order). Every
// customer gets a primary lead with one site/phone/email. Quotes, visits,
// jobs and stage history always carry that lead_id (and inherit those contacts).
// ============================================================
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { initDb, nextRef, setSetting, getSetting, sequelize, DEFAULT_SETTINGS, money } = require('./db');
const { hashPassword } = require('./auth');
const { normalisePhone } = require('./phone');
const { datesInRange } = require('./jobDays');
const { CATALOGUE, lineFromCatalogue, findCatalogueItem } = require('./catalogue');
const ukTax = require('./services/ukTax');
const { publicTemplates, findChecklistTemplate } = require('./jobChecklists');
const { defaultFollowups, stepBody } = require('./quoteFollowups');
const { jobValueFromQuote } = require('./quoteExtras');
const { OFFICE_IN_APP_KINDS, STAFF_IN_APP_KINDS } = require('./notificationPrefs');
const {
  User, Customer, CustomerSite, CustomerPhone, CustomerEmail, CustomerNote, Lead, Message,
  Appointment, AppointmentAssignee, Quote, Job, JobDayAssignment, JobMaterialLine, JobChecklistItem, JobVariation,
  JobMessage, Invoice, InvoicePayment, Followup, Activity, StageHistory, HolidayRequest,
  TeamMessage, Task, TaskAssignee, Timesheet, IntegrationEvent, CatalogueItem, Notification, SecurityEvent,
} = require('./models');

const CLEAN = process.argv.includes('--clean');

const TABLES = [
  'ai_proposals', 'calendar_sync_links', 'oauth_tokens', 'integration_events', 'stage_history', 'activity',
  'followups', 'task_assignees', 'tasks', 'timesheets', 'notifications',
  'invoice_payments', 'invoices',
  'job_variations', 'job_files', 'job_messages', 'job_material_lines', 'job_checklist_items',
  'job_day_assignments', 'job_assignments', 'jobs',
  'quotes', 'appointment_assignees', 'appointments', 'messages', 'leads', 'holiday_requests', 'team_messages',
  'customer_sites', 'customer_phones', 'customer_emails', 'customer_notes', 'customer_files',
  'customers', 'security_events', 'users', 'settings', 'catalogue_items',
];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function at(daysOffset, hour = 9, min = 0) {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  d.setHours(hour, min, 0, 0);
  return d;
}

function dateOnly(daysOffset) {
  const d = at(daysOffset);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function firstName(name) {
  return String(name || '').split(' ')[0] || 'there';
}

function catLine(id, qty) {
  const item = findCatalogueItem(id);
  if (!item) throw new Error(`Unknown catalogue item ${id}`);
  return lineFromCatalogue(item, qty);
}

function customLine(description, qty, unitPrice, { kind = 'both', vat_code = 'standard', unit = 'item' } = {}) {
  return { description, qty, unit_price: unitPrice, vat_code, kind, unit };
}

const boardSeq = {};
function nextBoard(stage) {
  boardSeq[stage] = (boardSeq[stage] || 0);
  const order = boardSeq[stage];
  boardSeq[stage] += 1;
  return order;
}

const CONVERTED_STAGES = new Set(['WON', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'INVOICED', 'PAID']);

function leadStatusForStage(stage) {
  if (stage === 'ENQUIRY') return 'NEW';
  if (stage === 'LOST') return 'CLOSED';
  if (CONVERTED_STAGES.has(stage)) return 'CONVERTED';
  return 'ACTIONED';
}

/** Reading-area coordinates so clock-in distance flags match seeded jobs. */
const SITE = {
  reading: { lat: 51.4543, lng: -0.9781 },
  caversham: { lat: 51.4678, lng: -0.9739 },
  woodley: { lat: 51.4494, lng: -0.895 },
  tilehurst: { lat: 51.4575, lng: -1.0408 },
  earley: { lat: 51.441, lng: -0.925 },
  bracknell: { lat: 51.416, lng: -0.753 },
};

let lisa;
let paul;
let quoteDefaults = DEFAULT_SETTINGS.quote_defaults;
let ukSettings = DEFAULT_SETTINGS.uk;
let followupCfg = defaultFollowups();

function officePrefs() {
  const in_app = {};
  for (const kind of OFFICE_IN_APP_KINDS) in_app[kind] = true;
  return { in_app, email: {} };
}

function staffPrefs() {
  const in_app = {};
  for (const kind of STAFF_IN_APP_KINDS) {
    in_app[kind] = kind === 'crew_added' || kind === 'holiday_approved' || kind === 'holiday_declined' || kind === 'visit_booked';
  }
  return { in_app, email: { crew_added: false, crew_removed: false } };
}

async function addUser(attrs) {
  const row = await User.create({
    name: attrs.name,
    email: attrs.email,
    phone: attrs.phone || null,
    password_hash: hashPassword(attrs.password),
    role: attrs.role,
    skills: attrs.skills || [],
    is_driver: !!attrs.is_driver,
    color: attrs.color,
    holiday_allowance: attrs.holiday_allowance ?? 28,
    hourly_cost: attrs.hourly_cost || 0,
    cis_status: attrs.cis_status || 'none',
    financials_restricted: !!attrs.financials_restricted,
    notification_prefs: attrs.notification_prefs || { in_app: {}, email: {} },
    created_at: attrs.createdAt || at(-90, 9, 0),
  });
  return row.id;
}

async function addCustomer({
  name, phone, email, address, postcode, stage, source, createdAt, updatedAt, lostReason,
  ownerId = null, customerType = 'domestic', companyName = null, vatNumber = null,
  subject = null, message = null, leadStatus = null, nextAction = null, meta = {},
}) {
  const order = nextBoard(stage);
  const row = await Customer.create({
    name,
    stage,
    source,
    owner_id: ownerId || null,
    lost_reason: lostReason || null,
    customer_type: customerType,
    company_name: companyName,
    vat_number: vatNumber,
    board_order: order,
    created_at: createdAt,
    updated_at: updatedAt || createdAt,
  });
  if (phone) {
    await CustomerPhone.create({
      customer_id: row.id,
      value: phone,
      normalised: normalisePhone(phone),
      type: customerType === 'commercial' ? 'work' : 'mobile',
      is_primary: true,
      created_at: createdAt,
    });
  }
  if (email) {
    await CustomerEmail.create({
      customer_id: row.id,
      value: email,
      type: customerType === 'commercial' ? 'work' : 'personal',
      is_primary: true,
      created_at: createdAt,
    });
  }
  if (address) {
    await CustomerSite.create({
      customer_id: row.id,
      address,
      postcode: postcode || null,
      is_primary: true,
      created_at: createdAt,
    });
  }
  const ids = await primaryContactIds(row.id);
  await Lead.create({
    customer_id: row.id,
    ref: await nextRef('lead'),
    source,
    subject,
    message,
    status: leadStatus || leadStatusForStage(stage),
    next_action: nextAction,
    meta: { ...meta, ...ids },
    stage,
    lost_reason: lostReason || null,
    board_order: order,
    created_at: createdAt,
    updated_at: updatedAt || createdAt,
    ...ids,
  });
  return row;
}

async function primaryContactIds(customerId) {
  const [site, phone, email] = await Promise.all([
    CustomerSite.findOne({ where: { customer_id: customerId, is_primary: true } }),
    CustomerPhone.findOne({ where: { customer_id: customerId, is_primary: true } }),
    CustomerEmail.findOne({ where: { customer_id: customerId, is_primary: true } }),
  ]);
  return { site_id: site?.id || null, phone_id: phone?.id || null, email_id: email?.id || null };
}

async function addActivity(customerId, userId, kind, detail, createdAt, entityType = null, entityId = null) {
  await Activity.create({
    customer_id: customerId, user_id: userId, kind, detail,
    entity_type: entityType, entity_id: entityId, created_at: createdAt,
  });
}

async function addStageHistory(customerId, from, to, userId, createdAt, leadId = null) {
  await StageHistory.create({
    customer_id: customerId,
    lead_id: leadId || await latestLeadId(customerId),
    from_stage: from,
    to_stage: to,
    user_id: userId,
    created_at: createdAt,
  });
}

async function latestLeadId(customerId) {
  const lead = await Lead.findOne({
    where: { customer_id: customerId },
    order: [['created_at', 'DESC'], ['id', 'DESC']],
    attributes: ['id'],
  });
  return lead?.id || null;
}

/** Quotes, visits and jobs inherit this enquiry's one site / phone / email. */
async function contactIdsFor(customerId, leadId = null) {
  if (leadId) {
    const lead = await Lead.findByPk(leadId, { attributes: ['site_id', 'phone_id', 'email_id'] });
    if (lead) {
      return { site_id: lead.site_id, phone_id: lead.phone_id, email_id: lead.email_id };
    }
  }
  return primaryContactIds(customerId);
}

function enquiryNotifyMessage(name, source, body) {
  const snippet = String(body || '').replace(/\s+/g, ' ').trim().slice(0, 120);
  return snippet ? `${name} (${source}): ${snippet}` : `${name} — new ${source} enquiry`;
}

async function addLead(customerId, {
  source, subject = null, message = null, status, createdAt, updatedAt,
  nextAction = null, stage, lostReason = null, meta = {},
  siteId, phoneId, emailId,
}) {
  const order = nextBoard(stage);
  const defaults = await primaryContactIds(customerId);
  const ids = {
    site_id: siteId !== undefined ? siteId : defaults.site_id,
    phone_id: phoneId !== undefined ? phoneId : defaults.phone_id,
    email_id: emailId !== undefined ? emailId : defaults.email_id,
  };
  const row = await Lead.create({
    customer_id: customerId,
    ref: await nextRef('lead'),
    source,
    subject,
    message,
    status,
    next_action: nextAction,
    meta: { ...meta, ...ids },
    stage,
    lost_reason: lostReason,
    board_order: order,
    created_at: createdAt,
    updated_at: updatedAt || createdAt,
    ...ids,
  });
  return row;
}

async function addMessage(customerId, direction, channel, body, status, createdAt, userId = null) {
  await Message.create({
    customer_id: customerId, direction, channel, body, status, user_id: userId, created_at: createdAt,
  });
}

async function addAppointment(customerId, title, start, end, address, status, gcalStatus, createdBy, createdAt, stageAdvanced = false, visitType = 'site_visit', assigneeIds = [], completeNote = null, notes = null, leadId = null) {
  const ids = await contactIdsFor(customerId, leadId || await latestLeadId(customerId));
  const row = await Appointment.create({
    customer_id: customerId,
    lead_id: leadId || await latestLeadId(customerId),
    title, start, end, address, status,
    gcal_status: gcalStatus, stage_advanced: !!stageAdvanced, created_by: createdBy, created_at: createdAt,
    visit_type: visitType,
    complete_note: completeNote,
    notes,
    ...ids,
  });
  if (assigneeIds.length) {
    await AppointmentAssignee.bulkCreate(
      assigneeIds.map((user_id) => ({ appointment_id: row.id, user_id })),
    );
  }
  return row.id;
}

async function addQuote({
  customer, title, items, status, createdAt, sentAt, sentVia, decidedAt, validUntil, notes,
  optionalExtras = [], provisionalSums = [], acceptedOptionalExtras = [],
  durationEstimate = null, accessRequirements = null, leadId = null,
}) {
  const { calc, cols } = ukTax.documentTotals(items, {
    payment_schedule: quoteDefaults.payment_schedule || [],
    optional_extras: optionalExtras,
    provisional_sums: provisionalSums,
    provisional_sums_in_total: false,
  }, customer, ukSettings);
  const ref = await nextRef('quote');
  const ids = await contactIdsFor(customer.id, leadId || await latestLeadId(customer.id));
  const isDomestic = (customer.customer_type || 'domestic') === 'domestic';
  const row = await Quote.create({
    customer_id: customer.id,
    lead_id: leadId || await latestLeadId(customer.id),
    ref,
    title,
    items,
    notes: notes || null,
    valid_until: validUntil,
    status,
    sent_at: sentAt || null,
    sent_via: sentVia || null,
    decided_at: decidedAt || null,
    created_by: lisa,
    created_at: createdAt,
    updated_at: decidedAt || sentAt || createdAt,
    vat_rate: 20,
    subtotal: cols.subtotal,
    vat_amount: cols.vat_amount,
    total: cols.total,
    vat_treatment: cols.vat_treatment,
    labour_total: cols.labour_total,
    materials_total: cols.materials_total,
    vat_breakdown: cols.vat_breakdown,
    cis_applies: cols.cis_applies,
    cis_rate: cols.cis_rate,
    cis_deduction: cols.cis_deduction,
    retention_percent: cols.retention_percent,
    retention_amount: cols.retention_amount,
    due_now: cols.due_now,
    payment_schedule: cols.payment_schedule,
    inclusions: quoteDefaults.inclusions,
    exclusions: quoteDefaults.exclusions,
    warranty_years: quoteDefaults.warranty_years,
    warranty_text: quoteDefaults.warranty_text,
    lead_time: quoteDefaults.lead_time,
    duration_estimate: durationEstimate,
    access_requirements: accessRequirements,
    provisional_sums: provisionalSums,
    provisional_sums_in_total: false,
    optional_extras: optionalExtras,
    accepted_optional_extras: acceptedOptionalExtras,
    cancellation_rights_apply: isDomestic,
    ...ids,
  });
  return {
    id: row.id,
    ref,
    total: cols.total,
    subtotal: cols.subtotal,
    vat_amount: cols.vat_amount,
    due_now: cols.due_now,
    items,
    calc,
    quote: row,
  };
}

async function addJob({
  customerId, quoteId, title, description, address, status, priority = 'normal',
  requiredSkills = [], needsDriver = false, materials, value, startDate, endDate,
  startTime = '08:00', endTime = '16:30', createdAt, crew = [], crewByDate = null,
  completedAt, notes, checklistId,
  lat = null, lng = null, leadId = null,
}) {
  const ids = await contactIdsFor(customerId, leadId || await latestLeadId(customerId));
  const row = await Job.create({
    customer_id: customerId,
    lead_id: leadId || await latestLeadId(customerId),
    quote_id: quoteId || null,
    title,
    description: description || null,
    address,
    status,
    priority,
    required_skills: requiredSkills,
    needs_driver: !!needsDriver,
    materials: materials || null,
    notes: notes || null,
    checklist_template: checklistId || null,
    value: value || null,
    start_date: startDate || null,
    end_date: endDate || null,
    start_time: startTime,
    end_time: endTime,
    completed_at: completedAt || null,
    lat,
    lng,
    created_at: createdAt,
    updated_at: completedAt || createdAt,
    ...ids,
  });
  const days = datesInRange(startDate, endDate || startDate);
  for (const workDate of days) {
    const uids = crewByDate && crewByDate[workDate] != null ? crewByDate[workDate] : crew;
    for (const uid of uids || []) {
      await JobDayAssignment.create({ job_id: row.id, work_date: workDate, user_id: uid });
    }
  }
  if (checklistId) {
    const tpl = findChecklistTemplate(checklistId);
    if (tpl) {
      await JobChecklistItem.bulkCreate(tpl.items.map((body, i) => ({
        job_id: row.id,
        body,
        done: ['COMPLETED', 'INVOICED', 'PAID'].includes(status) ? i < 2 : false,
        sort_order: i,
        created_at: createdAt,
        updated_at: createdAt,
      })));
    }
  }
  return row.id;
}

async function addMaterials(jobId, lines) {
  await JobMaterialLine.bulkCreate(lines.map((line, i) => ({
    job_id: jobId,
    description: line.description,
    qty: line.qty ?? 1,
    unit: line.unit || null,
    status: line.status || 'needed',
    sort_order: i,
  })));
}

async function addInvoice({
  customer, jobId, items, status, issueDate, dueDate, sentAt, paidAt, createdAt, qboId, notes,
  payments = null,
}) {
  const { cols } = ukTax.documentTotals(items, { payment_schedule: [] }, customer, ukSettings);
  const ref = await nextRef('invoice');
  const row = await Invoice.create({
    customer_id: customer.id,
    job_id: jobId || null,
    ref,
    items,
    notes: notes || null,
    subtotal: cols.subtotal,
    vat_rate: 20,
    vat_amount: cols.vat_amount,
    total: cols.grand_total,
    amount_paid: 0,
    issue_date: issueDate,
    due_date: dueDate,
    status,
    sent_at: sentAt || null,
    paid_at: paidAt || null,
    qbo_id: qboId || null,
    created_at: createdAt,
    vat_treatment: cols.vat_treatment,
    labour_total: cols.labour_total,
    materials_total: cols.materials_total,
    vat_breakdown: cols.vat_breakdown,
    cis_applies: cols.cis_applies,
    cis_rate: cols.cis_rate,
    cis_deduction: cols.cis_deduction,
    retention_percent: cols.retention_percent,
    retention_amount: cols.retention_amount,
    due_now: cols.due_now,
    provisional_sums: [],
    provisional_sums_in_total: false,
  });
  const ledger = payments || (status === 'paid' && cols.due_now > 0
    ? [{
      amount: cols.due_now,
      paidAt: paidAt || createdAt,
      note: 'Bank transfer',
    }]
    : []);
  if (ledger.length) {
    let paid = 0;
    for (const p of ledger) {
      const paidDay = p.paidAt instanceof Date
        ? `${p.paidAt.getFullYear()}-${String(p.paidAt.getMonth() + 1).padStart(2, '0')}-${String(p.paidAt.getDate()).padStart(2, '0')}`
        : String(p.paidAt || issueDate).slice(0, 10);
      await InvoicePayment.create({
        invoice_id: row.id,
        amount: p.amount,
        paid_at: paidDay,
        note: p.note || 'Bank transfer',
        recorded_by: lisa,
        created_at: p.paidAt || createdAt,
      });
      paid += Number(p.amount) || 0;
    }
    await row.update({ amount_paid: Math.round(paid * 100) / 100 });
  }
  return { id: row.id, ref, total: cols.grand_total, due_now: cols.due_now };
}

async function addTask(attrs) {
  const row = await Task.create(attrs);
  if (attrs.assignee_id) {
    await TaskAssignee.create({ task_id: row.id, user_id: attrs.assignee_id });
  }
  return row;
}

async function scheduleQuoteFollowups(quote, customer, sentAt) {
  const origin = sentAt.getTime();
  let firstStepAt = null;
  let step = 0;
  for (const s of followupCfg.steps || []) {
    const body = stepBody(s);
    if (!body) continue;
    step += 1;
    const scheduledAt = new Date(origin + Number(s.delay_days) * 24 * 3600 * 1000);
    if (!firstStepAt) firstStepAt = scheduledAt;
    await Followup.create({
      quote_id: quote.id,
      customer_id: customer.id,
      step,
      channel: s.channel,
      scheduled_at: scheduledAt,
      status: 'pending',
      body_template: body,
      created_at: sentAt,
    });
  }
  if (firstStepAt) {
    await addTask({
      type: 'system',
      rule_key: `quote_followup:quote:${quote.id}`,
      title: `Follow up quote ${quote.ref}`,
      detail: `Automatic follow-up sequence is running. First step due ${firstStepAt.toISOString().slice(0, 10)}.`,
      due_date: firstStepAt.toISOString().slice(0, 10),
      priority: 'normal',
      status: 'open',
      entity_type: 'quote',
      entity_id: quote.id,
      created_at: sentAt,
    });
  }
}

async function seedSettings() {
  const settings = clone(DEFAULT_SETTINGS);
  settings.company = {
    ...settings.company,
    city: 'Reading',
    vat_number: 'GB 123 4567 89',
    company_number: '09876543',
    bank_name: 'Barclays',
    bank_account_name: 'Paul Douglas Roofing',
    bank_sort_code: '20-00-00',
    bank_account_number: '12345678',
  };
  settings.uk = {
    ...settings.uk,
    vat_registered: true,
    cis_registered: true,
    cis_utr: '1234567890',
    default_cis_rate: 20,
  };
  settings.timesheets = {
    ...settings.timesheets,
    enabled: true,
    require_location: true,
    site_radius_m: 250,
    require_photo_on_clockout: false,
    round_to_minutes: 0,
    max_shift_hours: 14,
  };
  settings.followups = defaultFollowups();
  for (const [key, value] of Object.entries(settings)) {
    await setSetting(key, value);
  }
  await setSetting('checklist_templates', publicTemplates());
  ukSettings = await getSetting('uk');
  quoteDefaults = await getSetting('quote_defaults');
  followupCfg = await getSetting('followups');
}

async function main() {
  await initDb();

  if (CLEAN) {
    console.log('Cleaning existing data...');
    await sequelize.query(`TRUNCATE TABLE ${TABLES.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`);
  }

  if ((await CatalogueItem.count()) === 0) {
    await CatalogueItem.bulkCreate(CATALOGUE.map((row) => ({ ...row })));
  }

  const already = await User.count();
  if (already > 0 && !CLEAN) {
    console.log(`Database already has ${already} user(s) — skipping seed. Run "npm run seed:clean" to reset and reseed.`);
    await sequelize.close();
    return;
  }

  await seedSettings();

  console.log('Creating staff...');
  paul = await addUser({
    name: 'Paul Douglas', email: 'paul@pauldouglasroofing.co.uk', phone: '07700 900001',
    password: 'password123', role: 'ADMIN', color: '#ea580c', notification_prefs: officePrefs(),
    createdAt: at(-120, 9, 0),
  });
  lisa = await addUser({
    name: 'Lisa Grant', email: 'lisa@pauldouglasroofing.co.uk', phone: '07700 900002',
    password: 'password123', role: 'OFFICE', color: '#0891b2', notification_prefs: officePrefs(),
    createdAt: at(-100, 9, 0),
  });

  const jamie = await addUser({
    hourly_cost: 24.50, cis_status: 'net20', name: 'Jamie Fisher', email: 'jamie@pauldouglasroofing.co.uk',
    phone: '07700 900011', password: 'password123', role: 'STAFF', skills: ['roofer', 'slate', 'lead_work'],
    is_driver: true, color: '#16a34a', notification_prefs: staffPrefs(), createdAt: at(-95, 9, 0),
  });
  const connor = await addUser({
    hourly_cost: 23.00, cis_status: 'net20', name: 'Connor Blake', email: 'connor@pauldouglasroofing.co.uk',
    phone: '07700 900012', password: 'password123', role: 'STAFF', skills: ['roofer', 'flat_roof', 'felt'],
    is_driver: false, color: '#7c3aed', notification_prefs: staffPrefs(), createdAt: at(-94, 9, 0),
  });
  const liam = await addUser({
    hourly_cost: 16.50, cis_status: 'net20', name: 'Liam Ozturk', email: 'liam@pauldouglasroofing.co.uk',
    phone: '07700 900013', password: 'password123', role: 'STAFF', skills: ['labourer', 'guttering'],
    is_driver: true, color: '#d97706', notification_prefs: staffPrefs(), createdAt: at(-93, 9, 0),
  });
  const ryan = await addUser({
    hourly_cost: 25.00, cis_status: 'net20', name: 'Ryan Kaczmarek', email: 'ryan@pauldouglasroofing.co.uk',
    phone: '07700 900014', password: 'password123', role: 'STAFF', skills: ['roofer', 'slate', 'chimney'],
    is_driver: true, color: '#2563eb', notification_prefs: staffPrefs(), createdAt: at(-92, 9, 0),
  });
  const callum = await addUser({
    hourly_cost: 15.75, cis_status: 'net20', name: 'Callum Ashworth', email: 'callum@pauldouglasroofing.co.uk',
    phone: '07700 900015', password: 'password123', role: 'STAFF', skills: ['labourer', 'flat_roof'],
    is_driver: false, color: '#db2777', notification_prefs: staffPrefs(), createdAt: at(-91, 9, 0),
  });
  const nathan = await addUser({
    hourly_cost: 21.00, cis_status: 'net20', name: 'Nathan Wren', email: 'nathan@pauldouglasroofing.co.uk',
    phone: '07700 900016', password: 'password123', role: 'STAFF', skills: ['roofer', 'felt', 'guttering'],
    is_driver: false, color: '#0d9488', notification_prefs: staffPrefs(), createdAt: at(-90, 9, 0),
  });

  await SecurityEvent.create({ actor_user_id: paul, target_user_id: lisa, action: 'user_create', detail: 'OFFICE', created_at: at(-100, 9, 5) });
  await SecurityEvent.create({ actor_user_id: paul, target_user_id: jamie, action: 'user_create', detail: 'STAFF', created_at: at(-95, 9, 5) });
  await SecurityEvent.create({ actor_user_id: paul, target_user_id: paul, action: 'login_success', created_at: at(-1, 8, 0) });

  console.log('Creating customers across the full pipeline...');

  {
    const daveLeakMsg = 'Hiya, got a leak coming through the bedroom ceiling after last night\'s rain. Can someone come take a look this week?';
    const customer = await addCustomer({
      name: 'Dave Whitfield', phone: '+447911223344', email: null, address: '14 Elm Grove, Reading',
      postcode: 'RG1 5AB', stage: 'ENQUIRY', source: 'whatsapp', createdAt: at(0, 8, 12), ownerId: paul,
      message: daveLeakMsg,
      nextAction: 'Review & respond',
    });
    const id = customer.id;
    await CustomerPhone.create({
      customer_id: id, value: '0118 123 4567', normalised: normalisePhone('0118 123 4567'),
      type: 'landline', is_primary: false, created_at: at(0, 8, 12),
    });
    await CustomerSite.create({
      customer_id: id, address: 'Garage roof, 14 Elm Grove, Reading', postcode: 'RG1 5AB',
      is_primary: false, created_at: at(0, 8, 12),
    });
    await addMessage(id, 'in', 'whatsapp', daveLeakMsg, 'received', at(0, 8, 12));
    await addActivity(id, null, 'customer_created', 'New customer created from whatsapp enquiry', at(0, 8, 12));
    await addActivity(id, null, 'inbound', 'Inbound whatsapp message', at(0, 8, 12));
    await CustomerNote.create({ customer_id: id, user_id: paul, body: 'Urgent leak — bedroom ceiling. Check loft hatch access.', created_at: at(0, 8, 20) });
    const daveLeakLead = await latestLeadId(id);
    await Notification.create({
      user_id: lisa, kind: 'new_enquiry', message: enquiryNotifyMessage('Dave Whitfield', 'whatsapp', daveLeakMsg),
      entity_type: 'lead', entity_id: daveLeakLead, created_at: at(0, 8, 12),
    });
    const garageSite = await CustomerSite.findOne({ where: { customer_id: id, is_primary: false } });
    const garagePhone = await CustomerPhone.findOne({ where: { customer_id: id, is_primary: false } });
    const daveGarageMsg = 'Called back — the garage felt is leaking as well. Can you look at that as a separate job?';
    const daveGarageLead = await addLead(id, {
      source: 'phone',
      message: daveGarageMsg,
      status: 'NEW',
      createdAt: at(0, 11, 20),
      nextAction: 'Review & respond',
      stage: 'ENQUIRY',
      siteId: garageSite?.id || null,
      phoneId: garagePhone?.id || null,
    });
    await addMessage(id, 'in', 'phone', daveGarageMsg, 'logged', at(0, 11, 20));
    await addActivity(id, null, 'inbound', 'Inbound phone message', at(0, 11, 20));
    await Notification.create({
      user_id: lisa, kind: 'new_enquiry', message: enquiryNotifyMessage('Dave Whitfield', 'phone', daveGarageMsg),
      entity_type: 'lead', entity_id: daveGarageLead.id, created_at: at(0, 11, 20),
    });
  }

  {
    const priyaMsg = 'Hi! Saw your page — need a quote for a full re-roof on a 1930s semi. Can you help?';
    const customer = await addCustomer({
      name: 'Priya Nair', phone: null, email: 'priya.nair@example.co.uk', address: '8 Oakfield Road, Reading',
      postcode: 'RG2 7EH', stage: 'ENQUIRY', source: 'facebook', createdAt: at(0, 10, 40), ownerId: lisa,
      message: priyaMsg,
      nextAction: 'Review & respond',
    });
    const id = customer.id;
    await addMessage(id, 'in', 'facebook', priyaMsg, 'received', at(0, 10, 40));
    await addActivity(id, null, 'customer_created', 'New customer created from facebook enquiry', at(0, 10, 40));
    await Notification.create({
      user_id: paul, kind: 'new_enquiry', message: enquiryNotifyMessage('Priya Nair', 'facebook', priyaMsg),
      entity_type: 'lead', entity_id: await latestLeadId(id), created_at: at(0, 10, 40),
    });
  }

  {
    const customer = await addCustomer({
      name: 'Sandra Cole', phone: '+447922334455', email: 'sandra.cole@example.co.uk',
      address: '22 Birch Close, Caversham', postcode: 'RG4 8LP', stage: 'SITE_VISIT_BOOKED',
      source: 'phone', createdAt: at(-2, 9, 0), updatedAt: at(-1, 14, 0),
      message: 'Called about guttering pulling away from the fascia on the back of the house.',
    });
    const id = customer.id;
    await addMessage(id, 'in', 'phone', 'Called about guttering pulling away from the fascia on the back of the house.', 'logged', at(-2, 9, 0));
    await addActivity(id, null, 'customer_created', 'New customer created from phone enquiry', at(-2, 9, 0));
    await addStageHistory(id, 'ENQUIRY', 'SITE_VISIT_BOOKED', paul, at(-1, 14, 0));
    const sandraVisit = await addAppointment(id, 'Site visit — Sandra Cole', at(1, 10, 0), at(1, 11, 0), '22 Birch Close, Caversham', 'booked', 'simulated', paul, at(-1, 14, 0), false, 'site_visit', [callum]);
    await addActivity(
      id, paul, 'appointment_booked',
      `Site visit booked for ${at(1, 10, 0).toLocaleString('en-GB', { timeZone: 'Europe/London' })} (in Google Calendar)`,
      at(-1, 14, 0), 'appointment', sandraVisit,
    );
    await Notification.create({
      user_id: lisa, kind: 'visit_booked',
      message: `Sandra Cole — Site visit — Sandra Cole on ${at(1, 10, 0).toLocaleString('en-GB', { timeZone: 'Europe/London' })}`,
      entity_type: 'customer', entity_id: id, created_at: at(-1, 14, 0),
    });
    await Notification.create({
      user_id: callum, kind: 'visit_booked',
      message: `You're assigned to Site visit — Sandra Cole on ${at(1, 10, 0).toLocaleString('en-GB', { timeZone: 'Europe/London' })}`,
      entity_type: 'appointment', entity_id: sandraVisit, created_at: at(-1, 14, 0),
    });
  }

  {
    const customer = await addCustomer({
      name: 'Marcus Reid', phone: '+447933445566', email: 'marcus.reid@example.co.uk',
      address: '5 The Sidings, Woodley', postcode: 'RG5 4HD', stage: 'QUOTE_PENDING',
      source: 'email', createdAt: at(-6, 9, 15), updatedAt: at(-1, 16, 0),
      subject: 'Roof enquiry',
      message: 'Good morning, we have some slipped tiles after the recent storm and would like a quote to make good. Regards, Marcus',
    });
    const id = customer.id;
    await addMessage(id, 'in', 'email', 'Good morning, we have some slipped tiles after the recent storm and would like a quote to make good. Regards, Marcus', 'received', at(-6, 9, 15));
    await addStageHistory(id, 'ENQUIRY', 'SITE_VISIT_BOOKED', lisa, at(-5, 11, 0));
    await addAppointment(
      id, 'Measure — Marcus Reid', at(-1, 9, 30), at(-1, 10, 30), '5 The Sidings, Woodley',
      'done', 'simulated', lisa, at(-5, 11, 0), true, 'measure', [],
      'Storm damage on the front slope — three slipped tiles, felt showing. Quote for making good.',
    );
    await addStageHistory(id, 'SITE_VISIT_BOOKED', 'QUOTE_PENDING', null, at(-1, 10, 30));
    await addActivity(id, null, 'stage_change', 'Site visit completed — quote needed', at(-1, 10, 30));
    await addQuote({
      customer, title: 'Make good slipped tiles after storm',
      items: [catLine('cracked_tile', 8), catLine('lead_flashing', 3)],
      status: 'draft', createdAt: at(-1, 16, 0), validUntil: dateOnly(21),
      notes: 'Draft after measure — Lisa to finish and send tomorrow.',
    });
  }

  {
    const customer = await addCustomer({
      name: 'Chloe Denham', phone: '+447911556677', email: 'chloe.denham@example.co.uk',
      address: '18 Riverdene Drive, Tilehurst', postcode: 'RG31 6NY', stage: 'QUOTE_PENDING',
      source: 'phone', createdAt: at(-4, 10, 0), updatedAt: at(0, 11, 0),
      message: 'Called about a dripping valley on the rear extension.',
    });
    const id = customer.id;
    const chloeLeadId = await latestLeadId(id);
    await addMessage(id, 'in', 'phone', 'Called about a dripping valley on the rear extension.', 'logged', at(-4, 10, 0));
    await addStageHistory(id, 'ENQUIRY', 'SITE_VISIT_BOOKED', lisa, at(-3, 9, 0));
    await addAppointment(
      id, 'Site visit — Chloe Denham', at(0, 9, 0), at(0, 9, 45), '18 Riverdene Drive, Tilehurst',
      'done', 'simulated', lisa, at(-3, 9, 0), true, 'site_visit', [callum],
      'Valley flashing failed at the rear extension. Quote for new lead and valley trough.',
    );
    await addStageHistory(id, 'SITE_VISIT_BOOKED', 'QUOTE_PENDING', null, at(0, 9, 45));
    await addActivity(id, null, 'stage_change', 'Site visit completed — quote needed', at(0, 9, 45));
    await addTask({
      type: 'system',
      rule_key: `produce_quote:lead:${chloeLeadId}`,
      title: 'Produce quote for Chloe Denham',
      detail: 'Site visit "Site visit — Chloe Denham" completed — quotation needs producing.',
      due_date: dateOnly(0),
      priority: 'high',
      status: 'open',
      entity_type: 'customer',
      entity_id: id,
      created_at: at(0, 9, 45),
    });
  }

  {
    const customer = await addCustomer({
      name: 'Grace Bowman', phone: '+447944556677', email: 'grace.bowman@example.co.uk',
      address: '31 Kennet Side, Reading', postcode: 'RG1 3DW', stage: 'QUOTED',
      source: 'whatsapp', createdAt: at(-5, 13, 0), updatedAt: at(-1, 9, 0),
      message: 'WhatsApp about a leaking flat roof on the rear extension.',
    });
    const id = customer.id;
    await addStageHistory(id, 'ENQUIRY', 'SITE_VISIT_BOOKED', paul, at(-5, 13, 30));
    await addAppointment(
      id, 'Site visit — Grace Bowman', at(-3, 14, 0), at(-3, 15, 0), '31 Kennet Side, Reading',
      'done', 'simulated', paul, at(-5, 13, 30), true, 'site_visit', [],
      'Felt bubbling on the rear extension. Quote for 3-layer torch-on.',
    );
    await addAppointment(
      id, 'Follow-up — Grace Bowman', at(2, 10, 0), at(2, 10, 45), '31 Kennet Side, Reading',
      'cancelled', 'not_synced', lisa, at(0, 9, 0), false, 'follow_up', [],
      null, 'Customer asked to cancel — will decide from the quote instead.',
    );
    await addStageHistory(id, 'SITE_VISIT_BOOKED', 'QUOTE_PENDING', null, at(-3, 15, 0));
    const q = await addQuote({
      customer, title: 'Flat roof felt replacement — rear extension',
      items: [catLine('strip_covering', 18), catLine('felt_3layer', 18), customLine('New GRP box gutter trim', 1, 220, { kind: 'materials' })],
      optionalExtras: [{ description: 'Replace UPVC fascia on the rear elevation', amount: 280 }],
      status: 'sent', createdAt: at(-2, 9, 0), sentAt: at(-1, 9, 0), sentVia: 'whatsapp', validUntil: dateOnly(28),
    });
    await addStageHistory(id, 'QUOTE_PENDING', 'QUOTED', lisa, at(-1, 9, 0));
    await addMessage(id, 'out', 'whatsapp', `Hi ${firstName(customer.name)}, thanks for having us out. Your quotation ${q.ref} from Paul Douglas Roofing is attached (${money(q.total)}). Any questions at all, just reply here. Cheers, Paul`, 'simulated', at(-1, 9, 0), lisa);
    await addActivity(id, lisa, 'quote_sent', `Quote ${q.ref} (${money(q.total)}) sent via whatsapp`, at(-1, 9, 0), 'quote', q.id);
    await scheduleQuoteFollowups(q, customer, at(-1, 9, 0));
  }

  {
    const customer = await addCustomer({
      name: 'Tom Ellery', phone: '+447955667788', email: 'tom.ellery@example.co.uk',
      address: '9 Mill Lane, Tilehurst', postcode: 'RG31 5AN', stage: 'FOLLOW_UP',
      source: 'facebook_lead', createdAt: at(-9, 10, 0), updatedAt: at(-2, 9, 0),
      message: 'Lead ad form — chimney leaning / flashing leaking into the loft.',
      meta: { leadgen_id: 'demo-lg-chimney', form_id: 'demo-form-roof-quote' },
    });
    const id = customer.id;
    await addStageHistory(id, 'ENQUIRY', 'SITE_VISIT_BOOKED', paul, at(-9, 15, 0));
    await addAppointment(
      id, 'Site visit — Tom Ellery', at(-7, 13, 0), at(-7, 14, 0), '9 Mill Lane, Tilehurst',
      'done', 'simulated', paul, at(-9, 15, 0), true, 'site_visit', [],
      'Stack needs repointing and new lead. Quote issued.',
    );
    await addStageHistory(id, 'SITE_VISIT_BOOKED', 'QUOTE_PENDING', null, at(-7, 14, 0));
    const q = await addQuote({
      customer, title: 'Chimney repointing & new lead flashing',
      items: [catLine('chimney_repoint', 1), catLine('lead_flashing', 6), catLine('chimney_cowl', 2)],
      status: 'sent', createdAt: at(-6, 9, 0), sentAt: at(-4, 9, 0), sentVia: 'whatsapp', validUntil: dateOnly(25),
    });
    await addStageHistory(id, 'QUOTE_PENDING', 'QUOTED', lisa, at(-4, 9, 0));
    await addActivity(id, lisa, 'quote_sent', `Quote ${q.ref} (${money(q.total)}) sent via whatsapp`, at(-4, 9, 0), 'quote', q.id);
    await addStageHistory(id, 'QUOTED', 'FOLLOW_UP', null, at(-2, 9, 0));
    const step1 = stepBody(followupCfg.steps[0]);
    const step2 = followupCfg.steps[1] ? stepBody(followupCfg.steps[1]) : '';
    await addMessage(id, 'out', 'whatsapp', step1.replace('{name}', firstName(customer.name)).replace('{ref}', q.ref).replace('{title}', 'Chimney repointing & new lead flashing').replace('{total}', money(q.total)), 'simulated', at(-2, 9, 0), null);
    await addActivity(id, null, 'followup_sent', `Automatic follow-up step 1 sent for quote ${q.ref} via whatsapp`, at(-2, 9, 0));
    await Followup.create({
      quote_id: q.id, customer_id: id, step: 1, channel: 'whatsapp',
      scheduled_at: at(-2, 9, 0), status: 'sent', sent_at: at(-2, 9, 0),
      body_template: step1, message: 'Follow-up 1 sent', created_at: at(-4, 9, 0),
    });
    if (step2) {
      await Followup.create({
        quote_id: q.id, customer_id: id, step: 2, channel: 'email',
        scheduled_at: at(1, 9, 0), status: 'pending', body_template: step2,
        created_at: at(-4, 9, 0),
      });
    }
    await addTask({
      type: 'system',
      rule_key: `quote_followup:quote:${q.id}`,
      title: `Follow up quote ${q.ref}`,
      detail: `Automatic follow-up sequence is running. First step due ${dateOnly(1)}.`,
      due_date: dateOnly(1),
      priority: 'normal',
      status: 'open',
      entity_type: 'quote',
      entity_id: q.id,
      created_at: at(-4, 9, 0),
    });
  }

  {
    const customer = await addCustomer({
      name: 'Helen Ackroyd', phone: '+447966778899', email: 'helen.ackroyd@example.co.uk',
      address: '2 Priory Court, Reading', postcode: 'RG1 2AH', stage: 'WON',
      source: 'whatsapp', createdAt: at(-12, 9, 0), updatedAt: at(-1, 11, 0),
      message: 'Porch roof is rotting through — can you rebuild it?',
    });
    const id = customer.id;
    await addStageHistory(id, 'ENQUIRY', 'SITE_VISIT_BOOKED', paul, at(-12, 9, 30));
    await addAppointment(
      id, 'Site visit — Helen Ackroyd', at(-10, 10, 0), at(-10, 11, 0), '2 Priory Court, Reading',
      'done', 'simulated', paul, at(-12, 9, 30), true, 'site_visit', [],
      'Timber porch roof beyond repair. Quote for rebuild with EPDM.',
    );
    await addStageHistory(id, 'SITE_VISIT_BOOKED', 'QUOTE_PENDING', null, at(-10, 11, 0));
    const porchExtra = { description: 'Upgrade to coloured fascia', amount: 90 };
    const q = await addQuote({
      customer, title: 'Porch roof rebuild', status: 'accepted',
      items: [
        customLine('Remove existing porch roof covering', 1, 150, { kind: 'labour' }),
        catLine('epdm', 8),
        catLine('fascia_upvc', 6),
      ],
      optionalExtras: [porchExtra],
      acceptedOptionalExtras: [porchExtra],
      createdAt: at(-9, 9, 0), sentAt: at(-8, 9, 0), sentVia: 'whatsapp', decidedAt: at(-1, 11, 0), validUntil: dateOnly(20),
    });
    await addStageHistory(id, 'QUOTE_PENDING', 'QUOTED', lisa, at(-8, 9, 0));
    await addStageHistory(id, 'QUOTED', 'WON', paul, at(-1, 11, 0));
    const porchValue = jobValueFromQuote(q, [porchExtra]);
    const porchJob = await addJob({
      customerId: id, quoteId: q.id, title: 'Porch roof rebuild', address: '2 Priory Court, Reading',
      status: 'PENDING', requiredSkills: ['flat_roof', 'felt'], needsDriver: true,
      value: porchValue, createdAt: at(-1, 11, 0), checklistId: 'felt',
      lat: SITE.reading.lat, lng: SITE.reading.lng,
    });
    await addActivity(id, paul, 'quote_accepted', `Quote ${q.ref} accepted — job created`, at(-1, 11, 0), 'job', porchJob);
    await addTask({
      type: 'system',
      rule_key: `schedule_job:job:${porchJob}`,
      title: 'Schedule job — Porch roof rebuild',
      detail: `Helen Ackroyd accepted quote ${q.ref} (${money(porchValue)}). Job needs lads and dates.`,
      priority: 'high',
      status: 'open',
      entity_type: 'job',
      entity_id: porchJob,
      created_at: at(-1, 11, 0),
    });
    await Notification.create({
      user_id: lisa, kind: 'quote_accepted', message: `Helen Ackroyd accepted quote ${q.ref}.`,
      entity_type: 'customer', entity_id: id, created_at: at(-1, 11, 0),
    });
  }

  {
    const customer = await addCustomer({
      name: 'Kevin Postlethwaite', phone: '+447977889900', email: null,
      address: '17 Wensley Road, Reading', postcode: 'RG1 6BN', stage: 'LOST',
      source: 'phone', createdAt: at(-15, 9, 0), updatedAt: at(-4, 15, 0), lostReason: 'Cheaper quote',
      message: 'Phone enquiry — garage re-roof, went with a cheaper quote.',
    });
    const id = customer.id;
    await addStageHistory(id, 'ENQUIRY', 'SITE_VISIT_BOOKED', lisa, at(-15, 9, 20));
    await addAppointment(
      id, 'Site visit — Kevin Postlethwaite', at(-13, 11, 0), at(-13, 12, 0), '17 Wensley Road, Reading',
      'done', 'simulated', lisa, at(-15, 9, 20), true, 'site_visit', [],
      'Garage roof in poor condition. Quoted full strip and concrete tiles.',
    );
    await addStageHistory(id, 'SITE_VISIT_BOOKED', 'QUOTE_PENDING', null, at(-13, 12, 0));
    const q = await addQuote({
      customer, title: 'Re-roof — garage', status: 'declined',
      items: [catLine('strip_covering', 20), catLine('concrete_tiles', 20)],
      createdAt: at(-12, 9, 0), sentAt: at(-11, 9, 0), sentVia: 'email', decidedAt: at(-4, 15, 0), validUntil: dateOnly(-1),
    });
    await addStageHistory(id, 'QUOTE_PENDING', 'QUOTED', lisa, at(-11, 9, 0));
    await addStageHistory(id, 'QUOTED', 'LOST', paul, at(-4, 15, 0));
    await addActivity(id, paul, 'quote_declined', `Quote ${q.ref} declined — Cheaper quote`, at(-4, 15, 0), 'quote', q.id);
  }

  {
    const customer = await addCustomer({
      name: 'Alan & Denise Fitch', phone: '+447988990011', email: 'fitch.family@example.co.uk',
      address: '44 Sherwood Rise, Woodley', postcode: 'RG5 3JA', stage: 'IN_PROGRESS',
      source: 'whatsapp', createdAt: at(-18, 9, 0), updatedAt: at(-3, 10, 0),
      message: 'Guttering coming away on the front and rear — can you replace the lot?',
    });
    const id = customer.id;
    await addStageHistory(id, 'ENQUIRY', 'SITE_VISIT_BOOKED', paul, at(-18, 9, 15));
    await addAppointment(
      id, 'Site visit — Fitch', at(-16, 9, 0), at(-16, 10, 0), '44 Sherwood Rise, Woodley',
      'done', 'simulated', paul, at(-18, 9, 15), true, 'site_visit', [],
      'Cast iron gutters failing. Full UPVC run quoted.',
    );
    await addStageHistory(id, 'SITE_VISIT_BOOKED', 'QUOTE_PENDING', null, at(-16, 10, 0));
    const q = await addQuote({
      customer, title: 'Guttering & fascia replacement — full run', status: 'accepted',
      items: [
        customLine('Remove old cast iron guttering', 1, 220, { kind: 'labour' }),
        catLine('gutter_upvc', 16),
        catLine('fascia_upvc', 16),
      ],
      createdAt: at(-15, 9, 0), sentAt: at(-14, 9, 0), sentVia: 'whatsapp', decidedAt: at(-6, 14, 0), validUntil: dateOnly(-2),
    });
    await addStageHistory(id, 'QUOTE_PENDING', 'QUOTED', lisa, at(-14, 9, 0));
    await addStageHistory(id, 'QUOTED', 'WON', paul, at(-6, 14, 0));
    const fitchStart = dateOnly(0);
    const fitchEnd = dateOnly(1);
    const jobId = await addJob({
      customerId: id, quoteId: q.id, title: 'Guttering & fascia replacement',
      description: 'Full run — front & rear, UPVC', address: '44 Sherwood Rise, Woodley',
      status: 'IN_PROGRESS', priority: 'low', requiredSkills: ['guttering'], needsDriver: true,
      value: jobValueFromQuote(q, []), startDate: fitchStart, endDate: fitchEnd,
      createdAt: at(-6, 14, 0),
      crewByDate: {
        [fitchStart]: [liam, nathan, callum],
        [fitchEnd]: [liam, nathan],
      },
      checklistId: 'guttering',
      lat: SITE.woodley.lat, lng: SITE.woodley.lng,
    });
    await addMaterials(jobId, [
      { description: 'UPVC guttering', qty: 16, unit: 'lin m', status: 'packed' },
      { description: 'Fascia / soffit board', qty: 16, unit: 'lin m', status: 'packed' },
      { description: 'Brackets and silicone', qty: 1, unit: 'lot', status: 'needed' },
    ]);
    await addStageHistory(id, 'WON', 'SCHEDULED', paul, at(-3, 10, 0));
    await addStageHistory(id, 'SCHEDULED', 'IN_PROGRESS', null, at(0, 8, 0));
    await addActivity(id, paul, 'job_scheduled', 'Guttering & fascia replacement scheduled for today and tomorrow', at(-3, 10, 0), 'job', jobId);
    await addActivity(id, null, 'job_status', 'Job "Guttering & fascia replacement" → IN_PROGRESS', at(0, 8, 0), 'job', jobId);
    const fitchTitle = 'Guttering & fascia replacement';
    for (const [uid, day] of [
      [liam, fitchStart], [nathan, fitchStart], [callum, fitchStart],
      [liam, fitchEnd], [nathan, fitchEnd],
    ]) {
      await Notification.create({
        user_id: uid,
        kind: 'crew_added',
        message: `You've been assigned to "${fitchTitle}" on ${day}`,
        job_id: jobId,
        work_date: day,
        entity_type: 'job',
        entity_id: jobId,
        created_at: at(-3, 10, 0),
      });
    }
  }

  {
    const customer = await addCustomer({
      name: 'Community Hall Trust', phone: '+447999001122', email: 'trust@communityhallreading.example.org',
      address: 'Reading Community Hall, Northfield Rd', postcode: 'RG1 8DU', stage: 'SCHEDULED',
      source: 'email', createdAt: at(-20, 9, 0), updatedAt: at(-5, 10, 0),
      customerType: 'commercial', companyName: 'Community Hall Trust', vatNumber: 'GB 334 2211 00',
      message: 'Email from the trustees — hall extension flat roof is ponding.',
    });
    const id = customer.id;
    await addStageHistory(id, 'ENQUIRY', 'SITE_VISIT_BOOKED', lisa, at(-20, 9, 30));
    await addAppointment(
      id, 'Site visit — Community Hall Trust', at(-18, 9, 0), at(-18, 10, 30), 'Reading Community Hall, Northfield Rd',
      'done', 'simulated', lisa, at(-20, 9, 30), true, 'site_visit', [],
      'Ponding on the extension. GRP overlay quoted, deck repairs as a provisional sum.',
    );
    await addStageHistory(id, 'SITE_VISIT_BOOKED', 'QUOTE_PENDING', null, at(-18, 10, 30));
    const q = await addQuote({
      customer, title: 'Flat roof overlay — hall extension', status: 'accepted',
      items: [catLine('grp_overlay', 42), customLine('New roof edge trims', 1, 340, { kind: 'materials' })],
      provisionalSums: [{ description: 'Deck repairs if found on strip-up', amount: 750 }],
      createdAt: at(-17, 9, 0), sentAt: at(-16, 9, 0), sentVia: 'email', decidedAt: at(-9, 14, 0), validUntil: dateOnly(-4),
    });
    await addStageHistory(id, 'QUOTE_PENDING', 'QUOTED', lisa, at(-16, 9, 0));
    await addStageHistory(id, 'QUOTED', 'WON', paul, at(-9, 14, 0));
    const hallStart = dateOnly(1);
    const hallEnd = dateOnly(2);
    const jobId = await addJob({
      customerId: id, quoteId: q.id, title: 'Flat roof overlay — hall extension',
      description: 'GRP fibreglass overlay, full extension roof', address: 'Reading Community Hall, Northfield Rd',
      status: 'SCHEDULED', priority: 'high', requiredSkills: ['flat_roof'], needsDriver: true,
      value: jobValueFromQuote(q, []), startDate: hallStart, endDate: hallEnd,
      startTime: '09:30',
      createdAt: at(-9, 14, 0),
      crewByDate: {
        [hallStart]: [connor, callum, jamie],
        [hallEnd]: [connor, jamie],
      },
      checklistId: 'felt',
      lat: SITE.reading.lat, lng: SITE.reading.lng,
    });
    await addMaterials(jobId, [
      { description: 'GRP resin kit', qty: 3, unit: 'kit', status: 'needed' },
      { description: 'Matting', qty: 42, unit: 'm²', status: 'needed' },
      { description: 'Edge trim', qty: 24, unit: 'lin m', status: 'needed' },
    ]);
    await addStageHistory(id, 'WON', 'SCHEDULED', paul, at(-5, 10, 0));
    await addActivity(id, paul, 'job_scheduled', 'Flat roof overlay scheduled — 2 day job', at(-5, 10, 0), 'job', jobId);
    await addTask({
      type: 'system',
      rule_key: `job_tomorrow:job:${jobId}`,
      title: 'Job starts tomorrow — Flat roof overlay — hall extension',
      detail: 'Community Hall Trust · Reading Community Hall, Northfield Rd. Confirm materials and team.',
      due_date: dateOnly(0),
      priority: 'high',
      status: 'open',
      entity_type: 'job',
      entity_id: jobId,
      created_at: at(0, 7, 0),
    });
    const hallTitle = 'Flat roof overlay — hall extension';
    for (const [uid, day] of [
      [connor, hallStart], [callum, hallStart], [jamie, hallStart],
      [connor, hallEnd], [jamie, hallEnd],
    ]) {
      await Notification.create({
        user_id: uid,
        kind: 'crew_added',
        message: `You've been assigned to "${hallTitle}" on ${day}`,
        job_id: jobId,
        work_date: day,
        entity_type: 'job',
        entity_id: jobId,
        created_at: at(-5, 10, 0),
      });
    }
  }

  let jobReroof = null;
  let jobMoss = null;
  let jobMaya = null;
  let jobNora = null;
  let owenId = null;
  {
    const customer = await addCustomer({
      name: 'Owen Marsh', phone: '+447900112233', email: 'owen.marsh@example.co.uk',
      address: '6 Foxglove Way, Lower Earley', postcode: 'RG6 4EZ', stage: 'IN_PROGRESS',
      source: 'whatsapp', createdAt: at(-22, 9, 0), updatedAt: at(0, 8, 0),
      message: 'Full re-roof on the semi — tiles are slipping after the last gale.',
    });
    const id = customer.id;
    owenId = id;
    await addStageHistory(id, 'ENQUIRY', 'SITE_VISIT_BOOKED', paul, at(-22, 9, 15));
    await addAppointment(
      id, 'Site visit — Owen Marsh', at(-20, 9, 0), at(-20, 10, 0), '6 Foxglove Way, Lower Earley',
      'done', 'simulated', paul, at(-22, 9, 15), true, 'site_visit', [],
      'Concrete interlocking, breathable felt, dry-fix ridge. Scaffold required.',
    );
    await addStageHistory(id, 'SITE_VISIT_BOOKED', 'QUOTE_PENDING', null, at(-20, 10, 0));
    const q = await addQuote({
      customer, title: 'Full re-roof — semi-detached', status: 'accepted',
      items: [
        catLine('strip_covering', 65),
        catLine('concrete_tiles', 65),
        catLine('breathable_felt', 65),
        catLine('ridge_dryfix', 12),
        catLine('scaffold', 1),
      ],
      durationEstimate: '3 days on site',
      accessRequirements: 'Side gate; skip on the drive from 8am. Neighbour parking on the left.',
      createdAt: at(-19, 9, 0), sentAt: at(-18, 9, 0), sentVia: 'whatsapp', decidedAt: at(-11, 14, 0), validUntil: dateOnly(-6),
    });
    await addStageHistory(id, 'QUOTE_PENDING', 'QUOTED', lisa, at(-18, 9, 0));
    await addStageHistory(id, 'QUOTED', 'WON', paul, at(-11, 14, 0));
    jobReroof = await addJob({
      customerId: id, quoteId: q.id, title: 'Full re-roof — semi-detached',
      description: 'Strip & re-roof, concrete interlocking tiles', address: '6 Foxglove Way, Lower Earley',
      status: 'IN_PROGRESS', priority: 'high', requiredSkills: ['roofer'], needsDriver: true,
      value: jobValueFromQuote(q, []), startDate: dateOnly(-1), endDate: dateOnly(1),
      createdAt: at(-6, 10, 0),
      crewByDate: {
        [dateOnly(-1)]: [ryan, jamie, connor],
        [dateOnly(0)]: [ryan, jamie],
        [dateOnly(1)]: [ryan],
      },
      checklistId: 're_roof',
      notes: 'Access via side gate. Skip arriving 8am.',
      lat: SITE.earley.lat, lng: SITE.earley.lng,
    });
    await addMaterials(jobReroof, [
      { description: 'Concrete interlocking tiles', qty: 65, unit: 'm²', status: 'used' },
      { description: 'Breathable felt', qty: 65, unit: 'm²', status: 'packed' },
      { description: 'Dry-fix ridge kit', qty: 1, unit: 'item', status: 'needed' },
    ]);
    await JobMessage.create({ job_id: jobReroof, user_id: jamie, body: 'Tiles are on site. Starting the front slope first.', created_at: at(0, 8, 10) });
    await addStageHistory(id, 'WON', 'SCHEDULED', paul, at(-6, 10, 0));
    await addStageHistory(id, 'SCHEDULED', 'IN_PROGRESS', null, at(0, 8, 0));
    await addActivity(id, null, 'job_status', 'Job "Full re-roof — semi-detached" → IN_PROGRESS', at(0, 8, 0), 'job', jobReroof);
  }

  {
    const customer = await addCustomer({
      name: 'Fiona Whitmore', phone: '+447900223344', email: 'fiona.whitmore@example.co.uk',
      address: '3 Chestnut Ave, Caversham', postcode: 'RG4 6HG', stage: 'COMPLETED',
      source: 'facebook', createdAt: at(-25, 9, 0), updatedAt: at(-1, 16, 0),
      message: 'Moss all over the front slope — can you treat it and replace cracked tiles?',
    });
    const id = customer.id;
    await addStageHistory(id, 'ENQUIRY', 'SITE_VISIT_BOOKED', lisa, at(-25, 9, 15));
    await addAppointment(
      id, 'Site visit — Fiona Whitmore', at(-23, 9, 0), at(-23, 10, 0), '3 Chestnut Ave, Caversham',
      'done', 'simulated', lisa, at(-25, 9, 15), true, 'site_visit', [],
      'Heavy moss, four cracked tiles. Soft wash and treatment quoted.',
    );
    await addStageHistory(id, 'SITE_VISIT_BOOKED', 'QUOTE_PENDING', null, at(-23, 10, 0));
    const q = await addQuote({
      customer, title: 'Moss removal & roof treatment', status: 'accepted',
      items: [catLine('moss_removal', 1), customLine('Anti-fungal roof treatment', 1, 120, { kind: 'materials' }), catLine('cracked_tile', 4)],
      createdAt: at(-22, 9, 0), sentAt: at(-21, 9, 0), sentVia: 'whatsapp', decidedAt: at(-14, 14, 0), validUntil: dateOnly(-9),
    });
    await addStageHistory(id, 'QUOTE_PENDING', 'QUOTED', lisa, at(-21, 9, 0));
    await addStageHistory(id, 'QUOTED', 'WON', paul, at(-14, 14, 0));
    jobMoss = await addJob({
      customerId: id, quoteId: q.id, title: 'Moss removal & roof treatment', address: '3 Chestnut Ave, Caversham',
      status: 'COMPLETED', requiredSkills: ['roofer'],
      value: jobValueFromQuote(q, []), startDate: dateOnly(-1), endDate: dateOnly(-1),
      createdAt: at(-7, 10, 0), crew: [nathan, callum], completedAt: at(-1, 15, 30), checklistId: 'generic',
      lat: SITE.caversham.lat, lng: SITE.caversham.lng,
    });
    await JobVariation.create({
      job_id: jobMoss, description: 'Extra cracked tiles found on the rear slope', amount: 66, sort_order: 0,
      created_at: at(-1, 14, 0), updated_at: at(-1, 14, 0),
    });
    await addStageHistory(id, 'WON', 'SCHEDULED', paul, at(-7, 10, 0));
    await addStageHistory(id, 'SCHEDULED', 'IN_PROGRESS', null, at(-1, 8, 0));
    await addStageHistory(id, 'IN_PROGRESS', 'COMPLETED', jamie, at(-1, 16, 0));
    await addActivity(id, jamie, 'job_status', 'Job "Moss removal & roof treatment" → COMPLETED', at(-1, 16, 0), 'job', jobMoss);
    await addTask({
      type: 'system',
      rule_key: `invoice_job:job:${jobMoss}`,
      title: 'Invoice job — Moss removal & roof treatment',
      detail: "Fiona Whitmore's job is completed and has no invoice yet.",
      due_date: dateOnly(0),
      priority: 'high',
      status: 'open',
      entity_type: 'job',
      entity_id: jobMoss,
      created_at: at(-1, 16, 0),
    });

    const garageSite = await CustomerSite.create({
      customer_id: id,
      address: 'Garage, 3 Chestnut Ave, Caversham',
      postcode: 'RG4 6HG',
      is_primary: false,
      created_at: at(0, 11, 10),
    });
    const garageMsg = 'The garage felt is leaking now as well — can you come back and look at that separately?';
    const garageLead = await addLead(id, {
      source: 'whatsapp',
      message: garageMsg,
      status: 'ACTIONED',
      createdAt: at(0, 11, 10),
      nextAction: 'Site visit booked',
      stage: 'SITE_VISIT_BOOKED',
      siteId: garageSite.id,
    });
    await addStageHistory(id, 'ENQUIRY', 'SITE_VISIT_BOOKED', lisa, at(0, 11, 10), garageLead.id);
    const garageVisit = await addAppointment(
      id, 'Site visit — Fiona Whitmore (garage)', at(3, 9, 30), at(3, 10, 30), 'Garage, 3 Chestnut Ave, Caversham',
      'booked', 'not_synced', lisa, at(0, 11, 10), false, 'site_visit', [nathan],
      null, null, garageLead.id,
    );
    await addActivity(id, lisa, 'appointment_booked', 'Second enquiry — garage felt leak, site visit booked', at(0, 11, 10), 'appointment', garageVisit);
    await Notification.create({
      user_id: paul, kind: 'new_enquiry', message: enquiryNotifyMessage('Fiona Whitmore', 'whatsapp', garageMsg),
      entity_type: 'lead', entity_id: garageLead.id, created_at: at(0, 11, 10),
    });
    await Notification.create({
      user_id: paul, kind: 'visit_booked',
      message: `Fiona Whitmore — Site visit — Fiona Whitmore (garage) on ${at(3, 9, 30).toLocaleString('en-GB', { timeZone: 'Europe/London' })}`,
      entity_type: 'customer', entity_id: id, created_at: at(0, 11, 10),
    });
    await Notification.create({
      user_id: nathan, kind: 'visit_booked',
      message: `You're assigned to Site visit — Fiona Whitmore (garage) on ${at(3, 9, 30).toLocaleString('en-GB', { timeZone: 'Europe/London' })}`,
      entity_type: 'appointment', entity_id: garageVisit, created_at: at(0, 11, 10),
    });
  }

  let jobCommercial = null;
  let bracknellId = null;
  {
    const customer = await addCustomer({
      name: 'Bracknell Retail Park Ltd', phone: '01344 556677', email: 'facilities@bracknellretail.example.com',
      address: 'Unit 12, Bracknell Retail Park', postcode: 'RG12 1WA', stage: 'INVOICED',
      source: 'email', createdAt: at(-40, 9, 0), updatedAt: at(-20, 10, 0),
      customerType: 'commercial', companyName: 'Bracknell Retail Park Ltd', vatNumber: 'GB 556 7788 21',
      message: 'Facilities email — unit 12 membrane splits and a blocked outlet.',
    });
    const id = customer.id;
    bracknellId = id;
    await addStageHistory(id, 'ENQUIRY', 'SITE_VISIT_BOOKED', paul, at(-40, 9, 15));
    await addAppointment(
      id, 'Site visit — Bracknell Retail Park', at(-38, 9, 0), at(-38, 11, 0), 'Unit 12, Bracknell Retail Park',
      'done', 'simulated', paul, at(-40, 9, 15), true, 'site_visit', [],
      'Membrane splits around two outlets. Commercial reverse-charge quote.',
    );
    await addStageHistory(id, 'SITE_VISIT_BOOKED', 'QUOTE_PENDING', null, at(-38, 11, 0));
    const q = await addQuote({
      customer, title: 'Commercial flat roof repair — unit 12', status: 'accepted',
      items: [
        customLine('Locate & repair roof membrane splits', 1, 890, { kind: 'labour' }),
        customLine('New rainwater outlet', 2, 165, { kind: 'materials' }),
      ],
      createdAt: at(-37, 9, 0), sentAt: at(-36, 9, 0), sentVia: 'email', decidedAt: at(-30, 14, 0), validUntil: dateOnly(-23),
    });
    await addStageHistory(id, 'QUOTE_PENDING', 'QUOTED', lisa, at(-36, 9, 0));
    await addStageHistory(id, 'QUOTED', 'WON', paul, at(-30, 14, 0));
    jobCommercial = await addJob({
      customerId: id, quoteId: q.id, title: 'Commercial flat roof repair', address: 'Unit 12, Bracknell Retail Park',
      status: 'INVOICED', requiredSkills: ['flat_roof'], needsDriver: true,
      value: jobValueFromQuote(q, []), startDate: dateOnly(-22), endDate: dateOnly(-21),
      createdAt: at(-25, 10, 0), crew: [ryan, connor], completedAt: at(-21, 16, 0), checklistId: 'felt',
      lat: SITE.bracknell.lat, lng: SITE.bracknell.lng,
    });
    await JobVariation.create({
      job_id: jobCommercial, description: 'Extra rainwater outlet found on strip-up', amount: 165, sort_order: 0,
      created_at: at(-21, 15, 0), updated_at: at(-21, 15, 0),
    });
    await addStageHistory(id, 'WON', 'SCHEDULED', paul, at(-25, 10, 0));
    await addStageHistory(id, 'SCHEDULED', 'IN_PROGRESS', null, at(-22, 8, 0));
    await addStageHistory(id, 'IN_PROGRESS', 'COMPLETED', ryan, at(-21, 16, 0));
    const invItems = [
      ...q.items,
      { description: 'Extra rainwater outlet found on strip-up', qty: 1, unit_price: 165, vat_code: 'standard', kind: 'labour' },
    ];
    const inv = await addInvoice({
      customer, jobId: jobCommercial, items: invItems, status: 'overdue',
      issueDate: dateOnly(-20), dueDate: dateOnly(-6), sentAt: at(-20, 10, 0), createdAt: at(-20, 10, 0),
    });
    await addStageHistory(id, 'COMPLETED', 'INVOICED', lisa, at(-20, 10, 0));
    await addActivity(id, lisa, 'invoice_sent', `Invoice ${inv.ref} sent (QuickBooks simulated)`, at(-20, 10, 0), 'invoice', inv.id);
    await addActivity(id, null, 'invoice_overdue', `Invoice ${inv.ref} is overdue`, at(-6, 9, 0));
    await addTask({
      type: 'system',
      rule_key: `chase_payment:invoice:${inv.id}`,
      title: `Payment overdue — ${inv.ref} (Bracknell Retail Park Ltd)`,
      detail: `Invoice ${inv.ref} was due ${dateOnly(-6)} and is unpaid. Chase payment.`,
      due_date: dateOnly(0),
      priority: 'high',
      status: 'open',
      entity_type: 'invoice',
      entity_id: inv.id,
      created_at: at(-6, 9, 0),
    });
    await Notification.create({
      user_id: lisa, kind: 'invoice_overdue',
      message: `Invoice ${inv.ref} (Bracknell Retail Park Ltd) is overdue`,
      entity_type: 'invoice', entity_id: inv.id, created_at: at(-6, 9, 0),
    });
  }

  {
    const customer = await addCustomer({
      name: 'Rebecca & James Doyle', phone: '+447900334455', email: 'doyle.family@example.co.uk',
      address: '19 Hawthorn Drive, Earley', postcode: 'RG6 5NT', stage: 'PAID',
      source: 'whatsapp', createdAt: at(-50, 9, 0), updatedAt: at(-25, 10, 0),
      message: 'Velux leaking around the flashing — can you replace it?',
    });
    const id = customer.id;
    await addStageHistory(id, 'ENQUIRY', 'SITE_VISIT_BOOKED', paul, at(-50, 9, 15));
    await addAppointment(
      id, 'Site visit — Doyle', at(-48, 9, 0), at(-48, 10, 0), '19 Hawthorn Drive, Earley',
      'done', 'simulated', paul, at(-50, 9, 15), true, 'site_visit', [],
      'Old Velux and failed flashing. Replacement quoted.',
    );
    await addStageHistory(id, 'SITE_VISIT_BOOKED', 'QUOTE_PENDING', null, at(-48, 10, 0));
    const q = await addQuote({
      customer, title: 'Velux window replacement + roof repair', status: 'accepted',
      items: [catLine('velux', 1), customLine('Re-tile surrounding area', 1, 180, { kind: 'labour' })],
      createdAt: at(-47, 9, 0), sentAt: at(-46, 9, 0), sentVia: 'whatsapp', decidedAt: at(-42, 14, 0), validUntil: dateOnly(-27),
    });
    await addStageHistory(id, 'QUOTE_PENDING', 'QUOTED', lisa, at(-46, 9, 0));
    await addStageHistory(id, 'QUOTED', 'WON', paul, at(-42, 14, 0));
    const jobId = await addJob({
      customerId: id, quoteId: q.id, title: 'Velux window replacement', address: '19 Hawthorn Drive, Earley',
      status: 'PAID', requiredSkills: ['roofer'], needsDriver: true,
      value: jobValueFromQuote(q, []), startDate: dateOnly(-35), endDate: dateOnly(-35),
      createdAt: at(-40, 10, 0), crew: [jamie], completedAt: at(-35, 15, 0), checklistId: 'generic',
      lat: SITE.earley.lat, lng: SITE.earley.lng,
    });
    await addStageHistory(id, 'WON', 'SCHEDULED', paul, at(-40, 10, 0));
    await addStageHistory(id, 'SCHEDULED', 'IN_PROGRESS', null, at(-35, 8, 0));
    await addStageHistory(id, 'IN_PROGRESS', 'COMPLETED', jamie, at(-35, 15, 0));
    const inv = await addInvoice({
      customer, jobId, items: q.items, status: 'paid',
      issueDate: dateOnly(-34), dueDate: dateOnly(-20), sentAt: at(-34, 10, 0), paidAt: at(-25, 10, 0),
      createdAt: at(-34, 10, 0), qboId: 'SIM-DEMO-001',
    });
    await addStageHistory(id, 'COMPLETED', 'INVOICED', lisa, at(-34, 10, 0));
    await addStageHistory(id, 'INVOICED', 'PAID', null, at(-25, 10, 0));
    await addActivity(id, null, 'payment_recorded', `Payment of ${money(inv.due_now)} recorded against ${inv.ref}`, at(-25, 10, 0), 'invoice', inv.id);
  }

  {
    const customer = await addCustomer({
      name: "St. Aldhelm's Primary School", phone: '01189 887766', email: 'office@staldhelms.example.sch.uk',
      address: 'Church Road, Reading', postcode: 'RG1 6DZ', stage: 'PAID',
      source: 'email', createdAt: at(-60, 9, 0), updatedAt: at(-33, 11, 0),
      customerType: 'commercial', companyName: "St. Aldhelm's Primary School", vatNumber: 'GB 112 3344 55',
      message: 'School office — classroom block flat roof recover in the holiday.',
    });
    const id = customer.id;
    await addStageHistory(id, 'ENQUIRY', 'SITE_VISIT_BOOKED', lisa, at(-60, 9, 15));
    await addAppointment(
      id, "Site visit — St Aldhelm's", at(-58, 9, 0), at(-58, 10, 30), 'Church Road, Reading',
      'done', 'simulated', lisa, at(-60, 9, 15), true, 'site_visit', [],
      'Classroom block EPDM recover plus insulation upgrade.',
    );
    await addStageHistory(id, 'SITE_VISIT_BOOKED', 'QUOTE_PENDING', null, at(-58, 10, 30));
    const q = await addQuote({
      customer, title: 'Classroom block flat roof — full recover', status: 'accepted',
      items: [catLine('epdm', 85), customLine('New insulation upgrade', 85, 18, { kind: 'materials', unit: 'm²' })],
      createdAt: at(-57, 9, 0), sentAt: at(-56, 9, 0), sentVia: 'email', decidedAt: at(-50, 14, 0), validUntil: dateOnly(-45),
    });
    await addStageHistory(id, 'QUOTE_PENDING', 'QUOTED', lisa, at(-56, 9, 0));
    await addStageHistory(id, 'QUOTED', 'WON', paul, at(-50, 14, 0));
    const jobId = await addJob({
      customerId: id, quoteId: q.id, title: 'Classroom block flat roof recover', address: 'Church Road, Reading',
      status: 'PAID', requiredSkills: ['flat_roof', 'felt'],
      value: jobValueFromQuote(q, []), startDate: dateOnly(-44), endDate: dateOnly(-40),
      createdAt: at(-48, 10, 0), crew: [connor, callum, nathan], completedAt: at(-40, 16, 0), checklistId: 'felt',
      lat: SITE.reading.lat, lng: SITE.reading.lng,
    });
    await addStageHistory(id, 'WON', 'SCHEDULED', paul, at(-48, 10, 0));
    await addStageHistory(id, 'SCHEDULED', 'IN_PROGRESS', null, at(-44, 8, 0));
    await addStageHistory(id, 'IN_PROGRESS', 'COMPLETED', connor, at(-40, 16, 0));
    const inv = await addInvoice({
      customer, jobId, items: q.items, status: 'paid',
      issueDate: dateOnly(-39), dueDate: dateOnly(-25), sentAt: at(-39, 10, 0), paidAt: at(-33, 11, 0),
      createdAt: at(-39, 10, 0), qboId: 'SIM-DEMO-002',
    });
    await addStageHistory(id, 'COMPLETED', 'INVOICED', lisa, at(-39, 10, 0));
    await addStageHistory(id, 'INVOICED', 'PAID', null, at(-33, 11, 0));
    await addActivity(id, null, 'payment_recorded', `Payment of ${money(inv.due_now)} recorded against ${inv.ref}`, at(-33, 11, 0), 'invoice', inv.id);
  }

  {
    const customer = await addCustomer({
      name: 'Nora Quinn', phone: '+447900445566', email: 'nora.quinn@example.co.uk',
      address: '11 Star Road, Caversham', postcode: 'RG4 5BX', stage: 'INVOICED',
      source: 'phone', createdAt: at(-16, 9, 0), updatedAt: at(-1, 10, 0),
      message: 'Downpipe off the fascia after the wind — small repair.',
    });
    const id = customer.id;
    await addStageHistory(id, 'ENQUIRY', 'SITE_VISIT_BOOKED', lisa, at(-16, 9, 20));
    await addAppointment(
      id, 'Site visit — Nora Quinn', at(-14, 11, 0), at(-14, 11, 45), '11 Star Road, Caversham',
      'done', 'simulated', lisa, at(-16, 9, 20), true, 'other', [],
      'Downpipe bracket failed. Quoted a small fascia repair.',
    );
    await addStageHistory(id, 'SITE_VISIT_BOOKED', 'QUOTE_PENDING', null, at(-14, 11, 45));
    const q = await addQuote({
      customer, title: 'Downpipe & fascia repair', status: 'accepted',
      items: [customLine('Refit downpipe and fascia bracket', 1, 180, { kind: 'labour' }), catLine('fascia_upvc', 2)],
      createdAt: at(-13, 9, 0), sentAt: at(-12, 9, 0), sentVia: 'email', decidedAt: at(-8, 14, 0), validUntil: dateOnly(5),
    });
    await addStageHistory(id, 'QUOTE_PENDING', 'QUOTED', lisa, at(-12, 9, 0));
    await addStageHistory(id, 'QUOTED', 'WON', paul, at(-8, 14, 0));
    jobNora = await addJob({
      customerId: id, quoteId: q.id, title: 'Downpipe & fascia repair', address: '11 Star Road, Caversham',
      status: 'INVOICED', requiredSkills: ['guttering'], needsDriver: true,
      value: jobValueFromQuote(q, []), startDate: dateOnly(-2), endDate: dateOnly(-2),
      createdAt: at(-7, 10, 0), crew: [liam], completedAt: at(-2, 15, 0), checklistId: 'guttering',
      lat: SITE.caversham.lat, lng: SITE.caversham.lng,
    });
    await addStageHistory(id, 'WON', 'SCHEDULED', paul, at(-7, 10, 0));
    await addStageHistory(id, 'SCHEDULED', 'IN_PROGRESS', null, at(-2, 8, 0));
    await addStageHistory(id, 'IN_PROGRESS', 'COMPLETED', liam, at(-2, 16, 0));
    const noraInv = await addInvoice({
      customer, jobId: jobNora, items: q.items, status: 'draft',
      issueDate: dateOnly(-1), dueDate: dateOnly(13), createdAt: at(-1, 10, 0),
      notes: 'Draft from completed job — Lisa to check and send.',
    });
    await addStageHistory(id, 'COMPLETED', 'INVOICED', lisa, at(-1, 10, 0));
    await addActivity(id, lisa, 'invoice_created', `Invoice ${noraInv.ref} created — ${money(noraInv.total)}`, at(-1, 10, 0), 'invoice', noraInv.id);
  }

  {
    const customer = await addCustomer({
      name: 'Ian Croft', phone: '+447900556677', email: 'ian.croft@example.co.uk',
      address: '27 Peppard Road, Reading', postcode: 'RG4 8LR', stage: 'INVOICED',
      source: 'whatsapp', createdAt: at(-18, 10, 0), updatedAt: at(-3, 10, 0),
      message: 'A few cracked tiles on the rear — not urgent.',
    });
    const id = customer.id;
    await addStageHistory(id, 'ENQUIRY', 'SITE_VISIT_BOOKED', paul, at(-18, 10, 30));
    await addAppointment(
      id, 'Site visit — Ian Croft', at(-16, 14, 0), at(-16, 14, 40), '27 Peppard Road, Reading',
      'done', 'simulated', paul, at(-18, 10, 30), true, 'site_visit', [],
      'Six cracked tiles. Quoted replacements.',
    );
    await addStageHistory(id, 'SITE_VISIT_BOOKED', 'QUOTE_PENDING', null, at(-16, 14, 40));
    const q = await addQuote({
      customer, title: 'Replace cracked tiles — rear slope', status: 'accepted',
      items: [catLine('cracked_tile', 6)],
      createdAt: at(-15, 9, 0), sentAt: at(-14, 9, 0), sentVia: 'whatsapp', decidedAt: at(-10, 11, 0), validUntil: dateOnly(4),
    });
    await addStageHistory(id, 'QUOTE_PENDING', 'QUOTED', lisa, at(-14, 9, 0));
    await addStageHistory(id, 'QUOTED', 'WON', paul, at(-10, 11, 0));
    const jobId = await addJob({
      customerId: id, quoteId: q.id, title: 'Replace cracked tiles', address: '27 Peppard Road, Reading',
      status: 'INVOICED', requiredSkills: ['roofer'],
      value: jobValueFromQuote(q, []), startDate: dateOnly(-4), endDate: dateOnly(-4),
      createdAt: at(-9, 10, 0), crew: [nathan], completedAt: at(-4, 15, 0), checklistId: 'generic',
      lat: SITE.reading.lat, lng: SITE.reading.lng,
    });
    await addStageHistory(id, 'WON', 'SCHEDULED', paul, at(-9, 10, 0));
    await addStageHistory(id, 'SCHEDULED', 'IN_PROGRESS', null, at(-4, 8, 0));
    await addStageHistory(id, 'IN_PROGRESS', 'COMPLETED', nathan, at(-4, 15, 0));
    const inv = await addInvoice({
      customer, jobId, items: q.items, status: 'sent',
      issueDate: dateOnly(-3), dueDate: dateOnly(11), sentAt: at(-3, 10, 0), createdAt: at(-3, 10, 0),
    });
    await addStageHistory(id, 'COMPLETED', 'INVOICED', lisa, at(-3, 10, 0));
    await addActivity(id, lisa, 'invoice_sent', `Invoice ${inv.ref} sent`, at(-3, 10, 0), 'invoice', inv.id);
  }

  {
    const customer = await addCustomer({
      name: 'Maya Chen', phone: '+447900667788', email: 'maya.chen@example.co.uk',
      address: '4 Meadow Walk, Woodley', postcode: 'RG5 4PQ', stage: 'INVOICED',
      source: 'email', createdAt: at(-20, 11, 0), updatedAt: at(-1, 9, 0),
      message: 'Gutter leak over the kitchen window.',
    });
    const id = customer.id;
    await addStageHistory(id, 'ENQUIRY', 'SITE_VISIT_BOOKED', lisa, at(-20, 11, 20));
    await addAppointment(
      id, 'Site visit — Maya Chen', at(-18, 15, 0), at(-18, 15, 40), '4 Meadow Walk, Woodley',
      'done', 'simulated', lisa, at(-20, 11, 20), true, 'site_visit', [],
      'Joint failed on the kitchen run. Quoted a short UPVC replacement.',
    );
    await addStageHistory(id, 'SITE_VISIT_BOOKED', 'QUOTE_PENDING', null, at(-18, 15, 40));
    const q = await addQuote({
      customer, title: 'Gutter joint repair — kitchen elevation', status: 'accepted',
      items: [catLine('gutter_upvc', 8)],
      createdAt: at(-17, 9, 0), sentAt: at(-16, 9, 0), sentVia: 'email', decidedAt: at(-12, 14, 0), validUntil: dateOnly(2),
    });
    await addStageHistory(id, 'QUOTE_PENDING', 'QUOTED', lisa, at(-16, 9, 0));
    await addStageHistory(id, 'QUOTED', 'WON', paul, at(-12, 14, 0));
    jobMaya = await addJob({
      customerId: id, quoteId: q.id, title: 'Gutter joint repair', address: '4 Meadow Walk, Woodley',
      status: 'INVOICED', requiredSkills: ['guttering'], needsDriver: true,
      value: jobValueFromQuote(q, []), startDate: dateOnly(-5), endDate: dateOnly(-5),
      createdAt: at(-11, 10, 0), crew: [liam], completedAt: at(-5, 15, 0), checklistId: 'guttering',
      lat: SITE.woodley.lat, lng: SITE.woodley.lng,
    });
    await addStageHistory(id, 'WON', 'SCHEDULED', paul, at(-11, 10, 0));
    await addStageHistory(id, 'SCHEDULED', 'IN_PROGRESS', null, at(-5, 8, 0));
    await addStageHistory(id, 'IN_PROGRESS', 'COMPLETED', liam, at(-5, 15, 0));
    const inv = await addInvoice({
      customer, jobId: jobMaya, items: q.items, status: 'part_paid',
      issueDate: dateOnly(-4), dueDate: dateOnly(10), sentAt: at(-4, 10, 0), createdAt: at(-4, 10, 0),
      payments: [{ amount: 80, paidAt: at(-1, 9, 0), note: 'Part payment — bank transfer' }],
    });
    await addStageHistory(id, 'COMPLETED', 'INVOICED', lisa, at(-4, 10, 0));
    await addActivity(id, lisa, 'payment_recorded', `Part payment recorded against ${inv.ref}`, at(-1, 9, 0), 'invoice', inv.id);
  }

  const extra = [
    ['Neil Draper', 'phone', -3, 'No response'],
    ['Amy Considine', 'email', -7, 'No response'],
    ['Rob & Sheila Pang', 'whatsapp', -10, 'Out of area'],
    ['Faisal Rahman', 'facebook', -14, 'No response'],
    ['Julie Marchant', 'phone', -17, 'No response'],
    ['Craig Osei', 'whatsapp', -21, 'No response'],
  ];
  for (let i = 0; i < extra.length; i++) {
    const [name, source, offset, lostReason] = extra[i];
    const ts = at(offset, 9 + i, 0);
    const customer = await addCustomer({
      name,
      phone: source !== 'email' ? `+44790${1000000 + i * 37}` : null,
      email: source === 'email' ? `${name.split(' ')[0].toLowerCase()}@example.co.uk` : null,
      address: 'Reading area', postcode: 'RG1 1AA', stage: 'LOST', source, createdAt: ts, updatedAt: ts,
      lostReason,
      message: 'Enquiry — did not proceed',
    });
    await addStageHistory(customer.id, 'ENQUIRY', 'LOST', null, ts);
    if (i === 0) {
      const expired = await addQuote({
        customer, title: 'General roof enquiry', status: 'expired',
        items: [catLine('moss_removal', 1)],
        createdAt: at(offset - 12, 9, 0), sentAt: at(offset - 11, 9, 0), sentVia: 'email',
        validUntil: dateOnly(offset - 1),
      });
      await addTask({
        type: 'system',
        rule_key: `quote_expired:quote:${expired.id}`,
        title: `Quote expired — ${expired.ref} (${name})`,
        detail: 'Quote passed its validity date with no decision. Re-issue or mark lost.',
        due_date: dateOnly(0),
        priority: 'normal',
        status: 'open',
        entity_type: 'quote',
        entity_id: expired.id,
        created_at: at(offset - 1, 9, 0),
      });
    }
  }

  console.log('Adding holiday requests...');
  const holConnor = await HolidayRequest.create({
    user_id: connor, start_date: dateOnly(35), end_date: dateOnly(39), days: 5, reason: 'Family holiday',
    status: 'pending', created_at: at(-1, 16, 0),
  });
  await HolidayRequest.create({
    user_id: callum, start_date: dateOnly(10), end_date: dateOnly(12), days: 3, reason: null,
    status: 'approved', decided_by: paul, decided_at: at(-10, 10, 0), created_at: at(-40, 9, 0),
  });
  await HolidayRequest.create({
    user_id: ryan, start_date: dateOnly(50), end_date: dateOnly(54), days: 5, reason: 'Family holiday',
    status: 'approved', decided_by: paul, decided_at: at(-5, 10, 0), created_at: at(-8, 9, 0),
  });
  await HolidayRequest.create({
    user_id: nathan, start_date: dateOnly(-20), end_date: dateOnly(-18), days: 3, reason: 'Personal',
    status: 'declined', decided_by: paul, decided_at: at(-25, 10, 0),
    decline_reason: 'Less than 4 weeks notice given at the time — please rebook further out',
    created_at: at(-26, 9, 0),
  });
  await Notification.create({
    user_id: paul, kind: 'holiday_submitted',
    message: `Connor Blake requested ${dateOnly(35)} to ${dateOnly(39)} (5 days)`,
    entity_type: 'holiday', entity_id: holConnor.id, created_at: at(-1, 16, 0),
  });
  await Notification.create({
    user_id: callum, kind: 'holiday_approved',
    message: `Your holiday ${dateOnly(10)} to ${dateOnly(12)} was approved`,
    created_at: at(-10, 10, 0),
  });
  await Notification.create({
    user_id: nathan, kind: 'holiday_declined',
    message: `Your holiday ${dateOnly(-20)} to ${dateOnly(-18)} was declined — Less than 4 weeks notice given at the time — please rebook further out`,
    created_at: at(-25, 10, 0),
  });

  console.log('Adding team chat & tasks...');
  const chat = [
    [paul, 'Morning all — forecast says rain from Thursday so let\'s try and get the Fitch guttering job done today and tomorrow while it\'s dry.', -1],
    [liam, 'Sounds good, I\'ll bring the extra ladder.', -1],
    [lisa, 'Community Hall job — client asked if we can start slightly later, 9:30 instead of 8. Fine to confirm?', 0],
    [paul, 'Yep that\'s fine, confirmed.', 0],
  ];
  for (let i = 0; i < chat.length; i++) {
    const [uid, body, dayOffset] = chat[i];
    await TeamMessage.create({ user_id: uid, body, created_at: at(dayOffset, 7 + i, 30) });
  }

  await addTask({
    type: 'manual', title: 'Order more dry-fix ridge kits',
    detail: 'Down to last 2 — order before the Owen Marsh job needs more.',
    due_date: dateOnly(1), priority: 'normal', assignee_id: lisa,
    entity_type: 'customer', entity_id: owenId, created_at: at(-1, 9, 0),
  });
  await addTask({
    type: 'manual', title: 'Call insurance re: Bracknell Retail Park',
    detail: 'They mentioned it might be a partial insurance claim — check before chasing payment further.',
    due_date: dateOnly(0), priority: 'high', assignee_id: lisa,
    entity_type: 'customer', entity_id: bracknellId, created_at: at(-2, 11, 0),
  });
  await addTask({
    type: 'manual', title: 'Photo the skip area at Owen Marsh',
    detail: 'Confirm skip placement before tomorrow\'s tile delivery.',
    due_date: dateOnly(0), priority: 'normal', assignee_id: jamie,
    entity_type: 'customer', entity_id: owenId, created_at: at(-1, 10, 0),
  });

  console.log('Adding timesheets...');
  async function addShift({
    userId, jobId, dayOffset, inH, inM = 0, outH, outM = 0, breakMin = 30,
    notes = null, flag = null, distance = null, status = 'approved', onBreak = false,
    editReason = null, inLat = null, inLng = null, outLat = null, outLng = null,
  }) {
    const clockIn = at(dayOffset, inH, inM);
    const clockOut = outH === null ? null : at(dayOffset, outH, outM);
    const user = await User.findByPk(userId, { attributes: ['hourly_cost'] });
    const rate = Number(user.hourly_cost) || 0;
    let worked = null;
    let cost = null;
    if (clockOut) {
      worked = Math.max(0, (clockOut - clockIn) / 60000);
      cost = Math.round((worked / 60) * rate * 100) / 100;
    }
    await Timesheet.create({
      user_id: userId,
      job_id: jobId,
      work_date: dateOnly(dayOffset),
      clock_in: clockIn,
      clock_out: clockOut,
      break_minutes: breakMin,
      break_started_at: onBreak ? at(dayOffset, 12, 15) : null,
      in_lat: inLat,
      in_lng: inLng,
      in_accuracy: inLat != null ? 12 : null,
      out_lat: outLat,
      out_lng: outLng,
      out_accuracy: outLat != null ? 14 : null,
      in_distance_m: distance,
      location_flag: flag,
      notes,
      worked_minutes: worked,
      cost_rate: clockOut ? rate : null,
      labour_cost: cost,
      status,
      edit_reason: editReason,
      approved_by: status === 'approved' ? paul : null,
      approved_at: status === 'approved' ? at(dayOffset, 18, 0) : null,
      created_at: clockIn,
    });
  }

  for (const [d, i, o] of [[-22, 8, 16], [-21, 8, 16]]) {
    await addShift({
      userId: ryan, jobId: jobCommercial, dayOffset: d, inH: i, outH: o,
      inLat: SITE.bracknell.lat, inLng: SITE.bracknell.lng,
      outLat: SITE.bracknell.lat, outLng: SITE.bracknell.lng,
    });
    await addShift({
      userId: connor, jobId: jobCommercial, dayOffset: d, inH: i, outH: o,
      inLat: SITE.bracknell.lat, inLng: SITE.bracknell.lng,
      outLat: SITE.bracknell.lat, outLng: SITE.bracknell.lng,
    });
  }

  await addShift({
    userId: nathan, jobId: jobMoss, dayOffset: -1, inH: 8, outH: 15, outM: 30, breakMin: 30,
    notes: 'Soft washed both slopes, treated and replaced the 4 cracked tiles. All good.', status: 'completed',
    inLat: SITE.caversham.lat, inLng: SITE.caversham.lng,
    outLat: SITE.caversham.lat, outLng: SITE.caversham.lng,
  });
  await addShift({
    userId: callum, jobId: jobMoss, dayOffset: -1, inH: 8, outH: 15, outM: 30, breakMin: 30,
    notes: 'Cleared gutters of the moss run-off before we left.', status: 'completed',
    inLat: SITE.caversham.lat, inLng: SITE.caversham.lng,
    outLat: SITE.caversham.lat, outLng: SITE.caversham.lng,
  });

  await addShift({
    userId: liam, jobId: jobNora, dayOffset: -2, inH: 9, inM: 20, outH: 16, breakMin: 45,
    notes: 'Started late, went to the wrong address first.', flag: 'far_from_site', distance: 2400, status: 'completed',
    inLat: SITE.reading.lat, inLng: SITE.reading.lng,
    outLat: SITE.reading.lat, outLng: SITE.reading.lng,
  });

  await addShift({
    userId: liam, jobId: null, dayOffset: -3, inH: 8, outH: 12, breakMin: 0,
    notes: 'Yard / van prep — no job pin.', flag: 'no_location', status: 'completed',
  });

  await addShift({
    userId: callum, jobId: jobMoss, dayOffset: -4, inH: 8, outH: 16, breakMin: 30,
    notes: 'Clocked against moss job by mistake — was a yard day.',
    status: 'rejected', editReason: 'Wrong job — this was a yard day, not the Caversham moss visit.',
    inLat: SITE.reading.lat, inLng: SITE.reading.lng,
  });

  await addShift({
    userId: liam, jobId: jobMaya, dayOffset: -5, inH: 8, outH: 15, outM: 30, breakMin: 30,
    notes: 'Replaced the kitchen-elevation gutter run. Joint sealed.',
    status: 'approved',
    inLat: SITE.woodley.lat, inLng: SITE.woodley.lng,
    outLat: SITE.woodley.lat, outLng: SITE.woodley.lng,
  });

  for (const u of [jamie, ryan, connor]) {
    await addShift({
      userId: u, jobId: jobReroof, dayOffset: -1, inH: 7, inM: 45, outH: 16, outM: 30, breakMin: 45,
      status: u === connor ? 'approved' : 'completed',
      inLat: SITE.earley.lat, inLng: SITE.earley.lng,
      outLat: SITE.earley.lat, outLng: SITE.earley.lng,
    });
  }
  await addShift({
    userId: jamie, jobId: jobReroof, dayOffset: 0, inH: 7, inM: 50, outH: null, breakMin: 0, status: 'active',
    inLat: SITE.earley.lat, inLng: SITE.earley.lng,
  });
  await addShift({
    userId: ryan, jobId: jobReroof, dayOffset: 0, inH: 7, inM: 55, outH: null, breakMin: 0, status: 'active', onBreak: true,
    inLat: SITE.earley.lat, inLng: SITE.earley.lng,
  });

  console.log('Seeding integration events...');
  const events = [
    ['whatsapp', 'in', 'message.received', 'simulated'], ['whatsapp', 'out', 'template.simulated', 'simulated'],
    ['email', 'out', 'email.simulated', 'simulated'], ['facebook', 'in', 'leadgen.received', 'simulated'],
    ['google', 'out', 'event.simulated', 'simulated'], ['quickbooks', 'out', 'invoice.simulated', 'simulated'],
    ['ai', 'out', 'schedule.proposed', 'ok'],
  ];
  for (let i = 0; i < events.length; i++) {
    const [provider, direction, event, status] = events[i];
    await IntegrationEvent.create({ provider, direction, event, payload: { demo: true }, status, created_at: at(-1, 8 + i, 0) });
  }

  console.log('\nSeed complete.');
  console.log('  Owner/Admin login:  paul@pauldouglasroofing.co.uk / password123');
  console.log('  Office login:       lisa@pauldouglasroofing.co.uk / password123');
  console.log('  Field staff login:  jamie@pauldouglasroofing.co.uk / password123  (any of jamie/connor/liam/ryan/callum/nathan)');
  await sequelize.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
