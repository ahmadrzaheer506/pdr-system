// ============================================================
// Reminders & Task Engine (PRD §10.4).
// System tasks are deduplicated by rule_key — a rule can fire
// repeatedly without spamming duplicates while one is open.
// ============================================================
const { db, todayStr } = require('../db');

function ensureTask({ ruleKey, title, detail = null, dueDate = null, priority = 'normal', assigneeId = null, entityType = null, entityId = null }) {
  if (ruleKey) {
    const existing = db
      .prepare("SELECT id FROM tasks WHERE rule_key = ? AND status = 'open'")
      .get(ruleKey);
    if (existing) return existing.id;
    // If the same rule fired before and was completed, don't recreate within the same day
    const doneToday = db
      .prepare("SELECT id FROM tasks WHERE rule_key = ? AND status != 'open' AND date(done_at) = date('now')")
      .get(ruleKey);
    if (doneToday) return null;
  }
  const r = db
    .prepare(
      `INSERT INTO tasks (type, rule_key, title, detail, due_date, priority, assignee_id, entity_type, entity_id)
       VALUES ('system', ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(ruleKey, title, detail, dueDate, priority, assigneeId, entityType, entityId);
  return r.lastInsertRowid;
}

/** Close any open system task matching a rule key (e.g. quote produced → clear 'produce quote'). */
function resolveRule(ruleKey) {
  db.prepare(
    "UPDATE tasks SET status = 'done', done_at = datetime('now') WHERE rule_key = ? AND status = 'open'"
  ).run(ruleKey);
}

// ---------- scheduled rule scans (called from cron) ----------

/** Appointment end-time passed → advance stage + 'produce quote' task (PRD §9.3). */
function scanAppointments(setStage) {
  const rows = db
    .prepare(
      `SELECT a.*, c.name AS customer_name, c.stage FROM appointments a
       JOIN customers c ON c.id = a.customer_id
       WHERE a.status = 'booked' AND a.stage_advanced = 0 AND datetime(a.end) < datetime('now')`
    )
    .all();
  for (const a of rows) {
    db.prepare("UPDATE appointments SET status = 'done', stage_advanced = 1 WHERE id = ?").run(a.id);
    if (['ENQUIRY', 'SITE_VISIT_BOOKED'].includes(a.stage)) {
      setStage(a.customer_id, 'QUOTE_PENDING', null, 'Site visit completed — quote needed');
    }
    ensureTask({
      ruleKey: `produce_quote:customer:${a.customer_id}`,
      title: `Produce quote for ${a.customer_name}`,
      detail: `Site visit "${a.title}" completed — quotation needs producing.`,
      dueDate: todayStr(),
      priority: 'high',
      entityType: 'customer',
      entityId: a.customer_id,
    });
  }
  return rows.length;
}

/** Jobs starting tomorrow → confirm materials/team reminder (PRD §10.4). */
function scanJobsTomorrow() {
  const rows = db
    .prepare(
      `SELECT j.*, c.name AS customer_name FROM jobs j
       JOIN customers c ON c.id = j.customer_id
       WHERE j.status = 'SCHEDULED' AND j.start_date = date('now', '+1 day')`
    )
    .all();
  for (const jb of rows) {
    ensureTask({
      ruleKey: `job_tomorrow:job:${jb.id}`,
      title: `Job starts tomorrow — ${jb.title}`,
      detail: `${jb.customer_name} · ${jb.address || 'no address'}. Confirm materials and team.${jb.materials ? ` Materials: ${jb.materials}` : ''}`,
      dueDate: todayStr(),
      priority: 'high',
      entityType: 'job',
      entityId: jb.id,
    });
  }
  return rows.length;
}

/** Completed jobs with no invoice → 'invoice this job'. */
function scanUninvoicedJobs() {
  const rows = db
    .prepare(
      `SELECT j.*, c.name AS customer_name FROM jobs j
       JOIN customers c ON c.id = j.customer_id
       WHERE j.status = 'COMPLETED'
         AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.job_id = j.id)`
    )
    .all();
  for (const jb of rows) {
    ensureTask({
      ruleKey: `invoice_job:job:${jb.id}`,
      title: `Invoice job — ${jb.title}`,
      detail: `${jb.customer_name}'s job is completed and has no invoice yet.`,
      dueDate: todayStr(),
      priority: 'high',
      entityType: 'job',
      entityId: jb.id,
    });
  }
  return rows.length;
}

