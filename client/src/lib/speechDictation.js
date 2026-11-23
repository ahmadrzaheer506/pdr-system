/**
 * Browser speech-to-text for the schedule composer (requirement 15.1).
 *
 * Chrome/Edge send audio to the cloud and often end the session after a short
 * pause. We rebuild the current phrase from the result list (no double-append)
 * and restart while the mic is still on so later sentences are not dropped.
 */

export function speechRecognitionCtor() {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

export function bestAlternative(result) {
  if (!result || !result.length) return { transcript: '', confidence: 0 };
  let best = result[0];
  for (let i = 1; i < result.length; i++) {
    if ((Number(result[i].confidence) || 0) > (Number(best.confidence) || 0)) best = result[i];
  }
  return best;
}

export function splitRecognitionResults(results) {
  let finals = '';
  let interim = '';
  const list = results || [];
  for (let i = 0; i < list.length; i++) {
    const text = String(bestAlternative(list[i]).transcript || '');
    if (list[i].isFinal) finals += text;
    else interim += text;
  }
  return { finals, interim };
}

export function normalizeSpoken(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

/** True when the next Chrome burst would otherwise start a new “sentence”. */
export function isMidSentence(text) {
  const t = String(text || '').replace(/\s+$/g, '');
  if (!t) return false;
  if (/[.!?]$/.test(t)) return false;
  if (/[:;]$/.test(t)) return false;
  return /[A-Za-z0-9)]$/.test(t);
}

/**
 * Chrome capitalises the first word of every restart. That turns
 * “a verb that express…” into “Express one complete thought”.
 * Only soften closed-class words so names like Ryan stay capitalised.
 */
const RESTART_SOFTEN = new Set([
  'a', 'an', 'the', 'and', 'but', 'or', 'for', 'nor', 'so', 'yet',
  'with', 'that', 'this', 'these', 'those', 'then', 'than', 'thus',
  'please', 'also', 'just', 'because', 'after', 'before', 'while',
  'as', 'if', 'when', 'where', 'what', 'which', 'who',
  'to', 'of', 'in', 'on', 'at', 'from', 'by', 'into', 'over', 'about',
  'it', 'he', 'she', 'we', 'they', 'you', 'my', 'your', 'our', 'their',
  'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'has', 'have', 'had', 'do', 'does', 'did',
  'create', 'express', 'get', 'make', 'put', 'take', 'give', 'keep',
  'hello', 'hi', 'want', 'need', 'use', 'one',
]);

export function softenRestartCapital(previous, next) {
  const body = normalizeSpoken(next);
  if (!body || !isMidSentence(previous)) return body;
  const match = body.match(/^([A-Za-z][A-Za-z']*)([\s\S]*)$/);
  if (!match) return body;
  const word = match[1];
  if (/^I(?:'[\w]+)?$/.test(word)) return body;
  if (RESTART_SOFTEN.has(word.toLowerCase())) return word.toLowerCase() + match[2];
  return body;
}

export function glueDictation(prefix, spoken, interim = '') {
  const head = String(prefix || '').replace(/[ \t]+$/g, '');
  const raw = `${spoken || ''}${spoken && interim ? ' ' : ''}${interim || ''}`;
  const body = softenRestartCapital(head, raw);
  if (!head) return body;
  if (!body) return head;
  const needsSpace = !/[\s\n]$/.test(head);
  return needsSpace ? `${head} ${body}` : `${head}${body}`;
}

export function shouldRestartRecognition(errorName, wantListening) {
  if (!wantListening) return false;
  if (!errorName) return true;
  return errorName === 'no-speech';
}

/**
 * One click-to-talk session. `getPrefix` is the textarea when the mic opens so
 * typed notes stay; each Chrome restart folds finished speech into that prefix.
 */
export function createDictationSession({
  Recognition,
  getPrefix,
  onUpdate,
  onListeningChange,
  onError,
}) {
  let recog = null;
  let want = false;
  let base = '';
  let lastFinals = '';
  let lastInterim = '';

  const publish = (interim = '') => {
    onUpdate?.(glueDictation(base, lastFinals, interim));
  };

  const foldFinals = () => {
    base = glueDictation(base, lastFinals, lastInterim);
    lastFinals = '';
    lastInterim = '';
  };

  const attach = () => {
    const instance = new Recognition();
    recog = instance;
    instance.lang = typeof navigator !== 'undefined' && String(navigator.language || '').toLowerCase().startsWith('en')
      ? navigator.language
      : 'en-GB';
    instance.continuous = true;
    instance.interimResults = true;
    instance.maxAlternatives = 3;
    instance.onresult = (event) => {
      if (recog !== instance) return;
      const { finals, interim } = splitRecognitionResults(event.results);
      lastFinals = finals;
      lastInterim = interim;
      publish(interim);
    };
    instance.onspeechstart = () => {
      if (recog !== instance) return;
      onListeningChange?.(true, 'speech');
    };
    instance.onerror = (event) => {
      if (recog !== instance) return;
      const name = event?.error;
      if (name === 'not-allowed' || name === 'service-not-allowed') {
        want = false;
        onError?.('Microphone is blocked. Allow it for this site, or type the instruction.');
        return;
      }
      if (name === 'audio-capture') {
        want = false;
        onError?.('No microphone found. Plug one in, or type the instruction.');
        return;
      }
      if (name === 'network') {
        want = false;
        onError?.('Voice dropped (network). Tap the mic and try again.');
      }
    };
    instance.onend = () => {
      if (recog !== instance) return;
      foldFinals();
      publish('');
      if (shouldRestartRecognition(null, want)) {
        try {
          instance.start();
        } catch {
          onListeningChange?.(false);
        }
        return;
      }
      want = false;
      onListeningChange?.(false);
    };
  };

  return {
    start() {
      if (want && recog) return;
      base = String(getPrefix?.() || '');
      lastFinals = '';
      lastInterim = '';
      want = true;
      attach();
      try {
        recog.start();
        onListeningChange?.(true);
      } catch (err) {
        want = false;
        onListeningChange?.(false);
        onError?.(err?.message || 'Could not start the microphone.');
      }
    },
    stop() {
      want = false;
      foldFinals();
      publish('');
      try { recog?.stop(); } catch { /* already stopping */ }
      onListeningChange?.(false);
    },
    dispose() {
      want = false;
      try { recog?.abort(); } catch { /* ignore */ }
      recog = null;
    },
  };
}
