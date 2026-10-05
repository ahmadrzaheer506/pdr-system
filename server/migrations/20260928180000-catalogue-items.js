'use strict';

/**
 * Requirement 17.2 — service catalogue as its own table with CRUD + search.
 * Seeded with the 6.1 quote-builder rows so existing quotes still pick the same ids.
 */
const { CATALOGUE } = require('../catalogue');

module.exports = {
  async up(queryInterface, Sequelize) {
    const { TEXT, DOUBLE, DATE } = Sequelize;
    const tables = await queryInterface.showAllTables();
    const names = tables.map((t) => (typeof t === 'string' ? t : t.tableName || t.name));
    if (!names.includes('catalogue_items')) {
      await queryInterface.createTable('catalogue_items', {
        id: { type: TEXT, primaryKey: true },
        description: { type: TEXT, allowNull: false },
        unit: { type: TEXT, allowNull: false },
        unit_price: { type: DOUBLE, allowNull: false },
        vat_code: { type: TEXT, allowNull: false },
        kind: { type: TEXT, allowNull: false },
        created_at: { type: DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
        updated_at: { type: DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      });
      await queryInterface.addIndex('catalogue_items', ['kind'], { name: 'catalogue_items_kind' });
      await queryInterface.addIndex('catalogue_items', ['description'], { name: 'catalogue_items_description' });
    }
    const now = new Date();
    await queryInterface.bulkInsert(
      'catalogue_items',
      CATALOGUE.map((row) => ({
        id: row.id,
        description: row.description,
        unit: row.unit,
        unit_price: row.unit_price,
        vat_code: row.vat_code,
        kind: row.kind,
        created_at: now,
        updated_at: now,
      })),
      { ignoreDuplicates: true },
    );
  },

  async down(queryInterface) {
    const tables = await queryInterface.showAllTables();
    const names = tables.map((t) => (typeof t === 'string' ? t : t.tableName || t.name));
    if (names.includes('catalogue_items')) {
      await queryInterface.dropTable('catalogue_items');
    }
  },
};
