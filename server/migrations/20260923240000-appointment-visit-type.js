'use strict';

/**
 * Requirement 5.3 — visit type on appointments (site visit, follow-up, measure, other).
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const { TEXT } = Sequelize;
    const table = await queryInterface.describeTable('appointments');
    if (!table.visit_type) {
      await queryInterface.addColumn('appointments', 'visit_type', {
        type: TEXT,
        allowNull: false,
        defaultValue: 'site_visit',
      });
    }
    await queryInterface.sequelize.query(`
      ALTER TABLE appointments
      DROP CONSTRAINT IF EXISTS appointments_visit_type_check
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE appointments
      ADD CONSTRAINT appointments_visit_type_check
      CHECK (visit_type IN ('site_visit', 'follow_up', 'measure', 'other'))
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_visit_type_check
    `);
    const table = await queryInterface.describeTable('appointments');
    if (table.visit_type) {
      await queryInterface.removeColumn('appointments', 'visit_type');
    }
  },
};
