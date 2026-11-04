'use strict';

/**
 * Optional remarks captured when a task is marked done (same idea as visit complete_note).
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('tasks');
    if (!table.complete_note) {
      await queryInterface.addColumn('tasks', 'complete_note', {
        type: Sequelize.TEXT,
        allowNull: true,
      });
    }
  },

  async down(queryInterface) {
    const table = await queryInterface.describeTable('tasks');
    if (table.complete_note) {
      await queryInterface.removeColumn('tasks', 'complete_note');
    }
  },
};
