'use strict';

/**
 * One site, phone and email per enquiry (lead workspace).
 * Backfill from meta json, then the customer's primary contacts.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('leads');
    if (!table.site_id) {
      await queryInterface.addColumn('leads', 'site_id', { type: Sequelize.INTEGER, allowNull: true });
    }
    if (!table.phone_id) {
      await queryInterface.addColumn('leads', 'phone_id', { type: Sequelize.INTEGER, allowNull: true });
    }
    if (!table.email_id) {
      await queryInterface.addColumn('leads', 'email_id', { type: Sequelize.INTEGER, allowNull: true });
    }

    await queryInterface.sequelize.query(`
      UPDATE leads SET
        site_id = COALESCE(site_id, NULLIF(meta->>'site_id', '')::integer),
        phone_id = COALESCE(phone_id, NULLIF(meta->>'phone_id', '')::integer),
        email_id = COALESCE(email_id, NULLIF(meta->>'email_id', '')::integer)
      WHERE meta IS NOT NULL
    `);

    await queryInterface.sequelize.query(`
      UPDATE leads l SET site_id = s.id
      FROM customer_sites s
      WHERE l.site_id IS NULL AND s.customer_id = l.customer_id AND s.is_primary = true
    `);
    await queryInterface.sequelize.query(`
      UPDATE leads l SET phone_id = p.id
      FROM customer_phones p
      WHERE l.phone_id IS NULL AND p.customer_id = l.customer_id AND p.is_primary = true
    `);
    await queryInterface.sequelize.query(`
      UPDATE leads l SET email_id = e.id
      FROM customer_emails e
      WHERE l.email_id IS NULL AND e.customer_id = l.customer_id AND e.is_primary = true
    `);

    const addFk = async (column, refTable) => {
      const name = `leads_${column}_fkey`;
      try {
        await queryInterface.addConstraint('leads', {
          fields: [column],
          type: 'foreign key',
          name,
          references: { table: refTable, field: 'id' },
          onDelete: 'RESTRICT',
          onUpdate: 'CASCADE',
        });
      } catch (err) {
        if (!String(err.message || err).includes('already exists')) throw err;
      }
    };
    await addFk('site_id', 'customer_sites');
    await addFk('phone_id', 'customer_phones');
    await addFk('email_id', 'customer_emails');
  },

  async down(queryInterface) {
    const table = await queryInterface.describeTable('leads');
    if (table.email_id) await queryInterface.removeColumn('leads', 'email_id');
    if (table.phone_id) await queryInterface.removeColumn('leads', 'phone_id');
    if (table.site_id) await queryInterface.removeColumn('leads', 'site_id');
  },
};
