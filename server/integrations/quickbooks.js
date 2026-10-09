'use strict';

/**
 * QuickBooks Online (UK) — company OAuth, quote→Estimate, invoice push
 * with PDF attachment, payment push, and payment poll back into the CRM.
 * Live once QBO_CLIENT_ID/SECRET are set AND an owner connects in Settings.
 * Until then, send/pay still work in simulated mode.
 */
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');
const { OauthToken, Invoice, Customer, Job, Quote, logIntegrationEvent } = require('../models');
const { plain, todayStr, DATA_DIR } = require('../db');

const AUTH_URL = 'https://appcenter.intuit.com/connect/oauth2';
const TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
const MINOR_VERSION = '75';
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const SCOPE = 'com.intuit.quickbooks.accounting';

function apiBase() {
  return process.env.QBO_ENVIRONMENT === 'production'
    ? 'https://quickbooks.api.intuit.com'
    : 'https://sandbox-quickbooks.api.intuit.com';
}

function isConfigured() {
  return !!(process.env.QBO_CLIENT_ID && process.env.QBO_CLIENT_SECRET);
}

function redirectUri() {
  return process.env.QBO_REDIRECT_URI
    || `${process.env.APP_URL || 'http://localhost:4000'}/api/integrations/quickbooks/callback`;
}

function liveInvoiceId(id) {
  if (!id) return null;
  const text = String(id);
  return text.startsWith('SIM-') ? null : text;
}

/** QBO TxnDate / DueDate must be YYYY-MM-DD — ISO datetimes are rejected. */
function toQboDate(value) {
  if (value == null || value === '') return undefined;
  if (typeof value === 'string') {
    const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
  }
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return undefined;
  if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0) {
    return d.toISOString().slice(0, 10);
  }
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function roundMoney(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function escapeQbo(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function withMinor(path) {
  return path.includes('?') ? `${path}&minorversion=${MINOR_VERSION}` : `${path}?minorversion=${MINOR_VERSION}`;
}

async function getTokens() {
  return plain(await OauthToken.findOne({ where: { provider: 'quickbooks', user_id: null } }));
}

async function isConnected() {
  const t = await getTokens();
  return !!(t && t.meta && t.meta.realmId);
}

async function isLive() {
  return isConfigured() && (await isConnected());
}

async function logEvent(direction, event, payload, status = 'ok') {
  await logIntegrationEvent('quickbooks', direction, event, payload, status);
}

function signOauthState(userId) {
  return jwt.sign({ uid: Number(userId), p: 'qbo' }, JWT_SECRET, { expiresIn: '15m' });
}

function parseOauthState(state) {
  if (!state) throw new Error('Missing OAuth state');
  const payload = jwt.verify(state, JWT_SECRET);
  if (payload.p !== 'qbo' || !payload.uid) throw new Error('Invalid OAuth state');
  return Number(payload.uid);
}

function authUrl(state = '') {
  const params = new URLSearchParams({
    client_id: process.env.QBO_CLIENT_ID,
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: SCOPE,
    state,
  });
  return `${AUTH_URL}?${params}`;
}

function basicAuth() {
  return 'Basic ' + Buffer.from(`${process.env.QBO_CLIENT_ID}:${process.env.QBO_CLIENT_SECRET}`).toString('base64');
}

async function saveCompanyTokens(data, realmId, extraMeta = {}) {
  const expiresAt = new Date(Date.now() + (Number(data.expires_in || 3600) - 60) * 1000);
  const existing = await OauthToken.findOne({ where: { provider: 'quickbooks', user_id: null } });
  const prevMeta = existing?.meta && typeof existing.meta === 'object' ? existing.meta : {};
  const fields = {
    access_token: data.access_token,
    refresh_token: data.refresh_token || existing?.refresh_token || null,
    expires_at: expiresAt,
    meta: { ...prevMeta, ...extraMeta, realmId: realmId || prevMeta.realmId },
  };
  if (existing) await existing.update(fields);
  else await OauthToken.create({ provider: 'quickbooks', user_id: null, ...fields });
}

async function exchangeCode(code, realmId, stateUserId) {
  if (!code) throw new Error('QuickBooks did not return an authorisation code');
  if (!realmId) throw new Error('QuickBooks did not return a company (realm) id');
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: basicAuth(),
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri(),
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`QuickBooks token exchange failed: ${JSON.stringify(data)}`);
  await saveCompanyTokens(data, realmId, stateUserId ? { connected_by: stateUserId } : {});
  await logEvent('in', 'oauth.connected', { realmId, connected_by: stateUserId || null });
  return true;
}

async function disconnect() {
  const n = await OauthToken.destroy({ where: { provider: 'quickbooks', user_id: null } });
  if (n) await logEvent('in', 'oauth.disconnected', {});
  return n > 0;
}

async function accessToken() {
  const t = await getTokens();
  if (!t) throw new Error('QuickBooks is not connected');
  if (t.expires_at && new Date(t.expires_at) > new Date()) return t.access_token;
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: basicAuth(),
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: t.refresh_token }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`QuickBooks token refresh failed: ${JSON.stringify(data)}`);
  await saveCompanyTokens(data, t.meta?.realmId);
  return data.access_token;
}

