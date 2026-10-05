jest.mock('../db', () => ({
  DATA_DIR: require('os').tmpdir(),
  setSetting: jest.fn(),
}));

const request = require('supertest');
const express = require('express');
const branding = require('../branding');

const app = express();
app.get('/api/branding/logo', (req, res) => branding.sendLogo(res));

describe('GET /api/branding/logo (requirement 17.3)', () => {
  test('is public and returns an image from the seed fallback', async () => {
    const res = await request(app).get('/api/branding/logo');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['content-type']).toMatch(/image\//);
  });
});
