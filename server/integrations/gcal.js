// ============================================================
// Google Calendar adapter (OAuth2, raw REST — no SDK dependency).
// Requirement 5.2: each office user connects their own calendar.
// CRM → Google on book/update/cancel; Google → CRM via poll of linked
// events (time moves and cancels). Booking still works unconnected
// (simulated in-app). Live once GOOGLE_CLIENT_ID/SECRET set AND that
// user clicks Connect.
// ============================================================
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');
const { OauthToken, Appointment, logIntegrationEvent } = require('../models');
const { plain } = require('../db');
const { SOURCE_NAME } = require('../gcalEventFormat');

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const CAL_API = 'https://www.googleapis.com/calendar/v3';
const SCOPE = 'https://www.googleapis.com/auth/calendar';
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const CRM_CALENDAR_SUMMARY = SOURCE_NAME;

function isConfigured() {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}
function redirectUri() {
  return process.env.GOOGLE_REDIRECT_URI || `${process.env.APP_URL || 'http://localhost:4000'}/api/integrations/google/callback`;
}

/** Signed OAuth state so the callback binds the token to the office user who clicked Connect. */
function signOauthState(userId) {
  return jwt.sign({ uid: Number(userId), p: 'gcal' }, JWT_SECRET, { expiresIn: '15m' });
}

function parseOauthState(state) {
  if (!state) throw new Error('Missing OAuth state');
  const payload = jwt.verify(state, JWT_SECRET);
  if (payload.p !== 'gcal' || !payload.uid) throw new Error('Invalid OAuth state');
  return Number(payload.uid);
}

async function getTokens(userId) {
  if (!userId) return null;
  return plain(await OauthToken.findOne({ where: { provider: 'google', user_id: userId } }));
}

async function isConnected(userId) {
  return !!(await getTokens(userId));
}

async function logEvent(direction, event, payload, status = 'ok') {
  await logIntegrationEvent('google', direction, event, payload, status);
}

function authUrl(state = '') {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    state,
  });
  return `${AUTH_URL}?${params}`;
}

async function saveUserTokens(userId, data) {
  const expiresAt = new Date(Date.now() + (data.expires_in - 60) * 1000);
  const existing = await OauthToken.findOne({ where: { provider: 'google', user_id: userId } });
  if (existing) {
    await existing.update({
      access_token: data.access_token,
      refresh_token: data.refresh_token || existing.refresh_token,
      expires_at: expiresAt,
    });
  } else {
    await OauthToken.create({
      provider: 'google',
      user_id: userId,
      access_token: data.access_token,
      refresh_token: data.refresh_token || null,
      expires_at: expiresAt,
      meta: {},
    });
  }
}

/** Drop this user's Google token. CRM records stay; Google events are left in place. */
async function disconnect(userId) {
  if (!userId) return false;
  const n = await OauthToken.destroy({ where: { provider: 'google', user_id: userId } });
  if (n) await logEvent('in', 'oauth.disconnected', { userId });
  return n > 0;
}

function sourceUrl() {
  const app = String(process.env.APP_URL || '').replace(/\/$/, '');
  if (app && /^https:\/\//i.test(app) && !/localhost|127\.0\.0\.1/i.test(app)) return app;
  return 'https://www.pauldouglasroofing.co.uk';
}

function eventBody({ title, start, end, address, notes, allDay, startDate, endDateExclusive, colorId }) {
  const body = {
    summary: title,
    location: address || undefined,
    description: notes || undefined,
    colorId: colorId ? String(colorId) : undefined,
    transparency: 'opaque',
    reminders: { useDefault: true },
    source: { title: SOURCE_NAME, url: sourceUrl() },
  };
  if (allDay) {
    body.start = { date: startDate };
    body.end = { date: endDateExclusive };
  } else {
    body.start = { dateTime: new Date(start).toISOString(), timeZone: 'Europe/London' };
    body.end = { dateTime: new Date(end).toISOString(), timeZone: 'Europe/London' };
  }
  return body;
}

async function exchangeCode(code, userId) {
  if (!userId) throw new Error('Google Calendar connect must be tied to a user');
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri(),
      grant_type: 'authorization_code',
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Google token exchange failed: ${JSON.stringify(data)}`);
  await saveUserTokens(userId, data);
  await logEvent('in', 'oauth.connected', { userId, scope: data.scope });
  return true;
}

async function accessToken(userId) {
  const t = await getTokens(userId);
  if (!t) throw new Error('Google Calendar not connected');
  if (t.expires_at && new Date(t.expires_at) > new Date()) return t.access_token;
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: t.refresh_token,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Google token refresh failed: ${JSON.stringify(data)}`);
  const expiresAt = new Date(Date.now() + (data.expires_in - 60) * 1000);
  await OauthToken.update(
    { access_token: data.access_token, expires_at: expiresAt },
    { where: { provider: 'google', user_id: userId } },
  );
  return data.access_token;
}

