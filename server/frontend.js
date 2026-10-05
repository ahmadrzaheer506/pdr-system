#!/usr/bin/env node
/**
 * Production frontend process: serves client/dist and proxies /api
 * and /public-files to the API PM2 process so the SPA keeps same-origin cookies.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const http = require('http');
const path = require('path');
const express = require('express');

const HOST = process.env.HOST || '127.0.0.1';
const FRONTEND_PORT = Number(process.env.FRONTEND_PORT) || 4000;
const API_HOST = process.env.API_HOST || '127.0.0.1';
const API_PORT = Number(process.env.API_PORT) || 4001;
const dist = path.join(__dirname, '..', 'client', 'dist');

const app = express();

function proxyToApi(req, res) {
  const headers = { ...req.headers };
  headers['x-forwarded-for'] = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
  headers['x-forwarded-proto'] = req.headers['x-forwarded-proto'] || 'http';
  const upstream = http.request(
    {
      hostname: API_HOST,
      port: API_PORT,
      path: req.originalUrl,
      method: req.method,
      headers,
    },
    (incoming) => {
      res.writeHead(incoming.statusCode || 502, incoming.headers);
      incoming.pipe(res);
    },
  );
  upstream.on('error', (err) => {
    console.error('[frontend] API proxy failed:', err.message);
    if (!res.headersSent) res.status(502).json({ error: 'API unavailable' });
  });
  req.pipe(upstream);
}

app.use('/api', proxyToApi);
app.use('/public-files', proxyToApi);
app.use(express.static(dist));
app.get(/^(?!\/api|\/public-files).*/, (req, res, next) => {
  res.sendFile(path.join(dist, 'index.html'), (err) => { if (err) next(); });
});

app.listen(FRONTEND_PORT, HOST, () => {
  console.log(`  Frontend http://${HOST}:${FRONTEND_PORT} → API http://${API_HOST}:${API_PORT}`);
});
