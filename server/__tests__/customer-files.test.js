jest.mock('../models', () => ({
  CustomerFile: {},
  User: {},
}));
jest.mock('../db', () => ({
  DATA_DIR: '/tmp',
  plain: (row) => (row && typeof row.toJSON === 'function' ? row.toJSON() : row),
}));

const { validateUpload, ALLOWED_MIME, MAX_BYTES } = require('../customerFiles');

describe('customer file validation (requirement 2.4)', () => {
  test('allows jpeg, png, webp, and pdf up to 10MB', () => {
    expect(Object.keys(ALLOWED_MIME).sort()).toEqual([
      'application/pdf', 'image/jpeg', 'image/png', 'image/webp',
    ]);
    expect(MAX_BYTES).toBe(10 * 1024 * 1024);
    const ok = validateUpload({
      buffer: Buffer.from('%PDF-1.4'),
      mimetype: 'application/pdf',
      originalname: 'survey.pdf',
      size: 1200,
    });
    expect(ok.ok).toBe(true);
    expect(ok.ext).toBe('pdf');
    expect(ok.original_name).toBe('survey.pdf');
  });

  test('rejects missing files, wrong types, and oversized payloads', () => {
    expect(validateUpload(undefined).error).toBe('File required');
    expect(validateUpload({
      buffer: Buffer.from('x'),
      mimetype: 'text/plain',
      originalname: 'notes.txt',
      size: 1,
    }).error).toMatch(/JPEG, PNG, WebP, and PDF/);
    expect(validateUpload({
      buffer: Buffer.alloc(1),
      mimetype: 'image/jpeg',
      originalname: 'huge.jpg',
      size: MAX_BYTES + 1,
    }).error).toMatch(/10MB/);
  });
});
