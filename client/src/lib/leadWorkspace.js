/**
 * Inbox Open is per enquiry. Quotes/visits/jobs live on the customer, so the
 * workspace scopes those records to the time window between this lead and the next.
 */

function leadTime(lead) {
  const t = new Date(lead?.created_at).getTime();
  return Number.isNaN(t) ? 0 : t;
}

function sortLeads(leads) {
  return [...(leads || [])].sort((a, b) => {
    const byTime = leadTime(a) - leadTime(b);
    if (byTime !== 0) return byTime;
    return Number(a.id) - Number(b.id);
  });
}

/** Creation time of a workspace record. Do not use visit `start` — that is the appointment, not when it was booked. */
export function recordTime(row) {
  const raw = row?.created_at || row?.at || null;
  if (!raw) return null;
  const t = new Date(raw).getTime();
  return Number.isNaN(t) ? null : t;
}

/**
 * Time window for one lead on a customer, or null when Open is not enquiry-scoped.
 */
export function leadWorkspaceScope(leads, leadId) {
  if (leadId == null || leadId === '') return null;
  const id = Number(leadId);
  if (!Number.isFinite(id) || id <= 0) return null;
  const sorted = sortLeads(leads);
  const idx = sorted.findIndex((lead) => Number(lead.id) === id);
  if (idx < 0) return null;
  const lead = sorted[idx];
  const start = idx === 0 ? 0 : leadTime(lead);
  const next = sorted[idx + 1];
  const end = next ? leadTime(next) : Number.POSITIVE_INFINITY;
  return { lead, start, end };
}

export function inLeadScope(row, scope) {
  if (!scope) return true;
  if (row?.lead_id != null && scope.lead?.id != null) {
    return Number(row.lead_id) === Number(scope.lead.id);
  }
  const t = recordTime(row);
  if (t == null) return false;
  return t >= scope.start && t < scope.end;
}

export function filterByLeadScope(rows, scope) {
  if (!scope) return rows || [];
  return (rows || []).filter((row) => inLeadScope(row, scope));
}

/**
 * Workspace badge is this enquiry's pipeline stage, not the customer's last move.
 */
export function enquiryWorkspaceStage(customerStage, scope) {
  return scope?.lead?.stage || customerStage;
}
