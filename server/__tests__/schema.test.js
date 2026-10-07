const Sequelize = require('sequelize');
const migration = require('../migrations/20260921120000-initial-schema');

describe('initial PostgreSQL migration', () => {
  const tables = {};
  const indexes = [];
  const rawSql = [];

  beforeAll(async () => {
    const queryInterface = {
      createTable: async (name, cols) => { tables[name] = cols; },
      addIndex: async (table, cols, opts) => { indexes.push({ table, cols, opts }); },
      addConstraint: async () => {},
      sequelize: {
        query: async (sql) => { rawSql.push(sql); },
      },
    };
    await migration.up(queryInterface, Sequelize);
  });

  test('replaces SQLite INTEGER flags with BOOLEAN', () => {
    expect(tables.users.is_driver.type).toBe(Sequelize.BOOLEAN);
    expect(tables.users.active.type).toBe(Sequelize.BOOLEAN);
    expect(tables.appointments.stage_advanced.type).toBe(Sequelize.BOOLEAN);
    expect(tables.quotes.cis_applies.type).toBe(Sequelize.BOOLEAN);
    expect(tables.quotes.cancellation_rights_apply.type).toBe(Sequelize.BOOLEAN);
    expect(tables.quotes.waiver_signed.type).toBe(Sequelize.BOOLEAN);
    expect(tables.invoices.cis_applies.type).toBe(Sequelize.BOOLEAN);
  });

  test('uses DATE (TIMESTAMPTZ on Postgres) and DATEONLY instead of TEXT dates', () => {
    expect(tables.quotes.created_at.type).toBe(Sequelize.DATE);
    expect(tables.quotes.sent_at.type).toBe(Sequelize.DATE);
    expect(tables.quotes.valid_until.type).toBe(Sequelize.DATEONLY);
    expect(tables.appointments.start.type).toBe(Sequelize.DATE);
    expect(tables.timesheets.clock_in.type).toBe(Sequelize.DATE);
    expect(tables.timesheets.work_date.type).toBe(Sequelize.DATEONLY);
    expect(tables.jobs.start_date.type).toBe(Sequelize.DATEONLY);
  });

  test('stores structured columns as JSONB instead of TEXT JSON', () => {
    expect(tables.users.skills.type).toBe(Sequelize.JSONB);
    expect(tables.quotes.items.type).toBe(Sequelize.JSONB);
    expect(tables.quotes.vat_breakdown.type).toBe(Sequelize.JSONB);
    expect(tables.quotes.payment_schedule.type).toBe(Sequelize.JSONB);
    expect(tables.settings.value.type).toBe(Sequelize.JSONB);
    expect(tables.jobs.required_skills.type).toBe(Sequelize.JSONB);
  });

  test('creates partial unique indexes previously expressed in SQLite', () => {
    expect(rawSql.some((s) => /idx_tasks_rule/.test(s))).toBe(true);
    expect(rawSql.some((s) => /idx_timesheets_one_active/.test(s))).toBe(true);
  });

  test('constrains users.role to ADMIN, OFFICE, STAFF (requirement 1.4)', () => {
    expect(rawSql.some((s) => /users_role_check/.test(s) && /ADMIN/.test(s) && /OFFICE/.test(s) && /STAFF/.test(s))).toBe(true);
    expect(rawSql.some((s) => /users_role_check/.test(s) && /DIRECTOR/.test(s))).toBe(false);
  });
});

describe('user password-reset migration (requirement 1.7)', () => {
  test('adds hashed token columns', async () => {
    const added = {};
    const queryInterface = {
      addColumn: async (table, name, col) => { added[name] = { table, col }; },
    };
    const migration = require('../migrations/20260921220000-user-password-reset');
    await migration.up(queryInterface, Sequelize);
    expect(added.password_reset_token.table).toBe('users');
    expect(added.password_reset_expires.table).toBe('users');
    expect(added.password_reset_token.col.type).toBe(Sequelize.TEXT);
    expect(added.password_reset_expires.col.type).toBe(Sequelize.DATE);
  });
});

