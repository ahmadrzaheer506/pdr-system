/**
 * The first / seed owner account cannot be deactivated, demoted, or deleted.
 * Seed sets `protected` on that admin; the migration also flags the oldest ADMIN.
 */
function isProtectedAccount(user) {
  return !!(user && user.protected);
}

function protectedDeactivateError(user, nextActive, nextRole) {
  if (!isProtectedAccount(user)) return null;
  if (user.active && nextActive === false) {
    return 'The first administrator cannot be deactivated';
  }
  if (nextRole && nextRole !== user.role) {
    return 'The first administrator cannot change role';
  }
  return null;
}

function protectedDeleteError(user) {
  if (!isProtectedAccount(user)) return null;
  return 'The first administrator cannot be deleted';
}

module.exports = {
  isProtectedAccount,
  protectedDeactivateError,
  protectedDeleteError,
};
