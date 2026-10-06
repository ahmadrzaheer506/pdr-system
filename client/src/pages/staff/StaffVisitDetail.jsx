import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, MapPin, Phone, Clock, Users } from 'lucide-react';
import { api, fmtDate } from '../../lib/api';
import { PageLoading, LoadError, StatusBadge, useToast, Toast } from '../../components/ui.jsx';
import { visitTypeLabel, canCompleteVisit } from '../../lib/visitTypes';
import VisitCompleteTick, { VisitCompleteModal, VisitCompleteRemarks } from '../../components/VisitCompleteTick.jsx';

function visitWhen(start, end) {
  const s = new Date(start);
  if (Number.isNaN(s.getTime())) return '';
  const startLabel = `${fmtDate(s.toISOString().slice(0, 10), { weekday: 'long', day: 'numeric', month: 'short' })} · ${String(s.getHours()).padStart(2, '0')}:${String(s.getMinutes()).padStart(2, '0')}`;
  const e = new Date(end);
  if (Number.isNaN(e.getTime())) return startLabel;
  return `${startLabel}–${String(e.getHours()).padStart(2, '0')}:${String(e.getMinutes()).padStart(2, '0')}`;
}

export default function StaffVisitDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [visit, setVisit] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const { toast, show } = useToast();

  const load = () => api.get(`/staff/visits/${id}`).then((d) => {
    setLoadError('');
    setVisit(d.visit);
  }).catch((err) => {
    show(err.message, 'error');
    setLoadError(err.message || 'Could not load this visit');
  });

  useEffect(() => {
    let cancelled = false;
    api.get(`/staff/visits/${id}`).then((d) => {
      if (cancelled) return;
      setLoadError('');
      setVisit(d.visit);
    }).catch((err) => {
      if (cancelled) return;
      show(err.message, 'error');
      setLoadError(err.message || 'Could not load this visit');
    });
    return () => { cancelled = true; };
  }, [id, show]);

  const complete = async (note) => {
    if (!visit?.id) return;
    setSaving(true);
    try {
      await api.post(`/staff/visits/${visit.id}/complete`, { complete_note: note });
      show('Visit completed');
      setConfirming(false);
      load();
    } catch (err) {
      show(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loadError && !visit) return <LoadError message={loadError} />;
  if (!visit) return <PageLoading />;

  return (
    <div className="space-y-4">
      {toast && <Toast {...toast} />}
      <button type="button" onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-sm text-slate-500">
        <ArrowLeft size={15} /> Back
      </button>

      <div className="card p-4">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <h1 className="text-lg font-bold text-slate-900">{visit.customer_name || visit.title}</h1>
          <StatusBadge status={visit.status} />
        </div>
        <div className="text-sm text-slate-500">{visitTypeLabel(visit.visit_type)}</div>
        <div className="mt-3 space-y-2 text-sm">
          {visit.address && (
            <a
              href={`https://maps.google.com/?q=${encodeURIComponent(visit.address)}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 text-brand-600"
            >
              <MapPin size={15} /> {visit.address}
            </a>
          )}
          {visit.customer_phone && (
            <a href={`tel:${visit.customer_phone}`} className="flex items-center gap-2 text-brand-600">
              <Phone size={15} /> {visit.customer_phone}
            </a>
          )}
        </div>
        <div className="mt-3 text-sm text-slate-500 flex items-center gap-1.5">
          <Clock size={15} /> {visitWhen(visit.start, visit.end)}
        </div>
        {visit.assignee_name && (
          <div className="mt-2 text-sm text-slate-500 flex items-center gap-1.5">
            <Users size={15} /> With {visit.assignee_name}
          </div>
        )}
        {visit.notes && <p className="mt-3 text-sm text-slate-600 border-t border-slate-100 pt-3">{visit.notes}</p>}
        {(canCompleteVisit(visit) || visit.status === 'done') && (
          <div className="mt-3 pt-3 border-t border-slate-100">
            <VisitCompleteTick
              large
              done={visit.status === 'done'}
              saving={saving}
              onComplete={() => setConfirming(true)}
            />
            {visit.status === 'done' && (
              <VisitCompleteRemarks note={visit.complete_note} className="mt-3" />
            )}
          </div>
        )}
      </div>

      <VisitCompleteModal
        visit={visit}
        open={confirming}
        saving={saving}
        onClose={() => !saving && setConfirming(false)}
        onConfirm={complete}
      />
    </div>
  );
}
