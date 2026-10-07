'use strict';

/**
 * Per-user Google Calendar event links (requirement 16.3).
 * One row per CRM record per connected user — admin/office can hold
 * company-wide copies while field staff only hold assigned items.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('calendar_sync_links', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      entity_type: { type: Sequelize.TEXT, allowNull: false },
      entity_id: { type: Sequelize.INTEGER, allowNull: false },
      gcal_event_id: { type: Sequelize.TEXT, allowNull: false },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });
    await queryInterface.addIndex('calendar_sync_links', ['user_id', 'entity_type', 'entity_id'], {
      unique: true,
      name: 'idx_calendar_sync_links_user_entity',
    });
    await queryInterface.sequelize.query(`
      ALTER TABLE calendar_sync_links
      ADD CONSTRAINT calendar_sync_links_entity_type_check
      CHECK (entity_type IN ('appointment', 'job', 'holiday', 'task'))
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      'ALTER TABLE calendar_sync_links DROP CONSTRAINT IF EXISTS calendar_sync_links_entity_type_check',
    );
    await queryInterface.dropTable('calendar_sync_links');
  },
};
