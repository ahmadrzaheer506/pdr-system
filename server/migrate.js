#!/usr/bin/env node
// Apply pending Sequelize/Umzug migrations without starting the HTTP server.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { initDb, sequelize } = require('./db');

initDb()
  .then(async () => {
    console.log('[db] migrations up to date');
    await sequelize.close();
  })
  .catch((err) => {
    console.error('[db] migration failed', err);
    process.exit(1);
  });