async function qboFetch(path, options = {}, retried = false) {
  const t = await getTokens();
  const realmId = t?.meta?.realmId;
  if (!realmId) throw new Error('QuickBooks company (realm) is missing — reconnect in Settings');
  const token = await accessToken();
  const res = await fetch(`${apiBase()}/v3/company/${realmId}${withMinor(path)}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (res.status === 401 && !retried) {
    const existing = await OauthToken.findOne({ where: { provider: 'quickbooks', user_id: null } });
    if (existing) await existing.update({ expires_at: new Date(0) });
    return qboFetch(path, options, true);
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`QuickBooks API ${res.status}: ${JSON.stringify(data.Fault || data)}`);
  return data;
}

async function qboQuery(sql) {
  const data = await qboFetch(`/query?query=${encodeURIComponent(sql)}`);
  return data?.QueryResponse || {};
}

async function qboUpload(form, retried = false) {
  const t = await getTokens();
  const realmId = t?.meta?.realmId;
  if (!realmId) throw new Error('QuickBooks company (realm) is missing — reconnect in Settings');
  const token = await accessToken();
  const res = await fetch(`${apiBase()}/v3/company/${realmId}${withMinor('/upload')}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
    body: form,
  });
  if (res.status === 401 && !retried) {
    const existing = await OauthToken.findOne({ where: { provider: 'quickbooks', user_id: null } });
    if (existing) await existing.update({ expires_at: new Date(0) });
    return qboUpload(form, true);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`QuickBooks upload ${res.status}: ${JSON.stringify(data.Fault || data)}`);
  return data;
}

function pdfPathFor(filename) {
  if (!filename) return null;
  return path.join(DATA_DIR, 'files', filename);
}

/**
 * Attach a CRM PDF to a QuickBooks Invoice or Estimate. Skips if already linked
 * or the file is missing so send/pay never fail on the attachment.
 */