describe('security audit migration (requirement 1.9)', () => {
  test('adds token_version and creates security_events', async () => {
    const added = {};
    const tables = {};
    const indexes = [];
    const queryInterface = {
      addColumn: async (table, name, col) => { added[name] = { table, col }; },
      createTable: async (name, cols) => { tables[name] = cols; },
      addIndex: async (table, cols) => { indexes.push({ table, cols }); },
    };
    const migration = require('../migrations/20260921230000-security-audit');
    await migration.up(queryInterface, Sequelize);
    expect(added.token_version.table).toBe('users');
    expect(added.token_version.col.type).toBe(Sequelize.INTEGER);
    expect(added.token_version.col.allowNull).toBe(false);
    expect(added.token_version.col.defaultValue).toBe(0);
    expect(tables.security_events.actor_user_id.type).toBe(Sequelize.INTEGER);
    expect(tables.security_events.target_user_id.type).toBe(Sequelize.INTEGER);
    expect(tables.security_events.action.allowNull).toBe(false);
    expect(tables.security_events.detail.type).toBe(Sequelize.TEXT);
    expect(indexes.some((i) => i.table === 'security_events')).toBe(true);
  });
});

describe('customer type check migration (requirement 2.1)', () => {
  test('adds a domestic/commercial check constraint', async () => {
    const rawSql = [];
    const queryInterface = {
      sequelize: { query: async (sql) => { rawSql.push(sql); } },
    };
    const migration = require('../migrations/20260922010000-customer-type-check');
    await migration.up(queryInterface);
    expect(rawSql.some((s) => /customers_type_check/.test(s) && /domestic/.test(s) && /commercial/.test(s))).toBe(true);
  });
});

describe('customer contacts migration (requirement 2.2)', () => {
  test('creates contact tables, primary indexes, and FKs on quotes/jobs/appointments', async () => {
    const tables = {};
    const indexes = [];
    const rawSql = [];
    const added = [];
    const removed = [];
    const queryInterface = {
      createTable: async (name, cols) => { tables[name] = cols; },
      addIndex: async (table, cols, opts) => { indexes.push({ table, cols, opts }); },
      addColumn: async (table, name) => { added.push({ table, name }); },
      removeIndex: async () => {},
      removeColumn: async (table, name) => { removed.push({ table, name }); },
      sequelize: { query: async (sql) => { rawSql.push(sql); } },
    };
    const migration = require('../migrations/20260922170000-customer-contacts');
    await migration.up(queryInterface, Sequelize);
    expect(tables.customer_sites.address.allowNull).toBe(false);
    expect(tables.customer_phones.value.allowNull).toBe(false);
    expect(tables.customer_emails.value.allowNull).toBe(false);
    expect(rawSql.some((s) => /customer_phones_type_check/.test(s) && /mobile/.test(s) && /landline/.test(s))).toBe(true);
    expect(rawSql.some((s) => /customer_emails_type_check/.test(s) && /personal/.test(s) && /work/.test(s))).toBe(true);
    expect(rawSql.some((s) => /customer_sites_one_primary/.test(s))).toBe(true);
    expect(added.filter((c) => c.name === 'site_id').map((c) => c.table).sort()).toEqual(['appointments', 'jobs', 'quotes']);
    expect(removed.some((c) => c.table === 'customers' && c.name === 'phone')).toBe(true);
    expect(removed.some((c) => c.table === 'customers' && c.name === 'address')).toBe(true);
  });
});

describe('lead contacts migration', () => {
  test('adds one site/phone/email on leads and backfills from meta then primary', async () => {
    const added = [];
    const constraints = [];
    const rawSql = [];
    const queryInterface = {
      describeTable: async () => ({}),
      addColumn: async (table, name) => { added.push({ table, name }); },
      addConstraint: async (table, opts) => { constraints.push({ table, ...opts }); },
      sequelize: { query: async (sql) => { rawSql.push(sql); } },
    };
    const migration = require('../migrations/20261006200000-lead-contacts');
    await migration.up(queryInterface, Sequelize);
    expect(added.map((c) => c.name).sort()).toEqual(['email_id', 'phone_id', 'site_id']);
    expect(added.every((c) => c.table === 'leads')).toBe(true);
    expect(rawSql.some((s) => /meta->>'site_id'/.test(s))).toBe(true);
    expect(rawSql.some((s) => /customer_sites/.test(s) && /is_primary/.test(s))).toBe(true);
    expect(constraints.map((c) => c.fields[0]).sort()).toEqual(['email_id', 'phone_id', 'site_id']);
  });
});

