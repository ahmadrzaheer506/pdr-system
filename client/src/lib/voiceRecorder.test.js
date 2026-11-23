import { describe, it, expect, vi, afterEach } from 'vitest';
import { preferredRecorderMime, createVoiceRecorder } from './voiceRecorder.js';

describe('voiceRecorder', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('picks a supported mime type', () => {
    vi.stubGlobal('MediaRecorder', {
      isTypeSupported: (type) => type === 'audio/webm',
    });
    expect(preferredRecorderMime()).toBe('audio/webm');
  });

  it('returns false when the browser has no getUserMedia', async () => {
    vi.stubGlobal('navigator', {});
    const rec = createVoiceRecorder();
    expect(await rec.start()).toBe(false);
  });
});
