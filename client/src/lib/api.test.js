import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readCookie, api } from './api.js';

describe('readCookie / CSRF header (requirement 1.3)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true }),
    })));
    Object.defineProperty(document, 'cookie', {
      writable: true,
      configurable: true,
      value: 'pdr_csrf=csrf-abc; other=1',
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads the CSRF cookie', () => {
    expect(readCookie('pdr_csrf')).toBe('csrf-abc');
  });

  it('sends X-CSRF-Token on mutating requests', async () => {
    await api.post('/auth/logout', {});
    expect(fetch).toHaveBeenCalledWith('/api/auth/logout', expect.objectContaining({
      method: 'POST',
      credentials: 'include',
      headers: expect.objectContaining({
        'X-CSRF-Token': 'csrf-abc',
        'Content-Type': 'application/json',
      }),
    }));
  });

  it('does not send X-CSRF-Token on GET', async () => {
    await api.get('/auth/me');
    const opts = fetch.mock.calls[0][1];
    expect(opts.headers).toBeUndefined();
  });

  it('downloads an authenticated file as a blob', async () => {
    const blob = new Blob(['%PDF'], { type: 'application/pdf' });
    fetch.mockResolvedValueOnce({
      ok: true,
      blob: async () => blob,
    });
    const click = vi.fn();
    const orig = document.createElement.bind(document);
    const spy = vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      const el = orig(tag);
      if (tag === 'a') el.click = click;
      return el;
    });
    const createObjectURL = vi.fn(() => 'blob:quote');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });

    await api.download('/files/quote-Q-2026-0001.pdf?download=1', 'Q-2026-0001.pdf');
    expect(fetch).toHaveBeenCalledWith('/api/files/quote-Q-2026-0001.pdf?download=1', expect.objectContaining({
      method: 'GET',
      credentials: 'include',
    }));
    expect(click).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('sends CSRF on multipart upload without forcing JSON Content-Type', async () => {
    const fd = new FormData();
    fd.append('file', new Blob(['x']), 'roof.jpg');
    await api.upload('/customers/9/files', fd);
    expect(fetch).toHaveBeenCalledWith('/api/customers/9/files', expect.objectContaining({
      method: 'POST',
      credentials: 'include',
      body: fd,
      headers: { 'X-CSRF-Token': 'csrf-abc' },
    }));
  });
});
