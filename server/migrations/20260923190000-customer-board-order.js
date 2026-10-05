'use strict';

/**
 * Requirement 4.2 — persist Kanban card order within each stage column.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('customers');
    if (!table.board_order) {
      await queryInterface.addColumn('customers', 'board_order', {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      });
    }
    const indexes = await queryInterface.showIndex('customers');
    const hasIndex = (indexes || []).some((idx) => idx.name === 'idx_customers_stage_board_order');
    if (!hasIndex) {
      await queryInterface.addIndex('customers', ['stage', 'board_order'], {
        name: 'idx_customers_stage_board_order',
      });
    }
    await queryInterface.sequelize.query(`
      UPDATE customers AS c SET board_order = ranked.ord
      FROM (
        SELECT id, (ROW_NUMBER() OVER (PARTITION BY stage ORDER BY updated_at DESC, id ASC) - 1) AS ord
        FROM customers
      ) AS ranked
      WHERE c.id = ranked.id
    `);
  },

  async down(queryInterface) {
    const indexes = await queryInterface.showIndex('customers');
    const hasIndex = (indexes || []).some((idx) => idx.name === 'idx_customers_stage_board_order');
    if (hasIndex) await queryInterface.removeIndex('customers', 'idx_customers_stage_board_order');
    const table = await queryInterface.describeTable('customers');
    if (table.board_order) await queryInterface.removeColumn('customers', 'board_order');
  },
};
