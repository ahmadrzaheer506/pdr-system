'use strict';

/**
 * Requirement 4.4 — index owner_id for pipeline owner filters.
 */
module.exports = {
  async up(queryInterface) {
    const indexes = await queryInterface.showIndex('customers');
    const hasIndex = (indexes || []).some((idx) => idx.name === 'idx_customers_owner_id');
    if (!hasIndex) {
      await queryInterface.addIndex('customers', ['owner_id'], {
        name: 'idx_customers_owner_id',
      });
    }
  },

  async down(queryInterface) {
    const indexes = await queryInterface.showIndex('customers');
    const hasIndex = (indexes || []).some((idx) => idx.name === 'idx_customers_owner_id');
    if (hasIndex) await queryInterface.removeIndex('customers', 'idx_customers_owner_id');
  },
};