describe('customer notes and files migration (requirement 2.4)', () => {
  test('creates customer_notes and customer_files with mime check', async () => {
    const tables = {};
    const indexes = [];
    const rawSql = [];
    const queryInterface = {
      createTable: async (name, cols) => { tables[name] = cols; },
      addIndex: async (table, cols, opts) => { indexes.push({ table, cols, opts }); },
      sequelize: { query: async (sql) => { rawSql.push(sql); } },
    };
    const migration = require('../migrations/20260922190000-customer-notes-files');
    await migration.up(queryInterface, Sequelize);
    expect(tables.customer_notes.body.allowNull).toBe(false);
    expect(tables.customer_notes.customer_id.references.model).toBe('customers');
    expect(tables.customer_files.stored_name.allowNull).toBe(false);
    expect(tables.customer_files.original_name.allowNull).toBe(false);
    expect(tables.customer_files.mime.allowNull).toBe(false);
    expect(tables.customer_files.size_bytes.allowNull).toBe(false);
    expect(indexes.some((i) => i.table === 'customer_notes')).toBe(true);
    expect(indexes.some((i) => i.table === 'customer_files')).toBe(true);
    expect(rawSql.some((s) => /customer_files_mime_check/.test(s) && /image\/jpeg/.test(s) && /application\/pdf/.test(s))).toBe(true);
  });
});

describe('phone normalised migration (requirement 2.5)', () => {
  test('adds the digits-only column, indexes it, and backfills existing numbers', async () => {
    const added = {};
    const indexes = [];
    const queries = [];
    const queryInterface = {
      addColumn: async (table, name, col) => { added[name] = { table, col }; },
      addIndex: async (table, cols, opts) => { indexes.push({ table, cols, opts }); },
      sequelize: {
        query: async (sql) => {
          queries.push(sql);
          if (/SELECT id, value FROM customer_phones/.test(sql)) {
            return [[{ id: 1, value: '+44 7700 900100' }]];
          }
          return [[]];
        },
      },
    };
    const migration = require('../migrations/20260922220000-phone-normalised');
    await migration.up(queryInterface, Sequelize);
    expect(added.normalised.table).toBe('customer_phones');
    expect(added.normalised.col.type).toBe(Sequelize.TEXT);
    expect(indexes.some((i) => i.table === 'customer_phones' && i.opts?.name === 'idx_customer_phones_normalised')).toBe(true);
    expect(queries.some((s) => /UPDATE customer_phones SET normalised/.test(s))).toBe(true);
  });
});

describe('appointments customer_id index (requirement 5.1)', () => {
  test('indexes appointments.customer_id', async () => {
    const added = [];
    const queryInterface = {
      showIndex: async () => [],
      addIndex: async (table, cols, opts) => { added.push({ table, cols, opts }); },
    };
    const migration = require('../migrations/20260923220000-appointments-customer-index');
    await migration.up(queryInterface);
    expect(added).toEqual([{
      table: 'appointments',
      cols: ['customer_id'],
      opts: { name: 'idx_appointments_customer_id' },
    }]);
  });
});

describe('oauth tokens per-user Google (requirement 5.2)', () => {
  test('adds user_id and unique indexes for company vs user tokens', async () => {
    const queries = [];
    const queryInterface = {
      sequelize: { query: async (sql) => { queries.push(sql); } },
    };
    const migration = require('../migrations/20260923230000-oauth-tokens-user');
    await migration.up(queryInterface);
    const blob = queries.join('\n');
    expect(blob).toMatch(/user_id INTEGER/);
    expect(blob).toMatch(/idx_oauth_tokens_provider_company/);
    expect(blob).toMatch(/idx_oauth_tokens_provider_user/);
    expect(blob).toMatch(/provider = 'google'/);
  });
});

