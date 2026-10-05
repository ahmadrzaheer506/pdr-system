'use strict';

/**
 * Requirement 2.2 — multiple site addresses, contact numbers, and emails.
 * Moves customers.phone / email / address / postcode into child tables with
 * exactly one primary per list when the list is non-empty. Quotes, jobs, and
 * site visits store which site / phone / email they use.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const { INTEGER, TEXT, BOOLEAN, DATE } = Sequelize;

    await queryInterface.createTable('customer_sites', {
      id: { type: INTEGER, primaryKey: true, autoIncrement: true },
      customer_id: {
        type: INTEGER, allowNull: false,
        references: { model: 'customers', key: 'id' },
        onDelete: 'CASCADE',
      },
      address: { type: TEXT, allowNull: false },
      postcode: { type: TEXT },
      is_primary: { type: BOOLEAN, allowNull: false, defaultValue: false },
      created_at: { type: DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });
    await queryInterface.addIndex('customer_sites', ['customer_id'], { name: 'idx_customer_sites_customer' });
    await queryInterface.sequelize.query(
      'CREATE UNIQUE INDEX customer_sites_one_primary ON customer_sites (customer_id) WHERE is_primary',
    );

    await queryInterface.createTable('customer_phones', {
      id: { type: INTEGER, primaryKey: true, autoIncrement: true },
      customer_id: {
        type: INTEGER, allowNull: false,
        references: { model: 'customers', key: 'id' },
        onDelete: 'CASCADE',
      },
      value: { type: TEXT, allowNull: false },
      type: { type: TEXT, allowNull: false },
      is_primary: { type: BOOLEAN, allowNull: false, defaultValue: false },
      created_at: { type: DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });
    await queryInterface.addIndex('customer_phones', ['customer_id'], { name: 'idx_customer_phones_customer' });
    await queryInterface.sequelize.query(
      "ALTER TABLE customer_phones ADD CONSTRAINT customer_phones_type_check CHECK (type IN ('mobile','landline','work'))",
    );
    await queryInterface.sequelize.query(
      'CREATE UNIQUE INDEX customer_phones_one_primary ON customer_phones (customer_id) WHERE is_primary',
    );

    await queryInterface.createTable('customer_emails', {
      id: { type: INTEGER, primaryKey: true, autoIncrement: true },
      customer_id: {
        type: INTEGER, allowNull: false,
        references: { model: 'customers', key: 'id' },
        onDelete: 'CASCADE',
      },
      value: { type: TEXT, allowNull: false },
      type: { type: TEXT, allowNull: false },
      is_primary: { type: BOOLEAN, allowNull: false, defaultValue: false },
      created_at: { type: DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });
    await queryInterface.addIndex('customer_emails', ['customer_id'], { name: 'idx_customer_emails_customer' });
    await queryInterface.sequelize.query(
      "ALTER TABLE customer_emails ADD CONSTRAINT customer_emails_type_check CHECK (type IN ('personal','work'))",
    );
    await queryInterface.sequelize.query(
      'CREATE UNIQUE INDEX customer_emails_one_primary ON customer_emails (customer_id) WHERE is_primary',
    );

    await queryInterface.sequelize.query(`
      INSERT INTO customer_phones (customer_id, value, type, is_primary, created_at)
      SELECT id, TRIM(phone), 'mobile', TRUE, COALESCE(created_at, NOW())
      FROM customers
      WHERE phone IS NOT NULL AND TRIM(phone) <> ''
    `);
    await queryInterface.sequelize.query(`
      INSERT INTO customer_emails (customer_id, value, type, is_primary, created_at)
      SELECT id, TRIM(email), 'personal', TRUE, COALESCE(created_at, NOW())
      FROM customers
      WHERE email IS NOT NULL AND TRIM(email) <> ''
    `);
    await queryInterface.sequelize.query(`
      INSERT INTO customer_sites (customer_id, address, postcode, is_primary, created_at)
      SELECT id, TRIM(address), NULLIF(TRIM(postcode), ''), TRUE, COALESCE(created_at, NOW())
      FROM customers
      WHERE address IS NOT NULL AND TRIM(address) <> ''
    `);

    const fk = (table, column, refTable) => queryInterface.addColumn(table, column, {
      type: INTEGER,
      allowNull: true,
      references: { model: refTable, key: 'id' },
      onDelete: 'RESTRICT',
      onUpdate: 'CASCADE',
    });

    await fk('quotes', 'site_id', 'customer_sites');
    await fk('quotes', 'phone_id', 'customer_phones');
    await fk('quotes', 'email_id', 'customer_emails');
    await fk('jobs', 'site_id', 'customer_sites');
    await fk('jobs', 'phone_id', 'customer_phones');
    await fk('jobs', 'email_id', 'customer_emails');
    await fk('appointments', 'site_id', 'customer_sites');
    await fk('appointments', 'phone_id', 'customer_phones');
    await fk('appointments', 'email_id', 'customer_emails');

    for (const table of ['quotes', 'jobs', 'appointments']) {
      await queryInterface.sequelize.query(`
        UPDATE ${table} t SET site_id = s.id
        FROM customer_sites s
        WHERE s.customer_id = t.customer_id AND s.is_primary
      `);
      await queryInterface.sequelize.query(`
        UPDATE ${table} t SET phone_id = p.id
        FROM customer_phones p
        WHERE p.customer_id = t.customer_id AND p.is_primary
      `);
      await queryInterface.sequelize.query(`
        UPDATE ${table} t SET email_id = e.id
        FROM customer_emails e
        WHERE e.customer_id = t.customer_id AND e.is_primary
      `);
    }

    await queryInterface.removeIndex('customers', 'idx_customers_phone');
    await queryInterface.removeIndex('customers', 'idx_customers_email');
    await queryInterface.removeColumn('customers', 'phone');
    await queryInterface.removeColumn('customers', 'email');
    await queryInterface.removeColumn('customers', 'address');
    await queryInterface.removeColumn('customers', 'postcode');
  },

  async down(queryInterface, Sequelize) {
    const { TEXT } = Sequelize;
    await queryInterface.addColumn('customers', 'phone', { type: TEXT });
    await queryInterface.addColumn('customers', 'email', { type: TEXT });
    await queryInterface.addColumn('customers', 'address', { type: TEXT });
    await queryInterface.addColumn('customers', 'postcode', { type: TEXT });

    await queryInterface.sequelize.query(`
      UPDATE customers c SET phone = p.value
      FROM customer_phones p WHERE p.customer_id = c.id AND p.is_primary
    `);
    await queryInterface.sequelize.query(`
      UPDATE customers c SET email = e.value
      FROM customer_emails e WHERE e.customer_id = c.id AND e.is_primary
    `);
    await queryInterface.sequelize.query(`
      UPDATE customers c SET address = s.address, postcode = s.postcode
      FROM customer_sites s WHERE s.customer_id = c.id AND s.is_primary
    `);

    await queryInterface.addIndex('customers', ['phone'], { name: 'idx_customers_phone' });
    await queryInterface.addIndex('customers', ['email'], { name: 'idx_customers_email' });

    for (const table of ['quotes', 'jobs', 'appointments']) {
      await queryInterface.removeColumn(table, 'site_id');
      await queryInterface.removeColumn(table, 'phone_id');
      await queryInterface.removeColumn(table, 'email_id');
    }

    await queryInterface.dropTable('customer_emails');
    await queryInterface.dropTable('customer_phones');
    await queryInterface.dropTable('customer_sites');
  },
};
