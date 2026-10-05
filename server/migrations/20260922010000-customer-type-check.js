'use strict';

/** Constrain customers.customer_type to domestic | commercial (requirement 2.1). */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      "ALTER TABLE customers ADD CONSTRAINT customers_type_check CHECK (customer_type IN ('domestic','commercial'))",
    );
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      'ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_type_check',
    );
  },
};
