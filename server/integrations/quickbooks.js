// ============================================================
// QuickBooks Online (UK) adapter — OAuth2 + invoice push +
// payment status sync back (PRD §10.3). Raw REST, no SDK.
// Live once QBO_CLIENT_ID/SECRET set AND Paul clicks Connect.
// ============================================================
const { db, pj, j } = require('../db');

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
function getTokens() {
  return db.prepare("SELECT * FROM oauth_tokens WHERE provider = 'quickbooks'").get() || null;
}
function isConnected() {
  const t = getTokens();
  return !!(t && pj(t.meta, {}).realmId);
}

function logEvent(direction, event, payload, status = 'ok') {
  db.prepare('INSERT INTO integration_events (provider, direction, event, payload, status) VALUES (?,?,?,?,?)')
    .run('quickbooks', direction, event, JSON.stringify(payload).slice(0, 4000), status);
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
  const expiresAt = new Date(Date.now() + (data.expires_in - 60) * 1000).toISOString();
  db.prepare(
    `INSERT INTO oauth_tokens (provider, access_token, refresh_token, expires_at, meta, updated_at)
     VALUES ('quickbooks', ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(provider) DO UPDATE SET access_token = excluded.access_token,
       refresh_token = excluded.refresh_token, expires_at = excluded.expires_at,
       meta = excluded.meta, updated_at = datetime('now')`
  ).run(data.access_token, data.refresh_token, expiresAt, j({ realmId }));
  logEvent('in', 'oauth.connected', { realmId });
  return true;
}

async function accessToken() {
  const t = getTokens();
  if (!t) throw new Error('QuickBooks not connected');
  if (t.expires_at && new Date(t.expires_at) > new Date()) return t.access_token;
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { Authorization: basicAuth(), 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: t.refresh_token }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`QBO token refresh failed: ${JSON.stringify(data)}`);
  const expiresAt = new Date(Date.now() + (data.expires_in - 60) * 1000).toISOString();
  db.prepare("UPDATE oauth_tokens SET access_token = ?, refresh_token = ?, expires_at = ?, updated_at = datetime('now') WHERE provider = 'quickbooks'")
    .run(data.access_token, data.refresh_token || t.refresh_token, expiresAt);
  return data.access_token;
}

async function qboFetch(path, options = {}) {
  const t = getTokens();
  const realmId = pj(t.meta, {}).realmId;
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
  if (!isConfigured() || !isConnected()) {
    logEvent('out', 'invoice.simulated', { ref: invoice.ref, total: invoice.total }, 'simulated');
    return { qboId: `SIM-${invoice.ref}`, simulated: true };
  }
  const qboCustomerId = await ensureQboCustomer(customer);
  const items = pj(invoice.items, []);
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
        // '3' = the default 20% S (standard UK VAT) code in most QBO UK companies;
        // reconciled properly on first live sync.
        TaxCodeRef: { value: invoice.vat_rate > 0 ? '3' : 'NON' },
      },
    })),
  };
  const data = await qboFetch('/invoice', { method: 'POST', body: JSON.stringify(body) });
  logEvent('out', 'invoice.pushed', { ref: invoice.ref, qboId: data.Invoice.Id });
  return { qboId: data.Invoice.Id, simulated: false };
}

/** Poll QBO for payment status on pushed invoices (cron). */
async function pollPayments() {
  if (!isConfigured() || !isConnected()) return 0;
  const rows = db.prepare(
    `SELECT * FROM invoices WHERE qbo_id IS NOT NULL AND qbo_id NOT LIKE 'SIM-%' AND status IN ('sent','part_paid','overdue')`
  ).all();
  let updated = 0;
  for (const inv of rows) {
    try {
      const data = await qboFetch(`/invoice/${inv.qbo_id}`);
      const balance = Number(data.Invoice.Balance);
      const total = Number(data.Invoice.TotalAmt);
      const paid = total - balance;
      if (balance === 0 && inv.status !== 'paid') {
        db.prepare("UPDATE invoices SET status = 'paid', amount_paid = ?, paid_at = datetime('now') WHERE id = ?").run(total, inv.id);
        updated++;
      } else if (paid > 0 && paid !== inv.amount_paid) {
        db.prepare("UPDATE invoices SET status = 'part_paid', amount_paid = ? WHERE id = ?").run(paid, inv.id);
        updated++;
      }
    } catch (err) {
      logEvent('in', 'payment_poll.error', { invoice: inv.ref, error: String(err.message) }, 'error');
    }
  }
  if (updated) logEvent('in', 'payment_poll.synced', { updated });
  return updated;
}

function status() {
  return {
    id: 'quickbooks',
    name: 'QuickBooks Online (UK)',
    configured: isConfigured(),
    connected: isConnected(),
    mode: isConfigured() && isConnected() ? 'live' : 'simulated',
    env_needed: ['QBO_CLIENT_ID', 'QBO_CLIENT_SECRET', 'QBO_REDIRECT_URI', 'QBO_ENVIRONMENT'],
    connect_url: '/api/integrations/quickbooks/connect',
    detail: !isConfigured()
      ? 'Simulated — invoices tracked in-app only. Add Intuit app keys, then Paul clicks Connect.'
      : isConnected()
        ? `Live (${process.env.QBO_ENVIRONMENT || 'sandbox'}) — invoices push to QuickBooks, payments sync back`
        : 'Keys present — waiting for Paul to click "Connect QuickBooks" in Settings.',
  };
}

module.exports = { isConfigured, isConnected, authUrl, exchangeCode, pushInvoice, pollPayments, status };
