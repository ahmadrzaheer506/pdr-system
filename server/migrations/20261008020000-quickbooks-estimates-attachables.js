'use strict';

/**
 * Quote → QuickBooks Estimate ids, plus PDF attachable ids on invoices/quotes.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('quotes', 'qbo_id', { type: Sequelize.TEXT });
    await queryInterface.addColumn('quotes', 'qbo_sync_token', { type: Sequelize.TEXT });
    await queryInterface.addColumn('quotes', 'qbo_synced_at', { type: Sequelize.DATE });
    await queryInterface.addColumn('quotes', 'qbo_attachable_id', { type: Sequelize.TEXT });
    await queryInterface.addColumn('invoices', 'qbo_attachable_id', { type: Sequelize.TEXT });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('invoices', 'qbo_attachable_id');
    await queryInterface.removeColumn('quotes', 'qbo_attachable_id');
    await queryInterface.removeColumn('quotes', 'qbo_synced_at');
    await queryInterface.removeColumn('quotes', 'qbo_sync_token');
    await queryInterface.removeColumn('quotes', 'qbo_id');
  },
};
