/**
 * Invoice generation from a job (requirement 11.1).
 * Quoted lines plus job variations. One invoice per job. No job-status gate.
 * VAT / CIS totals stay on the 11.2 inherit-from-quote path.
 */
const { Invoice } = require('./models');
const jobVariations = require('./jobVariations');

function copyQuoteItems(items) {
  return (items || []).map((line) => ({ ...line }));
}

function variationAsInvoiceLine(row) {
  return {
    description: row.description,
    qty: 1,
    unit_price: Number(row.amount) || 0,
    vat_code: 'standard',
    kind: 'labour',
  };
}

/**
 * Quote items (or job title + value), then each variation as qty 1 / standard / labour.
 * @param {{ title?: string, value?: number }} job
 * @param {{ items?: object[] }|null} quote
 * @param {{ description: string, amount: number }[]} variations
 */
function linesForJobInvoice(job, quote, variations) {
  const quoted = quote?.items?.length
    ? copyQuoteItems(quote.items)
    : [{ description: job.title, qty: 1, unit_price: job.value || 0 }];
  return quoted.concat((variations || []).map(variationAsInvoiceLine));
}

async function invoiceIdForJob(jobId) {
  const row = await Invoice.findOne({
    where: { job_id: jobId },
    attributes: ['id', 'ref'],
  });
  return row ? { id: row.id, ref: row.ref } : null;
}

async function linesFromJobRecord(job, quote) {
  const variations = await jobVariations.listVariations(job.id);
  return linesForJobInvoice(job, quote, variations);
}

module.exports = {
  linesForJobInvoice,
  variationAsInvoiceLine,
  invoiceIdForJob,
  linesFromJobRecord,
};
