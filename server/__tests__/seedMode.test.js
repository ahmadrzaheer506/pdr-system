const { resolveSeedMode, isFullSeed } = require('../seedMode');

describe('resolveSeedMode', () => {
  test('production APP_ENV seeds core data only', () => {
    expect(resolveSeedMode({ APP_ENV: 'production' })).toBe('core');
    expect(resolveSeedMode({ APP_ENV: 'prod' })).toBe('core');
    expect(isFullSeed({ APP_ENV: 'production' })).toBe(false);
  });

  test('development and staging seed the full demo', () => {
    expect(resolveSeedMode({ APP_ENV: 'development' })).toBe('full');
    expect(resolveSeedMode({ APP_ENV: 'staging' })).toBe('full');
    expect(resolveSeedMode({})).toBe('full');
    expect(isFullSeed({ APP_ENV: 'staging' })).toBe(true);
  });

  test('SEED_MODE overrides APP_ENV', () => {
    expect(resolveSeedMode({ APP_ENV: 'production', SEED_MODE: 'full' })).toBe('full');
    expect(resolveSeedMode({ APP_ENV: 'development', SEED_MODE: 'core' })).toBe('core');
  });

  test('NODE_ENV=production is treated as core when APP_ENV is unset', () => {
    expect(resolveSeedMode({ NODE_ENV: 'production' })).toBe('core');
  });
});
