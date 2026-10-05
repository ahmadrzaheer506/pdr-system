'use strict';

/**
 * Requirement 5.1 — index customer_id so site visits linked to a customer load quickly.
 */
module.exports = {
  async up(queryInterface) {
    const indexes = await queryInterface.showIndex('appointments');
    const hasIndex = (indexes || []).some((idx) => idx.name === 'idx_appointments_customer_id');
    if (!hasIndex) {
      await queryInterface.addIndex('appointments', ['customer_id'], {
        name: 'idx_appointments_customer_id',
      });
    }
  },

  async down(queryInterface) {
    const indexes = await queryInterface.showIndex('appointments');
    const hasIndex = (indexes || []).some((idx) => idx.name === 'idx_appointments_customer_id');
    if (hasIndex) await queryInterface.removeIndex('appointments', 'idx_appointments_customer_id');
  },
};
