'use strict';

/**
 * Requirement 2.4 — dated internal notes and customer-only file attachments.
 * Notes are not enquiry messages. Files are not linked to quotes or jobs.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const { INTEGER, TEXT, DATE } = Sequelize;

    await queryInterface.createTable('customer_notes', {
      id: { type: INTEGER, primaryKey: true, autoIncrement: true },
      customer_id: {
        type: INTEGER, allowNull: false,
        references: { model: 'customers', key: 'id' },
        onDelete: 'CASCADE',
      },
      body: { type: TEXT, allowNull: false },
      user_id: {
        type: INTEGER, allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
      },
      created_at: { type: DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });
    await queryInterface.addIndex('customer_notes', ['customer_id'], { name: 'idx_customer_notes_customer' });

    await queryInterface.createTable('customer_files', {
      id: { type: INTEGER, primaryKey: true, autoIncrement: true },
      customer_id: {
        type: INTEGER, allowNull: false,
        references: { model: 'customers', key: 'id' },
        onDelete: 'CASCADE',
      },
      stored_name: { type: TEXT, allowNull: false },
      original_name: { type: TEXT, allowNull: false },
      mime: { type: TEXT, allowNull: false },
      size_bytes: { type: INTEGER, allowNull: false },
      user_id: {
        type: INTEGER, allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
      },
      created_at: { type: DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });
    await queryInterface.addIndex('customer_files', ['customer_id'], { name: 'idx_customer_files_customer' });
    await queryInterface.sequelize.query(
      "ALTER TABLE customer_files ADD CONSTRAINT customer_files_mime_check CHECK (mime IN ('image/jpeg','image/png','image/webp','application/pdf'))",
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable('customer_files');
    await queryInterface.dropTable('customer_notes');
  },
};