async function attachPdf({ entityType, entityId, fileName, filePath, existingId }) {
  if (!(await isLive()) || !entityId) return { attachableId: null, simulated: true };
  if (liveInvoiceId(existingId)) return { attachableId: existingId, simulated: false };
  if (!filePath || !fs.existsSync(filePath)) return { attachableId: null, simulated: false };
  const bytes = fs.readFileSync(filePath);
  const form = new FormData();
  const meta = {
    FileName: fileName || path.basename(filePath),
    ContentType: 'application/pdf',
    AttachableRef: [{ EntityRef: { type: entityType, value: String(entityId) } }],
  };
  form.append('file_metadata_01', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
  form.append('file_content_01', new Blob([bytes], { type: 'application/pdf' }), meta.FileName);
  const data = await qboUpload(form);
  const attachableId = data?.Attachable?.Id || null;
  await logEvent('out', 'attachable.uploaded', { entityType, entityId, attachableId, fileName: meta.FileName });
  return { attachableId, simulated: false };
}

async function patchCompanyMeta(patch) {
  const existing = await OauthToken.findOne({ where: { provider: 'quickbooks', user_id: null } });
  if (!existing) return;
  const meta = { ...(existing.meta || {}), ...patch };
  await existing.update({ meta });
}

async function ensureIncomeAccountId() {
  const t = await getTokens();
  if (t?.meta?.incomeAccountId) return t.meta.incomeAccountId;
  const q = await qboQuery("select * from Account where AccountType = 'Income' maxresults 1");
  const id = q.Account?.[0]?.Id;
  if (id) await patchCompanyMeta({ incomeAccountId: id });
  return id || null;
}

async function ensureServiceItemId() {
  const t = await getTokens();
  if (t?.meta?.itemId) return t.meta.itemId;
  const named = await qboQuery("select * from Item where Name = 'Roofing work' maxresults 1");
  if (named.Item?.[0]?.Id) {
    await patchCompanyMeta({ itemId: named.Item[0].Id });
    return named.Item[0].Id;
  }
  const any = await qboQuery("select * from Item where Type = 'Service' maxresults 1");
  if (any.Item?.[0]?.Id) {
    await patchCompanyMeta({ itemId: any.Item[0].Id });
    return any.Item[0].Id;
  }
  const incomeId = await ensureIncomeAccountId();
  const created = await qboFetch('/item', {
    method: 'POST',
    body: JSON.stringify({
      Name: 'Roofing work',
      Type: 'Service',
      IncomeAccountRef: incomeId ? { value: incomeId } : undefined,
    }),
  });
  const id = created?.Item?.Id;
  if (id) await patchCompanyMeta({ itemId: id });
  return id;
}

function pickTaxCodeId(codes, { wantZero }) {
  const list = Array.isArray(codes) ? codes : [];
  const scored = list.map((code) => {
    const name = `${code.Name || ''} ${code.Description || ''}`;
    const rate = Number(code.SalesTaxRateList?.TaxRateDetail?.[0]?.TaxRateRef?.value) || 0;
    let score = 0;
    if (wantZero) {
      if (/zero|exempt|out of scope|\bnon\b|0%/i.test(name)) score += 5;
      if (code.Id === 'NON' || code.Id === 'ZERO') score += 4;
    } else {
      if (/20|standard/i.test(name)) score += 5;
      if (rate === 20) score += 3;
      if (code.Id === '3') score += 1;
    }
    return { id: code.Id, score };
  }).filter((row) => row.id);
  scored.sort((a, b) => b.score - a.score);
  if (scored[0]?.score > 0) return scored[0].id;
  return wantZero ? 'NON' : '3';
}

async function taxCodeForInvoice(invoice) {
  const wantZero = !(Number(invoice.vat_amount) > 0);
  const t = await getTokens();
  const cached = wantZero ? t?.meta?.taxCodeZero : t?.meta?.taxCodeStandard;
  if (cached) return cached;
  const q = await qboQuery('select * from TaxCode maxresults 50');
  const id = pickTaxCodeId(q.TaxCode, { wantZero });
  await patchCompanyMeta(wantZero ? { taxCodeZero: id } : { taxCodeStandard: id });
  return id;
}

function customerDisplayName(customer) {
  const company = String(customer.company_name || '').trim();
  if (customer.customer_type === 'commercial' && company) return company;
  return String(customer.name || 'Customer').trim() || 'Customer';
}

async function ensureQboCustomer(customer) {
  const existingId = liveInvoiceId(customer.qbo_id);
  if (existingId) return existingId;
  const display = customerDisplayName(customer);
  const q = await qboQuery(`select * from Customer where DisplayName = '${escapeQbo(display)}' maxresults 1`);
  let id = q.Customer?.[0]?.Id;
  if (!id) {
    try {
      const created = await qboFetch('/customer', {
        method: 'POST',
        body: JSON.stringify({
          DisplayName: display,
          CompanyName: customer.company_name || undefined,
          PrimaryPhone: customer.phone ? { FreeFormNumber: customer.phone } : undefined,
          PrimaryEmailAddr: customer.email ? { Address: customer.email } : undefined,
          BillAddr: customer.address
            ? { Line1: customer.address, PostalCode: customer.postcode || undefined }
            : undefined,
        }),
      });
      id = created?.Customer?.Id;
    } catch (err) {
      const retry = await qboQuery(`select * from Customer where DisplayName = '${escapeQbo(`${display} (CRM ${customer.id})`)}' maxresults 1`);
      id = retry.Customer?.[0]?.Id;
      if (!id) {
        const created = await qboFetch('/customer', {
          method: 'POST',
          body: JSON.stringify({ DisplayName: `${display} (CRM ${customer.id})` }),
        });
        id = created?.Customer?.Id;
      }
      if (!id) throw err;
    }
  }
  if (id && customer.id) {
    await Customer.update({ qbo_id: id }, { where: { id: customer.id } });
  }
  return id;
}

function salesLines(doc, itemId, taxCode, fallbackDescription) {
  let items = Array.isArray(doc.items) ? doc.items : [];
  if (!items.length && typeof doc.items === 'string') {
    try {
      const parsed = JSON.parse(doc.items);
      if (Array.isArray(parsed)) items = parsed;
    } catch { /* keep empty and fall through to the total line */ }
  }
  const lines = items.map((it, index) => ({
    LineNum: index + 1,
    DetailType: 'SalesItemLineDetail',
    Amount: roundMoney(Number(it.qty) * Number(it.unit_price)),
    Description: it.description || 'Roofing work',
    SalesItemLineDetail: {
      ItemRef: { value: String(itemId) },
      Qty: Number(it.qty) || 1,
      UnitPrice: Number(it.unit_price) || 0,
      TaxCodeRef: { value: String(taxCode) },
    },
  })).filter((line) => line.Amount !== 0 || items.length === 1);

  if (!lines.length) {
    lines.push({
      DetailType: 'SalesItemLineDetail',
      Amount: roundMoney(Number(doc.subtotal) || Number(doc.total) || 0),
      Description: fallbackDescription || doc.ref || 'Roofing work',
      SalesItemLineDetail: {
        ItemRef: { value: String(itemId) },
        Qty: 1,
        UnitPrice: roundMoney(Number(doc.subtotal) || Number(doc.total) || 0),
        TaxCodeRef: { value: String(taxCode) },
      },
    });
  }

  const held = roundMoney((Number(doc.cis_deduction) || 0) + (Number(doc.retention_amount) || 0));
  if (held > 0) {
    lines.push({
      DetailType: 'DiscountLineDetail',
      Amount: held,
      Description: [
        Number(doc.cis_deduction) > 0 ? `CIS ${doc.cis_rate || 20}%` : null,
        Number(doc.retention_amount) > 0 ? `Retention ${doc.retention_percent || 0}%` : null,
      ].filter(Boolean).join(' · ') || 'Held from this document',
      DiscountLineDetail: { PercentBased: false },
    });
  }
  return lines;
}

function invoiceLines(invoice, itemId, taxCode) {
  return salesLines(invoice, itemId, taxCode, invoice.ref || 'Invoice');
}

function invoicePrivateNote(invoice, quoteRef) {
  const base = String(invoice?.notes || '').trim() || `PDR invoice ${invoice?.ref || ''}`.trim();
  if (!quoteRef) return base;
  if (base.includes(quoteRef)) return base;
  return `${base} (from estimate ${quoteRef})`;
}

function invoiceBody(invoice, qboCustomerId, itemId, taxCode, extra = {}) {
  return {
    ...extra,
    CustomerRef: { value: String(qboCustomerId) },
    DocNumber: String(invoice.ref || '').slice(0, 21),
    TxnDate: toQboDate(invoice.issue_date),
    DueDate: toQboDate(invoice.due_date),
    PrivateNote: extra.PrivateNote || invoicePrivateNote(invoice),
    GlobalTaxCalculation: Number(invoice.vat_amount) > 0 ? 'TaxExcluded' : 'NotApplicable',
    Line: invoiceLines(invoice, itemId, taxCode),
  };
}

/**
 * Job invoices come from an accepted quote. The quote ref always goes on the
 * invoice memo; the Estimate is deleted so All Sales is not double-counted.
 */
async function sourceQuoteForInvoice(invoice) {
  if (!invoice?.job_id) return null;
  const job = await Job.findByPk(invoice.job_id, { attributes: ['quote_id'] });
  if (!job?.quote_id) return null;
  const quote = await Quote.findByPk(job.quote_id, { attributes: ['id', 'ref', 'qbo_id'] });
  if (!quote) return null;
  return {
    quoteId: quote.id,
    quoteRef: quote.ref,
    TxnId: liveInvoiceId(quote.qbo_id),
  };
}

async function quoteEstimateForInvoice(invoice) {
  const source = await sourceQuoteForInvoice(invoice);
  if (!source?.TxnId) return null;
  return source;
}

function isMissingQboObject(err) {
  const text = String(err?.message || '');
  return /\b404\b/.test(text) || /object not found/i.test(text);
}

function isDuplicateDocNumber(err) {
  return /Duplicate Document Number/i.test(String(err?.message || ''));
}

function firstQueryRow(response, entity) {
  const raw = response?.[entity];
  if (!raw) return null;
  return Array.isArray(raw) ? raw[0] : raw;
}

/** CRM seed/resend can reuse a ref that already exists in the QBO company. */
async function findTxnByDocNumber(entity, docNumber) {
  const ref = String(docNumber || '').slice(0, 21);
  if (!ref) return null;
  const q = await qboQuery(`select * from ${entity} where DocNumber = '${escapeQbo(ref)}' maxresults 1`);
  return firstQueryRow(q, entity);
}

async function resolveExistingTxnId(entity, storedId, docNumber) {
  const fromCrm = liveInvoiceId(storedId);
  if (fromCrm) return fromCrm;
  const found = await findTxnByDocNumber(entity, docNumber);
  return liveInvoiceId(found?.Id) || null;
}

/**
 * QBO deletes with POST ?operation=delete and the current SyncToken.
 * HTTP DELETE /estimate/{id} is not supported and silently fails.
 */
async function tryDeleteEstimate(estimateId) {
  if (!liveInvoiceId(estimateId)) return false;
  try {
    const current = await qboFetch(`/estimate/${estimateId}`);
    const est = current?.Estimate;
    if (!est?.Id) return true;
    await qboFetch('/estimate?operation=delete', {
      method: 'POST',
      body: JSON.stringify({ Id: String(est.Id), SyncToken: String(est.SyncToken || '0') }),
    });
    await logEvent('out', 'estimate.deleted', { estimateId: est.Id });
    return true;
  } catch (err) {
    if (isMissingQboObject(err)) return true;
    await logEvent('out', 'estimate.delete_failed', { estimateId, error: String(err.message) }, 'error');
    return false;
  }
}

/** Closed converted estimates stay on All Sales until the Invoice.LinkedTxn is cleared. */
async function unlinkEstimateFromInvoice(invoiceQboId, estimateId) {
  if (!liveInvoiceId(invoiceQboId) || !liveInvoiceId(estimateId)) return false;
  try {
    const data = await qboFetch(`/invoice/${invoiceQboId}`);
    const inv = data?.Invoice;
    if (!inv?.Id) return false;
    const links = Array.isArray(inv.LinkedTxn) ? inv.LinkedTxn : [];
    const without = links.filter((link) => !(
      String(link.TxnId) === String(estimateId)
      && String(link.TxnType || '').toLowerCase() === 'estimate'
    ));
    if (without.length === links.length) return false;
    await qboFetch('/invoice', {
      method: 'POST',
      body: JSON.stringify({
        Id: inv.Id,
        SyncToken: inv.SyncToken,
        sparse: true,
        LinkedTxn: without,
      }),
    });
    await logEvent('out', 'estimate.unlinked', { invoiceQboId, estimateId });
    return true;
  } catch (err) {
    await logEvent('out', 'estimate.unlink_failed', {
      invoiceQboId,
      estimateId,
      error: String(err.message),
    }, 'error');
    return false;
  }
}

/** Last resort so All Sales does not keep the quote amount after the invoice is paid. */
async function tryZeroEstimate(estimateId) {
  try {
    const current = await qboFetch(`/estimate/${estimateId}`);
    const est = current?.Estimate;
    if (!est?.Id) return true;
    const lines = (Array.isArray(est.Line) ? est.Line : []).map((line) => {
      if (line.DetailType !== 'SalesItemLineDetail') return line;
      return {
        ...line,
        Amount: 0,
        SalesItemLineDetail: {
          ...(line.SalesItemLineDetail || {}),
          Qty: 0,
          UnitPrice: 0,
        },
      };
    });
    await qboFetch('/estimate', {
      method: 'POST',
      body: JSON.stringify({
        Id: est.Id,
        SyncToken: est.SyncToken,
        sparse: true,
        Line: lines,
      }),
    });
    await logEvent('out', 'estimate.zeroed', { estimateId: est.Id });
    return true;
  } catch (err) {
    if (isMissingQboObject(err)) return true;
    await logEvent('out', 'estimate.zero_failed', { estimateId, error: String(err.message) }, 'error');
    return false;
  }
}

async function removeQuoteEstimate({ quoteId, estimateId, invoiceQboId }) {
  if (!liveInvoiceId(estimateId)) return false;
  if (invoiceQboId) await unlinkEstimateFromInvoice(invoiceQboId, estimateId);
  let deleted = await tryDeleteEstimate(estimateId);
  if (!deleted && invoiceQboId) {
    await unlinkEstimateFromInvoice(invoiceQboId, estimateId);
    deleted = await tryDeleteEstimate(estimateId);
  }
  if (!deleted) await tryZeroEstimate(estimateId);
  if (deleted && quoteId) {
    await Quote.update(
      { qbo_id: null, qbo_sync_token: null, qbo_attachable_id: null },
      { where: { id: quoteId } },
    );
  }
  return deleted;
}

/**
 * Create or update the QuickBooks invoice for a CRM invoice.
 * @returns {{ qboId: string, syncToken?: string, simulated: boolean }}
 */
async function pushInvoice(invoice, customer) {
  if (!(await isLive())) {
    await logEvent('out', 'invoice.simulated', { ref: invoice.ref, total: invoice.total }, 'simulated');
    return { qboId: `SIM-${invoice.ref}`, simulated: true };
  }
  const qboCustomerId = await ensureQboCustomer(customer);
  if (!qboCustomerId) throw new Error('QuickBooks customer could not be created');
  const itemId = await ensureServiceItemId();
  if (!itemId) throw new Error('QuickBooks service item could not be created');
  const taxCode = await taxCodeForInvoice(invoice);
  const sourceQuote = await sourceQuoteForInvoice(invoice);
  const extra = {
    PrivateNote: invoicePrivateNote(invoice, sourceQuote?.quoteRef),
  };
  let existingId = await resolveExistingTxnId('Invoice', invoice.qbo_id, invoice.ref);
  let data;
  if (existingId) {
    const current = await qboFetch(`/invoice/${existingId}`);
    const syncToken = current?.Invoice?.SyncToken || invoice.qbo_sync_token || '0';
    data = await qboFetch('/invoice', {
      method: 'POST',
      body: JSON.stringify(invoiceBody(invoice, qboCustomerId, itemId, taxCode, {
        ...extra,
        Id: existingId,
        SyncToken: syncToken,
        sparse: true,
      })),
    });
    await logEvent('out', 'invoice.updated', { ref: invoice.ref, qboId: existingId });
  } else {
    try {
      data = await qboFetch('/invoice', {
        method: 'POST',
        body: JSON.stringify(invoiceBody(invoice, qboCustomerId, itemId, taxCode, extra)),
      });
    } catch (err) {
      if (!isDuplicateDocNumber(err)) throw err;
      const found = await findTxnByDocNumber('Invoice', invoice.ref);
      if (!found?.Id) throw err;
      existingId = found.Id;
      data = await qboFetch('/invoice', {
        method: 'POST',
        body: JSON.stringify(invoiceBody(invoice, qboCustomerId, itemId, taxCode, {
          ...extra,
          Id: found.Id,
          SyncToken: String(found.SyncToken || '0'),
          sparse: true,
        })),
      });
      await logEvent('out', 'invoice.reused', { ref: invoice.ref, qboId: found.Id });
    }
    if (sourceQuote?.TxnId) {
      await removeQuoteEstimate({
        quoteId: sourceQuote.quoteId,
        estimateId: sourceQuote.TxnId,
        invoiceQboId: data?.Invoice?.Id,
      });
    }
    if (!existingId) {
      await logEvent('out', 'invoice.pushed', {
        ref: invoice.ref,
        qboId: data?.Invoice?.Id,
        fromEstimate: sourceQuote?.TxnId || null,
      });
    }
  }
  const qboId = data?.Invoice?.Id;
  const leftoverEstimate = await quoteEstimateForInvoice(invoice);
  if (leftoverEstimate) {
    await removeQuoteEstimate({
      quoteId: leftoverEstimate.quoteId,
      estimateId: leftoverEstimate.TxnId,
      invoiceQboId: qboId,
    });
  }
  let attachableId = liveInvoiceId(invoice.qbo_attachable_id);
  try {
    const attached = await attachPdf({
      entityType: 'Invoice',
      entityId: qboId,
      fileName: `${invoice.ref}.pdf`,
      filePath: pdfPathFor(invoice.pdf_file),
      existingId: attachableId,
    });
    attachableId = attached.attachableId || attachableId;
  } catch (err) {
    await logEvent('out', 'attachable.error', { ref: invoice.ref, error: String(err.message) }, 'error');
  }
  return {
    qboId,
    syncToken: data?.Invoice?.SyncToken,
    attachableId,
    simulated: false,
  };
}

function estimateBody(quote, qboCustomerId, itemId, taxCode, extra = {}) {
  const txnDate = quote.sent_at
    ? String(quote.sent_at).slice(0, 10)
    : (todayStr() || undefined);
  return {
    ...extra,
    CustomerRef: { value: String(qboCustomerId) },
    DocNumber: String(quote.ref || '').slice(0, 21),
    TxnDate: toQboDate(txnDate),
    ExpirationDate: toQboDate(quote.valid_until),
    PrivateNote: quote.notes || `PDR quote ${quote.ref}${quote.title ? ` — ${quote.title}` : ''}`,
    GlobalTaxCalculation: Number(quote.vat_amount) > 0 ? 'TaxExcluded' : 'NotApplicable',
    Line: salesLines(quote, itemId, taxCode, quote.title || quote.ref || 'Quote'),
  };
}

/**
 * Create or update a QuickBooks Estimate when a CRM quote is sent.
 */
async function pushEstimate(quote, customer) {
  if (!(await isLive())) {
    await logEvent('out', 'estimate.simulated', { ref: quote.ref, total: quote.total }, 'simulated');
    return { qboId: `SIM-${quote.ref}`, simulated: true };
  }
  const qboCustomerId = await ensureQboCustomer(customer);
  const itemId = await ensureServiceItemId();
  const taxCode = await taxCodeForInvoice(quote);
  let existingId = await resolveExistingTxnId('Estimate', quote.qbo_id, quote.ref);
  let data;
  if (existingId) {
    const current = await qboFetch(`/estimate/${existingId}`);
    const syncToken = current?.Estimate?.SyncToken || quote.qbo_sync_token || '0';
    data = await qboFetch('/estimate', {
      method: 'POST',
      body: JSON.stringify(estimateBody(quote, qboCustomerId, itemId, taxCode, {
        Id: existingId,
        SyncToken: syncToken,
        sparse: true,
      })),
    });
    await logEvent('out', 'estimate.updated', { ref: quote.ref, qboId: existingId });
  } else {
    try {
      data = await qboFetch('/estimate', {
        method: 'POST',
        body: JSON.stringify(estimateBody(quote, qboCustomerId, itemId, taxCode)),
      });
    } catch (err) {
      if (!isDuplicateDocNumber(err)) throw err;
      const found = await findTxnByDocNumber('Estimate', quote.ref);
      if (!found?.Id) throw err;
      existingId = found.Id;
      data = await qboFetch('/estimate', {
        method: 'POST',
        body: JSON.stringify(estimateBody(quote, qboCustomerId, itemId, taxCode, {
          Id: found.Id,
          SyncToken: String(found.SyncToken || '0'),
          sparse: true,
        })),
      });
      await logEvent('out', 'estimate.reused', { ref: quote.ref, qboId: found.Id });
    }
    if (!existingId) {
      await logEvent('out', 'estimate.pushed', { ref: quote.ref, qboId: data?.Estimate?.Id });
    }
  }
  const qboId = data?.Estimate?.Id;
  let attachableId = liveInvoiceId(quote.qbo_attachable_id);
  try {
    const attached = await attachPdf({
      entityType: 'Estimate',
      entityId: qboId,
      fileName: `${quote.ref}.pdf`,
      filePath: pdfPathFor(quote.pdf_file),
      existingId: attachableId,
    });
    attachableId = attached.attachableId || attachableId;
  } catch (err) {
    await logEvent('out', 'attachable.error', { ref: quote.ref, error: String(err.message) }, 'error');
  }
  return {
    qboId,
    syncToken: data?.Estimate?.SyncToken,
    attachableId,
    simulated: false,
  };
}

async function pushPayment(invoice, payment, customer) {
  const invoiceQboId = liveInvoiceId(invoice?.qbo_id);
  if (!(await isLive()) || !invoiceQboId) {
    return { qboId: null, simulated: true };
  }
  const amount = roundMoney(payment.amount);
  if (!(amount > 0)) return { qboId: null, simulated: true };
  const qboCustomerId = await ensureQboCustomer(customer);
  const data = await qboFetch('/payment', {
    method: 'POST',
    body: JSON.stringify({
      CustomerRef: { value: String(qboCustomerId) },
      TotalAmt: amount,
      TxnDate: toQboDate(payment.paid_at),
      PrivateNote: payment.note || `PDR payment on ${invoice.ref}`,
      Line: [{
        Amount: amount,
        LinkedTxn: [{ TxnId: invoiceQboId, TxnType: 'Invoice' }],
      }],
    }),
  });
  const qboId = data?.Payment?.Id;
  await logEvent('out', 'payment.pushed', { ref: invoice.ref, qboId, amount });
  const leftoverEstimate = await quoteEstimateForInvoice(invoice);
  if (leftoverEstimate) {
    await removeQuoteEstimate({
      quoteId: leftoverEstimate.quoteId,
      estimateId: leftoverEstimate.TxnId,
      invoiceQboId: invoiceQboId,
    });
  }
  return { qboId, simulated: false };
}

async function markInvoicePaidInCrm(inv, cols) {
  await inv.update(cols);
  if (cols.status !== 'paid') return;
  if (inv.job_id) await Job.update({ status: 'PAID' }, { where: { id: inv.job_id } });
  try {
    const job = inv.job_id ? await Job.findByPk(inv.job_id, { attributes: ['lead_id'] }) : null;
    const { setStage, logActivity } = require('../services/pipeline');
    const { resolveRule } = require('../services/taskEngine');
    await setStage(inv.customer_id, 'PAID', null, `Invoice ${inv.ref} paid in QuickBooks`, { leadId: job?.lead_id });
    await resolveRule(`chase_payment:invoice:${inv.id}`);
    await logActivity(inv.customer_id, null, 'payment_recorded', `QuickBooks marked ${inv.ref} paid`, 'invoice', inv.id);
  } catch { /* CRM side-effects must not fail the poll */ }
}

async function applyQboBalance(inv, paidOnQbo) {
  const invoicePayments = require('../invoicePayments');
  const remaining = invoicePayments.outstanding(inv);
  const already = roundMoney(Number(inv.amount_paid) || 0);
  const delta = roundMoney(Math.min(remaining, Math.max(0, paidOnQbo - already)));
  if (!(delta > 0)) return false;
  const stamp = `qbo-paid-${inv.qbo_id}-${Math.round(paidOnQbo * 100)}`;
  const applied = await invoicePayments.recordPayment(inv, {
    amount: delta,
    paid_at: todayStr(),
    note: 'Synced from QuickBooks',
  }, { userId: null, today: todayStr(), source: 'qbo', qboId: stamp });
  if (applied.error) return false;
  await markInvoicePaidInCrm(inv, applied.cols);
  return true;
}

async function pollPayments() {
  if (!(await isLive())) return 0;
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
      const qboInv = data?.Invoice;
      if (!qboInv) continue;
      if (qboInv.SyncToken && qboInv.SyncToken !== inv.qbo_sync_token) {
        await inv.update({ qbo_sync_token: qboInv.SyncToken, qbo_synced_at: new Date() });
      }
      const total = Number(qboInv.TotalAmt);
      const balance = Number(qboInv.Balance);
      const paid = roundMoney(total - balance);
      if (await applyQboBalance(inv, paid)) updated += 1;
    } catch (err) {
      await logEvent('in', 'payment_poll.error', { invoice: inv.ref, error: String(err.message) }, 'error');
    }
  }
  if (updated) await logEvent('in', 'payment_poll.synced', { updated });
  try {
    await sweepEstimatesReplacedByInvoices();
  } catch (err) {
    await logEvent('in', 'estimate.sweep_error', { error: String(err.message) }, 'error');
  }
  return updated;
}

