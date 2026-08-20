import React, { useEffect, useState, useRef } from 'react';
import { Mic, Square, Sparkles, ChevronLeft, ChevronRight, AlertTriangle, Check, X as XIcon } from 'lucide-react';
import { api, money } from '../lib/api';
import { PageLoading, Avatar, useToast, Toast, ModeBadge } from '../components/ui.jsx';
import WeekView from '../components/WeekView.jsx';
import JobModal from '../components/JobModal.jsx';

function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function isoDate(d) { return d.toISOString().slice(0, 10); }

export default function Schedule() {
  const [anchorDate, setAnchorDate] = useState(new Date());
  const [proposeDate, setProposeDate] = useState(isoDate(addDays(new Date(), 1)));
  const [weekJobs, setWeekJobs] = useState([]);
  const [staff, setStaff] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [openJob, setOpenJob] = useState(null);
  const [aiMode, setAiMode] = useState('idle');
  const { toast, show } = useToast();

  const loadWeek = () => {
    const from = isoDate(addDays(anchorDate, -7));
    const to = isoDate(addDays(anchorDate, 14));
    api.get(`/jobs?from=${from}&to=${to}`).then((d) => setWeekJobs(d.jobs));
    api.get(`/holidays/calendar?from=${from}&to=${to}`).then((d) => setHolidays(d.holidays));
  };
  useEffect(() => { loadWeek(); }, [anchorDate]);
  useEffect(() => { api.get('/settings/users').then((d) => setStaff(d.users.filter((u) => u.role === 'STAFF'))); }, []);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Schedule & AI Assistant</h1>
          <p className="text-slate-500 text-sm mt-0.5">Speak or type tomorrow's situation — the assistant proposes a schedule from real job & staff data.</p>
        </div>
      </div>

      <AiAssistant proposeDate={proposeDate} setProposeDate={setProposeDate} onApproved={() => { loadWeek(); show('Schedule approved and live'); }} show={show} />

      <div className="card p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-slate-800">Week view</h3>
          <div className="flex items-center gap-2">
            <button onClick={() => setAnchorDate(addDays(anchorDate, -7))} className="btn-ghost !p-1.5"><ChevronLeft size={16} /></button>
            <button onClick={() => setAnchorDate(new Date())} className="btn-ghost !py-1 !px-2.5 text-xs">Today</button>
            <button onClick={() => setAnchorDate(addDays(anchorDate, 7))} className="btn-ghost !p-1.5"><ChevronRight size={16} /></button>
          </div>
        </div>
        <WeekView anchorDate={anchorDate} jobs={weekJobs} holidays={holidays} onJobClick={setOpenJob} />
      </div>

      <div className="card p-4">
        <h3 className="font-semibold text-slate-800 mb-3">Team availability today</h3>
        <div className="flex flex-wrap gap-3">
          {staff.map((s) => {
            const onHoliday = holidays.some((h) => h.user_id === s.id && h.start_date <= isoDate(new Date()) && h.end_date >= isoDate(new Date()));
            return (
              <div key={s.id} className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${onHoliday ? 'border-amber-200 bg-amber-50' : 'border-slate-200'}`}>
                <Avatar name={s.name} color={s.color} size={7} />
                <div>
                  <div className="text-sm font-medium text-slate-800">{s.name}</div>
                  <div className="text-[11px] text-slate-400">{s.skills.join(', ') || 'no skills tagged'}{s.is_driver ? ' · driver' : ''}</div>
                </div>
                {onHoliday && <span className="text-[10px] text-amber-600 font-medium ml-1">On holiday</span>}
              </div>
            );
          })}
        </div>
      </div>

      <JobModal jobId={openJob} onClose={() => setOpenJob(null)} onChanged={loadWeek} staff={staff} />
      <Toast {...toast} />
    </div>
  );
}

function AiAssistant({ proposeDate, setProposeDate, onApproved, show }) {
  const [transcript, setTranscript] = useState('');
  const [listening, setListening] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null); // { provider, assignments, unassigned, warnings, errors, summary, context }
  const [edited, setEdited] = useState({}); // job_id -> user_ids[]
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

  const approve = async () => {
    setLoading(true);
    try {
      const assignments = Object.entries(edited).map(([job_id, user_ids]) => {
        const orig = result.assignments.find((a) => String(a.job_id) === String(job_id));
        return { job_id: Number(job_id), user_ids, start_time: orig?.start_time, end_time: orig?.end_time };
      }).filter((a) => a.user_ids.length);
      await api.post('/jobs/ai/approve', { proposal_id: result.proposal_id, date: proposeDate, assignments });
      setResult(null);
      setTranscript('');
      onApproved();
    } catch (err) { show(err.message, 'error'); }
    finally { setLoading(false); }
  };

  return (
    <div className="card p-5 bg-gradient-to-br from-navy-900 to-slate-800 text-white">
      <div className="flex items-center gap-2 mb-1">
        <Sparkles size={18} className="text-brand-400" />
        <h3 className="font-semibold">AI Scheduling Assistant</h3>
        {result && <ModeBadge mode={result.provider === 'builtin' || result.provider === 'builtin-fallback' ? 'simulated' : 'live'} />}
      </div>
      <p className="text-slate-400 text-sm mb-4">Tell it who's off, what's a priority, or anything unusual — it already knows every job and every lad.</p>

      <div className="flex items-center gap-2 mb-3">
        <label className="text-xs text-slate-400">Scheduling for</label>
        <input type="date" value={proposeDate} onChange={(e) => setProposeDate(e.target.value)} className="bg-white/10 border border-white/20 rounded-lg px-2.5 py-1.5 text-sm text-white [color-scheme:dark]" />
      </div>

      <div className="flex gap-2">
        <textarea
          className="flex-1 bg-white/10 border border-white/20 rounded-lg px-3.5 py-2.5 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/50"
          rows={3}
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          placeholder="e.g. Connor's off sick, Ryan's got the van. Get the Fitch guttering job done first, it's due to rain Thursday…"
        />
        <button onClick={listening ? stopListening : startListening} className={`btn self-stretch px-4 ${listening ? 'bg-red-600 text-white animate-pulse' : 'bg-white/10 text-white hover:bg-white/20'}`}>
          {listening ? <Square size={18} /> : <Mic size={18} />}
        </button>
      </div>

      <button onClick={propose} disabled={loading} className="btn-primary mt-3 w-full sm:w-auto">
        {loading ? 'Thinking…' : 'Propose schedule'}
      </button>

      {result && (
        <div className="mt-5 bg-white text-slate-800 rounded-xl p-4 space-y-3">
          <p className="text-sm text-slate-600">{result.summary}</p>

          {result.errors?.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 space-y-1">
              {result.errors.map((e, i) => <div key={i} className="flex gap-1.5"><AlertTriangle size={13} className="flex-shrink-0 mt-0.5" /> {e}</div>)}
            </div>
          )}
          {result.warnings?.length > 0 && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-600 space-y-1">
              {result.warnings.map((w, i) => <div key={i}>⚠ {w}</div>)}
            </div>
          )}

          <div className="space-y-2">
            {result.assignments.map((a) => {
              const jb = result.context.unscheduledJobs.find((j) => j.id === a.job_id);
              return (
                <div key={a.job_id} className="border border-slate-200 rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <div className="font-medium text-sm">{jb?.title}</div>
                    <span className="text-xs text-slate-400">{jb?.customer_name}</span>
                  </div>
                  {a.note && <div className="text-xs text-slate-500 mt-0.5">{a.note}</div>}
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {result.context.staff.map((s) => {
                      const on = (edited[a.job_id] || []).includes(s.id);
                      return (
                        <button key={s.id} onClick={() => toggleUser(a.job_id, s.id)} disabled={!s.available && !on}
                          className={`flex items-center gap-1.5 rounded-full pl-1 pr-2.5 py-1 text-xs font-medium border ${on ? 'border-brand-400 bg-brand-50 text-brand-700' : s.available ? 'border-slate-200 text-slate-500' : 'border-slate-100 text-slate-300'}`}>
                          <Avatar name={s.name} color={s.color} size={5} /> {s.name.split(' ')[0]}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {result.unassigned?.map((u, i) => (
              <div key={i} className="border border-dashed border-slate-300 rounded-lg p-3 text-sm text-slate-500">
                Could not staff: {result.context.unscheduledJobs.find((j) => j.id === u.job_id)?.title} — {u.reason}
              </div>
            ))}
          </div>

          <div className="flex gap-2 pt-2">
            <button onClick={approve} disabled={loading} className="btn-primary flex-1"><Check size={15} /> Approve & schedule</button>
            <button onClick={() => setResult(null)} className="btn-secondary"><XIcon size={15} /> Discard</button>
          </div>
        </div>
      )}
    </div>
  );
}
