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

/** Creation time of a workspace record. Do not use visit `start` - that is the appointment, not when it was booked. */
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

/**
 * Inbox Open always passes ?lead=. Task links and /leads/:id without it still
 * pin to one enquiry so a customer with several leads is not mixed together.
 */
export function workspaceScopeForOpen(leads, leadId) {
  const scoped = leadWorkspaceScope(leads, leadId);
  if (scoped) return scoped;
  if (leadId != null && String(leadId).trim() !== '') return null;
  const sorted = sortLeads(leads);
  if (!sorted.length) return null;
  return leadWorkspaceScope(leads, sorted[sorted.length - 1].id);
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
 * Keep enquiry-scoped files, plus landing-page photos tagged on this lead.
 */
export function filesForLead(files, scope, lead) {
  const scoped = filterByLeadScope(files, scope);
  const ids = Array.isArray(lead?.meta?.photo_file_ids) ? lead.meta.photo_file_ids : [];
  if (!ids.length) return scoped;
  const have = new Set(scoped.map((file) => Number(file.id)));
  const extras = (files || []).filter((file) => (
    ids.some((id) => Number(id) === Number(file.id)) && !have.has(Number(file.id))
  ));
  return extras.length ? [...scoped, ...extras] : scoped;
}

/**
 * Tasks may sit on the enquiry, the customer, or a quote/job for this enquiry.
 */
export function filterTasksForLead(tasks, scope, { quotes = [], jobs = [] } = {}) {
  if (!scope) return tasks || [];
  const leadId = Number(scope.lead?.id);
  if (!Number.isFinite(leadId) || leadId <= 0) return [];
  return (tasks || []).filter((task) => {
    if (task?.enquiry_id != null && task.enquiry_id !== '') {
      return Number(task.enquiry_id) === leadId;
    }
    if (task?.entity_type === 'lead') return Number(task.entity_id) === leadId;
    if (task?.entity_type === 'quote') {
      return quotes.some((q) => Number(q.id) === Number(task.entity_id) && Number(q.lead_id) === leadId);
    }
    if (task?.entity_type === 'job') {
      return jobs.some((j) => Number(j.id) === Number(task.entity_id) && Number(j.lead_id) === leadId);
    }
    return inLeadScope(task, scope);
  });
}

/**
 * Workspace badge is this enquiry's pipeline stage, not the customer's last move.
 */
export function enquiryWorkspaceStage(customerStage, scope) {
  return scope?.lead?.stage || customerStage;
}
