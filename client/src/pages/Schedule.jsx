import React, { useEffect, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, LayoutGrid } from 'lucide-react';
import { api } from '../lib/api';
import { useToast, Toast } from '../components/ui.jsx';
import WeekView from '../components/WeekView.jsx';
import DayView from '../components/DayView.jsx';
import UnscheduledQueue from '../components/UnscheduledQueue.jsx';
import JobModal from '../components/JobModal.jsx';
import AiAssistant from '../components/AiAssistant.jsx';
import TeamAvailability from '../components/TeamAvailability.jsx';
import { addIsoDays, localIsoDate, parseIsoDate } from '../lib/schedule';

export default function Schedule() {
  const [anchorDate, setAnchorDate] = useState(() => new Date());
  const [dayIso, setDayIso] = useState(null);
  const [availabilityIso, setAvailabilityIso] = useState(() => localIsoDate());
  const [proposeDate, setProposeDate] = useState(addIsoDays(localIsoDate(), 1));
  const [weekJobs, setWeekJobs] = useState([]);
  const [unscheduled, setUnscheduled] = useState([]);
  const [staff, setStaff] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [openJob, setOpenJob] = useState(null);
  const [openCrewDate, setOpenCrewDate] = useState(null);
  const { toast, show } = useToast();

  const openJobAt = (id, dateIso) => {
    setOpenJob(id);
    setOpenCrewDate(parseIsoDate(dateIso) || null);
  };
  const closeJob = () => {
    setOpenJob(null);
    setOpenCrewDate(null);
  };

  /** Keep week/day boards and team availability on the same calendar day. */
  const focusDate = (iso) => {
    const day = parseIsoDate(iso);
    if (!day) return;
    const [y, m, d] = day.split('-').map(Number);
    setAnchorDate(new Date(y, m - 1, d));
    setAvailabilityIso(day);
  };

  const showToday = () => {
    const now = new Date();
    setAnchorDate(now);
    setAvailabilityIso(localIsoDate(now));
  };

  const loadWeek = () => {
    const from = addIsoDays(localIsoDate(anchorDate), -7);
    const to = addIsoDays(localIsoDate(anchorDate), 14);
    api.get(`/jobs?from=${from}&to=${to}`).then((d) => setWeekJobs(d.jobs)).catch((err) => show(err.message, 'error'));
    api.get(`/holidays/calendar?from=${from}&to=${to}`).then((d) => setHolidays(d.holidays)).catch((err) => show(err.message, 'error'));
    api.get('/jobs/unscheduled').then((d) => setUnscheduled(d.jobs)).catch((err) => show(err.message, 'error'));
  };
  useEffect(() => { loadWeek(); }, [anchorDate]);
  useEffect(() => { api.get('/settings/users').then((d) => setStaff((d.users || []).filter((u) => u.role === 'STAFF'))).catch(() => setStaff([])); }, []);

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-[1.7rem] font-semibold tracking-tight text-slate-900">Schedule & AI Assistant</h1>
          <p className="text-slate-500 text-sm mt-1">Speak or type tomorrow's situation - the assistant proposes a schedule from real job & staff data.</p>
        </div>
      </div>

      <AiAssistant proposeDate={proposeDate} setProposeDate={setProposeDate} onApproved={() => { loadWeek(); show('Schedule approved and live'); }} show={show} />

      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start">
        <div className="card p-4">
          {!dayIso ? (
            <>
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600 ring-1 ring-slate-200/80">
                    <LayoutGrid size={16} strokeWidth={2} />
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold tracking-tight text-slate-900">Week view</h3>
                    <p className="mt-0.5 text-xs text-slate-500">Open a day for crew, or switch to day view.</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const iso = availabilityIso || localIsoDate();
                      focusDate(iso);
                      setDayIso(iso);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.04)] ring-1 ring-slate-200/90 transition hover:bg-slate-50 hover:ring-slate-300"
                  >
                    <CalendarDays size={14} strokeWidth={2} />
                    Day view
                  </button>
                  <div className="inline-flex items-center rounded-full bg-slate-100 p-0.5 ring-1 ring-slate-200/80">
                    <button type="button" onClick={() => setAnchorDate(new Date(anchorDate.getFullYear(), anchorDate.getMonth(), anchorDate.getDate() - 7))} className="rounded-full p-1.5 text-slate-600 hover:bg-white hover:text-slate-900" aria-label="Previous week"><ChevronLeft size={16} /></button>
                    <button type="button" onClick={showToday} className="rounded-full px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-white">Today</button>
                    <button type="button" onClick={() => setAnchorDate(new Date(anchorDate.getFullYear(), anchorDate.getMonth(), anchorDate.getDate() + 7))} className="rounded-full p-1.5 text-slate-600 hover:bg-white hover:text-slate-900" aria-label="Next week"><ChevronRight size={16} /></button>
                  </div>
                </div>
              </div>
              <WeekView
                anchorDate={anchorDate}
                selectedIso={availabilityIso}
                jobs={weekJobs}
                holidays={holidays}
                onJobClick={openJobAt}
                onDayClick={(iso) => {
                  focusDate(iso);
                  setDayIso(iso);
                }}
              />
            </>
          ) : (
            <DayView
              dateIso={dayIso}
              jobs={weekJobs}
              holidays={holidays}
              staff={staff}
              onJobClick={openJobAt}
              onDateChange={(iso) => {
                focusDate(iso);
                setDayIso(iso);
              }}
              onBackToWeek={() => setDayIso(null)}
              onCrewAssigned={(result) => {
                loadWeek();
                if (result?.warnings?.length) show(result.warnings.map((w) => w.message).join(' '));
              }}
              onCrewError={(msg) => show(msg, 'error')}
            />
          )}
        </div>
        <div className="h-full lg:col-start-2 lg:row-span-2">
          <UnscheduledQueue
            jobs={unscheduled}
            staff={staff}
            holidays={holidays}
            weekJobs={weekJobs}
            onPlaced={() => { loadWeek(); show('Job placed on the schedule'); }}
            onError={(msg) => show(msg, 'error')}
            onOpen={(id) => openJobAt(id)}
          />
        </div>
        <TeamAvailability staff={staff} holidays={holidays} jobs={weekJobs} today={availabilityIso} />
      </div>

      <JobModal
        jobId={openJob}
        crewDate={openCrewDate}
        onClose={closeJob}
        onChanged={loadWeek}
        staff={staff}
        jobs={weekJobs}
        holidays={holidays}
        from="schedule"
      />
      <Toast {...toast} />
    </div>
  );
}
