'use strict';

/**
 * Manual tasks can be assigned to several office / field staff users.
 * Copies existing tasks.assignee_id into the join table.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const { INTEGER } = Sequelize;
    const tables = await queryInterface.showAllTables();
    const names = tables.map((t) => (typeof t === 'string' ? t : t.tableName || t.name));
    if (names.includes('task_assignees')) return;

    await queryInterface.createTable('task_assignees', {
      task_id: {
        type: INTEGER,
        allowNull: false,
        references: { model: 'tasks', key: 'id' },
        onDelete: 'CASCADE',
      },
      user_id: {
        type: INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
    });
    await queryInterface.addConstraint('task_assignees', {
      fields: ['task_id', 'user_id'],
      type: 'unique',
      name: 'task_assignees_task_user_unique',
    });
    await queryInterface.addIndex('task_assignees', ['task_id'], { name: 'idx_task_assignees_task' });
    await queryInterface.addIndex('task_assignees', ['user_id'], { name: 'idx_task_assignees_user' });

    if (names.includes('tasks')) {
      await queryInterface.sequelize.query(`
        INSERT INTO task_assignees (task_id, user_id)
        SELECT id, assignee_id FROM tasks
        WHERE assignee_id IS NOT NULL
        ON CONFLICT (task_id, user_id) DO NOTHING
      `);
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable('task_assignees');
  },
};