describe('appointment visit_type (requirement 5.3)', () => {
  test('adds visit_type with a check constraint', async () => {
    const added = [];
    const queries = [];
    const tables = { appointments: {} };
    const queryInterface = {
      describeTable: async () => tables.appointments,
      addColumn: async (table, name, col) => { added.push({ table, name, col }); tables.appointments[name] = col; },
      sequelize: { query: async (sql) => { queries.push(sql); } },
    };
    const Sequelize = { TEXT: 'TEXT' };
    const migration = require('../migrations/20260923240000-appointment-visit-type');
    await migration.up(queryInterface, Sequelize);
    expect(added).toEqual([{
      table: 'appointments',
      name: 'visit_type',
      col: { type: 'TEXT', allowNull: false, defaultValue: 'site_visit' },
    }]);
    expect(queries.join('\n')).toMatch(/appointments_visit_type_check/);
    expect(queries.join('\n')).toMatch(/site_visit/);
    added.length = 0;
    await migration.up(queryInterface, Sequelize);
    expect(added).toEqual([]);
  });
});

describe('provisional sums in total (requirement 6.4)', () => {
  test('adds the toggle on quotes and copies P.S. onto invoices', async () => {
    const added = [];
    const tables = { quotes: {}, invoices: {} };
    const queryInterface = {
      describeTable: async (name) => tables[name],
      addColumn: async (table, colName, col) => {
        added.push({ table, name: colName, col });
        tables[table][colName] = col;
      },
    };
    const Sequelize = { BOOLEAN: 'BOOLEAN', JSONB: 'JSONB' };
    const migration = require('../migrations/20260924180000-provisional-sums-in-total');
    await migration.up(queryInterface, Sequelize);
    expect(added).toEqual([
      {
        table: 'quotes',
        name: 'provisional_sums_in_total',
        col: { type: 'BOOLEAN', allowNull: false, defaultValue: false },
      },
      {
        table: 'invoices',
        name: 'provisional_sums',
        col: { type: 'JSONB', allowNull: false, defaultValue: [] },
      },
      {
        table: 'invoices',
        name: 'provisional_sums_in_total',
        col: { type: 'BOOLEAN', allowNull: false, defaultValue: false },
      },
    ]);
    added.length = 0;
    await migration.up(queryInterface, Sequelize);
    expect(added).toEqual([]);
  });
});

describe('quote revisions and optional extras (requirement 6.5)', () => {
  test('adds extras JSON and revised_from_id on quotes', async () => {
    const added = [];
    const tables = { quotes: {} };
    const queryInterface = {
      describeTable: async (name) => tables[name],
      addColumn: async (table, colName, col) => {
        added.push({ table, name: colName, col });
        tables[table][colName] = col;
      },
    };
    const Sequelize = { JSONB: 'JSONB', INTEGER: 'INTEGER' };
    const migration = require('../migrations/20260924190000-quote-revisions-optional-extras');
    await migration.up(queryInterface, Sequelize);
    expect(added.map((a) => a.name)).toEqual([
      'optional_extras',
      'accepted_optional_extras',
      'revised_from_id',
    ]);
    expect(added[2].col.references).toEqual({ model: 'quotes', key: 'id' });
    added.length = 0;
    await migration.up(queryInterface, Sequelize);
    expect(added).toEqual([]);
  });
});

