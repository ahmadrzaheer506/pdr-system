// ============================================================
// Google Calendar adapter (OAuth2, raw REST — no SDK dependency).
// PRD §9.3: book site visit in CRM → event on Paul's calendar;
// moves/cancellations in Google sync back via polling.
// Live once GOOGLE_CLIENT_ID/SECRET set AND Paul clicks Connect.
// ============================================================
const { db, pj } = require('../db');

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const CAL_API = 'https://www.googleapis.com/calendar/v3';
const SCOPE = 'https://www.googleapis.com/auth/calendar.events';

function isConfigured() {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}
function redirectUri() {
  return process.env.GOOGLE_REDIRECT_URI || `${process.env.APP_URL || 'http://localhost:4000'}/api/integrations/google/callback`;
}
function getTokens() {
  return db.prepare("SELECT * FROM oauth_tokens WHERE provider = 'google'").get() || null;
}
function isConnected() {
  return !!getTokens();
}

function logEvent(direction, event, payload, status = 'ok') {
  db.prepare('INSERT INTO integration_events (provider, direction, event, payload, status) VALUES (?,?,?,?,?)')
    .run('google', direction, event, JSON.stringify(payload).slice(0, 4000), status);
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

async function exchangeCode(code) {
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
  const expiresAt = new Date(Date.now() + (data.expires_in - 60) * 1000).toISOString();
  db.prepare(
    `INSERT INTO oauth_tokens (provider, access_token, refresh_token, expires_at, meta, updated_at)
     VALUES ('google', ?, ?, ?, '{}', datetime('now'))
     ON CONFLICT(provider) DO UPDATE SET access_token = excluded.access_token,
       refresh_token = COALESCE(excluded.refresh_token, oauth_tokens.refresh_token),
       expires_at = excluded.expires_at, updated_at = datetime('now')`
  ).run(data.access_token, data.refresh_token || null, expiresAt);
  logEvent('in', 'oauth.connected', { scope: data.scope });
  return true;
}

async function accessToken() {
  const t = getTokens();
  if (!t) throw new Error('Google Calendar not connected');
  if (t.expires_at && new Date(t.expires_at) > new Date()) return t.access_token;
  // refresh
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
  const expiresAt = new Date(Date.now() + (data.expires_in - 60) * 1000).toISOString();
  db.prepare("UPDATE oauth_tokens SET access_token = ?, expires_at = ?, updated_at = datetime('now') WHERE provider = 'google'")
    .run(data.access_token, expiresAt);
  return data.access_token;
}

async function calFetch(path, options = {}) {
  const token = await accessToken();
  const res = await fetch(`${CAL_API}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Google Calendar API ${res.status}: ${JSON.stringify(data.error || data)}`);
  return data;
}

/** Create a calendar event for an appointment. Returns { eventId, simulated }. */
async function createEvent({ title, start, end, address, notes, customerName }) {
  if (!isConfigured() || !isConnected()) {
    logEvent('out', 'event.simulated', { title, start }, 'simulated');
    return { eventId: `sim-${Date.now()}`, simulated: true };
  }
  const body = {
    summary: title,
    location: address || undefined,
    description: `Customer: ${customerName || ''}\n${notes || ''}\n\n(Booked from PDR Business OS)`,
    start: { dateTime: new Date(start).toISOString(), timeZone: 'Europe/London' },
    end: { dateTime: new Date(end).toISOString(), timeZone: 'Europe/London' },
    reminders: { useDefault: true },
  };
  const data = await calFetch('/calendars/primary/events', { method: 'POST', body: JSON.stringify(body) });
  logEvent('out', 'event.created', { id: data.id, title });
  return { eventId: data.id, simulated: false };
}

async function updateEvent(eventId, { title, start, end, address, notes }) {
  if (!isConfigured() || !isConnected() || String(eventId).startsWith('sim-')) {
    logEvent('out', 'event.update_simulated', { eventId }, 'simulated');
    return { simulated: true };
  }
  const body = {
    summary: title,
    location: address || undefined,
    description: notes || undefined,
    start: { dateTime: new Date(start).toISOString(), timeZone: 'Europe/London' },
    end: { dateTime: new Date(end).toISOString(), timeZone: 'Europe/London' },
  };
  await calFetch(`/calendars/primary/events/${eventId}`, { method: 'PATCH', body: JSON.stringify(body) });
  logEvent('out', 'event.updated', { eventId });
  return { simulated: false };
}

async function cancelEvent(eventId) {
  if (!isConfigured() || !isConnected() || String(eventId).startsWith('sim-')) return { simulated: true };
  await calFetch(`/calendars/primary/events/${eventId}`, { method: 'DELETE' });
  logEvent('out', 'event.cancelled', { eventId });
  return { simulated: false };
}

/**
 * Two-way sync (polling): pull each synced future appointment's event and
 * mirror moves/cancellations made directly in Google Calendar. Called from cron.
 */
async function pollChanges() {
  if (!isConfigured() || !isConnected()) return 0;
  const appts = db.prepare(
    `SELECT * FROM appointments WHERE gcal_event_id IS NOT NULL AND gcal_status = 'synced'
     AND status = 'booked' AND datetime(start) > datetime('now', '-1 day')`
  ).all();
  let changed = 0;
  for (const a of appts) {
    try {
      const ev = await calFetch(`/calendars/primary/events/${a.gcal_event_id}`);
      if (!ev) continue;
      if (ev.status === 'cancelled') {
        db.prepare("UPDATE appointments SET status = 'cancelled' WHERE id = ?").run(a.id);
        changed++;
        continue;
      }
      const newStart = ev.start?.dateTime || ev.start?.date;
      const newEnd = ev.end?.dateTime || ev.end?.date;
      if (newStart && new Date(newStart).getTime() !== new Date(a.start).getTime()) {
        db.prepare('UPDATE appointments SET start = ?, end = ? WHERE id = ?')
          .run(new Date(newStart).toISOString(), new Date(newEnd).toISOString(), a.id);
        changed++;
      }
    } catch (err) {
      logEvent('in', 'poll.error', { appointment: a.id, error: String(err.message) }, 'error');
    }
  }
  if (changed) logEvent('in', 'poll.synced', { changed });
  return changed;
}

function status() {
  return {
    id: 'google',
    name: 'Google Calendar',
    configured: isConfigured(),
    connected: isConnected(),
    mode: isConfigured() && isConnected() ? 'live' : 'simulated',
    env_needed: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI'],
    connect_url: '/api/integrations/google/connect',
    detail: !isConfigured()
      ? 'Simulated — site visits are tracked in-app only. Add OAuth client keys, then Paul clicks Connect.'
      : isConnected()
        ? 'Live — events sync to the connected Google account'
        : 'Keys present — waiting for Paul to click "Connect Google Calendar" in Settings.',
  };
}

module.exports = { isConfigured, isConnected, authUrl, exchangeCode, createEvent, updateEvent, cancelEvent, pollChanges, status };
