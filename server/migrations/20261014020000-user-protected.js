'use strict';

/**
 * First / seed administrator cannot be deactivated or deleted.
 * Flag the oldest ADMIN so existing databases keep a locked owner account.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const users = await queryInterface.describeTable('users');
    if (!users.protected) {
      await queryInterface.addColumn('users', 'protected', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      });
    }
    await queryInterface.sequelize.query(`
      UPDATE users SET protected = true
      WHERE id = (
        SELECT id FROM (
          SELECT id FROM users WHERE role = 'ADMIN' ORDER BY id ASC LIMIT 1
        ) first_admin
      )
    `);
  },

  async down(queryInterface) {
    const users = await queryInterface.describeTable('users');
    if (users.protected) {
      await queryInterface.removeColumn('users', 'protected');
    }
  },
};
