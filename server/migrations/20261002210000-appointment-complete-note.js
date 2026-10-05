'use strict';

/**
 * Optional remarks captured when a site visit is marked complete.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('appointments');
    if (!table.complete_note) {
      await queryInterface.addColumn('appointments', 'complete_note', {
        type: Sequelize.TEXT,
        allowNull: true,
      });
    }
  },

  async down(queryInterface) {
    const table = await queryInterface.describeTable('appointments');
    if (table.complete_note) {
      await queryInterface.removeColumn('appointments', 'complete_note');
    }
  },
};
