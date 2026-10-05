'use strict';

/**
 * Snapshot the step body onto each scheduled follow-up (requirement 12.1)
 * so later Settings edits do not rewrite already-queued messages.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const cols = await queryInterface.describeTable('followups');
    if (!cols.body_template) {
      await queryInterface.addColumn('followups', 'body_template', {
        type: Sequelize.TEXT,
        allowNull: true,
      });
    }
  },

  async down(queryInterface) {
    const cols = await queryInterface.describeTable('followups');
    if (cols.body_template) {
      await queryInterface.removeColumn('followups', 'body_template');
    }
  },
};
