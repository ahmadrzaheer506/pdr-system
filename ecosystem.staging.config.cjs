const path = require('path');

const root = __dirname;
const logs = path.join(root, 'data-staging', 'logs');
const envFile = path.join(root, '.env.staging');

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
 * Staging PM2 apps, loopback-only, alongside production (4000/4001).
 * Nginx (scripts/nginx/frontend-staging) proxies to pdr-staging-web :5000.
 * pdr-staging-web proxies /api and /public-files to pdr-staging-api :5001.
 */
module.exports = {
  apps: [
    {
      ...common,
      name: 'pdr-staging-api',
      script: path.join(root, 'server', 'index.js'),
      error_file: path.join(logs, 'pdr-staging-api-error.log'),
      out_file: path.join(logs, 'pdr-staging-api-out.log'),
      env: {
        NODE_ENV: 'production',
        HOST: '127.0.0.1',
        PORT: '5001',
        SERVE_FRONTEND: '0',
        ENV_FILE: envFile,
      },
    },
    {
      ...common,
      name: 'pdr-staging-web',
      script: path.join(root, 'server', 'frontend.js'),
      error_file: path.join(logs, 'pdr-staging-web-error.log'),
      out_file: path.join(logs, 'pdr-staging-web-out.log'),
      env: {
        NODE_ENV: 'production',
        HOST: '127.0.0.1',
        FRONTEND_PORT: '5000',
        API_HOST: '127.0.0.1',
        API_PORT: '5001',
        ENV_FILE: envFile,
      },
    },
  ],
};
