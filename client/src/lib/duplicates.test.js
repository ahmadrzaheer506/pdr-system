import { describe, it, expect } from 'vitest';
import { duplicateFromError } from './duplicates';

describe('duplicateFromError (requirement 2.5)', () => {
  it('reads customer_id and name from a 409 payload', () => {
    expect(duplicateFromError({
      status: 409,
      message: 'This phone number is already on Helen Ackroyd. Open that customer instead.',
      data: { error: 'This phone number is already on Helen Ackroyd. Open that customer instead.', customer_id: 7, name: 'Helen Ackroyd' },
    })).toEqual({
      customerId: 7,
      name: 'Helen Ackroyd',
      message: 'This phone number is already on Helen Ackroyd. Open that customer instead.',
    });
  });

  it('ignores other errors', () => {
    expect(duplicateFromError({ status: 400, message: 'Name required', data: { error: 'Name required' } })).toBeNull();
    expect(duplicateFromError(new Error('fail'))).toBeNull();
  });
});
