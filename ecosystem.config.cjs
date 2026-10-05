const path = require('path');

const root = __dirname;

/**
 * PM2 process file for DigitalOcean droplets.
 * One fork instance only — the server runs in-process cron (follow-ups,
 * overdue invoices, job starts). Cluster mode would duplicate that work.
 */
module.exports = {
  apps: [
    {
      name: 'pdr-system',
      cwd: root,
      script: path.join(root, 'server', 'index.js'),
      interpreter: 'node',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      min_uptime: '5s',
      restart_delay: 3000,
      kill_timeout: 8000,
      env: {
        NODE_ENV: 'production',
        HOST: '127.0.0.1',
        PORT: '4000',
      },
      error_file: path.join(root, 'data', 'logs', 'pm2-error.log'),
      out_file: path.join(root, 'data', 'logs', 'pm2-out.log'),
      merge_logs: true,
      time: true,
    },
  ],
};
