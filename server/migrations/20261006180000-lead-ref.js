'use strict';

/**
 * Sequential lead refs (L-0001) so inbox / pipeline titles match quote & invoice style.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('leads');
    if (!table.ref) {
      await queryInterface.addColumn('leads', 'ref', { type: Sequelize.TEXT, allowNull: true });
    }
    const [rows] = await queryInterface.sequelize.query(
      'SELECT id FROM leads WHERE ref IS NULL ORDER BY id ASC',
    );
    let n = 0;
    for (const row of rows || []) {
      n += 1;
      await queryInterface.sequelize.query(
        'UPDATE leads SET ref = :ref WHERE id = :id',
        { replacements: { ref: `L-${String(n).padStart(4, '0')}`, id: row.id } },
      );
    }
    await queryInterface.changeColumn('leads', 'ref', {
      type: Sequelize.TEXT,
      allowNull: false,
    });
    const indexes = await queryInterface.showIndex('leads');
    const has = (indexes || []).some((idx) => idx.name === 'leads_ref_unique');
    if (!has) {
      await queryInterface.addIndex('leads', ['ref'], { unique: true, name: 'leads_ref_unique' });
    }
  },

  async down(queryInterface) {
    const indexes = await queryInterface.showIndex('leads');
    const has = (indexes || []).some((idx) => idx.name === 'leads_ref_unique');
    if (has) await queryInterface.removeIndex('leads', 'leads_ref_unique');
    await queryInterface.removeColumn('leads', 'ref');
  },
};
