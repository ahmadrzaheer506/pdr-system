import React from 'react';
import { Link } from 'react-router-dom';

/**
 * Shown when create/add is blocked because the phone or email already belongs
 * to another customer (requirement 2.5).
 */
export default function DuplicateCustomerNotice({ duplicate }) {
  if (!duplicate) return null;
  return (
    <p className="text-sm text-rose-700 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2" role="alert">
      {duplicate.message}{' '}
      <Link to={`/customers/${duplicate.customerId}`} className="font-medium underline hover:text-rose-900">
        Open {duplicate.name}
      </Link>
    </p>
  );
}
