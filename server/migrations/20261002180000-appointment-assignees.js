'use strict';

/**
 * Site visits can be assigned to office / field staff (same pattern as tasks).
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const { INTEGER } = Sequelize;
    const tables = await queryInterface.showAllTables();
    const names = tables.map((t) => (typeof t === 'string' ? t : t.tableName || t.name));
    if (names.includes('appointment_assignees')) return;

    await queryInterface.createTable('appointment_assignees', {
      appointment_id: {
        type: INTEGER,
        allowNull: false,
        references: { model: 'appointments', key: 'id' },
        onDelete: 'CASCADE',
      },
      user_id: {
        type: INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
    });
    await queryInterface.addConstraint('appointment_assignees', {
      fields: ['appointment_id', 'user_id'],
      type: 'unique',
      name: 'appointment_assignees_appointment_user_unique',
    });
    await queryInterface.addIndex('appointment_assignees', ['appointment_id'], {
      name: 'idx_appointment_assignees_appointment',
    });
    await queryInterface.addIndex('appointment_assignees', ['user_id'], {
      name: 'idx_appointment_assignees_user',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('appointment_assignees');
  },
};
