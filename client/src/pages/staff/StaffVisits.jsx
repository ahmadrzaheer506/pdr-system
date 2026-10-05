import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { MapPin, Clock, Users, ChevronRight, CalendarDays } from 'lucide-react';
import { api, fmtDate } from '../../lib/api';
import { PageLoading, StatusBadge, EmptyState, useToast, Toast } from '../../components/ui.jsx';
import { localIsoDate, addIsoDays } from '../../lib/schedule';
import {
  visitTypeLabel, canCompleteVisit, STAFF_VISIT_VIEWS, normalizeStaffVisitView,
  visitMatchesView, staffVisitCounts,
} from '../../lib/visitTypes';
import VisitCompleteTick, { VisitCompleteModal, VisitCompleteRemarks } from '../../components/VisitCompleteTick.jsx';
import FilterCountCards from '../../components/FilterCountCards.jsx';

const VISIT_TAB_STYLE = {
  uncompleted: { active: 'bg-amber-50 ring-amber-400', rail: 'bg-amber-500', labelClass: 'text-amber-800' },
  completed: { active: 'bg-emerald-50 ring-emerald-400', rail: 'bg-emerald-500', labelClass: 'text-emerald-800' },
  all: { active: 'bg-sky-50 ring-sky-400', rail: 'bg-sky-500', labelClass: 'text-sky-800' },
};

function visitDay(start) {
  const d = new Date(start);
  if (Number.isNaN(d.getTime())) return '';
  return localIsoDate(d);
}

function visitTime(start) {
  const d = new Date(start);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function StaffVisits() {
  const [searchParams, setSearchParams] = useSearchParams();
  const view = normalizeStaffVisitView(searchParams.get('status'));
  const [visits, setVisits] = useState(null);
  const [pending, setPending] = useState(null);
  const [saving, setSaving] = useState(false);
  const { toast, show } = useToast();

  const load = () => {
    const from = addIsoDays(localIsoDate(), -90);
    const to = addIsoDays(localIsoDate(), 13);
    return api.get(`/staff/visits?from=${from}&to=${to}`).then((d) => setVisits(d.visits || [])).catch((err) => {
      show(err.message, 'error');
      setVisits((current) => current || []);
    });
  };

  useEffect(() => {
    const from = addIsoDays(localIsoDate(), -90);
    const to = addIsoDays(localIsoDate(), 13);
    api.get(`/staff/visits?from=${from}&to=${to}`).then((d) => setVisits(d.visits || [])).catch(() => setVisits([]));
  }, []);

  const setView = (next) => {
    const params = new URLSearchParams();
    if (next !== 'uncompleted') params.set('status', next);
    setSearchParams(params);
  };

  const confirmComplete = async (note) => {
    if (!pending?.id) return;
    setSaving(true);
    try {
      await api.post(`/staff/visits/${pending.id}/complete`, { complete_note: note });
      show('Visit completed');
      setPending(null);
      await load();
    } catch (err) {
      show(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!visits) return <PageLoading />;

  const counts = staffVisitCounts(visits);
  const visible = visits.filter((v) => visitMatchesView(v, view));
  const today = localIsoDate();
  const tomorrow = addIsoDays(today, 1);
  const groups = {};
  for (const v of visible) {
    const date = visitDay(v.start);
    if (!date) continue;
    (groups[date] ||= []).push(v);
  }
  const sortedDates = Object.keys(groups).sort();
  const emptyDetail = view === 'uncompleted'
    ? 'Nothing left to complete in this window.'
    : view === 'completed'
      ? 'No completed visits in this window yet.'
      : 'Nothing assigned to you in this window yet.';

  return (
    <div className="space-y-5">
      {toast && <Toast {...toast} />}
      <div>
        <h1 className="text-xl font-bold text-slate-900">My visits</h1>
        <p className="text-slate-500 text-sm mt-0.5">Site visits assigned to you</p>
      </div>

      <FilterCountCards
        selected={view}
        onSelect={setView}
        items={STAFF_VISIT_VIEWS.map(({ id, label }) => ({
          id,
          label,
          count: counts[id] ?? 0,
          ...VISIT_TAB_STYLE[id],
        }))}
      />

      {sortedDates.length === 0 ? (
        <EmptyState icon={CalendarDays} title="No visits scheduled" detail={emptyDetail} />
      ) : (
        sortedDates.map((date) => (
          <div key={date}>
            <div className="text-xs font-semibold text-slate-400 uppercase mb-2 px-1">
              {date === today ? 'Today' : date === tomorrow ? 'Tomorrow' : fmtDate(date, { weekday: 'long', day: 'numeric', month: 'short' })}
            </div>
            <div className="space-y-2">
              {groups[date].map((v) => (
                <div key={v.id} className="card p-4 space-y-3">
                  <Link to={`/staff/visits/${v.id}`} className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-900 truncate">{v.customer_name || v.title}</span>
                        <StatusBadge status={v.status} />
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">{visitTypeLabel(v.visit_type)}</div>
                      {v.address && <div className="text-sm text-slate-500 mt-1 flex items-center gap-1.5"><MapPin size={13} /> {v.address}</div>}
                      <div className="text-sm text-slate-500 mt-0.5 flex items-center gap-1.5"><Clock size={13} /> {visitTime(v.start)}</div>
                      {v.assignee_name && <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-1.5"><Users size={12} /> With {v.assignee_name}</div>}
                    </div>
                    <ChevronRight size={18} className="text-slate-300 flex-shrink-0" />
                  </Link>
                  {canCompleteVisit(v) && (
                    <div className="border-t border-slate-100 pt-3 relative z-10">
                      <VisitCompleteTick
                        done={false}
                        saving={saving && pending?.id === v.id}
                        onComplete={() => setPending(v)}
                      />
                    </div>
                  )}
                  {v.status === 'done' && (
                    <VisitCompleteRemarks note={v.complete_note} className="text-sm text-slate-600 border-t border-slate-100 pt-3" />
                  )}
                </div>
              ))}
            </div>
          </div>
        ))
      )}

      <VisitCompleteModal
        visit={pending}
        open={!!pending}
        saving={saving}
        onClose={() => !saving && setPending(null)}
        onConfirm={confirmComplete}
      />
    </div>
  );
}
