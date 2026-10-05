// ============================================================
// Sequelize models — one definition per CRM table.
// Attribute names stay snake_case so route/service consumers
// keep the same property access as the previous SQLite layer.
// ============================================================
const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const { ROLE_VALUES } = require('../roles');

const jsonDefault = (value) => ({
  type: DataTypes.JSONB,
  allowNull: false,
  defaultValue: value,
});

const User = sequelize.define('User', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name: { type: DataTypes.TEXT, allowNull: false },
  email: { type: DataTypes.TEXT, allowNull: false, unique: true },
  phone: { type: DataTypes.TEXT },
  password_hash: { type: DataTypes.TEXT, allowNull: false },
  role: {
    type: DataTypes.TEXT,
    allowNull: false,
    validate: { isIn: { args: [[...ROLE_VALUES]], msg: 'Invalid role' } },
  },
  skills: jsonDefault([]),
  is_driver: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  holiday_allowance: { type: DataTypes.DOUBLE, allowNull: false, defaultValue: 28 },
  color: { type: DataTypes.TEXT, allowNull: false, defaultValue: '#64748b' },
  avatar_file: { type: DataTypes.TEXT },
  hourly_cost: { type: DataTypes.DOUBLE, allowNull: false, defaultValue: 0 },
  cis_status: { type: DataTypes.TEXT, allowNull: false, defaultValue: 'none' },
  /** When true, OFFICE users cannot see job costing / labour-cost (requirement 1.6). ADMIN ignores this. */
  financials_restricted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  password_reset_token: { type: DataTypes.TEXT },
  password_reset_expires: { type: DataTypes.DATE },
  /** Incremented to invalidate outstanding JWTs (requirement 1.9). */
  token_version: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  /** In-app / email opt-in map. Missing keys are off (requirement 13.2). */
  notification_prefs: jsonDefault({ in_app: {}, email: {} }),
}, { tableName: 'users', timestamps: true, createdAt: 'created_at', updatedAt: false });

const Customer = sequelize.define('Customer', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name: { type: DataTypes.TEXT, allowNull: false },
  notes: { type: DataTypes.TEXT },
  stage: { type: DataTypes.TEXT, allowNull: false, defaultValue: 'ENQUIRY' },
  /** Position within the stage column on the Kanban board (requirement 4.2). */
  board_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  source: { type: DataTypes.TEXT, allowNull: false, defaultValue: 'manual' },
  owner_id: { type: DataTypes.INTEGER },
  lost_reason: { type: DataTypes.TEXT },
  customer_type: {
    type: DataTypes.TEXT,
    allowNull: false,
    defaultValue: 'domestic',
    validate: { isIn: { args: [['domestic', 'commercial']], msg: 'Invalid customer type' } },
  },
  company_name: { type: DataTypes.TEXT },
  vat_number: { type: DataTypes.TEXT },
}, { tableName: 'customers', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at' });

/** Site address on a customer record (requirement 2.2). Fields match the previous scalar address + postcode. */
const CustomerSite = sequelize.define('CustomerSite', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  customer_id: { type: DataTypes.INTEGER, allowNull: false },
  address: { type: DataTypes.TEXT, allowNull: false },
  postcode: { type: DataTypes.TEXT },
  is_primary: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
}, { tableName: 'customer_sites', timestamps: true, createdAt: 'created_at', updatedAt: false });

const CustomerPhone = sequelize.define('CustomerPhone', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  customer_id: { type: DataTypes.INTEGER, allowNull: false },
  value: { type: DataTypes.TEXT, allowNull: false },
  /** Digits-only UK form for match/search; display stays on `value` (requirement 2.5). */
  normalised: { type: DataTypes.TEXT },
  type: {
    type: DataTypes.TEXT,
    allowNull: false,
    validate: { isIn: { args: [['mobile', 'landline', 'work']], msg: 'Invalid phone type' } },
  },
  is_primary: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
}, { tableName: 'customer_phones', timestamps: true, createdAt: 'created_at', updatedAt: false });

const CustomerEmail = sequelize.define('CustomerEmail', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  customer_id: { type: DataTypes.INTEGER, allowNull: false },
  value: { type: DataTypes.TEXT, allowNull: false },
  type: {
    type: DataTypes.TEXT,
    allowNull: false,
    validate: { isIn: { args: [['personal', 'work']], msg: 'Invalid email type' } },
  },
  is_primary: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
}, { tableName: 'customer_emails', timestamps: true, createdAt: 'created_at', updatedAt: false });

/** Dated internal note on the customer record (requirement 2.4). Never sent to the customer. */
const CustomerNote = sequelize.define('CustomerNote', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  customer_id: { type: DataTypes.INTEGER, allowNull: false },
  body: { type: DataTypes.TEXT, allowNull: false },
  user_id: { type: DataTypes.INTEGER },
}, { tableName: 'customer_notes', timestamps: true, createdAt: 'created_at', updatedAt: false });

