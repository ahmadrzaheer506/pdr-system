import React, { useRef, useState } from 'react';
import { Mic, Square, Sparkles, AlertTriangle, Check, X as XIcon } from 'lucide-react';
import { api } from '../lib/api';
import { Avatar, ModeBadge } from './ui.jsx';
import DatePicker from './DatePicker.jsx';
import { localIsoDate, proposalCrewConflicts } from '../lib/schedule';
import CrewConflictModal from './CrewConflictModal.jsx';

/**
 * Office AI schedule composer — same propose/approve payloads as before.
 */
export default function AiAssistant({ proposeDate, setProposeDate, onApproved, show }) {
  const [transcript, setTranscript] = useState('');
  const [listening, setListening] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [edited, setEdited] = useState({});
  const [conflicts, setConflicts] = useState([]);
  const recogRef = useRef(null);

  const startListening = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { show('Voice input isn\'t supported in this browser — type your instruction instead.', 'error'); return; }
    const recog = new SR();
    recog.lang = 'en-GB';
    recog.continuous = true;
    recog.interimResults = true;
    let finalText = transcript;
    recog.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalText += (finalText ? ' ' : '') + e.results[i][0].transcript;
        else interim += e.results[i][0].transcript;
      }
      setTranscript(finalText + (interim ? ' ' + interim : ''));
    };
    recog.onerror = () => setListening(false);
    recog.onend = () => setListening(false);
    recogRef.current = recog;
    recog.start();
    setListening(true);
  };
  const stopListening = () => { recogRef.current?.stop(); setListening(false); };

  const propose = async () => {
    setLoading(true);
    setResult(null);
    setEdited({});
    try {
      const r = await api.post('/jobs/ai/propose', { date: proposeDate, transcript });
      setResult(r);
      const initEdit = {};
      r.assignments.forEach((a) => { initEdit[a.job_id] = a.user_ids; });
      setEdited(initEdit);
    } catch (err) { show(err.message, 'error'); }
    finally { setLoading(false); }
  };

  const toggleUser = (jobId, uid) => {
    setEdited((prev) => {
      const cur = prev[jobId] || [];
      return { ...prev, [jobId]: cur.includes(uid) ? cur.filter((x) => x !== uid) : [...cur, uid] };
    });
  };

  const assignmentsPayload = () => Object.entries(edited).map(([job_id, user_ids]) => {
    const orig = result.assignments.find((a) => String(a.job_id) === String(job_id));
    return { job_id: Number(job_id), user_ids, start_time: orig?.start_time, end_time: orig?.end_time };
  }).filter((a) => a.user_ids.length);

  const writeSchedule = async (confirmConflicts = false) => {
    setLoading(true);
    try {
      const assignments = assignmentsPayload();
      await api.post('/jobs/ai/approve', {
        proposal_id: result.proposal_id,
        date: proposeDate,
        assignments,
        ...(confirmConflicts ? { confirm_conflicts: true } : {}),
      });
      setConflicts([]);
      setResult(null);
      setTranscript('');
      onApproved();
    } catch (err) {
      if (err.status === 409 && err.data?.needs_confirm) {
        setConflicts(err.data.conflicts || []);
        return;
      }
      show(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const approve = async () => {
    const assignments = assignmentsPayload();
    const nextConflicts = proposalCrewConflicts(
      assignments,
      result.context?.staff || [],
      result.context?.unscheduledJobs || [],
    );
    if (nextConflicts.length) {
      setConflicts(nextConflicts);
      return;
    }
    await writeSchedule(false);
  };

  const simulated = result && (result.provider === 'builtin' || result.provider === 'builtin-fallback');

  const onComposerKeyDown = (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !loading) {
      e.preventDefault();
      propose();
    }
  };

  return (
    <div className="rounded-[1.5rem] bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.05)] ring-1 ring-slate-200/80 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 ring-1 ring-indigo-100">
          <Sparkles size={18} strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold tracking-tight text-slate-900">AI Scheduling Assistant</h3>
            <span className="inline-flex items-center rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-indigo-600">
              AI
            </span>
            {result ? <ModeBadge mode={simulated ? 'simulated' : 'live'} /> : null}
          </div>
          <p className="mt-1 text-sm leading-relaxed text-slate-500">
            Tell it who's off, what's a priority, or anything unusual — it already knows every job and every lad.
          </p>
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl bg-slate-50 ring-1 ring-slate-200/80 transition focus-within:bg-white focus-within:ring-2 focus-within:ring-indigo-200">
        <label className="sr-only" htmlFor="ai-schedule-instruction">Schedule instruction</label>
        <textarea
          id="ai-schedule-instruction"
          className="min-h-[7rem] w-full resize-y bg-transparent px-4 pt-3.5 text-[15px] leading-relaxed text-slate-800 placeholder:text-slate-400 focus:outline-none"
          rows={3}
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          onKeyDown={onComposerKeyDown}
          placeholder="e.g. Connor's off sick, Ryan's got the van. Get the Fitch guttering job done first, it's due to rain Thursday…"
        />
        <div className="flex flex-col gap-2 border-t border-slate-200/70 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-slate-500">Scheduling for</span>
            <DatePicker
              className="w-44"
              size="sm"
              label="Scheduling for"
              value={proposeDate}
              min={localIsoDate()}
              onChange={setProposeDate}
            />
            {listening ? (
              <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-rose-600">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-500" aria-hidden="true" />
                Listening
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-2 self-end sm:self-auto">
            <button
              type="button"
              onClick={listening ? stopListening : startListening}
              aria-label={listening ? 'Stop recording' : 'Start voice input'}
              aria-pressed={listening}
              className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition ${
                listening
                  ? 'bg-rose-500 text-white shadow-[0_0_0_4px_rgba(244,63,94,0.18)]'
                  : 'bg-white text-slate-500 ring-1 ring-slate-200 hover:bg-slate-50 hover:text-slate-800'
              }`}
            >
              {listening ? <Square size={15} /> : <Mic size={16} />}
            </button>
            <button
              type="button"
              onClick={propose}
              disabled={loading}
              className="btn-primary !h-10 !rounded-full px-4"
            >
              <Sparkles size={15} />
              {loading ? 'Thinking…' : 'Propose schedule'}
            </button>
          </div>
        </div>
      </div>

      {result && (
        <div className="mt-4 space-y-3 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200/80 sm:p-5">
          <p className="text-sm leading-relaxed text-slate-600">{result.summary}</p>

          {result.errors?.length > 0 && (
            <div className="space-y-1 rounded-xl bg-amber-50 p-3 text-xs text-amber-800 ring-1 ring-amber-100">
              {result.errors.map((e, i) => (
                <div key={i} className="flex gap-1.5">
                  <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" /> {e}
                </div>
              ))}
            </div>
          )}
          {result.warnings?.length > 0 && (
            <div className="space-y-1 rounded-xl bg-white p-3 text-xs text-slate-600 ring-1 ring-slate-200/80">
              {result.warnings.map((w, i) => <div key={i}>⚠ {w}</div>)}
            </div>
          )}

          <div className="space-y-2">
            {result.assignments.map((a) => {
              const jb = result.context.unscheduledJobs.find((j) => j.id === a.job_id);
              return (
                <div key={a.job_id} className="rounded-xl bg-white p-3.5 ring-1 ring-slate-200/80">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium text-sm text-slate-900">{jb?.title}</div>
                    <span className="truncate text-xs text-slate-400">{jb?.customer_name}</span>
                  </div>
                  {a.note && <div className="mt-0.5 text-xs text-slate-500">{a.note}</div>}
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {result.context.staff.map((s) => {
                      const on = (edited[a.job_id] || []).includes(s.id);
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => toggleUser(a.job_id, s.id)}
                          className={`flex items-center gap-1.5 rounded-full py-1 pl-1 pr-2.5 text-xs font-medium ring-1 ${
                            on
                              ? 'bg-brand-50 text-brand-700 ring-brand-100'
                              : s.available
                                ? 'bg-white text-slate-500 ring-slate-200'
                                : 'bg-amber-50 text-amber-800 ring-amber-200'
                          }`}
                        >
                          <Avatar name={s.name} color={s.color} size={5} /> {s.name.split(' ')[0]}
                          {s.on_holiday && <span className="text-[10px] uppercase tracking-wide">holiday</span>}
                          {!s.on_holiday && (s.busy_on || []).length > 0 && (
                            <span className="text-[10px] uppercase tracking-wide">booked</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {result.unassigned?.map((u, i) => (
              <div key={i} className="rounded-xl border border-dashed border-slate-300 bg-white p-3 text-sm text-slate-500">
                Could not staff: {result.context.unscheduledJobs.find((j) => j.id === u.job_id)?.title} — {u.reason}
              </div>
            ))}
          </div>

          <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row">
            <button type="button" onClick={approve} disabled={loading} className="btn-primary flex-1 !rounded-full">
              <Check size={15} /> Approve & schedule
            </button>
            <button type="button" onClick={() => { setResult(null); setConflicts([]); }} className="btn-secondary !rounded-full">
              <XIcon size={15} /> Discard
            </button>
          </div>
        </div>
      )}
      <CrewConflictModal
        open={conflicts.length > 0}
        conflicts={conflicts}
        confirmLabel="Schedule anyway"
        saving={loading}
        onCancel={() => { if (!loading) setConflicts([]); }}
        onConfirm={() => writeSchedule(true)}
      />
    </div>
  );
}
