import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import BrandLogo from './BrandLogo.jsx';

/**
 * Shared chrome for public auth screens (forgot / reset password).
 */
export default function AuthCard({ title, subtitle, children }) {
  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-[420px] rounded-3xl border border-slate-200/80 bg-white px-7 py-9 shadow-[0_18px_50px_-20px_rgba(15,23,42,0.28)] sm:px-10">
        <div className="flex flex-col items-center text-center">
          <BrandLogo className="h-14 w-auto max-w-[168px]" />
          <h1 className="mt-6 text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
          {subtitle ? <p className="mt-2 max-w-sm text-sm leading-relaxed text-slate-500">{subtitle}</p> : null}
        </div>
        <div className="mt-7">{children}</div>
      </div>
    </div>
  );
}

export function AuthBackLink({ className = '' }) {
  return (
    <Link
      to="/login"
      className={`inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50 ${className}`}
    >
      <ArrowLeft size={16} /> Back to sign in
    </Link>
  );
}
