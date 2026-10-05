'use strict';

/**
 * Requirement 1.9 — JWT token_version (forced logout) and security_events audit table.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('users', 'token_version', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });

    await queryInterface.createTable('security_events', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      actor_user_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
      },
      target_user_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
      },
      action: { type: Sequelize.TEXT, allowNull: false },
      detail: { type: Sequelize.TEXT, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });

    await queryInterface.addIndex('security_events', ['created_at']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('security_events');
    await queryInterface.removeColumn('users', 'token_version');
  },
};
