'use strict';

/**
 * Requirement 13.1 — extra kinds, entity link, centre API.
 * Email for crew add/remove stays in application code (field staff only).
 */
const KINDS = [
  'crew_added',
  'crew_removed',
  'new_enquiry',
  'quote_accepted',
  'visit_booked',
  'invoice_overdue',
  'task_reminder',
  'holiday_submitted',
  'holiday_approved',
  'holiday_declined',
];

module.exports = {
  async up(queryInterface, Sequelize) {
    const cols = await queryInterface.describeTable('notifications');
    if (!cols.entity_type) {
      await queryInterface.addColumn('notifications', 'entity_type', {
        type: Sequelize.TEXT,
        allowNull: true,
      });
    }
    if (!cols.entity_id) {
      await queryInterface.addColumn('notifications', 'entity_id', {
        type: Sequelize.INTEGER,
        allowNull: true,
      });
    }
    await queryInterface.sequelize.query(
      'ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_kind_check',
    );
    const list = KINDS.map((k) => `'${k}'`).join(', ');
    await queryInterface.sequelize.query(
      `ALTER TABLE notifications ADD CONSTRAINT notifications_kind_check CHECK (kind IN (${list}))`,
    );
  },

  async down(queryInterface) {
    const cols = await queryInterface.describeTable('notifications');
    if (cols.entity_id) await queryInterface.removeColumn('notifications', 'entity_id');
    if (cols.entity_type) await queryInterface.removeColumn('notifications', 'entity_type');
    await queryInterface.sequelize.query(
      'ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_kind_check',
    );
    await queryInterface.sequelize.query(
      `ALTER TABLE notifications ADD CONSTRAINT notifications_kind_check
       CHECK (kind IN ('crew_added', 'crew_removed'))`,
    );
  },
};
