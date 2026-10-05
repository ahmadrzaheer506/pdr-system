'use strict';

/**
 * Requirement 13.2 — per-user notification preference JSON.
 * Empty object means everything off until the user opts in.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const cols = await queryInterface.describeTable('users');
    if (cols.notification_prefs) return;
    await queryInterface.addColumn('users', 'notification_prefs', {
      type: Sequelize.JSONB,
      allowNull: false,
      defaultValue: { in_app: {}, email: {} },
    });
  },

  async down(queryInterface) {
    const cols = await queryInterface.describeTable('users');
    if (cols.notification_prefs) {
      await queryInterface.removeColumn('users', 'notification_prefs');
    }
  },
};