/** Photo or PDF attached to the customer only — not a quote or job (requirement 2.4). */
const CustomerFile = sequelize.define('CustomerFile', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  customer_id: { type: DataTypes.INTEGER, allowNull: false },
  stored_name: { type: DataTypes.TEXT, allowNull: false },
  original_name: { type: DataTypes.TEXT, allowNull: false },
  mime: { type: DataTypes.TEXT, allowNull: false },
  size_bytes: { type: DataTypes.INTEGER, allowNull: false },
  user_id: { type: DataTypes.INTEGER },
}, { tableName: 'customer_files', timestamps: true, createdAt: 'created_at', updatedAt: false });

const Lead = sequelize.define('Lead', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  customer_id: { type: DataTypes.INTEGER },
  source: { type: DataTypes.TEXT, allowNull: false },
  subject: { type: DataTypes.TEXT },
  message: { type: DataTypes.TEXT },
  status: { type: DataTypes.TEXT, allowNull: false, defaultValue: 'NEW' },
  next_action: { type: DataTypes.TEXT },
  meta: jsonDefault({}),
  /** Pipeline column for this enquiry — independent of other jobs on the same customer. */
  stage: { type: DataTypes.TEXT, allowNull: false, defaultValue: 'ENQUIRY' },
  board_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  lost_reason: { type: DataTypes.TEXT },
}, { tableName: 'leads', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at' });

const Message = sequelize.define('Message', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  customer_id: { type: DataTypes.INTEGER, allowNull: false },
  direction: { type: DataTypes.TEXT, allowNull: false },
  channel: { type: DataTypes.TEXT, allowNull: false },
  body: { type: DataTypes.TEXT, allowNull: false },
  meta: jsonDefault({}),
  status: { type: DataTypes.TEXT, allowNull: false, defaultValue: 'logged' },
  user_id: { type: DataTypes.INTEGER },
}, { tableName: 'messages', timestamps: true, createdAt: 'created_at', updatedAt: false });

const Appointment = sequelize.define('Appointment', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  customer_id: { type: DataTypes.INTEGER, allowNull: false },
  lead_id: { type: DataTypes.INTEGER },
  title: { type: DataTypes.TEXT, allowNull: false },
  start: { type: DataTypes.DATE, allowNull: false },
  end: { type: DataTypes.DATE, allowNull: false },
  address: { type: DataTypes.TEXT },
  notes: { type: DataTypes.TEXT },
  gcal_event_id: { type: DataTypes.TEXT },
  gcal_status: { type: DataTypes.TEXT, allowNull: false, defaultValue: 'not_synced' },
  status: { type: DataTypes.TEXT, allowNull: false, defaultValue: 'booked' },
  stage_advanced: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  created_by: { type: DataTypes.INTEGER },
  site_id: { type: DataTypes.INTEGER },
  phone_id: { type: DataTypes.INTEGER },
  email_id: { type: DataTypes.INTEGER },
  visit_type: { type: DataTypes.TEXT, allowNull: false, defaultValue: 'site_visit' },
  complete_note: { type: DataTypes.TEXT },
}, { tableName: 'appointments', timestamps: true, createdAt: 'created_at', updatedAt: false });

const AppointmentAssignee = sequelize.define('AppointmentAssignee', {
  appointment_id: { type: DataTypes.INTEGER, primaryKey: true },
  user_id: { type: DataTypes.INTEGER, primaryKey: true },
}, { tableName: 'appointment_assignees', timestamps: false });

