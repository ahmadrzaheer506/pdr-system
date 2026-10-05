'use strict';

/**
 * Requirement 6.5 — optional extras (listed, not in the quoted total) and
 * quote revisions (duplicate as a new ref).
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const { JSONB, INTEGER } = Sequelize;
    const quotes = await queryInterface.describeTable('quotes');

    if (!quotes.optional_extras) {
      await queryInterface.addColumn('quotes', 'optional_extras', {
        type: JSONB,
        allowNull: false,
        defaultValue: [],
      });
    }
    if (!quotes.accepted_optional_extras) {
      await queryInterface.addColumn('quotes', 'accepted_optional_extras', {
        type: JSONB,
        allowNull: false,
        defaultValue: [],
      });
    }
    if (!quotes.revised_from_id) {
      await queryInterface.addColumn('quotes', 'revised_from_id', {
        type: INTEGER,
        allowNull: true,
        references: { model: 'quotes', key: 'id' },
        onDelete: 'SET NULL',
      });
    }
  },

  async down(queryInterface) {
    const quotes = await queryInterface.describeTable('quotes');
    if (quotes.revised_from_id) {
      await queryInterface.removeColumn('quotes', 'revised_from_id');
    }
    if (quotes.accepted_optional_extras) {
      await queryInterface.removeColumn('quotes', 'accepted_optional_extras');
    }
    if (quotes.optional_extras) {
      await queryInterface.removeColumn('quotes', 'optional_extras');
    }
  },
};
