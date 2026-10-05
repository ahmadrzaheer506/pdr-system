'use strict';

/**
 * Requirement 7.4 — per-job photos (before/during/after) and PDF documents.
 * Completing a job does not require photos. Files are not customer (2.4) attachments.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const { INTEGER, TEXT, DATE } = Sequelize;
    const tables = await queryInterface.showAllTables();
    const names = tables.map((t) => (typeof t === 'string' ? t : t.tableName || t.name));

    if (!names.includes('job_files')) {
      await queryInterface.createTable('job_files', {
        id: { type: INTEGER, primaryKey: true, autoIncrement: true },
        job_id: {
          type: INTEGER, allowNull: false,
          references: { model: 'jobs', key: 'id' },
          onDelete: 'CASCADE',
        },
        stored_name: { type: TEXT, allowNull: false },
        original_name: { type: TEXT, allowNull: false },
        mime: { type: TEXT, allowNull: false },
        size_bytes: { type: INTEGER, allowNull: false },
        stage: { type: TEXT, allowNull: true },
        user_id: {
          type: INTEGER, allowNull: true,
          references: { model: 'users', key: 'id' },
          onDelete: 'SET NULL',
        },
        created_at: { type: DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      });
      await queryInterface.addIndex('job_files', ['job_id'], { name: 'idx_job_files_job' });
      await queryInterface.sequelize.query(
        `ALTER TABLE job_files ADD CONSTRAINT job_files_kind_check CHECK (
          (mime = 'application/pdf' AND stage IS NULL)
          OR (mime IN ('image/jpeg','image/png','image/webp') AND stage IN ('before','during','after'))
        )`,
      );
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable('job_files');
  },
};