const Quote = sequelize.define('Quote', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  customer_id: { type: DataTypes.INTEGER, allowNull: false },
  lead_id: { type: DataTypes.INTEGER },
  ref: { type: DataTypes.TEXT, allowNull: false, unique: true },
  title: { type: DataTypes.TEXT, allowNull: false },
  items: jsonDefault([]),
  subtotal: { type: DataTypes.DOUBLE, allowNull: false, defaultValue: 0 },
  vat_rate: { type: DataTypes.DOUBLE, allowNull: false, defaultValue: 20 },
  vat_amount: { type: DataTypes.DOUBLE, allowNull: false, defaultValue: 0 },
  total: { type: DataTypes.DOUBLE, allowNull: false, defaultValue: 0 },
  valid_until: { type: DataTypes.DATEONLY },
  status: { type: DataTypes.TEXT, allowNull: false, defaultValue: 'draft' },
  sent_at: { type: DataTypes.DATE },
  sent_via: { type: DataTypes.TEXT },
  decided_at: { type: DataTypes.DATE },
  pdf_file: { type: DataTypes.TEXT },
  notes: { type: DataTypes.TEXT },
  created_by: { type: DataTypes.INTEGER },
  vat_treatment: { type: DataTypes.TEXT, allowNull: false, defaultValue: 'standard' },
  labour_total: { type: DataTypes.DOUBLE, allowNull: false, defaultValue: 0 },
  materials_total: { type: DataTypes.DOUBLE, allowNull: false, defaultValue: 0 },
  vat_breakdown: jsonDefault([]),
  cis_applies: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  cis_rate: { type: DataTypes.DOUBLE, allowNull: false, defaultValue: 20 },
  cis_deduction: { type: DataTypes.DOUBLE, allowNull: false, defaultValue: 0 },
  retention_percent: { type: DataTypes.DOUBLE, allowNull: false, defaultValue: 0 },
  retention_amount: { type: DataTypes.DOUBLE, allowNull: false, defaultValue: 0 },
  due_now: { type: DataTypes.DOUBLE, allowNull: false, defaultValue: 0 },
  payment_schedule: jsonDefault([]),
  exclusions: { type: DataTypes.TEXT },
  inclusions: { type: DataTypes.TEXT },
  warranty_years: { type: DataTypes.INTEGER },
  warranty_text: { type: DataTypes.TEXT },
  lead_time: { type: DataTypes.TEXT },
  duration_estimate: { type: DataTypes.TEXT },
  access_requirements: { type: DataTypes.TEXT },
  provisional_sums: jsonDefault([]),
  provisional_sums_in_total: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  optional_extras: jsonDefault([]),
  accepted_optional_extras: jsonDefault([]),
  revised_from_id: { type: DataTypes.INTEGER },
  cancellation_rights_apply: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  waiver_signed: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  site_id: { type: DataTypes.INTEGER },
  phone_id: { type: DataTypes.INTEGER },
  email_id: { type: DataTypes.INTEGER },
}, { tableName: 'quotes', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at' });

const Job = sequelize.define('Job', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  customer_id: { type: DataTypes.INTEGER, allowNull: false },
  lead_id: { type: DataTypes.INTEGER },
  quote_id: { type: DataTypes.INTEGER },
  title: { type: DataTypes.TEXT, allowNull: false },
  description: { type: DataTypes.TEXT },
  address: { type: DataTypes.TEXT },
  start_date: { type: DataTypes.DATEONLY },
  end_date: { type: DataTypes.DATEONLY },
  start_time: { type: DataTypes.STRING(8), defaultValue: '08:00' },
  end_time: { type: DataTypes.STRING(8), defaultValue: '16:30' },
  status: { type: DataTypes.TEXT, allowNull: false, defaultValue: 'PENDING' },
  priority: { type: DataTypes.TEXT, allowNull: false, defaultValue: 'normal' },
  required_skills: jsonDefault([]),
  needs_driver: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  materials: { type: DataTypes.TEXT },
  value: { type: DataTypes.DOUBLE },
  notes: { type: DataTypes.TEXT },
  checklist_template: { type: DataTypes.TEXT },
  completed_at: { type: DataTypes.DATE },
  lat: { type: DataTypes.DOUBLE },
  lng: { type: DataTypes.DOUBLE },
  site_id: { type: DataTypes.INTEGER },
  phone_id: { type: DataTypes.INTEGER },
  email_id: { type: DataTypes.INTEGER },
}, { tableName: 'jobs', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at' });

const JobAssignment = sequelize.define('JobAssignment', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  job_id: { type: DataTypes.INTEGER, allowNull: false },
  user_id: { type: DataTypes.INTEGER, allowNull: false },
}, { tableName: 'job_assignments', timestamps: false });

/** Per-day crew (requirement 8.1). Replaces job-wide job_assignments. */
const JobDayAssignment = sequelize.define('JobDayAssignment', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  job_id: { type: DataTypes.INTEGER, allowNull: false },
  work_date: { type: DataTypes.DATEONLY, allowNull: false },
  user_id: { type: DataTypes.INTEGER, allowNull: false },
}, { tableName: 'job_day_assignments', timestamps: false });

const JobMessage = sequelize.define('JobMessage', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  job_id: { type: DataTypes.INTEGER, allowNull: false },
  user_id: { type: DataTypes.INTEGER, allowNull: false },
  body: { type: DataTypes.TEXT, allowNull: false },
}, { tableName: 'job_messages', timestamps: true, createdAt: 'created_at', updatedAt: false });

