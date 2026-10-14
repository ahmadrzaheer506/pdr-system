const { isProtectedAccount, protectedDeactivateError, protectedDeleteError } = require('../protectedUser');

describe('protected first administrator', () => {
  const owner = { id: 1, role: 'ADMIN', active: true, protected: true };

  test('flags the seed owner', () => {
    expect(isProtectedAccount(owner)).toBe(true);
    expect(isProtectedAccount({ protected: false })).toBe(false);
  });

  test('blocks deactivate and role change', () => {
    expect(protectedDeactivateError(owner, false, 'ADMIN')).toBe('The first administrator cannot be deactivated');
    expect(protectedDeactivateError(owner, true, 'OFFICE')).toBe('The first administrator cannot change role');
    expect(protectedDeactivateError(owner, true, 'ADMIN')).toBeNull();
  });

  test('blocks delete', () => {
    expect(protectedDeleteError(owner)).toBe('The first administrator cannot be deleted');
    expect(protectedDeleteError({ protected: false })).toBeNull();
  });
});
