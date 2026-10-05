'use strict';

/**
 * Per-user profile photo. PNG/JPEG on disk as avatar-{id}.png|jpg.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('users', 'avatar_file', {
      type: Sequelize.TEXT,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('users', 'avatar_file');
  },
};
