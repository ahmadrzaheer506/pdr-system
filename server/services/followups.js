// ============================================================
// Automatic quote follow-up engine (PRD §10.2).
//  - scheduleForQuote(): when a quote is sent, queue the steps
//    from Settings (default: +2d WhatsApp, +5d email).
//  - processDue(): cron worker sends due steps UNLESS the
//    customer has replied since the quote went out (belt &
//    braces on top of messenger.stopFollowupsFor).
// ============================================================
const { db, getSetting, money } = require('../db');
const { logActivity, setStage } = require('./pipeline');
const { sendToCustomer } = require('./messenger');

function render(template, vars) {
  return String(template || '').replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined && vars[k] !== null ? vars[k] : ''));
}

function scheduleForQuote(quote) {
  const cfg = getSetting('followups');
  if (!cfg || !cfg.enabled) return 0;
  // clear any previous pending steps for this quote (re-send case)
  db.prepare("UPDATE followups SET status = 'cancelled' WHERE quote_id = ? AND status = 'pending'").run(quote.id);
  let step = 0;
  for (const s of cfg.steps || []) {
    step++;
    const scheduledAt = new Date(Date.now() + Number(s.delay_days) * 24 * 3600 * 1000)
      .toISOString().replace('T', ' ').slice(0, 19);
    db.prepare(
      'INSERT INTO followups (quote_id, customer_id, step, channel, scheduled_at) VALUES (?,?,?,?,?)'
    ).run(quote.id, quote.customer_id, step, s.channel, scheduledAt);
  }
  logActivity(quote.customer_id, null, 'followups_scheduled', `Automatic follow-ups scheduled for quote ${quote.ref} (${(cfg.steps || []).length} steps)`);
  return step;
}

/** Has the customer sent anything IN since this quote was sent? */
function customerRepliedSince(customerId, sinceIso) {
  const row = db
    .prepare(
      "SELECT 1 FROM messages WHERE customer_id = ? AND direction = 'in' AND datetime(created_at) > datetime(?) LIMIT 1"
    )
    .get(customerId, sinceIso);
  return !!row;
}

async function processDue() {
  const due = db
    .prepare(
      `SELECT f.*, q.ref, q.title, q.total, q.status AS quote_status, q.sent_at,
              c.name AS customer_name
       FROM followups f
       JOIN quotes q ON q.id = f.quote_id
       JOIN customers c ON c.id = f.customer_id
       WHERE f.status = 'pending' AND datetime(f.scheduled_at) <= datetime('now')`
    )
    .all();

  let sent = 0;
  for (const f of due) {
    // Quote decided or expired since → cancel silently
    if (f.quote_status !== 'sent') {
      db.prepare("UPDATE followups SET status = 'cancelled', stop_reason = ? WHERE id = ?")
        .run(`quote is ${f.quote_status}`, f.id);
      continue;
    }
    // Customer replied since the quote went out → stop (never look pushy)
    if (customerRepliedSince(f.customer_id, f.sent_at || f.created_at)) {
      db.prepare("UPDATE followups SET status = 'stopped', stop_reason = 'customer replied' WHERE id = ?").run(f.id);
      logActivity(f.customer_id, null, 'followup_stopped', `Follow-up step ${f.step} for ${f.ref} skipped — customer already replied`);
      continue;
    }

    const templates = getSetting('templates');
    const vars = {
      name: (f.customer_name || '').split(' ')[0],
      ref: f.ref,
      title: f.title,
      total: money(f.total),
    };
    const body = render(f.step === 1 ? templates.quote_followup_1 : templates.quote_followup_2, vars);

    try {
      if (f.channel === 'whatsapp') {
        await sendToCustomer(f.customer_id, 'whatsapp', body, {
          template: process.env.WHATSAPP_TEMPLATE_FOLLOWUP || 'quote_followup',
          templateParams: [vars.name, f.title],
        });
      } else {
        await sendToCustomer(f.customer_id, 'email', body, {
          subject: render(templates.followup_email_subject, vars),
        });
      }
      db.prepare("UPDATE followups SET status = 'sent', sent_at = datetime('now'), message = ? WHERE id = ?").run(body, f.id);
      logActivity(f.customer_id, null, 'followup_sent', `Automatic follow-up ${f.step}/${'2'} sent for quote ${f.ref} via ${f.channel}`);
      // First chase → customer sits in FOLLOW_UP stage
      const cust = db.prepare('SELECT stage FROM customers WHERE id = ?').get(f.customer_id);
      if (cust && cust.stage === 'QUOTED') setStage(f.customer_id, 'FOLLOW_UP', null, `Automatic follow-up sent for ${f.ref}`);
      sent++;
    } catch (err) {
      db.prepare("UPDATE followups SET status = 'cancelled', stop_reason = ? WHERE id = ?")
        .run(`send failed: ${String(err.message).slice(0, 200)}`, f.id);
      logActivity(f.customer_id, null, 'followup_failed', `Follow-up for ${f.ref} failed: ${String(err.message).slice(0, 200)}`);
    }
  }
  return sent;
}

module.exports = { scheduleForQuote, processDue, render };
