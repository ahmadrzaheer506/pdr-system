/**
 * Postgres SSL flags for DigitalOcean managed databases and other hosted
 * Postgres. Connection strings often include `sslmode=require`.
 *
 * @param {string} databaseUrl
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {object|undefined} sequelize dialectOptions.ssl, or undefined
 */
function postgresSslOptions(databaseUrl, env = process.env) {
  const explicit = String(env.DATABASE_SSL || '').toLowerCase();
  if (explicit === '0' || explicit === 'false') return undefined;

  const fromUrl = /[?&]sslmode=(require|verify-ca|verify-full)/i.test(databaseUrl || '');
  if (!(explicit === '1' || explicit === 'true' || fromUrl)) return undefined;

  const ssl = { require: true };
  if (env.DATABASE_SSL_CA) {
    const fs = require('fs');
    ssl.ca = fs.readFileSync(env.DATABASE_SSL_CA, 'utf8');
    ssl.rejectUnauthorized = true;
    return ssl;
  }
  ssl.rejectUnauthorized = env.DATABASE_SSL_REJECT_UNAUTHORIZED === 'true';
  return ssl;
}

function sequelizeDialectOptions(databaseUrl, env = process.env) {
  const ssl = postgresSslOptions(databaseUrl, env);
  return ssl ? { ssl } : {};
}

module.exports = { postgresSslOptions, sequelizeDialectOptions };
