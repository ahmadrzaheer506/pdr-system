/**
 * Invoice payment ledger and balances (requirement 11.4).
 * Office logs date + amount + optional note. amount_paid is the sum of ledger
 * rows, capped at due_now (CIS/retention already off). No reverse.
 */
const { Op, fn, col, literal } = require('sequelize');
const { Invoice, InvoicePayment } = require('./models');

const CAN_PAY_STATUSES = Object.freeze(['sent', 'part_paid', 'overdue']);
const OPEN_BALANCE_STATUSES = Object.freeze(['sent', 'part_paid', 'overdue']);
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const NOTE_MAX = 500;

function roundMoney(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

/** Remaining against due_now (never negative). */
function outstanding(inv) {
  return roundMoney(Math.max(0, Number(inv?.due_now || 0) - Number(inv?.amount_paid || 0)));
}

function canRecordPayment(status) {
  return CAN_PAY_STATUSES.includes(status);
}

function decorateBalance(inv) {
  return { ...inv, outstanding: outstanding(inv) };
}

/**
 * Validate a manual payment. Omitted amount pays the remaining due_now balance.
 * Amounts above remaining are capped (not rejected).
 * @returns {{ error: string, status: number }|{ amount: number, paid_at: string, note: string|null }}
 */
function parsePaymentBody(body, invoice, today) {
  if (!canRecordPayment(invoice.status)) {
    return { error: 'Payments can only be recorded on sent, part-paid, or overdue invoices', status: 400 };
  }
  const remaining = outstanding(invoice);
  if (remaining <= 0) {
    return { error: 'This invoice is already paid in full against the amount due now', status: 400 };
  }
  const b = body || {};
  let amount;
  if (b.amount === undefined || b.amount === null || b.amount === '') {
    amount = remaining;
  } else {
    amount = roundMoney(b.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return { error: 'Amount must be greater than zero', status: 400 };
    }
  }
  if (amount > remaining) amount = remaining;

  let paid_at = today;
  if (b.paid_at !== undefined && b.paid_at !== null && String(b.paid_at).trim() !== '') {
    paid_at = String(b.paid_at).trim();
    if (!DATE_ONLY.test(paid_at)) {
      return { error: 'paid_at must be a YYYY-MM-DD date', status: 400 };
    }
  }

  let note = null;
  if (b.note !== undefined && b.note !== null) {
    note = String(b.note).trim() || null;
    if (note && note.length > NOTE_MAX) {
      return { error: `Note must be ${NOTE_MAX} characters or fewer`, status: 400 };
    }
  }

  return { amount, paid_at, note };
}

/**
 * Insert a ledger row and recompute amount_paid from the ledger, capped at due_now.
 * @returns {Promise<{ error: string, status: number }|{ payment: object, cols: object }>}
 */
async function recordPayment(invoice, body, { userId, today }) {
  const parsed = parsePaymentBody(body, invoice, today);
  if (parsed.error) return parsed;

  const payment = await InvoicePayment.create({
    invoice_id: invoice.id,
    amount: parsed.amount,
    paid_at: parsed.paid_at,
    note: parsed.note,
    recorded_by: userId || null,
  });

  const rows = await InvoicePayment.findAll({ where: { invoice_id: invoice.id } });
  const summed = roundMoney(rows.reduce((sum, row) => sum + Number(row.amount || 0), 0));
  const cap = roundMoney(Number(invoice.due_now) || 0);
  const amount_paid = roundMoney(Math.min(cap, summed));
  const status = amount_paid >= cap ? 'paid' : 'part_paid';

  return {
    payment,
    cols: {
      amount_paid,
      status,
      paid_at: status === 'paid' ? new Date() : invoice.paid_at,
    },
  };
}

async function paymentsForInvoice(invoiceId) {
  return InvoicePayment.findAll({
    where: { invoice_id: invoiceId },
    order: [['paid_at', 'DESC'], ['id', 'DESC']],
  });
}

const OUTSTANDING_SQL = 'COALESCE(SUM(GREATEST(due_now - amount_paid, 0)),0)';

/**
 * Company-wide balances for the dashboard and Invoices totals strip.
 * Outstanding/overdue use due_now − amount_paid (requirement 11.4).
 */
async function balanceSummary() {
  const outstandingRow = await Invoice.findOne({
    attributes: [[literal(OUTSTANDING_SQL), 'v']],
    where: { status: { [Op.in]: OPEN_BALANCE_STATUSES } },
    raw: true,
  });
  const overdueRow = await Invoice.findOne({
    attributes: [[fn('COUNT', col('id')), 'c'], [literal(OUTSTANDING_SQL), 'v']],
    where: { status: 'overdue' },
    raw: true,
  });
  const paid_count = await Invoice.count({ where: { status: 'paid' } });
  return {
    outstanding: Number(outstandingRow?.v || 0),
    overdue: Number(overdueRow?.v || 0),
    overdue_count: Number(overdueRow?.c || 0),
    paid_count,
  };
}

module.exports = {
  CAN_PAY_STATUSES,
  OPEN_BALANCE_STATUSES,
  NOTE_MAX,
  roundMoney,
  outstanding,
  canRecordPayment,
  decorateBalance,
  parsePaymentBody,
  recordPayment,
  paymentsForInvoice,
  balanceSummary,
};
