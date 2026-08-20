// Integration tests for timesheets + UK quoting. Run: node test-features.js
const BASE = 'http://localhost:4000';
let pass = 0, fail = 0;
const jars = {};

function check(label, cond, detail = '') {
  console.log(cond ? `  ✓ ${label}` : `  ✗ ${label} ${detail}`);
  cond ? pass++ : fail++;
}

async function req(method, path, body, who = 'owner') {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(jars[who] ? { Cookie: jars[who] } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) jars[who] = setCookie.split(';')[0];
  let data = null;
  try { data = await res.json(); } catch {}
  return { status: res.status, data };
}

(async () => {
  console.log('\n=== Timesheets & UK quoting ===');

  await req('POST', '/api/auth/login', { email: 'paul@pauldouglasroofing.co.uk', password: 'password123' }, 'owner');
  await req('POST', '/api/auth/login', { email: 'liam@pauldouglasroofing.co.uk', password: 'password123' }, 'liam');
  await req('POST', '/api/auth/login', { email: 'nathan@pauldouglasroofing.co.uk', password: 'password123' }, 'nathan');

  // ---------------------------------------------------------
  console.log('\n1. Clock in / break / clock out lifecycle');
  let r = await req('GET', '/api/staff/clock/status', null, 'liam');
  check('Liam starts not clocked in', r.data.active === null, `(got ${JSON.stringify(r.data.active)})`);

  // find a job Liam is assigned to
  const jobs = (await req('GET', '/api/staff/jobs?from=2000-01-01&to=2099-01-01', null, 'liam')).data.jobs;
  check('Liam has assigned jobs', jobs.length > 0);
  const jobId = jobs[0]?.id;

  r = await req('POST', '/api/staff/clock/in', { job_id: jobId, lat: 51.45, lng: -0.97, accuracy: 12 }, 'liam');
  check('Clock in succeeds', r.status === 200, `(${r.data?.error || ''})`);

  r = await req('POST', '/api/staff/clock/in', { job_id: jobId }, 'liam');
  check('Cannot clock in twice', r.status === 400 && /already clocked in/i.test(r.data.error), `(got ${r.status})`);

  r = await req('POST', '/api/staff/clock/break/start', {}, 'liam');
  check('Break starts', r.status === 200);
  r = await req('POST', '/api/staff/clock/break/start', {}, 'liam');
  check('Cannot start a second break', r.status === 400);
  r = await req('POST', '/api/staff/clock/break/end', {}, 'liam');
  check('Break ends', r.status === 200);

  r = await req('GET', '/api/staff/clock/status', null, 'liam');
  check('Status reports the running shift', !!r.data.active);
  check('Status carries NO cost_rate', r.data.active.cost_rate === undefined);
  check('Status carries NO labour_cost', r.data.active.labour_cost === undefined);

  r = await req('POST', '/api/staff/clock/out', { notes: 'Test shift', lat: 51.45, lng: -0.97 }, 'liam');
  check('Clock out succeeds', r.status === 200, `(${r.data?.error || ''})`);
  check('Hours returned', typeof r.data.hours === 'number');
  check('Clock-out response has NO cost figures', r.data.shift.labour_cost === undefined && r.data.shift.cost_rate === undefined);

  r = await req('POST', '/api/staff/clock/out', {}, 'liam');
  check('Cannot clock out when not clocked in', r.status === 400);

  // ---------------------------------------------------------
  console.log('\n2. Staff cannot reach cost/payroll data (security)');
  for (const path of ['/api/timesheets', '/api/timesheets/totals', '/api/timesheets/costing', '/api/timesheets/live']) {
    r = await req('GET', path, null, 'nathan');
    check(`Field staff BLOCKED from ${path}`, r.status === 403, `(got ${r.status})`);
  }
  r = await req('GET', '/api/staff/timesheets/mine', null, 'nathan');
  check('Field staff CAN see own hours', r.status === 200);
  const mineStr = JSON.stringify(r.data);
  check('Own hours contain no cost_rate', !mineStr.includes('cost_rate'));
  check('Own hours contain no labour_cost', !mineStr.includes('labour_cost'));
  check('Own hours contain no hourly_cost', !mineStr.includes('hourly_cost'));

  // ---------------------------------------------------------
  console.log('\n3. Office review, approval and audit trail');
  r = await req('GET', '/api/timesheets', null, 'owner');
  check('Office can list timesheets', r.status === 200 && r.data.timesheets.length > 0);
  const completed = r.data.timesheets.find((t) => t.status === 'completed');
  check('There are shifts awaiting approval', !!completed);
  check('Office DOES see labour cost', completed && completed.labour_cost !== undefined);

  r = await req('PUT', `/api/timesheets/${completed.id}`, { break_minutes: 45 }, 'owner');
  check('Editing hours WITHOUT a reason is rejected', r.status === 400, `(got ${r.status})`);

  r = await req('PUT', `/api/timesheets/${completed.id}`, { break_minutes: 45, edit_reason: 'Confirmed longer break with Nathan' }, 'owner');
  check('Editing hours WITH a reason succeeds', r.status === 200);

  r = await req('POST', `/api/timesheets/${completed.id}/approve`, {}, 'owner');
  check('Approval succeeds', r.status === 200);

  r = await req('GET', '/api/timesheets/live', null, 'owner');
  check('Live board shows who is on the clock', r.status === 200 && Array.isArray(r.data.active));

  // ---------------------------------------------------------
  console.log('\n4. Job costing / profitability');
  r = await req('GET', '/api/timesheets/costing', null, 'owner');
  check('Costing endpoint works', r.status === 200);
  const costed = r.data.jobs.filter((j) => j.actual_hours > 0);
  check('At least one job has real hours', costed.length > 0);
  if (costed.length) {
    const j0 = costed[0];
    check('Margin computed', j0.margin_percent !== undefined);
    check('Net value strips VAT', j0.net_value < j0.quoted_value || j0.quoted_value === 0);
    check('Gross profit = net value - labour', Math.abs(j0.gross_profit - (j0.net_value - j0.actual_labour_cost)) < 0.02);
  }

  // ---------------------------------------------------------
  console.log('\n5. UK quote — mixed VAT, live preview matches saved record');
  const custId = (await req('GET', '/api/customers?q=Ackroyd', null, 'owner')).data.customers[0]?.id;
  check('Found a customer', !!custId);

  const items = [
    { description: 'Roof repair labour', qty: 1, unit_price: 1000, vat_code: 'standard', kind: 'labour' },
    { description: 'Insulation (energy saving)', qty: 1, unit_price: 500, vat_code: 'reduced', kind: 'materials' },
  ];

  r = await req('POST', '/api/quotes/preview', { items }, 'owner');
  check('Preview endpoint works', r.status === 200);
  check('Preview VAT = 200 + 25', Math.abs(r.data.vat_total - 225) < 0.01, `(got ${r.data.vat_total})`);
  const previewTotal = r.data.total;

  r = await req('POST', '/api/quotes', { customer_id: custId, title: 'Test UK quote', items }, 'owner');
  check('Quote created', r.status === 200);
  const quoteId = r.data.id;
  check('Saved total matches the preview exactly', Math.abs(r.data.calc.total - previewTotal) < 0.001);

  r = await req('GET', `/api/quotes/${quoteId}`, null, 'owner');
  check('Quote stores VAT breakdown', !!r.data.quote.vat_breakdown);
  check('Quote stores labour/materials split', r.data.quote.labour_total === 1000 && r.data.quote.materials_total === 500);
  check('Domestic customer gets cancellation rights', r.data.quote.cancellation_rights_apply === 1);

  // ---------------------------------------------------------
  console.log('\n6. Reverse charge + CIS quote');
  r = await req('POST', '/api/quotes', {
    customer_id: custId, title: 'Subcontract package',
    items: [
      { description: 'Labour', qty: 1, unit_price: 10000, vat_code: 'standard', kind: 'labour' },
      { description: 'Materials', qty: 1, unit_price: 5000, vat_code: 'standard', kind: 'materials' },
    ],
    vat_treatment: 'reverse_charge', cis_applies: true, cis_rate: 20, retention_percent: 5,
  }, 'owner');
  check('Reverse-charge quote created', r.status === 200);
  const c = r.data.calc;
  check('No VAT charged under reverse charge', c.vat_total === 0);
  check('Reverse-charge VAT disclosed (3000)', Math.abs(c.reverse_charge_vat - 3000) < 0.01, `(got ${c.reverse_charge_vat})`);
  check('CIS on labour only (2000, not 3000)', Math.abs(c.cis_deduction - 2000) < 0.01, `(got ${c.cis_deduction})`);
  check('Retention 5% of 15000 = 750', Math.abs(c.retention_amount - 750) < 0.01);
  check('Due now = 15000 - 2000 - 750', Math.abs(c.due_now - 12250) < 0.01, `(got ${c.due_now})`);

  // ---------------------------------------------------------
  console.log('\n7. Quote PDF actually generates');
  r = await req('POST', `/api/quotes/${quoteId}/send`, { channels: ['whatsapp'] }, 'owner');
  check('Quote sends and PDF is produced', r.status === 200 && !!r.data.pdf, `(${r.data?.error || ''})`);

  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===\n`);
  process.exit(fail ? 1 : 0);
})();
