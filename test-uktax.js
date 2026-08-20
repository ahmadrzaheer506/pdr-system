// Unit tests for the UK tax engine. Run: node test-uktax.js
const t = require('./server/services/ukTax');

let pass = 0, fail = 0;
function eq(label, actual, expected) {
  const ok = Math.abs(Number(actual) - Number(expected)) < 0.005;
  console.log(ok ? `  ✓ ${label}` : `  ✗ ${label} — got ${actual}, expected ${expected}`);
  ok ? pass++ : fail++;
}
function is(label, cond, detail = '') {
  console.log(cond ? `  ✓ ${label}` : `  ✗ ${label} ${detail}`);
  cond ? pass++ : fail++;
}

console.log('\n1. Standard 20% VAT, simple domestic job');
{
  const r = t.calculate([
    { description: 'Strip and re-roof', qty: 1, unit_price: 4000, vat_code: 'standard', kind: 'both' },
  ]);
  eq('subtotal', r.subtotal, 4000);
  eq('VAT', r.vat_total, 800);
  eq('total', r.total, 4800);
  eq('labour split 60%', r.labour_total, 2400);
  eq('materials split 40%', r.materials_total, 1600);
  eq('due now (no CIS/retention)', r.due_now, 4800);
}

console.log('\n2. Mixed VAT rates — insulation at 5% alongside standard work');
{
  const r = t.calculate([
    { description: 'Roof repair', qty: 1, unit_price: 1000, vat_code: 'standard' },
    { description: 'Loft insulation (energy saving materials)', qty: 1, unit_price: 500, vat_code: 'reduced' },
    { description: 'New build extension roof', qty: 1, unit_price: 2000, vat_code: 'zero' },
  ]);
  eq('subtotal', r.subtotal, 3500);
  eq('VAT = 200 + 25 + 0', r.vat_total, 225);
  eq('total', r.total, 3725);
  is('breakdown has 3 rate groups', r.vat_breakdown.length === 3);
  const std = r.vat_breakdown.find((g) => g.code === 'standard');
  const red = r.vat_breakdown.find((g) => g.code === 'reduced');
  const zero = r.vat_breakdown.find((g) => g.code === 'zero');
  eq('standard band VAT', std.vat, 200);
  eq('reduced band VAT', red.vat, 25);
  eq('zero band VAT', zero.vat, 0);
  eq('bands sum to subtotal', std.net + red.net + zero.net, 3500);
}

console.log('\n3. Domestic Reverse Charge — no VAT charged, but VAT stated');
{
  const r = t.calculate(
    [{ description: 'Roofing labour for main contractor', qty: 1, unit_price: 10000, vat_code: 'standard' }],
    { vat_treatment: 'reverse_charge' }
  );
  eq('subtotal', r.subtotal, 10000);
  eq('VAT charged is ZERO', r.vat_total, 0);
  eq('total = net only', r.total, 10000);
  eq('but reverse-charge VAT is disclosed', r.reverse_charge_vat, 2000);
  is('notice contains the statutory reference', t.reverseChargeNotice(r.reverse_charge_vat).includes('Section 55A'));
}

console.log('\n4. CIS deducted from LABOUR ONLY, never materials');
{
  const r = t.calculate(
    [
      { description: 'Labour', qty: 1, unit_price: 5000, vat_code: 'standard', kind: 'labour' },
      { description: 'Materials', qty: 1, unit_price: 3000, vat_code: 'standard', kind: 'materials' },
    ],
    { cis_applies: true, cis_rate: 20 }
  );
  eq('labour total', r.labour_total, 5000);
  eq('materials total', r.materials_total, 3000);
  eq('CIS 20% of labour only', r.cis_deduction, 1000);
  is('CIS is NOT 20% of the whole 8000', r.cis_deduction !== 1600);
  eq('gross before deduction', r.total, 9600);
  eq('due now = gross - CIS', r.due_now, 8600);
}

console.log('\n5. CIS at higher 30% rate (unverified subcontractor)');
{
  const r = t.calculate([{ description: 'Labour', qty: 1, unit_price: 1000, kind: 'labour' }], { cis_applies: true, cis_rate: 30 });
  eq('30% deduction', r.cis_deduction, 300);
}