const JobMaterialLine = sequelize.define('JobMaterialLine', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  job_id: { type: DataTypes.INTEGER, allowNull: false },
  description: { type: DataTypes.TEXT, allowNull: false },
  qty: { type: DataTypes.DOUBLE, allowNull: false, defaultValue: 1 },
  unit: { type: DataTypes.TEXT },
  status: { type: DataTypes.TEXT, allowNull: false, defaultValue: 'needed' },
  sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
}, { tableName: 'job_material_lines', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at' });

const JobChecklistItem = sequelize.define('JobChecklistItem', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  job_id: { type: DataTypes.INTEGER, allowNull: false },
  body: { type: DataTypes.TEXT, allowNull: false },
  done: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
}, { tableName: 'job_checklist_items', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at' });

/** Job photo or PDF (requirement 7.4). Images are tagged before/during/after; PDFs have no stage. */
const JobFile = sequelize.define('JobFile', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  job_id: { type: DataTypes.INTEGER, allowNull: false },
  stored_name: { type: DataTypes.TEXT, allowNull: false },
  original_name: { type: DataTypes.TEXT, allowNull: false },
  mime: { type: DataTypes.TEXT, allowNull: false },
  size_bytes: { type: DataTypes.INTEGER, allowNull: false },
  stage: { type: DataTypes.TEXT },
  user_id: { type: DataTypes.INTEGER },
}, { tableName: 'job_files', timestamps: true, createdAt: 'created_at', updatedAt: false });

/** Office-only variation line (requirement 7.5). Amount is money; never returned to staff. */
const JobVariation = sequelize.define('JobVariation', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  job_id: { type: DataTypes.INTEGER, allowNull: false },
  description: { type: DataTypes.TEXT, allowNull: false },
  amount: { type: DataTypes.DOUBLE, allowNull: false, defaultValue: 0 },
  sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
}, { tableName: 'job_variations', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at' });

/** In-app row (requirement 8.3 crew changes; 13.1 centre + other critical events). */
const Notification = sequelize.define('Notification', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  user_id: { type: DataTypes.INTEGER, allowNull: false },
  kind: { type: DataTypes.TEXT, allowNull: false },
  message: { type: DataTypes.TEXT, allowNull: false },
  job_id: { type: DataTypes.INTEGER },
  work_date: { type: DataTypes.DATEONLY },
  entity_type: { type: DataTypes.TEXT },
  entity_id: { type: DataTypes.INTEGER },
  read_at: { type: DataTypes.DATE },
}, { tableName: 'notifications', timestamps: true, createdAt: 'created_at', updatedAt: false });

const TeamMessage = sequelize.define('TeamMessage', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  user_id: { type: DataTypes.INTEGER, allowNull: false },
  body: { type: DataTypes.TEXT, allowNull: false },
}, { tableName: 'team_messages', timestamps: true, createdAt: 'created_at', updatedAt: false });

const HolidayRequest = sequelize.define('HolidayRequest', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  user_id: { type: DataTypes.INTEGER, allowNull: false },
  start_date: { type: DataTypes.DATEONLY, allowNull: false },
  end_date: { type: DataTypes.DATEONLY, allowNull: false },
  days: { type: DataTypes.DOUBLE, allowNull: false },
  reason: { type: DataTypes.TEXT },
  status: { type: DataTypes.TEXT, allowNull: false, defaultValue: 'pending' },
  decided_by: { type: DataTypes.INTEGER },
  decided_at: { type: DataTypes.DATE },
  decline_reason: { type: DataTypes.TEXT },
}, { tableName: 'holiday_requests', timestamps: true, createdAt: 'created_at', updatedAt: false });

const Invoice = sequelize.define('Invoice', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  customer_id: { type: DataTypes.INTEGER, allowNull: false },
  job_id: { type: DataTypes.INTEGER },
  ref: { type: DataTypes.TEXT, allowNull: false, unique: true },
  items: jsonDefault([]),
  subtotal: { type: DataTypes.DOUBLE, allowNull: false, defaultValue: 0 },
  vat_rate: { type: DataTypes.DOUBLE, allowNull: false, defaultValue: 20 },
  vat_amount: { type: DataTypes.DOUBLE, allowNull: false, defaultValue: 0 },
  total: { type: DataTypes.DOUBLE, allowNull: false, defaultValue: 0 },
  amount_paid: { type: DataTypes.DOUBLE, allowNull: false, defaultValue: 0 },
  issue_date: { type: DataTypes.DATEONLY },
  due_date: { type: DataTypes.DATEONLY },
  status: { type: DataTypes.TEXT, allowNull: false, defaultValue: 'draft' },
  qbo_id: { type: DataTypes.TEXT },
  qbo_synced_at: { type: DataTypes.DATE },
  sent_at: { type: DataTypes.DATE },
  paid_at: { type: DataTypes.DATE },
  pdf_file: { type: DataTypes.TEXT },
  notes: { type: DataTypes.TEXT },
  vat_treatment: { type: DataTypes.TEXT, allowNull: false, defaultValue: 'standard' },
  labour_total: { type: DataTypes.DOUBLE, allowNull: false, defaultValue: 0 },
  materials_total: { type: DataTypes.DOUBLE, allowNull: false, defaultValue: 0 },
  vat_breakdown: jsonDefault([]),
  cis_applies: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  cis_rate: { type: DataTypes.DOUBLE, allowNull: false, defaultValue: 20 },
  cis_deduction: { type: DataTypes.DOUBLE, allowNull: false, defaultValue: 0 },
  retention_percent: { type: DataTypes.DOUBLE, allowNull: false, defaultValue: 0 },
  retention_amount: { type: DataTypes.DOUBLE, allowNull: false, defaultValue: 0 },
  due_now: { type: DataTypes.DOUBLE, allowNull: false, defaultValue: 0 },
  provisional_sums: jsonDefault([]),
  provisional_sums_in_total: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
}, { tableName: 'invoices', timestamps: true, createdAt: 'created_at', updatedAt: false });

