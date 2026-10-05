jest.mock('../models', () => ({
  CustomerNote: { create: jest.fn(), findByPk: jest.fn(), findAll: jest.fn(), findOne: jest.fn() },
  User: {},
}));
jest.mock('../db', () => ({
  plain: (row) => (row && typeof row.toJSON === 'function' ? row.toJSON() : row),
}));

const { CustomerNote } = require('../models');
const { addNote } = require('../customerNotes');

describe('customer notes (requirement 2.4)', () => {
  test('rejects a blank note and never writes a row', async () => {
    const res = await addNote(9, 1, '   ');
    expect(res.error).toBe('Note is required');
    expect(CustomerNote.create).not.toHaveBeenCalled();
  });
});