describe('job materials and checklists migration (requirement 7.3)', () => {
  test('creates material and checklist tables with status check', async () => {
    const tables = { jobs: {} };
    const indexes = [];
    const rawSql = [];
    const added = [];
    const queryInterface = {
      showAllTables: async () => Object.keys(tables).filter((n) => n !== 'jobs'),
      createTable: async (name, cols) => { tables[name] = cols; },
      addIndex: async (table, cols, opts) => { indexes.push({ table, cols, opts }); },
      describeTable: async (name) => tables[name] || {},
      addColumn: async (table, name, col) => {
        added.push({ table, name, col });
        tables[table] = { ...(tables[table] || {}), [name]: col };
      },
      sequelize: { query: async (sql) => { rawSql.push(sql); } },
    };
    const migration = require('../migrations/20260924200000-job-materials-checklists');
    await migration.up(queryInterface, Sequelize);
    expect(tables.job_material_lines.description.allowNull).toBe(false);
    expect(tables.job_material_lines.status.defaultValue).toBe('needed');
    expect(tables.job_checklist_items.done.type).toBe(Sequelize.BOOLEAN);
    expect(indexes.some((i) => i.table === 'job_material_lines')).toBe(true);
    expect(indexes.some((i) => i.table === 'job_checklist_items')).toBe(true);
    expect(rawSql.some((s) => /job_material_lines_status_check/.test(s) && /packed/.test(s) && /used/.test(s))).toBe(true);
    expect(added.some((c) => c.table === 'jobs' && c.name === 'checklist_template')).toBe(true);
  });
});

describe('job files migration (requirement 7.4)', () => {
  test('creates job_files with before/during/after photo check', async () => {
    const tables = {};
    const indexes = [];
    const rawSql = [];
    const queryInterface = {
      showAllTables: async () => Object.keys(tables),
      createTable: async (name, cols) => { tables[name] = cols; },
      addIndex: async (table, cols, opts) => { indexes.push({ table, cols, opts }); },
      sequelize: { query: async (sql) => { rawSql.push(sql); } },
    };
    const migration = require('../migrations/20260924210000-job-files');
    await migration.up(queryInterface, Sequelize);
    expect(tables.job_files.job_id.allowNull).toBe(false);
    expect(tables.job_files.stage.allowNull).toBe(true);
    expect(indexes.some((i) => i.table === 'job_files')).toBe(true);
    expect(rawSql.some((s) => /job_files_kind_check/.test(s) && /before/.test(s) && /application\/pdf/.test(s))).toBe(true);
  });
});

describe('job variations migration (requirement 7.5)', () => {
  test('creates job_variations with amount', async () => {
    const tables = {};
    const indexes = [];
    const queryInterface = {
      showAllTables: async () => Object.keys(tables),
      createTable: async (name, cols) => { tables[name] = cols; },
      addIndex: async (table, cols, opts) => { indexes.push({ table, cols, opts }); },
    };
    const migration = require('../migrations/20260924220000-job-variations');
    await migration.up(queryInterface, Sequelize);
    expect(tables.job_variations.description.allowNull).toBe(false);
    expect(tables.job_variations.amount.allowNull).toBe(false);
    expect(indexes.some((i) => i.table === 'job_variations')).toBe(true);
  });
});

describe('job day assignments migration (requirement 8.1)', () => {
  test('creates job_day_assignments with a unique job/date/user constraint', async () => {
    const tables = {};
    const indexes = [];
    const constraints = [];
    const queryInterface = {
      showAllTables: async () => Object.keys(tables),
      createTable: async (name, cols) => { tables[name] = cols; },
      addIndex: async (table, cols, opts) => { indexes.push({ table, cols, opts }); },
      addConstraint: async (table, opts) => { constraints.push({ table, opts }); },
      sequelize: { query: jest.fn() },
    };
    const migration = require('../migrations/20260924230000-job-day-assignments');
    await migration.up(queryInterface, Sequelize);
    expect(tables.job_day_assignments.work_date.allowNull).toBe(false);
    expect(constraints.some((c) => c.opts.name === 'job_day_assignments_job_date_user_unique')).toBe(true);
    expect(indexes.some((i) => i.table === 'job_day_assignments')).toBe(true);
  });
});