const InvoicePayment = sequelize.define('InvoicePayment', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  invoice_id: { type: DataTypes.INTEGER, allowNull: false },
  amount: { type: DataTypes.DOUBLE, allowNull: false },
  paid_at: { type: DataTypes.DATEONLY, allowNull: false },
  note: { type: DataTypes.TEXT },
  recorded_by: { type: DataTypes.INTEGER },
}, { tableName: 'invoice_payments', timestamps: true, createdAt: 'created_at', updatedAt: false });

const TaskAssignee = sequelize.define('TaskAssignee', {
  task_id: { type: DataTypes.INTEGER, primaryKey: true },
  user_id: { type: DataTypes.INTEGER, primaryKey: true },
}, { tableName: 'task_assignees', timestamps: false });

const Task = sequelize.define('Task', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  type: { type: DataTypes.TEXT, allowNull: false, defaultValue: 'manual' },
  rule_key: { type: DataTypes.TEXT },
  title: { type: DataTypes.TEXT, allowNull: false },
  detail: { type: DataTypes.TEXT },
  due_date: { type: DataTypes.DATEONLY },
  priority: { type: DataTypes.TEXT, allowNull: false, defaultValue: 'normal' },
  status: { type: DataTypes.TEXT, allowNull: false, defaultValue: 'open' },
  assignee_id: { type: DataTypes.INTEGER },
  entity_type: { type: DataTypes.TEXT },
  entity_id: { type: DataTypes.INTEGER },
  done_at: { type: DataTypes.DATE },
}, { tableName: 'tasks', timestamps: true, createdAt: 'created_at', updatedAt: false });

const Followup = sequelize.define('Followup', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  quote_id: { type: DataTypes.INTEGER, allowNull: false },
  customer_id: { type: DataTypes.INTEGER, allowNull: false },
  step: { type: DataTypes.INTEGER, allowNull: false },
  channel: { type: DataTypes.TEXT, allowNull: false },
  scheduled_at: { type: DataTypes.DATE, allowNull: false },
  status: { type: DataTypes.TEXT, allowNull: false, defaultValue: 'pending' },
  sent_at: { type: DataTypes.DATE },
  message: { type: DataTypes.TEXT },
  body_template: { type: DataTypes.TEXT },
  stop_reason: { type: DataTypes.TEXT },
}, { tableName: 'followups', timestamps: true, createdAt: 'created_at', updatedAt: false });

const Activity = sequelize.define('Activity', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  customer_id: { type: DataTypes.INTEGER },
  user_id: { type: DataTypes.INTEGER },
  kind: { type: DataTypes.TEXT, allowNull: false },
  detail: { type: DataTypes.TEXT },
  entity_type: { type: DataTypes.TEXT },
  entity_id: { type: DataTypes.INTEGER },
}, { tableName: 'activity', timestamps: true, createdAt: 'created_at', updatedAt: false });

const StageHistory = sequelize.define('StageHistory', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  customer_id: { type: DataTypes.INTEGER, allowNull: false },
  lead_id: { type: DataTypes.INTEGER },
  from_stage: { type: DataTypes.TEXT },
  to_stage: { type: DataTypes.TEXT, allowNull: false },
  user_id: { type: DataTypes.INTEGER },
}, { tableName: 'stage_history', timestamps: true, createdAt: 'created_at', updatedAt: false });

const Setting = sequelize.define('Setting', {
  key: { type: DataTypes.TEXT, primaryKey: true },
  value: { type: DataTypes.JSONB, allowNull: false },
}, { tableName: 'settings', timestamps: false });

