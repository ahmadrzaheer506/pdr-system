// ============================================================
// Sequelize instance — PostgreSQL via DATABASE_URL.
// ============================================================
require('../loadEnv');
const { Sequelize } = require('sequelize');
const { sequelizeDialectOptions } = require('./postgresSsl');

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  throw new Error(
    'DATABASE_URL is not set. Add it to .env (e.g. postgres://user:pass@localhost:5432/roofing_crm). See .env.example.'
  );
}

const sequelize = new Sequelize(DATABASE_URL, {
  dialect: 'postgres',
  logging: false,
  dialectOptions: sequelizeDialectOptions(DATABASE_URL),
  define: {
    freezeTableName: true,
    underscored: true,
  },
});

module.exports = { sequelize, Sequelize };