describe('job driver flag and notifications migration (requirement 8.3)', () => {
  test('adds needs_driver and creates notifications with a kind check', async () => {
    const tables = { jobs: {} };
    const indexes = [];
    const rawSql = [];
    const queryInterface = {
      showAllTables: async () => ['jobs'],
      describeTable: async (name) => tables[name] || {},
      addColumn: async (table, col, def) => { tables[table][col] = def; },
      createTable: async (name, cols) => { tables[name] = cols; },
      addIndex: async (table, cols, opts) => { indexes.push({ table, cols, opts }); },
      sequelize: { query: async (sql) => { rawSql.push(sql); } },
    };
    const migration = require('../migrations/20260925010000-job-driver-notifications');
    await migration.up(queryInterface, Sequelize);
    expect(tables.jobs.needs_driver.allowNull).toBe(false);
    expect(tables.notifications.user_id.allowNull).toBe(false);
    expect(tables.notifications.message.allowNull).toBe(false);
    expect(rawSql.some((s) => /notifications_kind_check/.test(s) && /crew_added/.test(s))).toBe(true);
    expect(indexes.some((i) => i.name === 'idx_notifications_user_created' || i.opts?.name === 'idx_notifications_user_created')).toBe(true);
  });
});

describe('invoice one-per-job unique index (requirement 11.1)', () => {
  test('adds a unique index on invoices.job_id', async () => {
    const indexes = [];
    const queryInterface = {
      addIndex: async (table, cols, opts) => { indexes.push({ table, cols, opts }); },
      removeIndex: async () => {},
    };
    const migration = require('../migrations/20260925190000-invoice-one-per-job');
    await migration.up(queryInterface, Sequelize);
    expect(indexes).toEqual([
      { table: 'invoices', cols: ['job_id'], opts: { unique: true, name: 'idx_invoices_job_unique' } },
    ]);
  });
});

describe('invoice payments ledger migration (requirement 11.4)', () => {
  test('creates invoice_payments with invoice and recorded_by indexes', async () => {
    const tables = {};
    const indexes = [];
    const rawSql = [];
    const queryInterface = {
      showAllTables: async () => ['invoices', 'users'],
      createTable: async (name, cols) => { tables[name] = cols; },
      addIndex: async (table, cols, opts) => { indexes.push({ table, cols, opts }); },
      sequelize: { query: async (sql) => { rawSql.push(sql); } },
    };
    const migration = require('../migrations/20260926010000-invoice-payments');
    await migration.up(queryInterface, Sequelize);
    expect(tables.invoice_payments.invoice_id.allowNull).toBe(false);
    expect(tables.invoice_payments.amount.allowNull).toBe(false);
    expect(tables.invoice_payments.paid_at.allowNull).toBe(false);
    expect(indexes.some((i) => i.opts?.name === 'idx_invoice_payments_invoice')).toBe(true);
    expect(rawSql.some((s) => /INSERT INTO invoice_payments/.test(s))).toBe(true);
  });
});

describe('follow-up body template migration (requirement 12.1)', () => {
  test('adds body_template on followups', async () => {
    const cols = {};
    const queryInterface = {
      describeTable: async () => cols,
      addColumn: async (table, name, def) => { cols[name] = { table, ...def }; },
      removeColumn: async (table, name) => { delete cols[name]; },
    };
    const migration = require('../migrations/20260926020000-followup-body-template');
    await migration.up(queryInterface, Sequelize);
    expect(cols.body_template.table).toBe('followups');
    expect(cols.body_template.type).toBe(Sequelize.TEXT);
  });
});

describe('notification centre migration (requirement 13.1)', () => {
  test('adds entity columns and widens the kind check', async () => {
    const cols = {};
    const rawSql = [];
    const queryInterface = {
      describeTable: async () => cols,
      addColumn: async (table, name, def) => { cols[name] = def; },
      sequelize: { query: async (sql) => { rawSql.push(sql); } },
    };
    const migration = require('../migrations/20260926030000-notification-centre');
    await migration.up(queryInterface, Sequelize);
    expect(cols.entity_type).toBeTruthy();
    expect(cols.entity_id).toBeTruthy();
    expect(rawSql.some((s) => /DROP CONSTRAINT IF EXISTS notifications_kind_check/.test(s))).toBe(true);
    expect(rawSql.some((s) => /holiday_submitted/.test(s) && /new_enquiry/.test(s) && /task_reminder/.test(s))).toBe(true);
  });
});

