'use strict';

/**
 * Skill catalogue + job types, and migrate staff/job string skills to
 * { skill_id, level } (requirement 1.8 / 7.2).
 */
const { DEFAULT_SKILLS, DEFAULT_JOB_TYPES, migrateLegacyList } = require('../skills');

function tableNames(tables) {
  return tables.map((t) => (typeof t === 'string' ? t : t.tableName || t.name));
}

module.exports = {
  async up(queryInterface, Sequelize) {
    const { INTEGER, TEXT, JSONB, DATE } = Sequelize;
    const names = tableNames(await queryInterface.showAllTables());
    const now = new Date();

    if (!names.includes('skills')) {
      await queryInterface.createTable('skills', {
        id: { type: INTEGER, primaryKey: true, autoIncrement: true },
        slug: { type: TEXT, allowNull: false, unique: true },
        name: { type: TEXT, allowNull: false },
        sort_order: { type: INTEGER, allowNull: false, defaultValue: 0 },
        created_at: { type: DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
        updated_at: { type: DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      });
      await queryInterface.addIndex('skills', ['sort_order'], { name: 'skills_sort_order' });
    }

    if (!names.includes('job_types')) {
      await queryInterface.createTable('job_types', {
        id: { type: INTEGER, primaryKey: true, autoIncrement: true },
        name: { type: TEXT, allowNull: false },
        required_skills: { type: JSONB, allowNull: false, defaultValue: [] },
        sort_order: { type: INTEGER, allowNull: false, defaultValue: 0 },
        created_at: { type: DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
        updated_at: { type: DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      });
    }

    const jobCols = names.includes('jobs')
      ? await queryInterface.describeTable('jobs').catch(() => ({}))
      : {};
    if (names.includes('jobs') && !jobCols.job_type_id) {
      await queryInterface.addColumn('jobs', 'job_type_id', { type: INTEGER, allowNull: true });
    }

    const [existingSkills] = queryInterface.sequelize
      ? await queryInterface.sequelize.query('SELECT id, slug FROM skills')
      : [[]];
    if (!existingSkills.length) {
      await queryInterface.bulkInsert(
        'skills',
        DEFAULT_SKILLS.map((s, i) => ({
          slug: s.slug,
          name: s.name,
          sort_order: i,
          created_at: now,
          updated_at: now,
        })),
      );
    }

    const [skillRows] = queryInterface.sequelize
      ? await queryInterface.sequelize.query('SELECT id, slug FROM skills')
      : [[]];
    const slugToId = new Map((skillRows || []).map((row) => [row.slug, Number(row.id)]));

    const [typeCountRows] = queryInterface.sequelize
      ? await queryInterface.sequelize.query('SELECT COUNT(*)::int AS n FROM job_types')
      : [[{ n: 1 }]];
    const typeCount = Number(typeCountRows?.[0]?.n || typeCountRows?.[0]?.count || 0);
    if (!typeCount) {
      await queryInterface.bulkInsert(
        'job_types',
        DEFAULT_JOB_TYPES.map((t, i) => ({
          name: t.name,
          sort_order: i,
          required_skills: JSON.stringify(t.skills
            .map((s) => {
              const id = slugToId.get(s.slug);
              return id ? { skill_id: id, level: s.level } : null;
            })
            .filter(Boolean)),
          created_at: now,
          updated_at: now,
        })),
      );
    }

    if (queryInterface.sequelize && names.includes('users')) {
      const [users] = await queryInterface.sequelize.query('SELECT id, skills FROM users');
      for (const row of users || []) {
        const next = migrateLegacyList(row.skills, slugToId);
        await queryInterface.sequelize.query(
          'UPDATE users SET skills = CAST(:skills AS jsonb) WHERE id = :id',
          { replacements: { skills: JSON.stringify(next), id: row.id } },
        );
      }
    }

    if (queryInterface.sequelize && names.includes('jobs')) {
      const [jobs] = await queryInterface.sequelize.query('SELECT id, required_skills FROM jobs');
      for (const row of jobs || []) {
        const next = migrateLegacyList(row.required_skills, slugToId);
        await queryInterface.sequelize.query(
          'UPDATE jobs SET required_skills = CAST(:skills AS jsonb) WHERE id = :id',
          { replacements: { skills: JSON.stringify(next), id: row.id } },
        );
      }
    }
  },

  async down(queryInterface) {
    const names = tableNames(await queryInterface.showAllTables());
    if (names.includes('jobs')) {
      const cols = await queryInterface.describeTable('jobs').catch(() => ({}));
      if (cols.job_type_id) await queryInterface.removeColumn('jobs', 'job_type_id');
    }
    if (names.includes('job_types')) await queryInterface.dropTable('job_types');
    if (names.includes('skills')) await queryInterface.dropTable('skills');
  },
};
