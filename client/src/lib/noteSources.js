/** Office-only internal note origin (task remarks, site visits, typed memos, website). */
export const NOTE_SOURCES = {
  general: {
    label: 'General',
    className: 'bg-slate-100 text-slate-700 ring-1 ring-slate-200/80',
  },
  task: {
    label: 'Task completion remarks',
    className: 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-100',
  },
  visit: {
    label: 'Site visit completion remarks',
    className: 'bg-sky-50 text-sky-800 ring-1 ring-sky-100',
  },
  customer: {
    label: 'From customer',
    className: 'bg-amber-50 text-amber-800 ring-1 ring-amber-100',
  },
  clock: {
    label: 'Clock-out notes',
    className: 'bg-rose-50 text-rose-800 ring-1 ring-rose-100',
  },
};

export function noteSourceMeta(source) {
  return NOTE_SOURCES[source] || NOTE_SOURCES.general;
}

/**
 * Website enquiry photos live on the customer and on lead.meta.photo_file_ids.
 */
export function attachmentSource(file, lead) {
  if (file?.source === 'customer') return 'customer';
  if (file?.source === 'clock') return 'clock';
  const ids = Array.isArray(lead?.meta?.photo_file_ids) ? lead.meta.photo_file_ids : [];
  if (ids.some((id) => Number(id) === Number(file?.id))) return 'customer';
  return file?.source === 'general' ? 'general' : (file?.source || 'general');
}

/** File badges reuse note colours; clock-out photos use a photo label. */
export function attachmentSourceMeta(source) {
  if (source === 'clock') {
    return {
      label: 'Clock-out photo',
      className: NOTE_SOURCES.clock.className,
    };
  }
  return noteSourceMeta(source);
}
