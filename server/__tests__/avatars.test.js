const fs = require('fs');
const path = require('path');

jest.mock('../db', () => {
  const nodePath = require('path');
  const nodeFs = require('fs');
  const nodeOs = require('os');
  const dir = nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), 'pdr-avatar-'));
  return { DATA_DIR: dir };
});

const { DATA_DIR } = require('../db');
const avatars = require('../avatars');

describe('user avatars', () => {
  test('accepts PNG/JPEG up to 2MB and rejects other types', () => {
    expect(avatars.MAX_BYTES).toBe(2 * 1024 * 1024);
    expect(Object.keys(avatars.ALLOWED_MIME).sort()).toEqual(['image/jpeg', 'image/png']);
    expect(avatars.validateUpload({
      buffer: Buffer.from([0x89, 0x50]),
      mimetype: 'image/png',
      size: 12,
    }).ok).toBe(true);
    expect(avatars.validateUpload({
      buffer: Buffer.from('x'),
      mimetype: 'image/webp',
      size: 1,
    }).error).toMatch(/PNG and JPEG/);
  });

  test('saveAvatar writes avatar-{id}.png', () => {
    const saved = avatars.saveAvatar(4, {
      buffer: Buffer.from('png-bytes'),
      mimetype: 'image/png',
      size: 9,
    });
    expect(saved.avatar_file).toBe('avatar-4.png');
    const dest = path.join(DATA_DIR, 'files', 'avatar-4.png');
    expect(fs.existsSync(dest)).toBe(true);
    expect(avatars.resolveAvatarPath(4, 'avatar-4.png')).toBe(dest);
  });

  test('removeAvatar deletes the file', () => {
    avatars.saveAvatar(4, {
      buffer: Buffer.from('png-bytes'),
      mimetype: 'image/png',
      size: 9,
    });
    avatars.removeAvatar(4);
    expect(fs.existsSync(path.join(DATA_DIR, 'files', 'avatar-4.png'))).toBe(false);
  });
});