/**
 * Paid invoices that still have a Closed quote Estimate keep that amount on
 * All Sales. Unlink and delete (or zero) those leftovers on each poll.
 */
async function sweepEstimatesReplacedByInvoices() {
  const quotes = (await Quote.findAll({
    where: { qbo_id: { [Op.ne]: null, [Op.notLike]: 'SIM-%' } },
    attributes: ['id', 'qbo_id'],
  })) || [];
  for (const quote of quotes) {
    const estimateId = liveInvoiceId(quote.qbo_id);
    if (!estimateId) continue;
    const job = await Job.findOne({ where: { quote_id: quote.id }, attributes: ['id'] });
    if (!job) continue;
    const inv = await Invoice.findOne({
      where: { job_id: job.id, qbo_id: { [Op.ne]: null, [Op.notLike]: 'SIM-%' } },
      attributes: ['qbo_id'],
    });
    if (!liveInvoiceId(inv?.qbo_id)) continue;
    await removeQuoteEstimate({
      quoteId: quote.id,
      estimateId,
      invoiceQboId: inv.qbo_id,
    });
  }
}

async function status() {
  const connected = await isConnected();
  const env = process.env.QBO_ENVIRONMENT === 'production' ? 'production' : 'sandbox';
  return {
    id: 'quickbooks',
    name: 'QuickBooks Online (UK)',
    configured: isConfigured(),
    connected,
    mode: isConfigured() && connected ? 'live' : 'simulated',
    env_needed: ['QBO_CLIENT_ID', 'QBO_CLIENT_SECRET', 'QBO_REDIRECT_URI', 'QBO_ENVIRONMENT'],
    connect_url: '/api/integrations/quickbooks/connect',
    detail: !isConfigured()
      ? 'Simulated — invoices stay in the CRM. Add Intuit app keys, then the owner clicks Connect.'
      : connected
        ? `Live (${env}) — sent quotes become Estimates, sent invoices (with PDF) become Invoices, and payments sync both ways.`
        : 'Keys present — the owner must click Connect in Settings so quotes and invoices can go to the sandbox company.',
  };
}

module.exports = {
  isConfigured,
  isConnected,
  isLive,
  authUrl,
  signOauthState,
  parseOauthState,
  exchangeCode,
  disconnect,
  pushInvoice,
  pushEstimate,
  pushPayment,
  attachPdf,
  pollPayments,
  status,
  pickTaxCodeId,
  liveInvoiceId,
  toQboDate,
  invoicePrivateNote,
};
