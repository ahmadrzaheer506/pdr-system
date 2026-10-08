'use strict';

/**
 * Persist QuickBooks Online ids so invoices and payments can be updated
 * and so inbound payment polls are idempotent.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('customers', 'qbo_id', { type: Sequelize.TEXT });
    await queryInterface.addColumn('invoices', 'qbo_sync_token', { type: Sequelize.TEXT });
    await queryInterface.addColumn('invoice_payments', 'qbo_id', { type: Sequelize.TEXT });
    await queryInterface.addColumn('invoice_payments', 'source', {
      type: Sequelize.TEXT,
      allowNull: false,
      defaultValue: 'crm',
    });
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_invoice_payments_qbo_id
      ON invoice_payments (qbo_id)
      WHERE qbo_id IS NOT NULL
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query('DROP INDEX IF EXISTS idx_invoice_payments_qbo_id');
    await queryInterface.removeColumn('invoice_payments', 'source');
    await queryInterface.removeColumn('invoice_payments', 'qbo_id');
    await queryInterface.removeColumn('invoices', 'qbo_sync_token');
    await queryInterface.removeColumn('customers', 'qbo_id');
  },
};