/** Quote-builder service catalogue (requirement 17.2). Live list; quote lines keep a copy (6.1). */
const CatalogueItem = sequelize.define('CatalogueItem', {
  id: { type: DataTypes.TEXT, primaryKey: true },
  description: { type: DataTypes.TEXT, allowNull: false },
  unit: { type: DataTypes.TEXT, allowNull: false },
  unit_price: { type: DataTypes.DOUBLE, allowNull: false },
  vat_code: { type: DataTypes.TEXT, allowNull: false },
  kind: { type: DataTypes.TEXT, allowNull: false },
}, { tableName: 'catalogue_items', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at' });

const SecurityEvent = sequelize.define('SecurityEvent', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  actor_user_id: { type: DataTypes.INTEGER },
  target_user_id: { type: DataTypes.INTEGER },
  action: { type: DataTypes.TEXT, allowNull: false },
  detail: { type: DataTypes.TEXT },
}, { tableName: 'security_events', timestamps: true, createdAt: 'created_at', updatedAt: false });

SecurityEvent.belongsTo(User, { as: 'actor', foreignKey: 'actor_user_id' });
SecurityEvent.belongsTo(User, { as: 'target', foreignKey: 'target_user_id' });

const IntegrationEvent = sequelize.define('IntegrationEvent', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  provider: { type: DataTypes.TEXT, allowNull: false },
  direction: { type: DataTypes.TEXT, allowNull: false },
  event: { type: DataTypes.TEXT, allowNull: false },
  payload: { type: DataTypes.JSONB },
  status: { type: DataTypes.TEXT, allowNull: false, defaultValue: 'ok' },
}, { tableName: 'integration_events', timestamps: true, createdAt: 'created_at', updatedAt: false });

const AiProposal = sequelize.define('AiProposal', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  for_date: { type: DataTypes.DATEONLY, allowNull: false },
  transcript: { type: DataTypes.TEXT },
  provider: { type: DataTypes.TEXT, allowNull: false },
  proposal: { type: DataTypes.JSONB, allowNull: false },
  warnings: jsonDefault([]),
  status: { type: DataTypes.TEXT, allowNull: false, defaultValue: 'proposed' },
  created_by: { type: DataTypes.INTEGER },
  approved_at: { type: DataTypes.DATE },
}, { tableName: 'ai_proposals', timestamps: true, createdAt: 'created_at', updatedAt: false });

const OauthToken = sequelize.define('OauthToken', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  provider: { type: DataTypes.TEXT, allowNull: false },
  user_id: { type: DataTypes.INTEGER },
  access_token: { type: DataTypes.TEXT },
  refresh_token: { type: DataTypes.TEXT },
  expires_at: { type: DataTypes.DATE },
  meta: jsonDefault({}),
}, { tableName: 'oauth_tokens', timestamps: true, createdAt: false, updatedAt: 'updated_at' });

const Timesheet = sequelize.define('Timesheet', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  user_id: { type: DataTypes.INTEGER, allowNull: false },
  job_id: { type: DataTypes.INTEGER },
  work_date: { type: DataTypes.DATEONLY, allowNull: false },
  clock_in: { type: DataTypes.DATE, allowNull: false },
  clock_out: { type: DataTypes.DATE },
  break_started_at: { type: DataTypes.DATE },
  break_minutes: { type: DataTypes.DOUBLE, allowNull: false, defaultValue: 0 },
  in_lat: { type: DataTypes.DOUBLE },
  in_lng: { type: DataTypes.DOUBLE },
  in_accuracy: { type: DataTypes.DOUBLE },
  out_lat: { type: DataTypes.DOUBLE },
  out_lng: { type: DataTypes.DOUBLE },
  out_accuracy: { type: DataTypes.DOUBLE },
  in_distance_m: { type: DataTypes.DOUBLE },
  out_distance_m: { type: DataTypes.DOUBLE },
  location_flag: { type: DataTypes.TEXT },
  photo_file: { type: DataTypes.TEXT },
  notes: { type: DataTypes.TEXT },
  worked_minutes: { type: DataTypes.DOUBLE },
  cost_rate: { type: DataTypes.DOUBLE },
  labour_cost: { type: DataTypes.DOUBLE },
  status: { type: DataTypes.TEXT, allowNull: false, defaultValue: 'active' },
  approved_by: { type: DataTypes.INTEGER },
  approved_at: { type: DataTypes.DATE },
  edit_reason: { type: DataTypes.TEXT },
}, { tableName: 'timesheets', timestamps: true, createdAt: 'created_at', updatedAt: false });

// ---------- associations ----------
Customer.belongsTo(User, { foreignKey: 'owner_id', as: 'owner' });
User.hasMany(Customer, { foreignKey: 'owner_id' });

Customer.hasMany(CustomerSite, { foreignKey: 'customer_id', as: 'sites' });
Customer.hasMany(CustomerPhone, { foreignKey: 'customer_id', as: 'phones' });
Customer.hasMany(CustomerEmail, { foreignKey: 'customer_id', as: 'emails' });
CustomerSite.belongsTo(Customer, { foreignKey: 'customer_id' });
CustomerPhone.belongsTo(Customer, { foreignKey: 'customer_id' });
CustomerEmail.belongsTo(Customer, { foreignKey: 'customer_id' });

