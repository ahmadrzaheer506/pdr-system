// Site visits + Google Calendar sync (PRD §9.3)
const express = require('express');
const { db } = require('../db');
const { requireAuth, requireOffice } = require('../auth');
const { setStage, logActivity } = require('../services/pipeline');
const gcal = require('../integrations/gcal');

const router = express.Router();
router.use(requireAuth, requireOffice);

router.get('/', (req, res) => {
  const { from, to } = req.query;
  let sql = `SELECT a.*, c.name AS customer_name, c.phone FROM appointments a JOIN customers c ON c.id = a.customer_id WHERE a.status != 'cancelled'`;
  const params = [];
  if (from) { sql += ' AND datetime(a.start) >= datetime(?)'; params.push(from); }
  if (to) { sql += ' AND datetime(a.start) <= datetime(?)'; params.push(to); }
  sql += ' ORDER BY a.start';
  res.json({ appointments: db.prepare(sql).all(...params) });
});

router.post('/', async (req, res) => {
  const { customer_id, title, start, end, address, notes } = req.body || {};
  if (!customer_id || !start) return res.status(400).json({ error: 'customer_id and start required' });
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(customer_id);
  if (!customer) return res.status(404).json({ error: 'Customer not found' });
  const endTime = end || new Date(new Date(start).getTime() + 60 * 60 * 1000).toISOString();
  const useAddress = address || customer.address;
  const useTitle = title || `Site visit — ${customer.name}`;

  let eventId = null, gcalStatus = 'simulated';
  try {
    const ev = await gcal.createEvent({ title: useTitle, start, end: endTime, address: useAddress, notes, customerName: customer.name });
    eventId = ev.eventId;
    gcalStatus = ev.simulated ? 'simulated' : 'synced';
  } catch (err) {
    gcalStatus = 'not_synced';
    logActivity(customer_id, req.user.id, 'gcal_error', `Calendar sync failed: ${String(err.message).slice(0, 150)}`);
  }

  const r = db.prepare(
    'INSERT INTO appointments (customer_id, title, start, end, address, notes, gcal_event_id, gcal_status, created_by) VALUES (?,?,?,?,?,?,?,?,?)'
  ).run(customer_id, useTitle, new Date(start).toISOString(), new Date(endTime).toISOString(), useAddress, notes || null, eventId, gcalStatus, req.user.id);

  if (['ENQUIRY'].includes(customer.stage)) setStage(customer_id, 'SITE_VISIT_BOOKED', req.user.id, 'Site visit booked');
  logActivity(customer_id, req.user.id, 'appointment_booked',
    `Site visit booked for ${new Date(start).toLocaleString('en-GB', { timeZone: 'Europe/London' })}${gcalStatus === 'synced' ? ' (in Google Calendar)' : ''}`,
    'appointment', r.lastInsertRowid);
  res.json({ id: r.lastInsertRowid, gcal_status: gcalStatus });
});

router.put('/:id', async (req, res) => {
  const a = db.prepare('SELECT * FROM appointments WHERE id = ?').get(req.params.id);
  if (!a) return res.status(404).json({ error: 'Appointment not found' });
  const { title, start, end, address, notes, status } = req.body || {};
  const newStart = start ? new Date(start).toISOString() : a.start;
  const newEnd = end ? new Date(end).toISOString() : a.end;
  db.prepare('UPDATE appointments SET title = ?, start = ?, end = ?, address = ?, notes = ?, status = ? WHERE id = ?')
    .run(title || a.title, newStart, newEnd, address ?? a.address, notes ?? a.notes, status || a.status, a.id);
  if (a.gcal_event_id) {
    try {
      if (status === 'cancelled') await gcal.cancelEvent(a.gcal_event_id);
      else await gcal.updateEvent(a.gcal_event_id, { title: title || a.title, start: newStart, end: newEnd, address: address ?? a.address, notes: notes ?? a.notes });
    } catch { /* sync failure is non-fatal; polling will reconcile */ }
  }
  logActivity(a.customer_id, req.user.id, 'appointment_updated', status === 'cancelled' ? 'Site visit cancelled' : 'Site visit updated', 'appointment', a.id);
  res.json({ ok: true });
});

module.exports = router;
