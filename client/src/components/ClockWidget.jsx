import React, { useEffect, useRef, useState } from 'react';
import { Play, Square, Coffee, MapPin, Camera, Loader2, AlertTriangle } from 'lucide-react';
import { api } from '../lib/api';
import { Modal } from './ui.jsx';

/** Ask the browser for a position. Never rejects — resolves null if declined. */
function getPosition(timeout = 8000) {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout, maximumAge: 30000 }
    );
  });
}

function elapsedLabel(fromSql, breakMinutes, onBreak, breakStartedAt) {
  if (!fromSql) return '0:00';
  const start = new Date(String(fromSql).replace(' ', 'T') + 'Z').getTime();
  let mins = (Date.now() - start) / 60000 - (Number(breakMinutes) || 0);
  if (onBreak && breakStartedAt) {
    const bs = new Date(String(breakStartedAt).replace(' ', 'T') + 'Z').getTime();
    mins -= (Date.now() - bs) / 60000;
  }
  mins = Math.max(0, mins);
  const h = Math.floor(mins / 60);
  const m = Math.floor(mins % 60);
  return `${h}:${String(m).padStart(2, '0')}`;
}

export default function ClockWidget({ jobId = null, jobTitle = '', onChange, compact = false }) {
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);
  const [outOpen, setOutOpen] = useState(false);

  const load = () => api.get('/staff/clock/status').then(setState).catch(() => {});
  useEffect(() => { load(); }, []);
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);

  if (!state || state.enabled === false) return null;

  const shift = state.active;
  const onThisJob = shift && jobId && Number(shift.job_id) === Number(jobId);
  const onOtherJob = shift && jobId && Number(shift.job_id) !== Number(jobId);

  const act = async (fn) => {
    setBusy(true);
    setError('');
    try { await fn(); await load(); onChange && onChange(); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  const clockIn = () => act(async () => {
    const pos = state.require_location ? await getPosition() : null;
    await api.post('/staff/clock/in', { job_id: jobId, ...(pos || {}) });
  });

  const toggleBreak = () => act(async () => {
    await api.post(state.on_break ? '/staff/clock/break/end' : '/staff/clock/break/start');
  });

  // ---------- not clocked in ----------
  if (!shift) {
    return (
      <div className="card p-4">
        {error && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-3 py-2 mb-3">{error}</div>}
        <button
          onClick={clockIn}
          disabled={busy || !jobId}
          className="w-full bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-xl py-4 font-semibold text-lg flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {busy ? <Loader2 className="animate-spin" size={20} /> : <Play size={20} />}
          Clock in
        </button>
        {!jobId && <p className="text-xs text-slate-400 text-center mt-2">Open a job to clock in against it.</p>}
        {state.require_location && jobId && (
          <p className="text-xs text-slate-400 text-center mt-2 flex items-center justify-center gap-1">
            <MapPin size={11} /> Your location is recorded to confirm you were on site
          </p>
        )}
        <div className="text-center text-xs text-slate-400 mt-3 pt-3 border-t border-slate-100">
          {state.week_hours}h logged this week
        </div>
      </div>
    );
  }

  // ---------- clocked in on a different job ----------
  if (onOtherJob) {
    return (
      <div className="card p-4 bg-amber-50 border-amber-200">
        <div className="flex items-start gap-2 text-sm text-amber-800">
          <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
          <div>
            You're currently clocked in on <strong>{shift.job_title || 'another job'}</strong>.
            Clock out there before starting this one.
          </div>
        </div>
      </div>
    );
  }

  // ---------- clocked in ----------
  const running = elapsedLabel(shift.clock_in, shift.break_minutes, state.on_break, shift.break_started_at);

  return (
    <>
      <div className={`card p-4 ${state.on_break ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'}`}>
        {error && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-3 py-2 mb-3">{error}</div>}
        <div className="text-center mb-3">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
            {state.on_break ? 'On break' : 'Clocked in'}
          </div>
          <div className={`text-4xl font-bold tabular-nums mt-1 ${state.on_break ? 'text-amber-700' : 'text-emerald-700'}`}>
            {running}
          </div>
          {!compact && shift.job_title && <div className="text-xs text-slate-500 mt-1">{shift.job_title}</div>}
          {Number(shift.break_minutes) > 0 && (
            <div className="text-xs text-slate-400 mt-0.5">{Math.round(shift.break_minutes)} min break taken</div>
          )}
        </div>

        {shift.location_flag === 'far_from_site' && (
          <div className="text-xs bg-amber-100 text-amber-800 rounded-lg px-2.5 py-1.5 mb-3 flex items-center gap-1.5">
            <AlertTriangle size={12} /> Clocked in {shift.in_distance_m}m from the job address
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={toggleBreak}
            disabled={busy}
            className={`rounded-xl py-3 font-semibold flex items-center justify-center gap-2 ${
              state.on_break ? 'bg-amber-600 hover:bg-amber-700 text-white' : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'
            }`}
          >
            <Coffee size={17} /> {state.on_break ? 'End break' : 'Break'}
          </button>
          <button
            onClick={() => setOutOpen(true)}
            disabled={busy}
            className="bg-slate-800 hover:bg-slate-900 text-white rounded-xl py-3 font-semibold flex items-center justify-center gap-2"
          >
            <Square size={16} /> Clock out
          </button>
        </div>
      </div>

      <ClockOutModal
        open={outOpen}
        onClose={() => setOutOpen(false)}
        requirePhoto={state.require_photo}
        requireLocation={state.require_location}
        onDone={() => { setOutOpen(false); load(); onChange && onChange(); }}
      />
    </>
  );
}

function ClockOutModal({ open, onClose, requirePhoto, requireLocation, onDone }) {
  const [notes, setNotes] = useState('');
  const [photo, setPhoto] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef(null);

  useEffect(() => { if (open) { setNotes(''); setPhoto(null); setError(''); } }, [open]);

  const pickPhoto = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Downscale on the device — a raw phone photo is far too big to post.
    const img = new Image();
    const reader = new FileReader();
    reader.onload = () => {
      img.onload = () => {
        const max = 1280;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        setPhoto(canvas.toDataURL('image/jpeg', 0.75));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  };

  const submit = async () => {
    if (requirePhoto && !photo) { setError('A photo is required before clocking out'); return; }
    setBusy(true);
    setError('');
    try {
      const pos = requireLocation ? await getPosition() : null;
      const res = await api.post('/staff/clock/out', { notes, photo, ...(pos || {}) });
      onDone(res);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Clock out">
      <div className="space-y-3">
        {error && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-3 py-2">{error}</div>}
        <div>
          <label className="label">How did it go? What's left to do?</label>
          <textarea className="input" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Stripped and felted the front slope, ridge to finish tomorrow. Used 2 rolls of membrane." />
        </div>
        <div>
          <label className="label">Site photo {requirePhoto ? '(required)' : '(optional)'}</label>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={pickPhoto} />
          {photo ? (
            <div className="relative">
              <img src={photo} alt="Site" className="w-full rounded-lg" />
              <button onClick={() => setPhoto(null)} className="absolute top-2 right-2 bg-black/60 text-white rounded-full w-7 h-7">×</button>
            </div>
          ) : (
            <button onClick={() => fileRef.current?.click()} className="btn-secondary w-full py-3">
              <Camera size={16} /> Take a photo
            </button>
          )}
        </div>
        <button onClick={submit} disabled={busy} className="btn-primary w-full py-3">
          {busy ? 'Clocking out…' : 'Confirm clock out'}
        </button>
      </div>
    </Modal>
  );
}
