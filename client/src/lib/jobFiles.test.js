import { describe, it, expect } from 'vitest';
import { filesForStage, documentFiles, PHOTO_STAGES } from './jobFiles';

describe('jobFiles helpers (requirement 7.4)', () => {
  const files = [
    { id: 1, stage: 'before', mime: 'image/jpeg', original_name: 'a.jpg' },
    { id: 2, stage: 'after', mime: 'image/png', original_name: 'b.png' },
    { id: 3, stage: null, mime: 'application/pdf', original_name: 'spec.pdf' },
  ];

  it('groups photos by stage and PDFs as documents', () => {
    expect(PHOTO_STAGES).toEqual(['before', 'during', 'after']);
    expect(filesForStage(files, 'before').map((f) => f.id)).toEqual([1]);
    expect(filesForStage(files, 'during')).toEqual([]);
    expect(documentFiles(files).map((f) => f.original_name)).toEqual(['spec.pdf']);
  });
});
