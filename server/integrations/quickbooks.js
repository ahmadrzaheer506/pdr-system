// ============================================================
// QuickBooks Online (UK) adapter — OAuth2 + invoice push +
// payment status sync back (PRD §10.3). Raw REST, no SDK.
// Live once QBO_CLIENT_ID/SECRET set AND Paul clicks Connect.
// ============================================================
const { Op } = require('sequelize');
const { OauthToken, Invoice, logIntegrationEvent } = require('../models');
const { plain } = require('../db');

const AUTH_URL = 'https://appcenter.intuit.com/connect/oauth2';
const TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';

function apiBase() {
  return process.env.QBO_ENVIRONMENT === 'production'
    ? 'https://quickbooks.api.intuit.com'
    : 'https://sandbox-quickbooks.api.intuit.com';
}

function isConfigured() {
  return !!(process.env.QBO_CLIENT_ID && process.env.QBO_CLIENT_SECRET);
}
function redirectUri() {
  return process.env.QBO_REDIRECT_URI || `${process.env.APP_URL || 'http://localhost:4000'}/api/integrations/quickbooks/callback`;
}
async function getTokens() {
  return plain(await OauthToken.findOne({ where: { provider: 'quickbooks', user_id: null } }));
}
async function isConnected() {
  const t = await getTokens();
  return !!(t && t.meta && t.meta.realmId);
}

async function logEvent(direction, event, payload, status = 'ok') {
  await logIntegrationEvent('quickbooks', direction, event, payload, status);
}

function authUrl(state = 'pdr') {
  const params = new URLSearchParams({
    client_id: process.env.QBO_CLIENT_ID,
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: 'com.intuit.quickbooks.accounting',
    state,
  });
  return `${AUTH_URL}?${params}`;
}

function basicAuth() {
  return 'Basic ' + Buffer.from(`${process.env.QBO_CLIENT_ID}:${process.env.QBO_CLIENT_SECRET}`).toString('base64');
}

async function exchangeCode(code, realmId) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { Authorization: basicAuth(), 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri() }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`QBO token exchange failed: ${JSON.stringify(data)}`);
  const expiresAt = new Date(Date.now() + (data.expires_in - 60) * 1000);
  const existing = await OauthToken.findOne({ where: { provider: 'quickbooks', user_id: null } });
  const fields = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: expiresAt,
    meta: { realmId },
  };
  if (existing) await existing.update(fields);
  else await OauthToken.create({ provider: 'quickbooks', user_id: null, ...fields });
  await logEvent('in', 'oauth.connected', { realmId });
  return true;
}

async function accessToken() {
  const t = await getTokens();
  if (!t) throw new Error('QuickBooks not connected');
  if (t.expires_at && new Date(t.expires_at) > new Date()) return t.access_token;
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { Authorization: basicAuth(), 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: t.refresh_token }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`QBO token refresh failed: ${JSON.stringify(data)}`);
  const expiresAt = new Date(Date.now() + (data.expires_in - 60) * 1000);
  await OauthToken.update({
    access_token: data.access_token,
    refresh_token: data.refresh_token || t.refresh_token,
    expires_at: expiresAt,
  }, { where: { provider: 'quickbooks', user_id: null } });
  return data.access_token;
}

