/**
 * Capture the same utterance the browser is transcribing so we can correct
 * it with Whisper when a key is configured (requirement 15.1).
 */
export function preferredRecorderMime() {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return '';
  return ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((type) => MediaRecorder.isTypeSupported(type)) || '';
}

export function createVoiceRecorder() {
  let recorder = null;
  let stream = null;
  let chunks = [];

  return {
    async start() {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return false;
      if (typeof MediaRecorder === 'undefined') return false;
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      chunks = [];
      const mime = preferredRecorderMime();
      recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size) chunks.push(event.data);
      };
      recorder.start(250);
      return true;
    },
    stop() {
      return new Promise((resolve) => {
        const finish = () => {
          stream?.getTracks().forEach((track) => track.stop());
          const type = recorder?.mimeType || 'audio/webm';
          const blob = chunks.length ? new Blob(chunks, { type }) : null;
          stream = null;
          recorder = null;
          chunks = [];
          resolve(blob);
        };
        if (!recorder || recorder.state === 'inactive') {
          finish();
          return;
        }
        recorder.onstop = finish;
        try {
          recorder.stop();
        } catch {
          finish();
        }
      });
    },
    dispose() {
      try { recorder?.stop(); } catch { /* ignore */ }
      stream?.getTracks().forEach((track) => track.stop());
      recorder = null;
      stream = null;
      chunks = [];
    },
  };
}
