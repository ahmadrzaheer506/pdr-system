'use strict';

/**
 * Attachments can come from office upload or the customer's landing-page enquiry.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('customer_files');
    if (!table.source) {
      await queryInterface.addColumn('customer_files', 'source', {
        type: Sequelize.TEXT,
        allowNull: false,
        defaultValue: 'general',
      });
    }
    if (!table.lead_id) {
      await queryInterface.addColumn('customer_files', 'lead_id', {
        type: Sequelize.INTEGER,
        allowNull: true,
      });
    }
  },

  async down(queryInterface) {
    const table = await queryInterface.describeTable('customer_files');
    if (table.lead_id) await queryInterface.removeColumn('customer_files', 'lead_id');
    if (table.source) await queryInterface.removeColumn('customer_files', 'source');
  },
};
