'use strict';

/**
 * Requirement 7.3 — structured job materials (needed/packed/used) and
 * per-job checklist items copied from seeded templates.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const { INTEGER, TEXT, DOUBLE, BOOLEAN, DATE } = Sequelize;
    const tables = await queryInterface.showAllTables();
    const names = tables.map((t) => (typeof t === 'string' ? t : t.tableName || t.name));

    if (!names.includes('job_material_lines')) {
      await queryInterface.createTable('job_material_lines', {
        id: { type: INTEGER, primaryKey: true, autoIncrement: true },
        job_id: {
          type: INTEGER, allowNull: false,
          references: { model: 'jobs', key: 'id' },
          onDelete: 'CASCADE',
        },
        description: { type: TEXT, allowNull: false },
        qty: { type: DOUBLE, allowNull: false, defaultValue: 1 },
        unit: { type: TEXT, allowNull: true },
        status: { type: TEXT, allowNull: false, defaultValue: 'needed' },
        sort_order: { type: INTEGER, allowNull: false, defaultValue: 0 },
        created_at: { type: DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
        updated_at: { type: DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      });
      await queryInterface.addIndex('job_material_lines', ['job_id'], { name: 'idx_job_material_lines_job' });
      await queryInterface.sequelize.query(
        "ALTER TABLE job_material_lines ADD CONSTRAINT job_material_lines_status_check CHECK (status IN ('needed','packed','used'))",
      );
    }

    if (!names.includes('job_checklist_items')) {
      await queryInterface.createTable('job_checklist_items', {
        id: { type: INTEGER, primaryKey: true, autoIncrement: true },
        job_id: {
          type: INTEGER, allowNull: false,
          references: { model: 'jobs', key: 'id' },
          onDelete: 'CASCADE',
        },
        body: { type: TEXT, allowNull: false },
        done: { type: BOOLEAN, allowNull: false, defaultValue: false },
        sort_order: { type: INTEGER, allowNull: false, defaultValue: 0 },
        created_at: { type: DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
        updated_at: { type: DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      });
      await queryInterface.addIndex('job_checklist_items', ['job_id'], { name: 'idx_job_checklist_items_job' });
    }

    const jobs = await queryInterface.describeTable('jobs');
    if (!jobs.checklist_template) {
      await queryInterface.addColumn('jobs', 'checklist_template', {
        type: TEXT,
        allowNull: true,
      });
    }
  },

  async down(queryInterface) {
    const jobs = await queryInterface.describeTable('jobs');
    if (jobs.checklist_template) {
      await queryInterface.removeColumn('jobs', 'checklist_template');
    }
    await queryInterface.dropTable('job_checklist_items');
    await queryInterface.dropTable('job_material_lines');
  },
};
