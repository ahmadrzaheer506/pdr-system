const { hashResetToken, createResetToken, spaOrigin, resetLink, RESET_TTL_MS } = require('../passwordReset');

describe('passwordReset helpers (requirement 1.7)', () => {
  const originalAppUrl = process.env.APP_URL;

  afterEach(() => {
    process.env.APP_URL = originalAppUrl;
  });

  test('hashes tokens with SHA-256 hex', () => {
    expect(hashResetToken('abc')).toMatch(/^[a-f0-9]{64}$/);
    expect(hashResetToken('abc')).toBe(hashResetToken('abc'));
    expect(hashResetToken('abc')).not.toBe(hashResetToken('abd'));
  });

  test('issues a one-hour token', () => {
    const before = Date.now();
    const { token, hash, expires } = createResetToken();
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).toBe(hashResetToken(token));
    expect(expires.getTime()).toBeGreaterThanOrEqual(before + RESET_TTL_MS - 50);
    expect(expires.getTime()).toBeLessThanOrEqual(Date.now() + RESET_TTL_MS + 50);
  });

  test('maps local API origin to the Vite SPA', () => {
    process.env.APP_URL = 'http://localhost:4000';
    expect(spaOrigin()).toBe('http://localhost:5173');
    expect(resetLink('tok')).toBe('http://localhost:5173/reset-password?token=tok');
  });
});
