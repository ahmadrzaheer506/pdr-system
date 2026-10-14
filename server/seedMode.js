/**
 * Seed depth from APP_ENV / SEED_MODE.
 * production → core only (settings, skills, job types, catalogue, optional admin).
 * development / staging → full demo customers, jobs, and dummy staff.
 */
const FULL = 'full';
const CORE = 'core';

function resolveSeedMode(env = process.env) {
  const explicit = String(env.SEED_MODE || '').toLowerCase().trim();
  if (explicit === FULL || explicit === 'demo') return FULL;
  if (explicit === CORE || explicit === 'necessary') return CORE;
  const appEnv = String(env.APP_ENV || env.NODE_ENV || 'development').toLowerCase().trim();
  if (appEnv === 'production' || appEnv === 'prod') return CORE;
  return FULL;
}

function isFullSeed(env = process.env) {
  return resolveSeedMode(env) === FULL;
}

module.exports = { FULL, CORE, resolveSeedMode, isFullSeed };
