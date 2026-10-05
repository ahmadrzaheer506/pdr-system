'use strict';

const { normalisePhone } = require('../phone');

/**
 * Requirement 2.5 — digits-only normalised column on customer_phones for
 * match and search. Display value is unchanged. Existing rows are backfilled.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('customer_phones', 'normalised', {
      type: Sequelize.TEXT,
      allowNull: true,
    });
    await queryInterface.addIndex('customer_phones', ['normalised'], {
      name: 'idx_customer_phones_normalised',
    });

    const [rows] = await queryInterface.sequelize.query(
      'SELECT id, value FROM customer_phones',
    );
    for (const row of rows || []) {
      const normalised = normalisePhone(row.value);
      if (!normalised) continue;
      await queryInterface.sequelize.query(
        'UPDATE customer_phones SET normalised = :normalised WHERE id = :id',
        { replacements: { normalised, id: row.id } },
      );
    }
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('customer_phones', 'idx_customer_phones_normalised');
    await queryInterface.removeColumn('customer_phones', 'normalised');
  },
};
