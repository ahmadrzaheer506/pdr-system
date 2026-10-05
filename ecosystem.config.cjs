const path = require('path');

const root = __dirname;
const logs = path.join(root, 'data', 'logs');

const common = {
  cwd: root,
  interpreter: 'node',
  instances: 1,
  exec_mode: 'fork',
  autorestart: true,
  watch: false,
  max_memory_restart: '512M',
  min_uptime: '5s',
  restart_delay: 3000,
  kill_timeout: 8000,
  merge_logs: true,
  time: true,
};

/**
 * Two PM2 apps: API (cron + Express) and frontend (static + /api proxy).
 * Nginx can keep proxying to 127.0.0.1:4000 (frontend). API is internal on 4001.
 */
module.exports = {
  apps: [
    {
      ...common,
      name: 'pdr-api',
      script: path.join(root, 'server', 'index.js'),
      error_file: path.join(logs, 'pdr-api-error.log'),
      out_file: path.join(logs, 'pdr-api-out.log'),
      env: {
        NODE_ENV: 'production',
        HOST: '127.0.0.1',
        PORT: '4001',
        SERVE_FRONTEND: '0',
      },
    },
    {
      ...common,
      name: 'pdr-web',
      script: path.join(root, 'server', 'frontend.js'),
      error_file: path.join(logs, 'pdr-web-error.log'),
      out_file: path.join(logs, 'pdr-web-out.log'),
      env: {
        NODE_ENV: 'production',
        HOST: '127.0.0.1',
        FRONTEND_PORT: '4000',
        API_HOST: '127.0.0.1',
        API_PORT: '4001',
      },
    },
  ],
};
