'use strict';

/**
 * Requirement 7.5 — office-only job variation lines (description + amount).
 * Does not change jobs.value. Invoice-from-job is left for 11.1.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const { INTEGER, TEXT, DOUBLE, DATE } = Sequelize;
    const tables = await queryInterface.showAllTables();
    const names = tables.map((t) => (typeof t === 'string' ? t : t.tableName || t.name));

    if (!names.includes('job_variations')) {
      await queryInterface.createTable('job_variations', {
        id: { type: INTEGER, primaryKey: true, autoIncrement: true },
        job_id: {
          type: INTEGER, allowNull: false,
          references: { model: 'jobs', key: 'id' },
          onDelete: 'CASCADE',
        },
        description: { type: TEXT, allowNull: false },
        amount: { type: DOUBLE, allowNull: false, defaultValue: 0 },
        sort_order: { type: INTEGER, allowNull: false, defaultValue: 0 },
        created_at: { type: DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
        updated_at: { type: DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      });
      await queryInterface.addIndex('job_variations', ['job_id'], { name: 'idx_job_variations_job' });
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable('job_variations');
  },
};