async function qboFetch(path, options = {}) {
  const t = await getTokens();
  const realmId = (t.meta || {}).realmId;
  const token = await accessToken();
  const res = await fetch(`${apiBase()}/v3/company/${realmId}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`QBO API ${res.status}: ${JSON.stringify(data.Fault || data)}`);
  return data;
}

/** Find or create the QBO customer matching ours (dedupe per PRD §10.3). */
async function ensureQboCustomer(customer) {
  const name = customer.name.replace(/'/g, "\\'");
  const q = await qboFetch(`/query?query=${encodeURIComponent(`select * from Customer where DisplayName = '${name}'`)}`);
  const found = q.QueryResponse?.Customer?.[0];
  if (found) return found.Id;
  const created = await qboFetch('/customer', {
    method: 'POST',
    body: JSON.stringify({
      DisplayName: customer.name,
      PrimaryPhone: customer.phone ? { FreeFormNumber: customer.phone } : undefined,
      PrimaryEmailAddr: customer.email ? { Address: customer.email } : undefined,
      BillAddr: customer.address ? { Line1: customer.address, PostalCode: customer.postcode || undefined } : undefined,
    }),
  });
  return created.Customer.Id;
}

/**
 * Push an in-app invoice into QuickBooks. Returns { qboId, simulated }.
 * In simulated mode a fake id is issued so the workflow still demos.
 */
async function pushInvoice(invoice, customer) {
  if (!isConfigured() || !(await isConnected())) {
    await logEvent('out', 'invoice.simulated', { ref: invoice.ref, total: invoice.total }, 'simulated');
    return { qboId: `SIM-${invoice.ref}`, simulated: true };
  }
  const qboCustomerId = await ensureQboCustomer(customer);
  const items = Array.isArray(invoice.items) ? invoice.items : [];
  const body = {
    CustomerRef: { value: qboCustomerId },
    DocNumber: invoice.ref,
    TxnDate: invoice.issue_date,
    DueDate: invoice.due_date,
    GlobalTaxCalculation: 'TaxExcluded',
    Line: items.map((it) => ({
      DetailType: 'SalesItemLineDetail',
      Amount: Number(it.qty) * Number(it.unit_price),
      Description: it.description,
      SalesItemLineDetail: {
        Qty: Number(it.qty),
        UnitPrice: Number(it.unit_price),
        TaxCodeRef: { value: invoice.vat_rate > 0 ? '3' : 'NON' },
      },
    })),
  };
  const data = await qboFetch('/invoice', { method: 'POST', body: JSON.stringify(body) });
  await logEvent('out', 'invoice.pushed', { ref: invoice.ref, qboId: data.Invoice.Id });
  return { qboId: data.Invoice.Id, simulated: false };
}

async function pollPayments() {
  if (!isConfigured() || !(await isConnected())) return 0;
  const rows = await Invoice.findAll({
    where: {
      qbo_id: { [Op.ne]: null, [Op.notLike]: 'SIM-%' },
      status: { [Op.in]: ['sent', 'part_paid', 'overdue'] },
    },
  });
  let updated = 0;
  for (const inv of rows) {
    try {
      const data = await qboFetch(`/invoice/${inv.qbo_id}`);
      const balance = Number(data.Invoice.Balance);
      const total = Number(data.Invoice.TotalAmt);
      const paid = total - balance;
      if (balance === 0 && inv.status !== 'paid') {
        inv.status = 'paid';
        inv.amount_paid = total;
        inv.paid_at = new Date();
        await inv.save();
        updated++;
      } else if (paid > 0 && paid !== inv.amount_paid) {
        inv.status = 'part_paid';
        inv.amount_paid = paid;
        await inv.save();
        updated++;
      }
    } catch (err) {
      await logEvent('in', 'payment_poll.error', { invoice: inv.ref, error: String(err.message) }, 'error');
    }
  }
  if (updated) await logEvent('in', 'payment_poll.synced', { updated });
  return updated;
}

async function status() {
  const connected = await isConnected();
  return {
    id: 'quickbooks',
    name: 'QuickBooks Online (UK)',
    configured: isConfigured(),
    connected,
    mode: isConfigured() && connected ? 'live' : 'simulated',
    env_needed: ['QBO_CLIENT_ID', 'QBO_CLIENT_SECRET', 'QBO_REDIRECT_URI', 'QBO_ENVIRONMENT'],
    connect_url: '/api/integrations/quickbooks/connect',
    detail: !isConfigured()
      ? 'Simulated — invoices tracked in-app only. Add Intuit app keys, then Paul clicks Connect.'
      : connected
        ? `Live (${process.env.QBO_ENVIRONMENT || 'sandbox'}) — invoices push to QuickBooks, payments sync back`
        : 'Keys present — waiting for Paul to click "Connect QuickBooks" in Settings.',
  };
}

module.exports = { isConfigured, isConnected, authUrl, exchangeCode, pushInvoice, pollPayments, status };
