import React from 'react';
import { Link } from 'react-router-dom';
import { Users, Trophy, Contact, Briefcase, Receipt, PoundSterling } from 'lucide-react';
import { useAuth } from '../lib/auth.jsx';
import { ROLES } from '../lib/roles';
import { visibleReportCards } from '../lib/reports.js';

const ICONS = {
  'lead-volume': Users,
  'win-loss': Trophy,
  customers: Contact,
  jobs: Briefcase,
  invoices: Receipt,
  profitability: PoundSterling,
};

/**
 * Reports hub (requirements 14.1–14.3). Job profitability is Director-only.
 */
export default function Reports() {
  const { user } = useAuth();
  const cards = visibleReportCards(user?.role === ROLES.ADMIN);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Reports</h1>
        <p className="text-slate-500 text-sm mt-0.5">
          Lead volume, win/loss, and from/to lists of customers, jobs, and invoices. Download CSV from each report.
        </p>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map((card) => {
          const Icon = ICONS[card.id];
          return (
            <Link key={card.id} to={`/reports/${card.id}`} className="card p-5 hover:border-brand-300 transition-colors">
              <div className="rounded-lg p-2 bg-slate-100 text-slate-600 w-fit">
                {Icon && <Icon size={18} />}
              </div>
              <h2 className="font-semibold text-slate-800 mt-3">{card.title}</h2>
              <p className="text-sm text-slate-500 mt-1">{card.detail}</p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