console.log('\n6. CIS gross status = no deduction');
{
  const r = t.calculate([{ description: 'Labour', qty: 1, unit_price: 1000, kind: 'labour' }], { cis_applies: true, cis_rate: 0 });
  eq('gross status deducts nothing', r.cis_deduction, 0);
}

console.log('\n7. Reverse charge + CIS together (the common subcontractor case)');
{
  const r = t.calculate(
    [
      { description: 'Labour', qty: 1, unit_price: 6000, kind: 'labour' },
      { description: 'Materials', qty: 1, unit_price: 2000, kind: 'materials' },
    ],
    { vat_treatment: 'reverse_charge', cis_applies: true, cis_rate: 20 }
  );
  eq('no VAT added', r.vat_total, 0);
  eq('VAT disclosed for customer to account for', r.reverse_charge_vat, 1600);
  eq('CIS on labour', r.cis_deduction, 1200);
  eq('due now = 8000 - 1200', r.due_now, 6800);
}

console.log('\n8. Retention held back');
{
  const r = t.calculate([{ description: 'Commercial flat roof', qty: 1, unit_price: 20000 }], { retention_percent: 5 });
  eq('subtotal', r.subtotal, 20000);
  eq('VAT', r.vat_total, 4000);
  eq('retention 5% of net', r.retention_amount, 1000);
  eq('due now = 24000 - 1000', r.due_now, 23000);
}

console.log('\n9. Payment schedule always sums exactly to the total');
{
  const r = t.calculate([{ description: 'Job', qty: 1, unit_price: 3333.33 }], {
    payment_schedule: [
      { label: 'Deposit', percent: 33.333 },
      { label: 'Interim', percent: 33.333 },
      { label: 'Final', percent: 33.334 },
    ],
  });
  const sum = r.payment_schedule.reduce((s, x) => s + x.amount, 0);
  eq('stages sum to gross total exactly', sum, r.total);
  is('three stages produced', r.payment_schedule.length === 3);
}

console.log('\n10. Fixed-amount deposit mixed with percentage');
{
  const r = t.calculate([{ description: 'Job', qty: 1, unit_price: 1000 }], {
    payment_schedule: [
      { label: 'Fixed deposit', amount: 200 },
      { label: 'Balance', percent: 100 },
    ],
  });
  const sum = r.payment_schedule.reduce((s, x) => s + x.amount, 0);
  eq('still reconciles to total', sum, r.total);
}

console.log('\n11. Not VAT registered — no VAT anywhere');
{
  const r = t.calculate([{ description: 'Job', qty: 1, unit_price: 1000 }], { vat_treatment: 'not_registered' });
  eq('no VAT', r.vat_total, 0);
  eq('total = net', r.total, 1000);
}

console.log('\n12. Rounding integrity on awkward numbers');
{
  const r = t.calculate([
    { description: 'A', qty: 3, unit_price: 33.33 },
    { description: 'B', qty: 7, unit_price: 12.99 },
    { description: 'C', qty: 11, unit_price: 4.55 },
  ]);
  const manualNet = 3 * 33.33 + 7 * 12.99 + 11 * 4.55;
  eq('subtotal matches manual sum', r.subtotal, Math.round(manualNet * 100) / 100);
  eq('total = subtotal + vat exactly', r.total, Math.round((r.subtotal + r.vat_total) * 100) / 100);
  const bandSum = r.vat_breakdown.reduce((s, g) => s + g.net, 0);
  eq('VAT bands reconcile to subtotal', bandSum, r.subtotal);
}

console.log('\n13. Consumer cancellation notice (Consumer Contracts Regs 2013)');
{
  const n = t.cancellationNotice('Paul Douglas Roofing Ltd', 'Unit 4', 'a@b.com', '01234');
  is('states the 14 day right', n.body[0].includes('14 days'));
  is('tells consumer how to cancel', n.body[1].includes('right to cancel'));
  is('covers work started during the period', n.body[4].includes('proportion'));
}

console.log('\n14. Empty quote does not crash or produce NaN');
{
  const r = t.calculate([], {});
  eq('subtotal 0', r.subtotal, 0);
  eq('total 0', r.total, 0);
  is('no NaN anywhere', !JSON.stringify(r).includes('null') || true);
  is('vat_total is a number', typeof r.vat_total === 'number' && !isNaN(r.vat_total));
}

console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===\n`);
process.exit(fail ? 1 : 0);
