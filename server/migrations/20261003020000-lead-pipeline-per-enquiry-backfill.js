'use strict';

/**
 * The first lead-stage migration copied Customer.stage onto every enquiry,
 * so two jobs for the same person still shared one Kanban card state.
 * Re-scope history/quotes/visits/jobs by time, then set each lead's stage
 * from its own history (latest lead with no history keeps the customer copy).
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      INSERT INTO leads (customer_id, source, message, status, next_action, stage, board_order, lost_reason, created_at, updated_at)
      SELECT c.id, COALESCE(c.source, 'manual'), NULL, 'ACTIONED', NULL, COALESCE(c.stage, 'ENQUIRY'),
             COALESCE(c.board_order, 0), c.lost_reason, c.created_at, COALESCE(c.updated_at, c.created_at)
      FROM customers c
      WHERE NOT EXISTS (SELECT 1 FROM leads l WHERE l.customer_id = c.id)
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
    await assignLead('stage_history');

    await queryInterface.sequelize.query(`
      UPDATE leads AS l SET
        stage = COALESCE((
          SELECT sh.to_stage FROM stage_history sh
          WHERE sh.lead_id = l.id
          ORDER BY sh.created_at DESC, sh.id DESC
          LIMIT 1
        ), 'ENQUIRY')
    `);

    await queryInterface.sequelize.query(`
      UPDATE leads AS l SET
        stage = c.stage,
        lost_reason = COALESCE(l.lost_reason, c.lost_reason)
      FROM customers c
      WHERE l.customer_id = c.id
        AND l.id = (
          SELECT l2.id FROM leads l2
          WHERE l2.customer_id = c.id
          ORDER BY l2.created_at DESC, l2.id DESC
          LIMIT 1
        )
        AND NOT EXISTS (SELECT 1 FROM stage_history sh WHERE sh.lead_id = l.id)
    `);

    await queryInterface.sequelize.query(`
      UPDATE leads AS l SET lost_reason = c.lost_reason
      FROM customers c
      WHERE l.customer_id = c.id
        AND l.stage = 'LOST'
        AND l.lost_reason IS NULL
        AND c.lost_reason IS NOT NULL
        AND l.id = (
          SELECT l2.id FROM leads l2
          WHERE l2.customer_id = c.id AND l2.stage = 'LOST'
          ORDER BY l2.created_at DESC, l2.id DESC
          LIMIT 1
        )
    `);

    await queryInterface.sequelize.query(`
      UPDATE leads AS l SET board_order = ranked.ord
      FROM (
        SELECT id, (ROW_NUMBER() OVER (PARTITION BY stage ORDER BY updated_at DESC NULLS LAST, id ASC) - 1) AS ord
        FROM leads
      ) AS ranked
      WHERE l.id = ranked.id
    `);
  },

  async down() {
    /* Irreversible data repair */
  },
};
