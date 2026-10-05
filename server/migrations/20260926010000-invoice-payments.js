'use strict';

/**
 * Office payment ledger (requirement 11.4).
 * amount_paid on invoices remains the running total; rows here are the log.
 * Existing amount_paid values are copied as a single opening row so the sum matches.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const { INTEGER, TEXT, DOUBLE, DATE, DATEONLY } = Sequelize;
    const tables = await queryInterface.showAllTables();
    const names = tables.map((t) => (typeof t === 'string' ? t : t.tableName || t.name));

    if (!names.includes('invoice_payments')) {
      await queryInterface.createTable('invoice_payments', {
        id: { type: INTEGER, primaryKey: true, autoIncrement: true },
        invoice_id: {
          type: INTEGER, allowNull: false,
          references: { model: 'invoices', key: 'id' },
          onDelete: 'CASCADE',
        },
        amount: { type: DOUBLE, allowNull: false },
        paid_at: { type: DATEONLY, allowNull: false },
        note: { type: TEXT },
        recorded_by: {
          type: INTEGER,
          references: { model: 'users', key: 'id' },
          onDelete: 'SET NULL',
        },
        created_at: { type: DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      });
      await queryInterface.addIndex('invoice_payments', ['invoice_id'], { name: 'idx_invoice_payments_invoice' });
    }

    await queryInterface.sequelize.query(`
      INSERT INTO invoice_payments (invoice_id, amount, paid_at, note, created_at)
      SELECT id,
             LEAST(amount_paid, COALESCE(NULLIF(due_now, 0), amount_paid)),
             COALESCE(paid_at::date, issue_date, CURRENT_DATE),
             NULL,
             NOW()
      FROM invoices
      WHERE amount_paid > 0
        AND NOT EXISTS (
          SELECT 1 FROM invoice_payments p WHERE p.invoice_id = invoices.id
        )
    `);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('invoice_payments');
  },
};
