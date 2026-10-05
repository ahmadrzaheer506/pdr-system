'use strict';

/**
 * Initial PostgreSQL schema for the roofing CRM.
 * Replaces the previous SQLite CREATE TABLE + boot-time ALTER TABLE patches.
 * Native types: BOOLEAN, TIMESTAMPTZ, DATE, JSONB.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const { INTEGER, TEXT, BOOLEAN, DOUBLE, DATE, DATEONLY, STRING, JSONB } = Sequelize;

    await queryInterface.createTable('users', {
      id: { type: INTEGER, primaryKey: true, autoIncrement: true },
      name: { type: TEXT, allowNull: false },
      email: { type: TEXT, allowNull: false, unique: true },
      phone: { type: TEXT },
      password_hash: { type: TEXT, allowNull: false },
      role: { type: TEXT, allowNull: false },
      skills: { type: JSONB, allowNull: false, defaultValue: [] },
      is_driver: { type: BOOLEAN, allowNull: false, defaultValue: false },
      active: { type: BOOLEAN, allowNull: false, defaultValue: true },
      holiday_allowance: { type: DOUBLE, allowNull: false, defaultValue: 28 },
      color: { type: TEXT, allowNull: false, defaultValue: '#64748b' },
      hourly_cost: { type: DOUBLE, allowNull: false, defaultValue: 0 },
      cis_status: { type: TEXT, allowNull: false, defaultValue: 'none' },
      created_at: { type: DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });

    await queryInterface.createTable('customers', {
      id: { type: INTEGER, primaryKey: true, autoIncrement: true },
      name: { type: TEXT, allowNull: false },
      phone: { type: TEXT },
      email: { type: TEXT },
      address: { type: TEXT },
      postcode: { type: TEXT },
      notes: { type: TEXT },
      stage: { type: TEXT, allowNull: false, defaultValue: 'ENQUIRY' },
      source: { type: TEXT, allowNull: false, defaultValue: 'manual' },
      owner_id: { type: INTEGER, references: { model: 'users', key: 'id' } },
      lost_reason: { type: TEXT },
      customer_type: { type: TEXT, allowNull: false, defaultValue: 'domestic' },
      company_name: { type: TEXT },
      vat_number: { type: TEXT },
      created_at: { type: DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });
    await queryInterface.addIndex('customers', ['stage'], { name: 'idx_customers_stage' });
    await queryInterface.addIndex('customers', ['phone'], { name: 'idx_customers_phone' });
    await queryInterface.addIndex('customers', ['email'], { name: 'idx_customers_email' });

    await queryInterface.createTable('leads', {
      id: { type: INTEGER, primaryKey: true, autoIncrement: true },
      customer_id: { type: INTEGER, references: { model: 'customers', key: 'id' }, onDelete: 'CASCADE' },
      source: { type: TEXT, allowNull: false },
      subject: { type: TEXT },
      message: { type: TEXT },
      status: { type: TEXT, allowNull: false, defaultValue: 'NEW' },
      next_action: { type: TEXT },
      meta: { type: JSONB, allowNull: false, defaultValue: {} },
      created_at: { type: DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });
    await queryInterface.addIndex('leads', ['status'], { name: 'idx_leads_status' });
    await queryInterface.addIndex('leads', ['created_at'], { name: 'idx_leads_created' });

    await queryInterface.createTable('messages', {
      id: { type: INTEGER, primaryKey: true, autoIncrement: true },
      customer_id: { type: INTEGER, allowNull: false, references: { model: 'customers', key: 'id' }, onDelete: 'CASCADE' },
      direction: { type: TEXT, allowNull: false },
      channel: { type: TEXT, allowNull: false },
      body: { type: TEXT, allowNull: false },
      meta: { type: JSONB, allowNull: false, defaultValue: {} },
      status: { type: TEXT, allowNull: false, defaultValue: 'logged' },
      user_id: { type: INTEGER, references: { model: 'users', key: 'id' } },
      created_at: { type: DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });
    await queryInterface.addIndex('messages', ['customer_id', 'created_at'], { name: 'idx_messages_customer' });

    await queryInterface.createTable('appointments', {
      id: { type: INTEGER, primaryKey: true, autoIncrement: true },
      customer_id: { type: INTEGER, allowNull: false, references: { model: 'customers', key: 'id' }, onDelete: 'CASCADE' },
      title: { type: TEXT, allowNull: false },
      start: { type: DATE, allowNull: false },
      end: { type: DATE, allowNull: false },
      address: { type: TEXT },
      notes: { type: TEXT },
      gcal_event_id: { type: TEXT },
      gcal_status: { type: TEXT, allowNull: false, defaultValue: 'not_synced' },
      status: { type: TEXT, allowNull: false, defaultValue: 'booked' },
      stage_advanced: { type: BOOLEAN, allowNull: false, defaultValue: false },
      created_by: { type: INTEGER, references: { model: 'users', key: 'id' } },
      created_at: { type: DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });

    await queryInterface.createTable('quotes', {
      id: { type: INTEGER, primaryKey: true, autoIncrement: true },
      customer_id: { type: INTEGER, allowNull: false, references: { model: 'customers', key: 'id' }, onDelete: 'CASCADE' },
      ref: { type: TEXT, allowNull: false, unique: true },
      title: { type: TEXT, allowNull: false },
      items: { type: JSONB, allowNull: false, defaultValue: [] },
      subtotal: { type: DOUBLE, allowNull: false, defaultValue: 0 },
      vat_rate: { type: DOUBLE, allowNull: false, defaultValue: 20 },
      vat_amount: { type: DOUBLE, allowNull: false, defaultValue: 0 },
      total: { type: DOUBLE, allowNull: false, defaultValue: 0 },
      valid_until: { type: DATEONLY },
      status: { type: TEXT, allowNull: false, defaultValue: 'draft' },
      sent_at: { type: DATE },
      sent_via: { type: TEXT },
      decided_at: { type: DATE },
      pdf_file: { type: TEXT },
      notes: { type: TEXT },
      created_by: { type: INTEGER, references: { model: 'users', key: 'id' } },
      vat_treatment: { type: TEXT, allowNull: false, defaultValue: 'standard' },
      labour_total: { type: DOUBLE, allowNull: false, defaultValue: 0 },
      materials_total: { type: DOUBLE, allowNull: false, defaultValue: 0 },
      vat_breakdown: { type: JSONB, allowNull: false, defaultValue: [] },
      cis_applies: { type: BOOLEAN, allowNull: false, defaultValue: false },
      cis_rate: { type: DOUBLE, allowNull: false, defaultValue: 20 },
      cis_deduction: { type: DOUBLE, allowNull: false, defaultValue: 0 },
      retention_percent: { type: DOUBLE, allowNull: false, defaultValue: 0 },
      retention_amount: { type: DOUBLE, allowNull: false, defaultValue: 0 },
      due_now: { type: DOUBLE, allowNull: false, defaultValue: 0 },
      payment_schedule: { type: JSONB, allowNull: false, defaultValue: [] },
      exclusions: { type: TEXT },
      inclusions: { type: TEXT },
      warranty_years: { type: INTEGER },
      warranty_text: { type: TEXT },
      lead_time: { type: TEXT },
      duration_estimate: { type: TEXT },
      access_requirements: { type: TEXT },
      provisional_sums: { type: JSONB, allowNull: false, defaultValue: [] },
      cancellation_rights_apply: { type: BOOLEAN, allowNull: false, defaultValue: true },
      waiver_signed: { type: BOOLEAN, allowNull: false, defaultValue: false },
      created_at: { type: DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });

    await queryInterface.createTable('jobs', {
      id: { type: INTEGER, primaryKey: true, autoIncrement: true },
      customer_id: { type: INTEGER, allowNull: false, references: { model: 'customers', key: 'id' }, onDelete: 'CASCADE' },
      quote_id: { type: INTEGER, references: { model: 'quotes', key: 'id' } },
      title: { type: TEXT, allowNull: false },
      description: { type: TEXT },
      address: { type: TEXT },
      start_date: { type: DATEONLY },
      end_date: { type: DATEONLY },
      start_time: { type: STRING(8), defaultValue: '08:00' },
      end_time: { type: STRING(8), defaultValue: '16:30' },
      status: { type: TEXT, allowNull: false, defaultValue: 'PENDING' },
      priority: { type: TEXT, allowNull: false, defaultValue: 'normal' },
      required_skills: { type: JSONB, allowNull: false, defaultValue: [] },
      materials: { type: TEXT },
      value: { type: DOUBLE },
      notes: { type: TEXT },
      completed_at: { type: DATE },
      lat: { type: DOUBLE },
      lng: { type: DOUBLE },
      created_at: { type: DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });
    await queryInterface.addIndex('jobs', ['start_date', 'end_date'], { name: 'idx_jobs_dates' });
    await queryInterface.addIndex('jobs', ['status'], { name: 'idx_jobs_status' });

    await queryInterface.createTable('job_assignments', {
      id: { type: INTEGER, primaryKey: true, autoIncrement: true },
      job_id: { type: INTEGER, allowNull: false, references: { model: 'jobs', key: 'id' }, onDelete: 'CASCADE' },
      user_id: { type: INTEGER, allowNull: false, references: { model: 'users', key: 'id' }, onDelete: 'CASCADE' },
    });
    await queryInterface.addConstraint('job_assignments', {
      fields: ['job_id', 'user_id'],
      type: 'unique',
      name: 'job_assignments_job_user_unique',
    });

    await queryInterface.createTable('job_messages', {
      id: { type: INTEGER, primaryKey: true, autoIncrement: true },
      job_id: { type: INTEGER, allowNull: false, references: { model: 'jobs', key: 'id' }, onDelete: 'CASCADE' },
      user_id: { type: INTEGER, allowNull: false, references: { model: 'users', key: 'id' } },
      body: { type: TEXT, allowNull: false },
      created_at: { type: DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });

    await queryInterface.createTable('team_messages', {
      id: { type: INTEGER, primaryKey: true, autoIncrement: true },
      user_id: { type: INTEGER, allowNull: false, references: { model: 'users', key: 'id' } },
      body: { type: TEXT, allowNull: false },
      created_at: { type: DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });

    await queryInterface.createTable('holiday_requests', {
      id: { type: INTEGER, primaryKey: true, autoIncrement: true },
      user_id: { type: INTEGER, allowNull: false, references: { model: 'users', key: 'id' }, onDelete: 'CASCADE' },
      start_date: { type: DATEONLY, allowNull: false },
      end_date: { type: DATEONLY, allowNull: false },
      days: { type: DOUBLE, allowNull: false },
      reason: { type: TEXT },
      status: { type: TEXT, allowNull: false, defaultValue: 'pending' },
      decided_by: { type: INTEGER, references: { model: 'users', key: 'id' } },
      decided_at: { type: DATE },
      decline_reason: { type: TEXT },
      created_at: { type: DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });

    await queryInterface.createTable('invoices', {
      id: { type: INTEGER, primaryKey: true, autoIncrement: true },
      customer_id: { type: INTEGER, allowNull: false, references: { model: 'customers', key: 'id' }, onDelete: 'CASCADE' },
      job_id: { type: INTEGER, references: { model: 'jobs', key: 'id' } },
      ref: { type: TEXT, allowNull: false, unique: true },
      items: { type: JSONB, allowNull: false, defaultValue: [] },
      subtotal: { type: DOUBLE, allowNull: false, defaultValue: 0 },
      vat_rate: { type: DOUBLE, allowNull: false, defaultValue: 20 },
      vat_amount: { type: DOUBLE, allowNull: false, defaultValue: 0 },
      total: { type: DOUBLE, allowNull: false, defaultValue: 0 },
      amount_paid: { type: DOUBLE, allowNull: false, defaultValue: 0 },
      issue_date: { type: DATEONLY },
      due_date: { type: DATEONLY },
      status: { type: TEXT, allowNull: false, defaultValue: 'draft' },
      qbo_id: { type: TEXT },
      qbo_synced_at: { type: DATE },
      sent_at: { type: DATE },
      paid_at: { type: DATE },
      pdf_file: { type: TEXT },
      notes: { type: TEXT },
      vat_treatment: { type: TEXT, allowNull: false, defaultValue: 'standard' },
      labour_total: { type: DOUBLE, allowNull: false, defaultValue: 0 },
      materials_total: { type: DOUBLE, allowNull: false, defaultValue: 0 },
      vat_breakdown: { type: JSONB, allowNull: false, defaultValue: [] },
      cis_applies: { type: BOOLEAN, allowNull: false, defaultValue: false },
      cis_rate: { type: DOUBLE, allowNull: false, defaultValue: 20 },
      cis_deduction: { type: DOUBLE, allowNull: false, defaultValue: 0 },
      retention_percent: { type: DOUBLE, allowNull: false, defaultValue: 0 },
      retention_amount: { type: DOUBLE, allowNull: false, defaultValue: 0 },
      due_now: { type: DOUBLE, allowNull: false, defaultValue: 0 },
      created_at: { type: DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });

    await queryInterface.createTable('tasks', {
      id: { type: INTEGER, primaryKey: true, autoIncrement: true },
      type: { type: TEXT, allowNull: false, defaultValue: 'manual' },
      rule_key: { type: TEXT },
      title: { type: TEXT, allowNull: false },
      detail: { type: TEXT },
      due_date: { type: DATEONLY },
      priority: { type: TEXT, allowNull: false, defaultValue: 'normal' },
      status: { type: TEXT, allowNull: false, defaultValue: 'open' },
      assignee_id: { type: INTEGER, references: { model: 'users', key: 'id' } },
      entity_type: { type: TEXT },
      entity_id: { type: INTEGER },
      created_at: { type: DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      done_at: { type: DATE },
    });
    await queryInterface.addIndex('tasks', ['status', 'due_date'], { name: 'idx_tasks_status' });

    await queryInterface.createTable('followups', {
      id: { type: INTEGER, primaryKey: true, autoIncrement: true },
      quote_id: { type: INTEGER, allowNull: false, references: { model: 'quotes', key: 'id' }, onDelete: 'CASCADE' },
      customer_id: { type: INTEGER, allowNull: false, references: { model: 'customers', key: 'id' }, onDelete: 'CASCADE' },
      step: { type: INTEGER, allowNull: false },
      channel: { type: TEXT, allowNull: false },
      scheduled_at: { type: DATE, allowNull: false },
      status: { type: TEXT, allowNull: false, defaultValue: 'pending' },
      sent_at: { type: DATE },
      message: { type: TEXT },
      stop_reason: { type: TEXT },
      created_at: { type: DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });
    await queryInterface.addIndex('followups', ['status', 'scheduled_at'], { name: 'idx_followups_due' });

    await queryInterface.createTable('activity', {
      id: { type: INTEGER, primaryKey: true, autoIncrement: true },
      customer_id: { type: INTEGER, references: { model: 'customers', key: 'id' }, onDelete: 'CASCADE' },
      user_id: { type: INTEGER, references: { model: 'users', key: 'id' } },
      kind: { type: TEXT, allowNull: false },
      detail: { type: TEXT },
      entity_type: { type: TEXT },
      entity_id: { type: INTEGER },
      created_at: { type: DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });
    await queryInterface.addIndex('activity', ['customer_id', 'created_at'], { name: 'idx_activity_customer' });

    await queryInterface.createTable('stage_history', {
      id: { type: INTEGER, primaryKey: true, autoIncrement: true },
      customer_id: { type: INTEGER, allowNull: false, references: { model: 'customers', key: 'id' }, onDelete: 'CASCADE' },
      from_stage: { type: TEXT },
      to_stage: { type: TEXT, allowNull: false },
      user_id: { type: INTEGER, references: { model: 'users', key: 'id' } },
      created_at: { type: DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });

    await queryInterface.createTable('settings', {
      key: { type: TEXT, primaryKey: true },
      value: { type: JSONB, allowNull: false },
    });

    await queryInterface.createTable('integration_events', {
      id: { type: INTEGER, primaryKey: true, autoIncrement: true },
      provider: { type: TEXT, allowNull: false },
      direction: { type: TEXT, allowNull: false },
      event: { type: TEXT, allowNull: false },
      payload: { type: JSONB },
      status: { type: TEXT, allowNull: false, defaultValue: 'ok' },
      created_at: { type: DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });

    await queryInterface.createTable('ai_proposals', {
      id: { type: INTEGER, primaryKey: true, autoIncrement: true },
      for_date: { type: DATEONLY, allowNull: false },
      transcript: { type: TEXT },
      provider: { type: TEXT, allowNull: false },
      proposal: { type: JSONB, allowNull: false },
      warnings: { type: JSONB, allowNull: false, defaultValue: [] },
      status: { type: TEXT, allowNull: false, defaultValue: 'proposed' },
      created_by: { type: INTEGER, references: { model: 'users', key: 'id' } },
      created_at: { type: DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      approved_at: { type: DATE },
    });

    await queryInterface.createTable('oauth_tokens', {
      provider: { type: TEXT, primaryKey: true },
      access_token: { type: TEXT },
      refresh_token: { type: TEXT },
      expires_at: { type: DATE },
      meta: { type: JSONB, allowNull: false, defaultValue: {} },
      updated_at: { type: DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });

    await queryInterface.createTable('timesheets', {
      id: { type: INTEGER, primaryKey: true, autoIncrement: true },
      user_id: { type: INTEGER, allowNull: false, references: { model: 'users', key: 'id' }, onDelete: 'CASCADE' },
      job_id: { type: INTEGER, references: { model: 'jobs', key: 'id' }, onDelete: 'SET NULL' },
      work_date: { type: DATEONLY, allowNull: false },
      clock_in: { type: DATE, allowNull: false },
      clock_out: { type: DATE },
      break_started_at: { type: DATE },
      break_minutes: { type: DOUBLE, allowNull: false, defaultValue: 0 },
      in_lat: { type: DOUBLE },
      in_lng: { type: DOUBLE },
      in_accuracy: { type: DOUBLE },
      out_lat: { type: DOUBLE },
      out_lng: { type: DOUBLE },
      out_accuracy: { type: DOUBLE },
      in_distance_m: { type: DOUBLE },
      out_distance_m: { type: DOUBLE },
      location_flag: { type: TEXT },
      photo_file: { type: TEXT },
      notes: { type: TEXT },
      worked_minutes: { type: DOUBLE },
      cost_rate: { type: DOUBLE },
      labour_cost: { type: DOUBLE },
      status: { type: TEXT, allowNull: false, defaultValue: 'active' },
      approved_by: { type: INTEGER, references: { model: 'users', key: 'id' } },
      approved_at: { type: DATE },
      edit_reason: { type: TEXT },
      created_at: { type: DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });
    await queryInterface.addIndex('timesheets', ['user_id', 'work_date'], { name: 'idx_timesheets_user' });
    await queryInterface.addIndex('timesheets', ['job_id'], { name: 'idx_timesheets_job' });
    await queryInterface.addIndex('timesheets', ['status'], { name: 'idx_timesheets_status' });

    const qi = queryInterface.sequelize;
    // Requirement 1.4: stored roles are ADMIN (Director), OFFICE, STAFF (Operative).
    await qi.query("ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('ADMIN','OFFICE','STAFF'))");
    await qi.query("ALTER TABLE messages ADD CONSTRAINT messages_direction_check CHECK (direction IN ('in','out'))");
    await qi.query(
      "CREATE UNIQUE INDEX idx_tasks_rule ON tasks (rule_key) WHERE rule_key IS NOT NULL AND status = 'open'"
    );
    await qi.query(
      "CREATE UNIQUE INDEX idx_timesheets_one_active ON timesheets (user_id) WHERE status = 'active'"
    );
  },

  async down(queryInterface) {
    const tables = [
      'timesheets', 'oauth_tokens', 'ai_proposals', 'integration_events', 'settings',
      'stage_history', 'activity', 'followups', 'tasks', 'invoices', 'holiday_requests',
      'team_messages', 'job_messages', 'job_assignments', 'jobs', 'quotes', 'appointments',
      'messages', 'leads', 'customers', 'users',
    ];
    for (const table of tables) {
      await queryInterface.dropTable(table);
    }
  },
};
