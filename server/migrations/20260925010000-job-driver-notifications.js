'use strict';

/**
 * Requirement 8.3 — job-level needs_driver flag and in-app notification rows
 * for crew add/remove. No notification-centre UI or email (those stay 13.1).
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const { INTEGER, TEXT, DATE, DATEONLY, BOOLEAN } = Sequelize;
    const tables = await queryInterface.showAllTables();
    const names = tables.map((t) => (typeof t === 'string' ? t : t.tableName || t.name));

    const jobs = await queryInterface.describeTable('jobs');
    if (!jobs.needs_driver) {
      await queryInterface.addColumn('jobs', 'needs_driver', {
        type: BOOLEAN,
        allowNull: false,
        defaultValue: false,
      });
    }

    if (!names.includes('notifications')) {
      await queryInterface.createTable('notifications', {
        id: { type: INTEGER, primaryKey: true, autoIncrement: true },
        user_id: {
          type: INTEGER, allowNull: false,
          references: { model: 'users', key: 'id' },
          onDelete: 'CASCADE',
        },
        kind: { type: TEXT, allowNull: false },
        message: { type: TEXT, allowNull: false },
        job_id: {
          type: INTEGER, allowNull: true,
          references: { model: 'jobs', key: 'id' },
          onDelete: 'CASCADE',
        },
        work_date: { type: DATEONLY },
        read_at: { type: DATE },
        created_at: { type: DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      });
      await queryInterface.sequelize.query(
        `ALTER TABLE notifications ADD CONSTRAINT notifications_kind_check
         CHECK (kind IN ('crew_added', 'crew_removed'))`,
      );
      await queryInterface.addIndex('notifications', ['user_id', 'created_at'], {
        name: 'idx_notifications_user_created',
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable('notifications');
    await queryInterface.removeColumn('jobs', 'needs_driver');
  },
};