describe('notification prefs migration (requirement 13.2)', () => {
  test('adds notification_prefs JSONB on users', async () => {
    const cols = {};
    const queryInterface = {
      describeTable: async () => cols,
      addColumn: async (table, name, def) => { cols[name] = { table, ...def }; },
      removeColumn: async (table, name) => { delete cols[name]; },
    };
    const migration = require('../migrations/20260926040000-notification-prefs');
    await migration.up(queryInterface, Sequelize);
    expect(cols.notification_prefs.table).toBe('users');
    expect(cols.notification_prefs.type).toBe(Sequelize.JSONB);
    expect(cols.notification_prefs.defaultValue).toEqual({ in_app: {}, email: {} });
  });
});

describe('catalogue items migration (requirement 17.2)', () => {
  test('creates catalogue_items and seeds the quote-builder rows', async () => {
    const tables = {};
    const indexes = [];
    const inserted = [];
    const queryInterface = {
      showAllTables: async () => [],
      createTable: async (name, cols) => { tables[name] = cols; },
      addIndex: async (table, cols, opts) => { indexes.push({ table, cols, opts }); },
      bulkInsert: async (table, rows) => { inserted.push({ table, rows }); },
    };
    const migration = require('../migrations/20260928180000-catalogue-items');
    await migration.up(queryInterface, Sequelize);
    expect(tables.catalogue_items.id.primaryKey).toBe(true);
    expect(tables.catalogue_items.unit_price.type).toBe(Sequelize.DOUBLE);
    expect(indexes.some((i) => i.opts?.name === 'catalogue_items_kind')).toBe(true);
    expect(inserted[0].table).toBe('catalogue_items');
    expect(inserted[0].rows.some((r) => r.id === 'felt_3layer')).toBe(true);
  });
});

describe('task assignees migration', () => {
  test('creates task_assignees and backfills from assignee_id', async () => {
    const tables = {};
    const indexes = [];
    const constraints = [];
    const rawSql = [];
    const queryInterface = {
      showAllTables: async () => ['tasks', 'users'],
      createTable: async (name, cols) => { tables[name] = cols; },
      addConstraint: async (table, opts) => { constraints.push({ table, opts }); },
      addIndex: async (table, cols, opts) => { indexes.push({ table, cols, opts }); },
      sequelize: { query: async (sql) => { rawSql.push(sql); } },
    };
    const migration = require('../migrations/20260930180000-task-assignees');
    await migration.up(queryInterface, Sequelize);
    expect(tables.task_assignees.task_id.allowNull).toBe(false);
    expect(tables.task_assignees.user_id.references.model).toBe('users');
    expect(constraints.some((c) => c.opts.name === 'task_assignees_task_user_unique')).toBe(true);
    expect(indexes.some((i) => i.opts?.name === 'idx_task_assignees_task')).toBe(true);
    expect(rawSql.some((s) => /INSERT INTO task_assignees/.test(s) && /assignee_id/.test(s))).toBe(true);
  });
});

describe('appointment assignees migration', () => {
  test('creates appointment_assignees with unique appointment + user', async () => {
    const tables = {};
    const indexes = [];
    const constraints = [];
    const queryInterface = {
      showAllTables: async () => ['appointments', 'users'],
      createTable: async (name, cols) => { tables[name] = cols; },
      addConstraint: async (table, opts) => { constraints.push({ table, opts }); },
      addIndex: async (table, cols, opts) => { indexes.push({ table, cols, opts }); },
    };
    const migration = require('../migrations/20261002180000-appointment-assignees');
    await migration.up(queryInterface, Sequelize);
    expect(tables.appointment_assignees.appointment_id.allowNull).toBe(false);
    expect(tables.appointment_assignees.user_id.references.model).toBe('users');
    expect(constraints.some((c) => c.opts.name === 'appointment_assignees_appointment_user_unique')).toBe(true);
    expect(indexes.some((i) => i.opts?.name === 'idx_appointment_assignees_appointment')).toBe(true);
  });
});

