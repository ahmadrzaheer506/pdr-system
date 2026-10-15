// Sequelize CLI connection config. Application code uses config/database.js.
require('../loadEnv');
const { sequelizeDialectOptions } = require('./postgresSsl');

const shared = {
  url: process.env.DATABASE_URL,
  dialect: 'postgres',
  logging: false,
  dialectOptions: sequelizeDialectOptions(process.env.DATABASE_URL || ''),
};

module.exports = {
  development: { ...shared },
  test: { ...shared },
  production: { ...shared },
};
