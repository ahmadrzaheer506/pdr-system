/** Holiday request length: one date, or an inclusive from–to range. */
export const HOLIDAY_KIND_SINGLE = 'single';
export const HOLIDAY_KIND_MULTI = 'multi';

export const HOLIDAY_KINDS = [
  { id: HOLIDAY_KIND_SINGLE, label: 'Single day' },
  { id: HOLIDAY_KIND_MULTI, label: 'Multi day' },
];

export function kindFromDates(start, end) {
  const from = String(start || '').slice(0, 10);
  const to = String(end || '').slice(0, 10);
  if (!from) return HOLIDAY_KIND_SINGLE;
  return from === to ? HOLIDAY_KIND_SINGLE : HOLIDAY_KIND_MULTI;
}

export function holidayKindOf(row) {
  if (row?.kind === HOLIDAY_KIND_SINGLE || row?.kind === HOLIDAY_KIND_MULTI) return row.kind;
  return kindFromDates(row?.start_date, row?.end_date);
}

export function holidayKindLabel(kind) {
  return HOLIDAY_KINDS.find((tab) => tab.id === kind)?.label || 'Single day';
}

export function holidayDateRange(row, format = (d) => d) {
  const kind = holidayKindOf(row);
  if (kind === HOLIDAY_KIND_SINGLE) return format(row.start_date);
  return `${format(row.start_date)} – ${format(row.end_date)}`;
}

export function holidayPayload({ kind, start, end, reason = '', userId }) {
  const body = {
    kind,
    start_date: start,
    end_date: kind === HOLIDAY_KIND_SINGLE ? start : end,
    reason,
  };
  if (userId != null && userId !== '') body.user_id = Number(userId);
  return body;
}