async function calFetch(userId, path, options = {}) {
  const token = await accessToken(userId);
  const res = await fetch(`${CAL_API}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Google Calendar API ${res.status}: ${JSON.stringify(data.error || data)}`);
  return data;
}

function shouldSimulate(userId) {
  return !userId || !isConfigured();
}

async function saveCalendarId(userId, calendarId) {
  const row = await OauthToken.findOne({ where: { provider: 'google', user_id: userId } });
  if (!row) return;
  const meta = { ...(plain(row).meta || {}), gcal_calendar_id: calendarId };
  await row.update({ meta });
}

/**
 * Only write to a named CRM calendar when it is on the user's calendar list
 * and selected. A calendar that was created but never inserted into
 * calendarList is invisible — events "succeed" and never show in the UI.
 */
async function ensureCrmCalendar(userId) {
  let list;
  try {
    list = await calFetch(userId, '/users/me/calendarList?maxResults=250');
  } catch {
    return 'primary';
  }
  const items = list.items || [];
  const existing = items.find((cal) => cal.summary === CRM_CALENDAR_SUMMARY);
  if (existing?.id) {
    if (existing.selected === false) {
      try {
        await calFetch(userId, `/users/me/calendarList/${encodeURIComponent(existing.id)}`, {
          method: 'PUT',
          body: JSON.stringify({
            ...existing,
            selected: true,
            hidden: false,
            colorRgbFormat: true,
            backgroundColor: '#dc1114',
          }),
        });
      } catch { /* still listed — user can tick it */ }
    }
    await saveCalendarId(userId, existing.id);
    return existing.id;
  }
  try {
    const created = await calFetch(userId, '/calendars', {
      method: 'POST',
      body: JSON.stringify({ summary: CRM_CALENDAR_SUMMARY, timeZone: 'Europe/London' }),
    });
    if (!created?.id) return 'primary';
    await calFetch(userId, '/users/me/calendarList', {
      method: 'POST',
      body: JSON.stringify({
        id: created.id,
        selected: true,
        hidden: false,
        colorRgbFormat: true,
        backgroundColor: '#dc1114',
      }),
    });
    await saveCalendarId(userId, created.id);
    return created.id;
  } catch {
    return 'primary';
  }
}

async function calendarsToTry(userId) {
  const tokens = await getTokens(userId);
  const stored = tokens?.meta?.gcal_calendar_id;
  const ids = ['primary'];
  if (stored && stored !== 'primary') ids.push(stored);
  return ids;
}

function calendarEventsPath(calendarId, eventId) {
  const cal = encodeURIComponent(calendarId);
  if (!eventId) return `/calendars/${cal}/events`;
  return `/calendars/${cal}/events/${encodeURIComponent(eventId)}`;
}

async function getEvent(userId, eventId) {
  let lastErr;
  for (const calendarId of await calendarsToTry(userId)) {
    try {
      return await calFetch(userId, calendarEventsPath(calendarId, eventId));
    } catch (err) {
      lastErr = err;
      if (!String(err.message).includes('Google Calendar API 404')) throw err;
    }
  }
  throw lastErr || new Error('Google Calendar API 404');
}

async function postEvent(userId, body) {
  const calendarId = await ensureCrmCalendar(userId);
  try {
    return await calFetch(userId, calendarEventsPath(calendarId), { method: 'POST', body: JSON.stringify(body) });
  } catch (err) {
    if (calendarId !== 'primary') {
      return calFetch(userId, calendarEventsPath('primary'), { method: 'POST', body: JSON.stringify(body) });
    }
    throw err;
  }
}

async function writeEvent(userId, eventId, options) {
  let lastErr;
  for (const calendarId of await calendarsToTry(userId)) {
    try {
      return await calFetch(userId, calendarEventsPath(calendarId, eventId), options);
    } catch (err) {
      lastErr = err;
      if (!String(err.message).includes('Google Calendar API 404')) throw err;
    }
  }
  throw lastErr || new Error('Google Calendar API 404');
}

