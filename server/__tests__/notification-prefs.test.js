'use strict';

const {
  parsePreferences, wantsInApp, wantsEmail, kindsForRole, emptyPrefs, catalog,
} = require('../notificationPrefs');

describe('notificationPrefs (requirement 13.2)', () => {
  test('missing keys are off except assigned site visits for staff', () => {
    expect(wantsInApp({}, 'new_enquiry')).toBe(false);
    expect(wantsInApp({ in_app: { new_enquiry: false } }, 'new_enquiry')).toBe(false);
    expect(wantsInApp({}, 'visit_booked', 'STAFF')).toBe(true);
    expect(wantsInApp({ in_app: { visit_booked: false } }, 'visit_booked', 'STAFF')).toBe(false);
    expect(wantsInApp({}, 'visit_booked', 'OFFICE')).toBe(false);
    expect(wantsEmail({ email: { crew_added: true } }, 'crew_added', 'OFFICE')).toBe(false);
    expect(wantsEmail({ email: { crew_added: true } }, 'crew_added', 'STAFF')).toBe(true);
  });

  test('office cannot store email flags', () => {
    const bad = parsePreferences({ email: { crew_added: true } }, 'OFFICE');
    expect(bad.error).toMatch(/field staff/i);
    const ok = parsePreferences({ in_app: { new_enquiry: true } }, 'ADMIN');
    expect(ok.value.in_app.new_enquiry).toBe(true);
    expect(ok.value.email).toEqual({});
  });

  test('rejects unknown kinds', () => {
    expect(parsePreferences({ in_app: { banana: true } }, 'STAFF').error).toMatch(/Unknown in-app/);
    expect(parsePreferences({ email: { new_enquiry: true } }, 'STAFF').error).toMatch(/Unknown email/);
  });

  test('staff kinds include crew email; office kinds do not', () => {
    expect(kindsForRole('STAFF')).toEqual(expect.arrayContaining(['crew_added', 'holiday_approved', 'visit_booked']));
    expect(kindsForRole('OFFICE')).toEqual(expect.arrayContaining(['new_enquiry', 'holiday_submitted']));
    expect(emptyPrefs('STAFF').email).toEqual({ crew_added: false, crew_removed: false });
    expect(emptyPrefs('STAFF').in_app.visit_booked).toBe(true);
    expect(emptyPrefs('STAFF').in_app.crew_added).toBe(false);
    expect(catalog('OFFICE', { new_enquiry: 'New enquiry' }).find((k) => k.id === 'new_enquiry').email).toBe(false);
    expect(catalog('STAFF', { crew_added: 'Assigned' }).find((k) => k.id === 'crew_added').email).toBe(true);
  });
});
