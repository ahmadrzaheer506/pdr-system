const path = require('path');

const root = path.join(__dirname, '..');
const envFile = process.env.ENV_FILE || path.join(root, '.env');
require('dotenv').config({ path: envFile });
