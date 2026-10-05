'use strict';

/** One invoice per job (requirement 11.1). Null job_id stays allowed for ad-hoc invoices. */
module.exports = {
  async up(queryInterface) {
    await queryInterface.addIndex('invoices', ['job_id'], {
      unique: true,
      name: 'idx_invoices_job_unique',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('invoices', 'idx_invoices_job_unique');
  },
};
