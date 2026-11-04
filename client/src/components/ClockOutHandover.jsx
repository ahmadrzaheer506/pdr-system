import React from 'react';

/** Timesheet photos live under DATA_DIR/files and are served at /api/files/:name. */
export function clockOutPhotoSrc(photoFile) {
  if (!photoFile || !/^[\w.\-]+$/.test(String(photoFile))) return null;
  return `/api/files/${photoFile}`;
}

/**
 * Clock-out handover: "How did it go?" notes and optional site photo.
 */
export default function ClockOutHandover({ notes, photoFile, compact = false, onOpen }) {
  const src = clockOutPhotoSrc(photoFile);
  const text = String(notes || '').trim();
  if (!text && !src) return null;

  const photoClass = compact
    ? 'h-9 w-9 rounded-md object-cover shrink-0 bg-slate-100 ring-1 ring-slate-200'
    : 'w-full max-h-56 rounded-lg object-contain bg-slate-100';
  const noteClass = compact
    ? 'text-xs text-slate-600 line-clamp-2 whitespace-pre-wrap min-w-0'
    : 'text-sm text-slate-800 whitespace-pre-wrap';

  const inner = (
    <>
      {src ? <img src={src} alt="Clock-out site photo" className={photoClass} /> : null}
      {text ? <p className={noteClass}>{text}</p> : (compact && src ? <span className="text-xs text-slate-400">Site photo</span> : null)}
    </>
  );

  if (onOpen) {
    return (
      <button
        type="button"
        onClick={onOpen}
        className="mt-1 flex w-full items-start gap-1.5 text-left"
        aria-label="View clock-out notes and site photo"
      >
        {inner}
      </button>
    );
  }

  if (compact) {
    return <div className="mt-1.5 flex items-start gap-1.5">{inner}</div>;
  }

  return (
    <div className="mt-1.5 space-y-2">
      {src ? <img src={src} alt="Clock-out site photo" className={photoClass} /> : null}
      {text ? <p className={noteClass}>{text}</p> : null}
    </div>
  );
}
