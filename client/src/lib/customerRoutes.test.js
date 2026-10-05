import { describe, it, expect } from 'vitest';
import { customerPath, leadPath, leadBackLink } from './customerRoutes.js';

describe('customer vs lead routes', () => {
  it('keeps the master record on /customers/:id', () => {
    expect(customerPath(37)).toBe('/customers/37');
  });

  it('opens the workspace on /leads/:id with an optional from flag', () => {
    expect(leadPath(44)).toBe('/leads/44');
    expect(leadPath(44, 'inbox')).toBe('/leads/44?from=inbox');
    expect(leadPath(44, 'customer')).toBe('/leads/44?from=customer');
    expect(leadPath(44, 'inbox', 18)).toBe('/leads/44?from=inbox&lead=18');
  });

  it('sends lead-page back links to the surface that opened them', () => {
    expect(leadBackLink('inbox', 44)).toEqual({ to: '/inbox', label: 'Back to inbox' });
    expect(leadBackLink('pipeline', 44)).toEqual({ to: '/pipeline', label: 'Back to pipeline' });
    expect(leadBackLink('tasks', 37)).toEqual({ to: '/tasks', label: 'Back to tasks' });
    expect(leadBackLink('schedule', 37)).toEqual({ to: '/schedule', label: 'Back to schedule' });
    expect(leadBackLink(null, 37)).toEqual({ to: '/customers/37', label: 'Back to customer' });
  });
});
