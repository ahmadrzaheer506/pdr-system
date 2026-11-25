'use strict';

/**
 * Office can choose whether the CCR 2013 “right to cancel” page is on a quote PDF,
 * and can edit the notice wording. The statutory model form is unchanged.
 * Toggle defaults off for every quote.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const { BOOLEAN, TEXT } = Sequelize;
    const quotes = await queryInterface.describeTable('quotes');

    if (!quotes.cancellation_notice_text) {
      await queryInterface.addColumn('quotes', 'cancellation_notice_text', {
        type: TEXT,
        allowNull: true,
      });
    }

    await queryInterface.changeColumn('quotes', 'cancellation_rights_apply', {
      type: BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });

    await queryInterface.sequelize.query(
      'UPDATE quotes SET cancellation_rights_apply = false WHERE cancellation_rights_apply = true'
    );
  },

  async down(queryInterface, Sequelize) {
    const { BOOLEAN } = Sequelize;
    const quotes = await queryInterface.describeTable('quotes');
    if (quotes.cancellation_notice_text) {
      await queryInterface.removeColumn('quotes', 'cancellation_notice_text');
    }
    await queryInterface.changeColumn('quotes', 'cancellation_rights_apply', {
      type: BOOLEAN,
      allowNull: false,
      defaultValue: true,
    });
  },
};
