'use strict';

/**
 * Requirement 5.2 — each office user has their own Google Calendar OAuth row.
 * Company tokens (QuickBooks) keep user_id NULL.
 */
module.exports = {
  async up(queryInterface) {
    const sequelize = queryInterface.sequelize;
    await sequelize.query(`
      ALTER TABLE oauth_tokens ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE CASCADE
    `);
    await sequelize.query(`
      ALTER TABLE oauth_tokens ADD COLUMN IF NOT EXISTS id INTEGER
    `);
    await sequelize.query(`
      CREATE SEQUENCE IF NOT EXISTS oauth_tokens_id_seq OWNED BY oauth_tokens.id
    `);
    await sequelize.query(`
      UPDATE oauth_tokens SET id = nextval('oauth_tokens_id_seq') WHERE id IS NULL
    `);
    await sequelize.query(`
      ALTER TABLE oauth_tokens ALTER COLUMN id SET DEFAULT nextval('oauth_tokens_id_seq')
    `);
    await sequelize.query(`
      ALTER TABLE oauth_tokens ALTER COLUMN id SET NOT NULL
    `);
    await sequelize.query(`
      ALTER TABLE oauth_tokens DROP CONSTRAINT IF EXISTS oauth_tokens_pkey
    `);
    await sequelize.query(`
      ALTER TABLE oauth_tokens ADD PRIMARY KEY (id)
    `);
    await sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_oauth_tokens_provider_company
      ON oauth_tokens (provider) WHERE user_id IS NULL
    `);
    await sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_oauth_tokens_provider_user
      ON oauth_tokens (provider, user_id) WHERE user_id IS NOT NULL
    `);
    await sequelize.query(`
      UPDATE oauth_tokens
      SET user_id = (SELECT id FROM users WHERE role = 'ADMIN' ORDER BY id ASC LIMIT 1)
      WHERE provider = 'google' AND user_id IS NULL
        AND EXISTS (SELECT 1 FROM users WHERE role = 'ADMIN')
    `);
  },

  async down(queryInterface) {
    const sequelize = queryInterface.sequelize;
    await sequelize.query(`DROP INDEX IF EXISTS idx_oauth_tokens_provider_user`);
    await sequelize.query(`DROP INDEX IF EXISTS idx_oauth_tokens_provider_company`);
    await sequelize.query(`ALTER TABLE oauth_tokens DROP CONSTRAINT IF EXISTS oauth_tokens_pkey`);
    await sequelize.query(`ALTER TABLE oauth_tokens DROP COLUMN IF EXISTS id`);
    await sequelize.query(`ALTER TABLE oauth_tokens DROP COLUMN IF EXISTS user_id`);
    await sequelize.query(`ALTER TABLE oauth_tokens ADD PRIMARY KEY (provider)`);
  },
};
