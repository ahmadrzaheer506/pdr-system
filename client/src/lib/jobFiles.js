/** Job photos and PDF documents (requirement 7.4). */
export const PHOTO_STAGES = ['before', 'during', 'after'];

export const PHOTO_STAGE_LABELS = {
  before: 'Before',
  during: 'During',
  after: 'After',
};

export function filesForStage(files, stage) {
  return (files || []).filter((f) => f.stage === stage);
}

export function documentFiles(files) {
  return (files || []).filter((f) => (f.mime || '') === 'application/pdf' || !f.stage);
}