/** Create a calendar event on the user's primary calendar, or simulate if they are not connected. */
async function createEvent({
  title, start, end, address, notes, userId, allDay, startDate, endDateExclusive, colorId,
}) {
  if (shouldSimulate(userId) || !(await isConnected(userId))) {
    await logEvent('out', 'event.simulated', { title, start, userId: userId || null }, 'simulated');
    return { eventId: `sim-${Date.now()}`, simulated: true };
  }
  const body = eventBody({
    title,
    start,
    end,
    address,
    notes,
    colorId,
    allDay,
    startDate,
    endDateExclusive,
  });
  let data;
  try {
    data = await postEvent(userId, body);
  } catch (err) {
    const { source, ...withoutSource } = body;
    if (!source) throw err;
    data = await postEvent(userId, withoutSource);
  }
  await logEvent('out', 'event.created', { id: data.id, title, userId });
  return { eventId: data.id, simulated: false };
}

async function updateEvent(eventId, payload, userId) {
  if (shouldSimulate(userId) || !(await isConnected(userId)) || String(eventId).startsWith('sim-')) {
    await logEvent('out', 'event.update_simulated', { eventId, userId: userId || null }, 'simulated');
    return { simulated: true };
  }
  const body = eventBody(payload);
  await writeEvent(userId, eventId, { method: 'PATCH', body: JSON.stringify(body) });
  await logEvent('out', 'event.updated', { eventId, userId });
  return { simulated: false };
}

async function cancelEvent(eventId, userId) {
  if (shouldSimulate(userId) || !(await isConnected(userId)) || String(eventId).startsWith('sim-')) {
    return { simulated: true };
  }
  await writeEvent(userId, eventId, { method: 'DELETE' });
  await logEvent('out', 'event.cancelled', { eventId, userId });
  return { simulated: false };
}

/**
 * Two-way sync (polling): for each linked booked visit, use the booker's
 * calendar token and mirror moves/cancellations made in Google. Cron.
 */
async function pollChanges() {
  if (!isConfigured()) return 0;
  const since = new Date(Date.now() - 24 * 3600 * 1000);
  const appts = await Appointment.findAll({
    where: {
      gcal_event_id: { [Op.ne]: null },
      gcal_status: 'synced',
      status: 'booked',
      start: { [Op.gt]: since },
    },
  });
  let changed = 0;
  for (const a of appts) {
    const userId = a.created_by;
    if (!userId || !(await isConnected(userId))) continue;
    try {
      const ev = await getEvent(userId, a.gcal_event_id);
      if (!ev) continue;
      if (ev.status === 'cancelled') {
        a.status = 'cancelled';
        await a.save();
        changed++;
        continue;
      }
      if (ev.start?.dateTime) {
        const newStart = ev.start.dateTime;
        const newEnd = ev.end?.dateTime;
        if (newStart && new Date(newStart).getTime() !== new Date(a.start).getTime()) {
          a.start = new Date(newStart);
          if (newEnd) a.end = new Date(newEnd);
          await a.save();
          changed++;
        }
      }
    } catch (err) {
      await logEvent('in', 'poll.error', { appointment: a.id, error: String(err.message) }, 'error');
    }
  }
  if (changed) await logEvent('in', 'poll.synced', { changed });
  try {
    const extra = await require('../calendarSync').pollInbound();
    return changed + extra;
  } catch {
    return changed;
  }
}

async function status(userId) {
  const connected = userId ? await isConnected(userId) : false;
  return {
    id: 'google',
    name: 'Google Calendar',
    configured: isConfigured(),
    connected,
    mode: isConfigured() && connected ? 'live' : 'simulated',
    env_needed: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI'],
    connect_url: '/api/integrations/google/connect',
    detail: !isConfigured()
      ? 'Simulated — events stay in-app until OAuth client keys are set, then each user connects their own calendar from Profile.'
      : connected
        ? 'Live — visits, jobs, holidays and tasks sync onto your Paul Douglas Roofing Google Calendar'
        : 'Keys present — connect Google Calendar from Profile. Nothing is pushed until you connect.',
  };
}

module.exports = {
  isConfigured,
  isConnected,
  authUrl,
  signOauthState,
  parseOauthState,
  exchangeCode,
  disconnect,
  eventBody,
  createEvent,
  updateEvent,
  cancelEvent,
  getEvent,
  pollChanges,
  status,
  calFetch,
};
