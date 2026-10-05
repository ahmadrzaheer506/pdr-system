'use strict';

/**
 * Pipeline stage is per enquiry (lead), not per customer, so two jobs for the
 * same person can sit in different Kanban columns.
 */
async function addColumnIfMissing(queryInterface, tableName, column, spec) {
  const table = await queryInterface.describeTable(tableName);
  if (!table[column]) await queryInterface.addColumn(tableName, column, spec);
}

async function addIndexIfMissing(queryInterface, tableName, columns, name) {
  const indexes = await queryInterface.showIndex(tableName);
  const has = (indexes || []).some((idx) => idx.name === name);
  if (!has) await queryInterface.addIndex(tableName, columns, { name });
}

module.exports = {
  async up(queryInterface, Sequelize) {
    await addColumnIfMissing(queryInterface, 'leads', 'stage', {
      type: Sequelize.TEXT,
      allowNull: false,
      defaultValue: 'ENQUIRY',
    });
    await addColumnIfMissing(queryInterface, 'leads', 'board_order', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });
    await addColumnIfMissing(queryInterface, 'leads', 'lost_reason', {
      type: Sequelize.TEXT,
      allowNull: true,
    });
    await addColumnIfMissing(queryInterface, 'leads', 'updated_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await addColumnIfMissing(queryInterface, 'stage_history', 'lead_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'leads', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });
    await addColumnIfMissing(queryInterface, 'quotes', 'lead_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'leads', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });
    await addColumnIfMissing(queryInterface, 'appointments', 'lead_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'leads', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });
    await addColumnIfMissing(queryInterface, 'jobs', 'lead_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'leads', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });

    await queryInterface.sequelize.query(`
      UPDATE leads AS l SET
        stage = c.stage,
        lost_reason = c.lost_reason,
        updated_at = COALESCE(c.updated_at, l.created_at)
      FROM customers c
      WHERE l.customer_id = c.id
    `);
    await queryInterface.sequelize.query(`
      UPDATE leads SET updated_at = created_at WHERE updated_at IS NULL
    `);
    await queryInterface.sequelize.query(`
      UPDATE leads AS l SET board_order = ranked.ord
      FROM (
        SELECT id, (ROW_NUMBER() OVER (PARTITION BY stage ORDER BY updated_at DESC NULLS LAST, id ASC) - 1) AS ord
        FROM leads
      ) AS ranked
      WHERE l.id = ranked.id
    `);

    await queryInterface.sequelize.query(`
      UPDATE stage_history sh SET lead_id = (
        SELECT l.id FROM leads l
        WHERE l.customer_id = sh.customer_id
        ORDER BY l.id DESC
        LIMIT 1
      )
      WHERE sh.lead_id IS NULL
    `);

    const assignLead = async (table) => {
      await queryInterface.sequelize.query(`
        UPDATE ${table} AS r SET lead_id = (
          SELECT l.id FROM leads l
          WHERE l.customer_id = r.customer_id
            AND l.created_at <= COALESCE(r.created_at, NOW())
          ORDER BY l.created_at DESC, l.id DESC
          LIMIT 1
        )
        WHERE r.lead_id IS NULL
      `);
      await queryInterface.sequelize.query(`
        UPDATE ${table} AS r SET lead_id = (
          SELECT l.id FROM leads l
          WHERE l.customer_id = r.customer_id
          ORDER BY l.created_at ASC, l.id ASC
          LIMIT 1
        )
        WHERE r.lead_id IS NULL
      `);
    };
    await assignLead('quotes');
    await assignLead('appointments');
    await assignLead('jobs');

    await addIndexIfMissing(queryInterface, 'leads', ['stage', 'board_order'], 'idx_leads_stage_board_order');
    await addIndexIfMissing(queryInterface, 'quotes', ['lead_id'], 'idx_quotes_lead_id');
    await addIndexIfMissing(queryInterface, 'appointments', ['lead_id'], 'idx_appointments_lead_id');
    await addIndexIfMissing(queryInterface, 'jobs', ['lead_id'], 'idx_jobs_lead_id');
    await addIndexIfMissing(queryInterface, 'stage_history', ['lead_id'], 'idx_stage_history_lead_id');
  },

  async down(queryInterface) {
    const dropIndex = async (table, name) => {
      const indexes = await queryInterface.showIndex(table);
      if ((indexes || []).some((idx) => idx.name === name)) {
        await queryInterface.removeIndex(table, name);
      }
    };
    await dropIndex('leads', 'idx_leads_stage_board_order');
    await dropIndex('quotes', 'idx_quotes_lead_id');
    await dropIndex('appointments', 'idx_appointments_lead_id');
    await dropIndex('jobs', 'idx_jobs_lead_id');
    await dropIndex('stage_history', 'idx_stage_history_lead_id');

    const dropCol = async (table, col) => {
      const desc = await queryInterface.describeTable(table);
      if (desc[col]) await queryInterface.removeColumn(table, col);
    };
    await dropCol('jobs', 'lead_id');
    await dropCol('appointments', 'lead_id');
    await dropCol('quotes', 'lead_id');
    await dropCol('stage_history', 'lead_id');
    await dropCol('leads', 'updated_at');
    await dropCol('leads', 'lost_reason');
    await dropCol('leads', 'board_order');
    await dropCol('leads', 'stage');
  },
};
