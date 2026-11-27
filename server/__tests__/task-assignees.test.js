const { parseAssigneeIds, assertAssignableUsers, ASSIGNABLE_ROLES } = require('../taskAssignees');
const { User } = require('../models');
const { ROLES } = require('../roles');

jest.mock('../models', () => ({
  User: { findAll: jest.fn() },
  TaskAssignee: { destroy: jest.fn(), bulkCreate: jest.fn() },
}));

describe('taskAssignees', () => {
  beforeEach(() => jest.clearAllMocks());

  test('parses unique integer ids', () => {
    expect(parseAssigneeIds(['2', 3, 2])).toEqual({ ids: [2, 3] });
    expect(parseAssigneeIds('nope').error).toMatch(/Invalid/);
    expect(ASSIGNABLE_ROLES).toEqual([ROLES.ADMIN, ROLES.OFFICE, ROLES.STAFF]);
  });

  test('rejects missing or inactive users', async () => {
    User.findAll.mockResolvedValue([{ id: 2 }]);
    const result = await assertAssignableUsers([1, 2]);
    expect(result.error).toMatch(/active user/i);
  });

  test('accepts director, office, and field staff', async () => {
    User.findAll.mockResolvedValue([{ id: 1 }, { id: 2 }, { id: 3 }]);
    await expect(assertAssignableUsers([1, 2, 3])).resolves.toEqual({ ids: [1, 2, 3] });
  });
});
