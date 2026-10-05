'use strict';

/**
 * Requirement 6.4 — toggle whether provisional sums are included in the grand total.
 * Invoices inherit the quote's provisional sums so billed totals stay consistent.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const { BOOLEAN, JSONB } = Sequelize;

    const quotes = await queryInterface.describeTable('quotes');
    if (!quotes.provisional_sums_in_total) {
      await queryInterface.addColumn('quotes', 'provisional_sums_in_total', {
        type: BOOLEAN,
        allowNull: false,
        defaultValue: false,
      });
    }

    const invoices = await queryInterface.describeTable('invoices');
    if (!invoices.provisional_sums) {
      await queryInterface.addColumn('invoices', 'provisional_sums', {
        type: JSONB,
        allowNull: false,
        defaultValue: [],
      });
    }
    if (!invoices.provisional_sums_in_total) {
      await queryInterface.addColumn('invoices', 'provisional_sums_in_total', {
        type: BOOLEAN,
        allowNull: false,
        defaultValue: false,
      });
    }
  },

  async down(queryInterface) {
    const quotes = await queryInterface.describeTable('quotes');
    if (quotes.provisional_sums_in_total) {
      await queryInterface.removeColumn('quotes', 'provisional_sums_in_total');
    }
    const invoices = await queryInterface.describeTable('invoices');
    if (invoices.provisional_sums_in_total) {
      await queryInterface.removeColumn('invoices', 'provisional_sums_in_total');
    }
    if (invoices.provisional_sums) {
      await queryInterface.removeColumn('invoices', 'provisional_sums');
    }
  },
};
