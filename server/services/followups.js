// ============================================================
// Automatic quote follow-up engine (requirement 12.1).
// ============================================================
const { Op } = require('sequelize');
const { Followup, Quote, Customer, Message } = require('../models');
const { getSetting, money, plain } = require('../db');
const { logActivity, setStage, resolveLeadForCustomer } = require('./pipeline');
const { sendToCustomer } = require('./messenger');
const { stepBody, DEFAULT_EMAIL_SUBJECT } = require('../quoteFollowups');
const { ensureQuoteFollowupTask, resolveQuoteFollowupTask } = require('./taskEngine');

function render(template, vars) {
  return String(template || '').replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined && vars[k] !== null ? vars[k] : ''));
}

async function cancelPendingForQuote(quoteId, reason) {
  const [n] = await Followup.update(
    { status: 'cancelled', stop_reason: reason },
    { where: { quote_id: quoteId, status: 'pending' } }
  );
  return n;
}

async function stopPendingForQuote(quoteId, reason) {
  const [n] = await Followup.update(
    { status: 'stopped', stop_reason: reason },
    { where: { quote_id: quoteId, status: 'pending' } }
  );
  return n;
}

/**
 * Halt remaining pending steps for quotes that had already been sent when the
 * inbound arrived. Later quotes for the same customer keep their sequences.
 */
async function stopFollowupsAfterInbound(customerId, inboundAt = new Date(), reason = 'customer replied') {
  const quotes = await Quote.findAll({
    where: {
      customer_id: customerId,
      sent_at: { [Op.ne]: null, [Op.lt]: inboundAt },
    },
    attributes: ['id', 'ref'],
  });
  let total = 0;
  for (const q of quotes) {
    const n = await stopPendingForQuote(q.id, reason);
    total += n;
    await resolveQuoteFollowupTask(q.id);
    if (n > 0) {
      await logActivity(customerId, null, 'followups_stopped', `Automatic follow-ups for ${q.ref} stopped — ${reason}`);
    }
  }
  return total;
}

async function scheduleForQuote(quote) {
  const cfg = await getSetting('followups');
  if (!cfg || !cfg.enabled) return 0;
  await cancelPendingForQuote(quote.id, 'rescheduled');
  const origin = quote.sent_at ? new Date(quote.sent_at).getTime() : Date.now();
  let created = 0;
  let firstStepAt = null;
  for (const s of cfg.steps || []) {
    const body = stepBody(s);
    if (!body) continue;
    created++;
    const scheduledAt = new Date(origin + Number(s.delay_days) * 24 * 3600 * 1000);
    if (!firstStepAt) firstStepAt = scheduledAt;
    await Followup.create({
      quote_id: quote.id,
      customer_id: quote.customer_id,
      step: created,
      channel: s.channel,
      scheduled_at: scheduledAt,
      body_template: body,
    });
  }
  if (!created) return 0;
  if (firstStepAt) {
    await ensureQuoteFollowupTask(quote, firstStepAt);
  }
  await logActivity(quote.customer_id, null, 'followups_scheduled', `Automatic follow-ups scheduled for quote ${quote.ref} (${created} steps)`);
  return created;
}

async function customerRepliedSince(customerId, sinceIso) {
  const since = sinceIso ? new Date(sinceIso) : new Date(0);
  const row = await Message.findOne({
    where: {
      customer_id: customerId,
      direction: 'in',
      created_at: { [Op.gt]: since },
    },
  });
  return !!row;
}

async function processDue() {
  const due = await Followup.findAll({
    where: {
      status: 'pending',
      scheduled_at: { [Op.lte]: new Date() },
    },
    include: [
      { model: Quote, attributes: ['id', 'ref', 'title', 'total', 'status', 'sent_at', 'lead_id'] },
      { model: Customer, attributes: ['name'] },
    ],
  });

  let sent = 0;
  for (const f of due) {
    const quoteStatus = f.Quote?.status;
    if (quoteStatus !== 'sent') {
      f.status = 'cancelled';
      f.stop_reason = `quote is ${quoteStatus}`;
      await f.save();
      continue;
    }
    const since = f.Quote?.sent_at || f.created_at;
    if (await customerRepliedSince(f.customer_id, since)) {
      await stopPendingForQuote(f.quote_id, 'customer replied');
      await resolveQuoteFollowupTask(f.quote_id);
      await logActivity(f.customer_id, null, 'followup_stopped', `Follow-up steps for ${f.Quote.ref} skipped — customer already replied`);
      continue;
    }

    const followups = await getSetting('followups');
    const vars = {
      name: (f.Customer?.name || '').split(' ')[0],
      ref: f.Quote.ref,
      title: f.Quote.title,
      total: money(f.Quote.total),
    };
    const template = String(f.body_template || '').trim()
      || stepBody((followups?.steps || [])[f.step - 1]);
    if (!template) {
      f.status = 'cancelled';
      f.stop_reason = 'no Company follow-up body';
      await f.save();
      continue;
    }
    const body = render(template, vars);

    try {
      if (f.channel === 'whatsapp') {
        await sendToCustomer(f.customer_id, 'whatsapp', body, {
          template: process.env.WHATSAPP_TEMPLATE_FOLLOWUP || 'quote_followup',
          templateParams: [vars.name, f.Quote.title],
        });
      } else {
        const subjectTpl = followups?.email_subject || DEFAULT_EMAIL_SUBJECT;
        await sendToCustomer(f.customer_id, 'email', body, {
          subject: render(subjectTpl, vars),
        });
      }
      f.status = 'sent';
      f.sent_at = new Date();
      f.message = body;
      await f.save();
      await logActivity(f.customer_id, null, 'followup_sent', `Automatic follow-up step ${f.step} sent for quote ${f.Quote.ref} via ${f.channel}`);
      const cust = await Customer.findByPk(f.customer_id, { attributes: ['stage'] });
      const lead = await resolveLeadForCustomer(f.customer_id, f.Quote?.lead_id);
      if ((lead?.stage || cust?.stage) === 'QUOTED') {
        await setStage(f.customer_id, 'FOLLOW_UP', null, `Automatic follow-up sent for ${f.Quote.ref}`, { leadId: lead?.id || f.Quote?.lead_id });
      }
      sent++;
    } catch (err) {
      f.status = 'cancelled';
      f.stop_reason = `send failed: ${String(err.message).slice(0, 200)}`;
      await f.save();
      await logActivity(f.customer_id, null, 'followup_failed', `Follow-up for ${f.Quote.ref} failed: ${String(err.message).slice(0, 200)}`);
    }
  }
  return sent;
}

module.exports = {
  scheduleForQuote,
  processDue,
  render,
  cancelPendingForQuote,
  stopFollowupsAfterInbound,
  resolveQuoteFollowupTask,
};