describe('user avatar migration', () => {
  test('adds avatar_file on users', async () => {
    const added = {};
    const queryInterface = {
      addColumn: async (table, name, col) => { added[name] = { table, col }; },
    };
    const migration = require('../migrations/20260929010000-user-avatar');
    await migration.up(queryInterface, Sequelize);
    expect(added.avatar_file.table).toBe('users');
    expect(added.avatar_file.col.type).toBe(Sequelize.TEXT);
    expect(added.avatar_file.col.allowNull).toBe(true);
  });
});

describe('appointment complete note migration', () => {
  test('adds complete_note on appointments', async () => {
    const cols = {};
    const queryInterface = {
      describeTable: async () => cols,
      addColumn: async (table, name, def) => { cols[name] = { table, ...def }; },
      removeColumn: async (table, name) => { delete cols[name]; },
    };
    const migration = require('../migrations/20261002210000-appointment-complete-note');
    await migration.up(queryInterface, Sequelize);
    expect(cols.complete_note.table).toBe('appointments');
    expect(cols.complete_note.type).toBe(Sequelize.TEXT);
  });
});

describe('lead pipeline stage migration', () => {
  test('adds stage on leads and lead_id on quotes, visits, jobs, and history', async () => {
    const added = {};
    const tables = {
      leads: {},
      stage_history: {},
      quotes: {},
      appointments: {},
      jobs: {},
    };
    const queryInterface = {
      describeTable: async (name) => tables[name] || {},
      addColumn: async (table, name, def) => {
        tables[table] = tables[table] || {};
        tables[table][name] = def;
        added[`${table}.${name}`] = def;
      },
      showIndex: async () => [],
      addIndex: async () => {},
      sequelize: { query: async () => {} },
    };
    const migration = require('../migrations/20261003010000-lead-pipeline-stage');
    await migration.up(queryInterface, Sequelize);
    expect(added['leads.stage'].defaultValue).toBe('ENQUIRY');
    expect(added['quotes.lead_id'].references.model).toBe('leads');
    expect(added['appointments.lead_id']).toBeTruthy();
    expect(added['jobs.lead_id']).toBeTruthy();
    expect(added['stage_history.lead_id']).toBeTruthy();
  });

  test('per-enquiry backfill is idempotent SQL against leads and related rows', async () => {
    const sql = [];
    const queryInterface = {
      sequelize: { query: async (q) => { sql.push(q); } },
    };
    const migration = require('../migrations/20261003020000-lead-pipeline-per-enquiry-backfill');
    await migration.up(queryInterface);
    expect(sql.some((q) => /INSERT INTO leads/.test(q))).toBe(true);
    expect(sql.some((q) => /UPDATE stage_history/.test(q))).toBe(true);
    expect(sql.some((q) => /sh\.lead_id = l\.id/.test(q))).toBe(true);
  });
});

describe('calendar_sync_links migration (requirement 16.3)', () => {
  test('creates per-user Google event links for visits, jobs, holidays, and tasks', async () => {
    const tables = {};
    const indexes = [];
    const sql = [];
    const queryInterface = {
      createTable: async (name, cols) => { tables[name] = cols; },
      addIndex: async (table, cols, opts) => { indexes.push({ table, cols, opts }); },
      sequelize: { query: async (q) => { sql.push(q); } },
    };
    const Sequelize = {
      INTEGER: 'INTEGER', TEXT: 'TEXT', DATE: 'DATE',
      fn: () => 'NOW',
    };
    const migration = require('../migrations/20261007010000-calendar-sync-links');
    await migration.up(queryInterface, Sequelize);
    expect(tables.calendar_sync_links.user_id.allowNull).toBe(false);
    expect(tables.calendar_sync_links.entity_type.allowNull).toBe(false);
    expect(tables.calendar_sync_links.gcal_event_id.allowNull).toBe(false);
    expect(indexes).toEqual([expect.objectContaining({
      table: 'calendar_sync_links',
      opts: expect.objectContaining({ unique: true, name: 'idx_calendar_sync_links_user_entity' }),
    })]);
    expect(sql.join('\n')).toMatch(/appointment.*job.*holiday.*task/);
  });
});