/** Invoices past due → mark overdue + 'chase payment' task (PRD §10.3/§10.4). */
function scanOverdueInvoices(logActivity) {
  const rows = db
    .prepare(
      `SELECT i.*, c.name AS customer_name FROM invoices i
       JOIN customers c ON c.id = i.customer_id
       WHERE i.status IN ('sent','part_paid') AND i.due_date IS NOT NULL AND date(i.due_date) < date('now')`
    )
    .all();
  for (const inv of rows) {
    db.prepare("UPDATE invoices SET status = 'overdue' WHERE id = ?").run(inv.id);
    logActivity(inv.customer_id, null, 'invoice_overdue', `Invoice ${inv.ref} is overdue`);
    ensureTask({
      ruleKey: `chase_payment:invoice:${inv.id}`,
      title: `Payment overdue — ${inv.ref} (${inv.customer_name})`,
      detail: `Invoice ${inv.ref} was due ${inv.due_date} and is unpaid. Chase payment.`,
      dueDate: todayStr(),
      priority: 'high',
      entityType: 'invoice',
      entityId: inv.id,
    });
  }
  return rows.length;
}

/** Quotes past valid_until still unanswered → expire them. */
function scanExpiredQuotes(logActivity) {
  const rows = db
    .prepare(
      `SELECT q.*, c.name AS customer_name FROM quotes q
       JOIN customers c ON c.id = q.customer_id
       WHERE q.status = 'sent' AND q.valid_until IS NOT NULL AND date(q.valid_until) < date('now')`
    )
    .all();
  for (const q of rows) {
    db.prepare("UPDATE quotes SET status = 'expired', updated_at = datetime('now') WHERE id = ?").run(q.id);
    logActivity(q.customer_id, null, 'quote_expired', `Quote ${q.ref} passed its valid-until date`);
    ensureTask({
      ruleKey: `quote_expired:quote:${q.id}`,
      title: `Quote expired — ${q.ref} (${q.customer_name})`,
      detail: 'Quote passed its validity date with no decision. Re-issue or mark lost.',
      dueDate: todayStr(),
      priority: 'normal',
      entityType: 'quote',
      entityId: q.id,
    });
  }
  return rows.length;
}

/** Jobs whose start date has arrived → IN_PROGRESS (and customer stage). */
function scanJobStarts(setStage) {
  const rows = db
    .prepare(
      `SELECT j.* FROM jobs j WHERE j.status = 'SCHEDULED' AND date(j.start_date) <= date('now')`
    )
    .all();
  for (const jb of rows) {
    db.prepare("UPDATE jobs SET status = 'IN_PROGRESS', updated_at = datetime('now') WHERE id = ?").run(jb.id);
    const cust = db.prepare('SELECT stage FROM customers WHERE id = ?').get(jb.customer_id);
    if (cust && cust.stage === 'SCHEDULED') setStage(jb.customer_id, 'IN_PROGRESS', null, 'Job start date reached');
  }
  return rows.length;
}

function runAllScans({ setStage, logActivity }) {
  const results = {
    appointments: scanAppointments(setStage),
    jobsTomorrow: scanJobsTomorrow(),
    uninvoiced: scanUninvoicedJobs(),
    overdueInvoices: scanOverdueInvoices(logActivity),
    expiredQuotes: scanExpiredQuotes(logActivity),
    jobStarts: scanJobStarts(setStage),
  };
  return results;
}

module.exports = { ensureTask, resolveRule, runAllScans, scanAppointments, scanJobsTomorrow, scanUninvoicedJobs, scanOverdueInvoices, scanExpiredQuotes, scanJobStarts };
