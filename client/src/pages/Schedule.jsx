import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '../lib/api';
import { useToast, Toast } from '../components/ui.jsx';
import WeekView from '../components/WeekView.jsx';
import DayView from '../components/DayView.jsx';
import UnscheduledQueue from '../components/UnscheduledQueue.jsx';
import JobModal from '../components/JobModal.jsx';
import AiAssistant from '../components/AiAssistant.jsx';
import TeamAvailability from '../components/TeamAvailability.jsx';
import { addIsoDays, localIsoDate } from '../lib/schedule';

export default function Schedule() {
  const [anchorDate, setAnchorDate] = useState(() => new Date());
  const [dayIso, setDayIso] = useState(null);
  const [proposeDate, setProposeDate] = useState(addIsoDays(localIsoDate(), 1));
  const [weekJobs, setWeekJobs] = useState([]);
  const [unscheduled, setUnscheduled] = useState([]);
  const [staff, setStaff] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [openJob, setOpenJob] = useState(null);
  const { toast, show } = useToast();

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
          <p className="text-slate-500 text-sm mt-1">Speak or type tomorrow's situation — the assistant proposes a schedule from real job & staff data.</p>
        </div>
      </div>

      <AiAssistant proposeDate={proposeDate} setProposeDate={setProposeDate} onApproved={() => { loadWeek(); show('Schedule approved and live'); }} show={show} />

      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start">
        <div className="card p-4">
          {!dayIso ? (
            <>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-slate-800">Week view</h3>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setAnchorDate(new Date(anchorDate.getFullYear(), anchorDate.getMonth(), anchorDate.getDate() - 7))} className="btn-ghost !p-1.5" aria-label="Previous week"><ChevronLeft size={16} /></button>
                  <button type="button" onClick={() => setAnchorDate(new Date())} className="btn-ghost !py-1 !px-2.5 text-xs">Today</button>
                  <button type="button" onClick={() => setAnchorDate(new Date(anchorDate.getFullYear(), anchorDate.getMonth(), anchorDate.getDate() + 7))} className="btn-ghost !p-1.5" aria-label="Next week"><ChevronRight size={16} /></button>
                </div>
              </div>
              <WeekView
                anchorDate={anchorDate}
                jobs={weekJobs}
                holidays={holidays}
                onJobClick={setOpenJob}
                onDayClick={(iso) => {
                  const [y, m, d] = iso.split('-').map(Number);
                  setAnchorDate(new Date(y, m - 1, d));
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
              onJobClick={setOpenJob}
              onDateChange={(iso) => {
                const [y, m, d] = iso.split('-').map(Number);
                setAnchorDate(new Date(y, m - 1, d));
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
            onPlaced={() => { loadWeek(); show('Job placed on the schedule'); }}
            onError={(msg) => show(msg, 'error')}
            onOpen={setOpenJob}
          />
        </div>
        <TeamAvailability staff={staff} holidays={holidays} jobs={weekJobs} />
      </div>

      <JobModal
        jobId={openJob}
        onClose={() => setOpenJob(null)}
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
