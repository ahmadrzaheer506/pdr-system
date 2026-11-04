'use strict';

/**
 * Internal notes can come from a typed memo, a task remark, a site visit, or the customer (website).
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('customer_notes');
    if (!table.source) {
      await queryInterface.addColumn('customer_notes', 'source', {
        type: Sequelize.TEXT,
        allowNull: false,
        defaultValue: 'general',
      });
    }
    if (!table.lead_id) {
      await queryInterface.addColumn('customer_notes', 'lead_id', {
        type: Sequelize.INTEGER,
        allowNull: true,
      });
    }
  },

  async down(queryInterface) {
    const table = await queryInterface.describeTable('customer_notes');
    if (table.lead_id) await queryInterface.removeColumn('customer_notes', 'lead_id');
    if (table.source) await queryInterface.removeColumn('customer_notes', 'source');
  },
};