Lead.belongsTo(Customer, { foreignKey: 'customer_id' });
Customer.hasMany(Lead, { foreignKey: 'customer_id' });
Lead.hasMany(StageHistory, { foreignKey: 'lead_id' });
StageHistory.belongsTo(Lead, { foreignKey: 'lead_id' });
Quote.belongsTo(Lead, { foreignKey: 'lead_id' });
Lead.hasMany(Quote, { foreignKey: 'lead_id' });
Appointment.belongsTo(Lead, { foreignKey: 'lead_id' });
Lead.hasMany(Appointment, { foreignKey: 'lead_id' });
Job.belongsTo(Lead, { foreignKey: 'lead_id' });
Lead.hasMany(Job, { foreignKey: 'lead_id' });

CustomerNote.belongsTo(Customer, { foreignKey: 'customer_id' });
CustomerNote.belongsTo(User, { foreignKey: 'user_id' });
Customer.hasMany(CustomerNote, { foreignKey: 'customer_id' });

CustomerFile.belongsTo(Customer, { foreignKey: 'customer_id' });
CustomerFile.belongsTo(User, { foreignKey: 'user_id' });
Customer.hasMany(CustomerFile, { foreignKey: 'customer_id' });

Message.belongsTo(Customer, { foreignKey: 'customer_id' });
Message.belongsTo(User, { foreignKey: 'user_id' });
Customer.hasMany(Message, { foreignKey: 'customer_id' });

Appointment.belongsTo(Customer, { foreignKey: 'customer_id' });
Appointment.belongsTo(User, { foreignKey: 'created_by', as: 'creator' });
Appointment.belongsTo(CustomerSite, { foreignKey: 'site_id', as: 'site' });
Appointment.belongsTo(CustomerPhone, { foreignKey: 'phone_id', as: 'selectedPhone' });
Appointment.belongsTo(CustomerEmail, { foreignKey: 'email_id', as: 'selectedEmail' });
Appointment.belongsToMany(User, { through: AppointmentAssignee, foreignKey: 'appointment_id', otherKey: 'user_id', as: 'assignees' });
User.belongsToMany(Appointment, { through: AppointmentAssignee, foreignKey: 'user_id', otherKey: 'appointment_id', as: 'assignedAppointments' });
AppointmentAssignee.belongsTo(Appointment, { foreignKey: 'appointment_id' });
AppointmentAssignee.belongsTo(User, { foreignKey: 'user_id' });
Customer.hasMany(Appointment, { foreignKey: 'customer_id' });

Quote.belongsTo(Customer, { foreignKey: 'customer_id' });
Quote.belongsTo(User, { foreignKey: 'created_by', as: 'creator' });
Quote.belongsTo(CustomerSite, { foreignKey: 'site_id', as: 'site' });
Quote.belongsTo(CustomerPhone, { foreignKey: 'phone_id', as: 'selectedPhone' });
Quote.belongsTo(CustomerEmail, { foreignKey: 'email_id', as: 'selectedEmail' });
Customer.hasMany(Quote, { foreignKey: 'customer_id' });

Job.belongsTo(Customer, { foreignKey: 'customer_id' });
Job.belongsTo(Quote, { foreignKey: 'quote_id' });
Job.belongsTo(CustomerSite, { foreignKey: 'site_id', as: 'site' });
Job.belongsTo(CustomerPhone, { foreignKey: 'phone_id', as: 'selectedPhone' });
Job.belongsTo(CustomerEmail, { foreignKey: 'email_id', as: 'selectedEmail' });
Customer.hasMany(Job, { foreignKey: 'customer_id' });
Job.belongsToMany(User, { through: JobAssignment, foreignKey: 'job_id', otherKey: 'user_id', as: 'crew' });
User.belongsToMany(Job, { through: JobAssignment, foreignKey: 'user_id', otherKey: 'job_id', as: 'assignedJobs' });
JobAssignment.belongsTo(Job, { foreignKey: 'job_id' });
JobAssignment.belongsTo(User, { foreignKey: 'user_id' });
Job.hasMany(JobDayAssignment, { foreignKey: 'job_id', as: 'dayAssignments' });
JobDayAssignment.belongsTo(Job, { foreignKey: 'job_id' });
JobDayAssignment.belongsTo(User, { foreignKey: 'user_id' });
User.hasMany(JobDayAssignment, { foreignKey: 'user_id' });

JobMessage.belongsTo(Job, { foreignKey: 'job_id' });
JobMessage.belongsTo(User, { foreignKey: 'user_id' });
Job.hasMany(JobMessage, { foreignKey: 'job_id' });

