'use strict';

/**
 * Requirement 1.6 — per-user financial restrictions for office users.
 * Default false: existing OFFICE users stay unrestricted until an ADMIN turns the flag on.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('users', 'financials_restricted', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('users', 'financials_restricted');
  },
};
