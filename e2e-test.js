// ============================================================
// End-to-end business flow test — walks the PRD's headline journey:
// enquiry -> visit -> quote -> send -> follow-up -> accept -> job
// -> schedule -> complete -> invoice -> QuickBooks -> paid
// Plus the security check: field staff cannot reach financial data.
// Run against a live server: node e2e-test.js
// ============================================================
const BASE = process.env.BASE || 'http://localhost:4000';

let cookie = '';
let pass = 0, fail = 0;

async function req(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  let data = null;
  try { data = await res.json(); } catch {}
  return { status: res.status, data };
}

function check(name, condition, detail = '') {
  if (condition) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} ${detail}`); }
}

(async () => {
  console.log('\n=== Paul Douglas Roofing — End-to-End Flow Test ===\n');

  console.log('1. Authentication & roles');
  let r = await req('POST', '/api/auth/login', { email: 'paul@pauldouglasroofing.co.uk', password: 'password123' });
  check('Owner can sign in', r.status === 200 && r.data.user.role === 'ADMIN');
  const ownerCookie = cookie;

  r = await req('POST', '/api/auth/login', { email: 'paul@pauldouglasroofing.co.uk', password: 'wrongpass' });
  check('Wrong password rejected', r.status === 401);
  cookie = ownerCookie;

  console.log('\n2. Inbound enquiry lands in the CRM (PRD §9.1)');
  r = await req('POST', '/api/integrations/simulate/enquiry', { source: 'whatsapp' });
  check('WhatsApp enquiry creates a lead + customer', r.status === 200 && r.data.customerId);
  const customerId = r.data.customerId;

  // dedupe check — same phone again should attach, not duplicate
  const cust = (await req('GET', `/api/customers/${customerId}`)).data.customer;
  const before = (await req('GET', '/api/customers')).data.customers.length;
  await req('POST', '/api/leads', { source: 'whatsapp', name: cust.name, phone: cust.phone, message: 'Following up on my enquiry' });
  const after = (await req('GET', '/api/customers')).data.customers.length;
  check('Duplicate contact matched to existing customer, not duplicated', before === after, `(${before} -> ${after})`);

  console.log('\n3. Site visit booking + calendar (PRD §9.3)');
  const start = new Date(Date.now() + 2 * 86400000);
  r = await req('POST', '/api/appointments', {
    customer_id: customerId, start: start.toISOString(),
    end: new Date(start.getTime() + 3600000).toISOString(), address: '1 Test Road',
  });
  check('Site visit booked', r.status === 200 && r.data.id);
  check('Calendar sync attempted (simulated without keys)', ['simulated', 'synced'].includes(r.data.gcal_status));
  let detail = (await req('GET', `/api/customers/${customerId}`)).data;
  check('Customer advanced to SITE_VISIT_BOOKED', detail.customer.stage === 'SITE_VISIT_BOOKED', `(got ${detail.customer.stage})`);

  console.log('\n4. Quotation (PRD §9.4)');
  r = await req('POST', '/api/quotes', {
    customer_id: customerId, title: 'E2E test — flat roof repair',
    items: [{ description: 'Strip and re-felt', qty: 20, unit_price: 45 }, { description: 'New trims', qty: 1, unit_price: 180 }],
  });
  check('Quote created', r.status === 200 && r.data.ref);
  const quoteId = r.data.id, quoteRef = r.data.ref;
  const quote = (await req('GET', `/api/quotes/${quoteId}`)).data.quote;
  check('VAT calculated correctly (20%)', Math.abs(quote.total - (1080 * 1.2)) < 0.01, `(got ${quote.total}, expected ${(1080 * 1.2).toFixed(2)})`);

  r = await req('POST', `/api/quotes/${quoteId}/send`, { channels: ['whatsapp'] });
  check('Quote sent via WhatsApp (simulated)', r.status === 200 && r.data.ok);
  check('Quote PDF generated', !!r.data.pdf);

  detail = (await req('GET', `/api/customers/${customerId}`)).data;
  check('Customer advanced to QUOTED', detail.customer.stage === 'QUOTED', `(got ${detail.customer.stage})`);
  check('Quote message recorded on conversation', detail.messages.some((m) => m.direction === 'out' && m.channel === 'whatsapp'));

  console.log('\n5. Automatic follow-ups (PRD §10.2)');
  const fu = (await req('GET', `/api/quotes/${quoteId}`)).data.followups;
  check('Follow-up sequence scheduled', fu.length >= 2, `(${fu.length} steps)`);
  check('All steps pending', fu.every((f) => f.status === 'pending'));

  // customer replies -> chasing must stop (the PRD's hard requirement)
  await req('POST', '/api/leads', { source: 'whatsapp', name: cust.name, phone: cust.phone, message: 'Thanks, having a look now' });
  const fuAfter = (await req('GET', `/api/quotes/${quoteId}`)).data.followups;
  check('Customer reply STOPS all pending follow-ups', fuAfter.every((f) => f.status !== 'pending'), `(statuses: ${fuAfter.map((f) => f.status).join(',')})`);

  console.log('\n6. Won quote auto-creates a job');
  r = await req('POST', `/api/quotes/${quoteId}/decision`, { decision: 'accepted' });
  check('Quote accepted', r.status === 200 && r.data.job_id);
  const jobId = r.data.job_id;
  detail = (await req('GET', `/api/customers/${customerId}`)).data;
  check('Customer moved to WON', detail.customer.stage === 'WON', `(got ${detail.customer.stage})`);
  check('Job created from quote', detail.jobs.some((j) => j.id === jobId));

  console.log('\n7. AI scheduling with server-side constraint validation (PRD §11.1)');
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  r = await req('POST', '/api/jobs/ai/propose', { date: tomorrow, transcript: 'Get the test job done, Connor is off sick today' });
  check('Assistant returned a proposal', r.status === 200 && Array.isArray(r.data.assignments));
  const proposal = r.data;
  check('Proposal only uses real job IDs', proposal.assignments.every((a) => proposal.context.unscheduledJobs.some((j) => j.id === a.job_id)));
  check('No staff double-booked across proposed jobs', (() => {
    const seen = new Set();
    for (const a of proposal.assignments) for (const u of a.user_ids) { if (seen.has(u)) return false; seen.add(u); }
    return true;
  })());
  check('No staff on approved holiday assigned', proposal.assignments.every((a) =>
    a.user_ids.every((u) => !proposal.context.staff.find((s) => s.id === u)?.on_holiday)));

  // Try to sneak an invalid assignment past the server (holiday staff)
  const onHoliday = proposal.context.staff.find((s) => s.on_holiday);
  if (onHoliday) {
    r = await req('POST', '/api/jobs/ai/approve', { date: tomorrow, assignments: [{ job_id: jobId, user_ids: [onHoliday.id] }] });
    check('Server REJECTS assigning someone on holiday', r.status === 400, `(got ${r.status})`);
  } else {
    check('Server rejects holiday assignment (skipped — nobody on holiday tomorrow)', true);
  }

  const available = proposal.context.staff.filter((s) => s.available).slice(0, 2).map((s) => s.id);
  r = await req('POST', '/api/jobs/ai/approve', { date: tomorrow, assignments: [{ job_id: jobId, user_ids: available }] });
  check('Valid schedule approved and written', r.status === 200 && r.data.scheduled === 1);

  console.log('\n8. Job completion -> invoice -> QuickBooks -> paid (PRD §10.3)');
  r = await req('PUT', `/api/jobs/${jobId}/status`, { status: 'COMPLETED' });
  check('Job marked completed', r.status === 200);
  detail = (await req('GET', `/api/customers/${customerId}`)).data;
  check('Customer moved to COMPLETED', detail.customer.stage === 'COMPLETED', `(got ${detail.customer.stage})`);

  r = await req('POST', '/api/invoices', { job_id: jobId });
  check('Invoice created from job (pre-filled from quote)', r.status === 200 && r.data.ref);
  const invoiceId = r.data.id;

  r = await req('POST', `/api/invoices/${invoiceId}/send`);
  check('Invoice sent + pushed to QuickBooks (simulated)', r.status === 200 && r.data.qbo);

  r = await req('POST', `/api/invoices/${invoiceId}/payment`, {});
  check('Payment recorded, invoice paid', r.status === 200 && r.data.status === 'paid');
  detail = (await req('GET', `/api/customers/${customerId}`)).data;
  check('Customer reached PAID — full circle', detail.customer.stage === 'PAID', `(got ${detail.customer.stage})`);

  console.log('\n9. Holiday notice rule enforced server-side (PRD §11.2)');
  const staffUser = (await req('GET', '/api/settings/users')).data.users.find((u) => u.role === 'STAFF');
  check('Found a field staff account to test with', !!staffUser);
  const tooSoon = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  r = await req('POST', '/api/holidays', { start_date: tooSoon, end_date: tooSoon, user_id: staffUser.id });
  check('Holiday inside notice window REJECTED by server', r.status === 400, `(got ${r.status})`);
  const farOut = new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10);
  r = await req('POST', '/api/holidays', { start_date: farOut, end_date: farOut, user_id: staffUser.id });
  check('Holiday with proper notice accepted', r.status === 200, `(got ${r.status}: ${r.data?.error || ''})`);
  r = await req('POST', '/api/holidays', { start_date: farOut, end_date: farOut, user_id: 999999 });
  check('Holiday for a non-existent staff member rejected cleanly (not a 500)', r.status === 400, `(got ${r.status})`);

  console.log('\n10. Field staff permissions — the PRD\'s hard security requirement (§9.5/§15.1)');
  cookie = '';
  r = await req('POST', '/api/auth/login', { email: 'jamie@pauldouglasroofing.co.uk', password: 'password123' });
  check('Field staff can sign in', r.status === 200 && r.data.user.role === 'STAFF');

  const blocked = ['/api/customers', '/api/quotes', '/api/invoices', '/api/dashboard', '/api/leads', '/api/tasks', '/api/jobs'];
  for (const path of blocked) {
    const res = await req('GET', path);
    check(`Field staff BLOCKED from ${path}`, res.status === 403, `(got ${res.status})`);
  }

  const staffJobs = await req('GET', '/api/staff/jobs');
  check('Field staff CAN see their own jobs', staffJobs.status === 200);
  const leaked = [];
  for (const j of staffJobs.data.jobs || []) {
    for (const k of Object.keys(j)) if (/value|price|total|cost|quote|invoice/i.test(k)) leaked.push(k);
  }
  check('No financial field names in staff job payload', leaked.length === 0, `(leaked: ${leaked.join(',')})`);
  const raw = JSON.stringify(staffJobs.data);
  check('No £ amounts anywhere in staff response', !/£|"value":\s*\d/.test(raw));

  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===\n`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error('TEST HARNESS ERROR', e); process.exit(1); });
