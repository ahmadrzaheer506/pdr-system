const {
  GCAL_COLOR, formatTimeRange, formatClockFromHhmm, formatTimeRangeFromHhmm,
  eventTitle, eventDescription, prettyStatus, appointmentTypeLabel,
} = require('../gcalEventFormat');

describe('gcalEventFormat', () => {
  test('uses Google palette ids so every CRM type has a fill colour', () => {
    expect(GCAL_COLOR.appointment).toBe('11');
    expect(GCAL_COLOR.job).toBe('9');
    expect(GCAL_COLOR.task).toBe('7');
    expect(GCAL_COLOR.holiday).toBe('6');
  });

  test('titles match time · type · reference', () => {
    expect(eventTitle({
      timeRange: '8:00 AM – 11:00 AM',
      typeLabel: 'Job',
      reference: 'JOB-9',
    })).toBe('8:00 AM – 11:00 AM · Job · JOB-9');
  });

  test('descriptions list CRM fields like the Google event card', () => {
    const body = eventDescription({
      time: '8:00 AM – 11:00 AM',
      type: 'Site visit',
      status: 'Booked',
      reference: 'L-0042',
      customer: 'Tom Ellery',
      assignees: 'Callum Ashworth',
      location: '9 Mill Lane, Tilehurst',
    });
    expect(body).toMatch(/Synced from Paul Douglas Roofing/);
    expect(body).toMatch(/Time: 8:00 AM – 11:00 AM/);
    expect(body).toMatch(/Type: Site visit/);
    expect(body).toMatch(/Status: Booked/);
    expect(body).toMatch(/Reference: L-0042/);
    expect(body).toMatch(/Customer: Tom Ellery/);
    expect(body).toMatch(/Assignees: Callum Ashworth/);
    expect(body).toMatch(/Location: 9 Mill Lane, Tilehurst/);
  });

  test('formats London times and visit labels', () => {
    expect(formatTimeRange('2026-10-08T09:00:00+01:00', '2026-10-08T10:00:00+01:00')).toMatch(/AM/);
    expect(formatClockFromHhmm('08:00')).toBe('8:00 AM');
    expect(formatClockFromHhmm('16:30')).toBe('4:30 PM');
    expect(formatTimeRangeFromHhmm('08:00', '16:30')).toBe('8:00 AM – 4:30 PM');
    expect(appointmentTypeLabel('measure')).toBe('Measure');
    expect(prettyStatus('IN_PROGRESS')).toBe('In progress');
  });
});