Job.hasMany(JobMaterialLine, { foreignKey: 'job_id' });
JobMaterialLine.belongsTo(Job, { foreignKey: 'job_id' });
Job.hasMany(JobChecklistItem, { foreignKey: 'job_id' });
JobChecklistItem.belongsTo(Job, { foreignKey: 'job_id' });
Job.hasMany(JobFile, { foreignKey: 'job_id' });
JobFile.belongsTo(Job, { foreignKey: 'job_id' });
JobFile.belongsTo(User, { foreignKey: 'user_id' });
Job.hasMany(JobVariation, { foreignKey: 'job_id' });
JobVariation.belongsTo(Job, { foreignKey: 'job_id' });

TeamMessage.belongsTo(User, { foreignKey: 'user_id' });

HolidayRequest.belongsTo(User, { foreignKey: 'user_id' });
HolidayRequest.belongsTo(User, { foreignKey: 'decided_by', as: 'decider' });
User.hasMany(HolidayRequest, { foreignKey: 'user_id' });

Invoice.belongsTo(Customer, { foreignKey: 'customer_id' });
Invoice.belongsTo(Job, { foreignKey: 'job_id' });
Customer.hasMany(Invoice, { foreignKey: 'customer_id' });
Invoice.hasMany(InvoicePayment, { foreignKey: 'invoice_id', as: 'payments' });
InvoicePayment.belongsTo(Invoice, { foreignKey: 'invoice_id' });
InvoicePayment.belongsTo(User, { foreignKey: 'recorded_by', as: 'recorder' });

Task.belongsTo(User, { foreignKey: 'assignee_id', as: 'assignee' });
Task.belongsToMany(User, { through: TaskAssignee, foreignKey: 'task_id', otherKey: 'user_id', as: 'assignees' });
User.belongsToMany(Task, { through: TaskAssignee, foreignKey: 'user_id', otherKey: 'task_id', as: 'assignedTasks' });
TaskAssignee.belongsTo(Task, { foreignKey: 'task_id' });
TaskAssignee.belongsTo(User, { foreignKey: 'user_id' });

Followup.belongsTo(Quote, { foreignKey: 'quote_id' });
Followup.belongsTo(Customer, { foreignKey: 'customer_id' });
Quote.hasMany(Followup, { foreignKey: 'quote_id' });

Activity.belongsTo(Customer, { foreignKey: 'customer_id' });
Activity.belongsTo(User, { foreignKey: 'user_id' });
Customer.hasMany(Activity, { foreignKey: 'customer_id' });

StageHistory.belongsTo(Customer, { foreignKey: 'customer_id' });
StageHistory.belongsTo(User, { foreignKey: 'user_id' });
Customer.hasMany(StageHistory, { foreignKey: 'customer_id' });

AiProposal.belongsTo(User, { foreignKey: 'created_by', as: 'creator' });

Notification.belongsTo(User, { foreignKey: 'user_id' });
Notification.belongsTo(Job, { foreignKey: 'job_id' });
User.hasMany(Notification, { foreignKey: 'user_id' });
Job.hasMany(Notification, { foreignKey: 'job_id' });

Timesheet.belongsTo(User, { foreignKey: 'user_id' });
Timesheet.belongsTo(Job, { foreignKey: 'job_id' });
Timesheet.belongsTo(User, { foreignKey: 'approved_by', as: 'approver' });
User.hasMany(Timesheet, { foreignKey: 'user_id' });
Job.hasMany(Timesheet, { foreignKey: 'job_id' });

/**
 * Persist an integration log row (WhatsApp, email, QBO, etc.).
 * @param {string} provider
 * @param {string} direction
 * @param {string} event
 * @param {object|null} payload
 * @param {string} [status]
 */
async function logIntegrationEvent(provider, direction, event, payload = null, status = 'ok') {
  await IntegrationEvent.create({ provider, direction, event, payload, status });
}

module.exports = {
  sequelize,
  User,
  Customer,
  CustomerSite,
  CustomerPhone,
  CustomerEmail,
  CustomerNote,
  CustomerFile,
  Lead,
  Message,
  Appointment,
  AppointmentAssignee,
  Quote,
  Job,
  JobAssignment,
  JobDayAssignment,
  JobMessage,
  JobMaterialLine,
  JobChecklistItem,
  JobFile,
  JobVariation,
  Notification,
  TeamMessage,
  HolidayRequest,
  Invoice,
  InvoicePayment,
  Task,
  TaskAssignee,
  Followup,
  Activity,
  StageHistory,
  Setting,
  CatalogueItem,
  IntegrationEvent,
  SecurityEvent,
  AiProposal,
  OauthToken,
  Timesheet,
  logIntegrationEvent,
};
