/**
 * 409 duplicate-contact payload from POST/PUT /customers (2.5) or POST /leads (3.4).
 * @param {{ status?: number, data?: { customer_id?: number, name?: string, error?: string }, message?: string }} err
 */
export function duplicateFromError(err) {
  if (err?.status === 409 && err.data?.customer_id) {
    return {
      customerId: err.data.customer_id,
      name: err.data.name || 'that customer',
      message: err.data.error || err.message,
    };
  }
  return null;
}
