const fs = require('fs');
const path = require('path');
const request = require('supertest');
const express = require('express');

jest.mock('../db', () => {
  const nodePath = require('path');
  const nodeFs = require('fs');
  const nodeOs = require('os');
  const dir = nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), 'pdr-brand-'));
  return {
    DATA_DIR: dir,
    setSetting: jest.fn(async () => {}),
  };
});

const { DATA_DIR, setSetting } = require('../db');
const branding = require('../branding');

describe('branding logo (requirement 17.3)', () => {
  test('accepts PNG/JPEG up to 2MB and rejects other types', () => {
    expect(branding.MAX_BYTES).toBe(2 * 1024 * 1024);
    expect(Object.keys(branding.ALLOWED_MIME).sort()).toEqual(['image/jpeg', 'image/png']);
    expect(branding.validateUpload({
      buffer: Buffer.from([0x89, 0x50]),
      mimetype: 'image/png',
      size: 12,
    }).ok).toBe(true);
    expect(branding.validateUpload({
      buffer: Buffer.from('x'),
      mimetype: 'image/webp',
      size: 1,
    }).error).toMatch(/PNG and JPEG/);
    expect(branding.validateUpload({
      buffer: Buffer.alloc(1),
      mimetype: 'image/jpeg',
      size: branding.MAX_BYTES + 1,
    }).error).toMatch(/2MB/);
  });

  test('saveLogo writes brand-logo.png and records the file name', async () => {
    const saved = await branding.saveLogo({
      buffer: Buffer.from('png-bytes'),
      mimetype: 'image/png',
      size: 9,
    });
    expect(saved.branding.logo_file).toBe('brand-logo.png');
    expect(saved.branding.uploaded).toBe(true);
    expect(setSetting).toHaveBeenCalledWith('branding', { logo_file: 'brand-logo.png' });
    const dest = path.join(DATA_DIR, 'files', 'brand-logo.png');
    expect(fs.existsSync(dest)).toBe(true);
    expect(branding.hasUploadedLogo()).toBe(true);
    expect(branding.resolveLogoPath()).toBe(dest);
  });

  test('public GET /api/branding/logo serves the file', async () => {
    const app = express();
    app.get('/api/branding/logo', (req, res) => branding.sendLogo(res));
    const res = await request(app).get('/api/branding/logo');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['content-type']).toMatch(/image\//);
  });

  test('mimeForPath is exported so Mailgun can set the logo Content-Type', () => {
    expect(typeof branding.mimeForPath).toBe('function');
    expect(branding.mimeForPath('brand-logo.png')).toBe('image/png');
    expect(branding.mimeForPath('C:\\files\\brand-logo.JPG')).toBe('image/jpeg');
    expect(branding.mimeForPath(null)).toBe('image/png');
  });

  test('sendLogo serves the uploaded file', () => {
    const res = {
      setHeader: jest.fn(),
      sendFile: jest.fn(),
      status: jest.fn(function status() { return this; }),
      json: jest.fn(),
    };
    branding.sendLogo(res);
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'image/png');
    expect(res.sendFile).toHaveBeenCalled();
  });
});
