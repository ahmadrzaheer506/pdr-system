jest.mock('../models', () => ({
  Job: { findByPk: jest.fn() },
  JobMaterialLine: {
    findAll: jest.fn(), findOne: jest.fn(), create: jest.fn(), max: jest.fn(),
  },
  JobChecklistItem: {
    findAll: jest.fn(), findOne: jest.fn(), create: jest.fn(), max: jest.fn(),
    destroy: jest.fn(), bulkCreate: jest.fn(),
  },
}));
jest.mock('../db', () => ({
  plain: (row) => (row && typeof row.toJSON === 'function' ? row.toJSON() : row),
  getSetting: jest.fn(async () => null),
}));

const { Job, JobMaterialLine, JobChecklistItem } = require('../models');
const kit = require('../jobKit');

describe('jobKit materials (requirement 7.3)', () => {
  beforeEach(() => jest.clearAllMocks());

  test('rejects a blank description and a non-positive qty', async () => {
    expect(await kit.addMaterial(4, { description: '  ' })).toMatchObject({ status: 400 });
    expect(await kit.addMaterial(4, { description: 'Felt', qty: 0 })).toMatchObject({
      error: 'Quantity must be greater than 0',
    });
    expect(JobMaterialLine.create).not.toHaveBeenCalled();
  });

  test('creates a needed line and updates packed/used', async () => {
    JobMaterialLine.max.mockResolvedValue(0);
    JobMaterialLine.create.mockResolvedValue({
      id: 1, job_id: 4, description: 'Felt', qty: 8, unit: 'm²', status: 'needed', sort_order: 1,
    });
    const created = await kit.addMaterial(4, { description: 'Felt', qty: 8, unit: 'm²' });
    expect(created.line.status).toBe('needed');

    const row = {
      id: 1, job_id: 4, description: 'Felt', qty: 8, unit: 'm²', status: 'needed', sort_order: 1,
      update: jest.fn(async function patch(fields) { Object.assign(this, fields); }),
    };
    JobMaterialLine.findOne.mockResolvedValue(row);
    const updated = await kit.updateMaterial(4, 1, { status: 'packed' });
    expect(updated.line.status).toBe('packed');
    expect(await kit.updateMaterial(4, 1, { status: 'lost' })).toMatchObject({ status: 400 });
  });
});

describe('jobKit checklists (requirement 7.3)', () => {
  beforeEach(() => jest.clearAllMocks());

  test('applies a template by replacing existing items', async () => {
    const jb = { id: 4, update: jest.fn() };
    Job.findByPk.mockResolvedValue(jb);
    JobChecklistItem.destroy.mockResolvedValue(3);
    JobChecklistItem.bulkCreate.mockResolvedValue([]);
    JobChecklistItem.findAll.mockResolvedValue([
      { id: 9, job_id: 4, body: 'Take before photos', done: false, sort_order: 2 },
    ]);
    const result = await kit.applyChecklistTemplate(4, 'generic');
    expect(JobChecklistItem.destroy).toHaveBeenCalledWith({ where: { job_id: 4 } });
    expect(JobChecklistItem.bulkCreate).toHaveBeenCalled();
    expect(jb.update).toHaveBeenCalledWith({ checklist_template: 'generic' });
    expect(result.checklist_items[0].body).toBe('Take before photos');
  });

  test('rejects an unknown template', async () => {
    const result = await kit.applyChecklistTemplate(4, 'wizard');
    expect(result.status).toBe(400);
    expect(JobChecklistItem.destroy).not.toHaveBeenCalled();
  });
});
