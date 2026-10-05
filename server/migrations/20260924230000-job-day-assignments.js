'use strict';

/**
 * Requirement 8.1 — per-day crew slots replace job-wide job_assignments.
 * Existing job-wide rows are copied onto each date in the job's start–end range.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const { INTEGER, DATEONLY } = Sequelize;
    const tables = await queryInterface.showAllTables();
    const names = tables.map((t) => (typeof t === 'string' ? t : t.tableName || t.name));

    if (!names.includes('job_day_assignments')) {
      await queryInterface.createTable('job_day_assignments', {
        id: { type: INTEGER, primaryKey: true, autoIncrement: true },
        job_id: {
          type: INTEGER, allowNull: false,
          references: { model: 'jobs', key: 'id' },
          onDelete: 'CASCADE',
        },
        work_date: { type: DATEONLY, allowNull: false },
        user_id: {
          type: INTEGER, allowNull: false,
          references: { model: 'users', key: 'id' },
          onDelete: 'CASCADE',
        },
      });
      await queryInterface.addConstraint('job_day_assignments', {
        fields: ['job_id', 'work_date', 'user_id'],
        type: 'unique',
        name: 'job_day_assignments_job_date_user_unique',
      });
      await queryInterface.addIndex('job_day_assignments', ['job_id'], { name: 'idx_job_day_assignments_job' });
      await queryInterface.addIndex('job_day_assignments', ['user_id', 'work_date'], { name: 'idx_job_day_assignments_user_date' });
    }

    if (names.includes('job_assignments')) {
      await queryInterface.sequelize.query(`
        INSERT INTO job_day_assignments (job_id, work_date, user_id)
        SELECT ja.job_id, d::date, ja.user_id
        FROM job_assignments ja
        JOIN jobs j ON j.id = ja.job_id
        CROSS JOIN LATERAL generate_series(
          j.start_date,
          COALESCE(j.end_date, j.start_date),
          interval '1 day'
        ) AS d
        WHERE j.start_date IS NOT NULL
        ON CONFLICT DO NOTHING
      `);
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable('job_day_assignments');
  },
};
