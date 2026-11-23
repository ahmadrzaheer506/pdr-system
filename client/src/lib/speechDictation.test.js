import { describe, it, expect, vi } from 'vitest';
import {
  bestAlternative,
  splitRecognitionResults,
  glueDictation,
  shouldRestartRecognition,
  softenRestartCapital,
  createDictationSession,
} from './speechDictation.js';

function result(text, isFinal, alts = []) {
  const row = [{ transcript: text, confidence: 0.6 }, ...alts];
  row.isFinal = isFinal;
  return row;
}

describe('speechDictation', () => {
  it('picks the highest-confidence alternative', () => {
    const row = result('wrong', true, [
      { transcript: 'Connor is off sick', confidence: 0.92 },
      { transcript: 'conor', confidence: 0.4 },
    ]);
    expect(bestAlternative(row).transcript).toBe('Connor is off sick');
  });

  it('rebuilds finals and interim instead of appending twice', () => {
    const results = [
      result('Connor is off', true),
      result(' sick', true),
      result(' Ryan has the van', false),
    ];
    expect(splitRecognitionResults(results)).toEqual({
      finals: 'Connor is off sick',
      interim: ' Ryan has the van',
    });
  });

  it('keeps typed notes and joins spoken text with a single space', () => {
    expect(glueDictation('Priority: Fitch.', 'Connor is off sick')).toBe(
      'Priority: Fitch. Connor is off sick',
    );
    expect(glueDictation('', '  Hello   what  are you doing  ')).toBe('Hello what are you doing');
  });

  it('drops false capitals when Chrome restarts mid-sentence', () => {
    expect(softenRestartCapital(
      'A simple sentence has one independent clause with a subject and a verb that',
      'Express one complete thought',
    )).toBe('express one complete thought');
    expect(softenRestartCapital('Hello I want to create a new job', 'For our customer')).toBe('for our customer');
    expect(softenRestartCapital('Connor is off sick.', 'Ryan has the van')).toBe('Ryan has the van');
    expect(glueDictation(
      'A simple sentence has one independent clause with a subject and a verb that',
      'Express one complete thought',
    )).toBe('A simple sentence has one independent clause with a subject and a verb that express one complete thought');
  });

  it('restarts after a pause, but not after a blocked mic', () => {
    expect(shouldRestartRecognition(null, true)).toBe(true);
    expect(shouldRestartRecognition('no-speech', true)).toBe(true);
    expect(shouldRestartRecognition('not-allowed', true)).toBe(false);
    expect(shouldRestartRecognition(null, false)).toBe(false);
  });

  it('folds finished speech into the prefix when Chrome ends the session', () => {
    const onUpdate = vi.fn();
    const instances = [];
    class Recognition {
      constructor() {
        this.continuous = false;
        this.interimResults = false;
        this.maxAlternatives = 1;
        this.lang = '';
        instances.push(this);
      }
      start() {}
      stop() { this.onend?.(); }
      abort() {}
    }

    const session = createDictationSession({
      Recognition,
      getPrefix: () => 'Note:',
      onUpdate,
      onListeningChange: vi.fn(),
    });
    session.start();
    const recog = instances[0];
    recog.onresult({
      results: [result(' Connor is off', true), result(' sick', false)],
    });
    expect(onUpdate).toHaveBeenLastCalledWith('Note: Connor is off sick');
    recog.onend();
    expect(onUpdate).toHaveBeenLastCalledWith('Note: Connor is off sick');
    expect(instances).toHaveLength(1);
    const restarted = instances[0];
    restarted.onresult({ results: [result(' Express one complete thought', true)] });
    expect(onUpdate).toHaveBeenLastCalledWith('Note: Connor is off sick express one complete thought');
    session.dispose();
  });
});
