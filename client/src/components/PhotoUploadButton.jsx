import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Camera, ChevronRight, Image as ImageIcon } from 'lucide-react';

const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp';

/**
 * Photo picker that keeps both camera and library on mobile.
 * A single input with capture="environment" skips the library; attachments
 * already omit capture so Android shows Camera + Files. This control always
 * offers both, including inside job modals (portaled sheet).
 */
export default function PhotoUploadButton({
  accept = IMAGE_ACCEPT,
  disabled = false,
  ariaLabel = 'photo',
  onFile,
  className = 'btn-secondary !py-1 !px-2 text-[10px]',
  wrapperClassName = '',
  children = 'Upload',
}) {
  const cameraRef = useRef(null);
  const libraryRef = useRef(null);
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const hintId = useId();

  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const pick = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    setOpen(false);
    if (file) onFile?.(file);
  };

  const sheet = open ? createPortal(
    <div className="fixed inset-0 z-[120] flex items-end justify-center p-3 sm:items-center sm:p-5">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/55 backdrop-blur-[2px]"
        aria-label="Close dialog"
        onClick={() => setOpen(false)}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={hintId}
        className="relative z-10 w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl shadow-slate-900/20"
      >
        <div className="flex justify-center pt-2 sm:hidden" aria-hidden="true">
          <span className="h-1 w-10 rounded-full bg-slate-200" />
        </div>
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0">
            <h3 id={titleId} className="text-base font-semibold tracking-tight text-slate-900">Add photo</h3>
            <p id={hintId} className="mt-0.5 text-sm leading-snug text-slate-500">
              Take a new picture, or choose one already on this device. JPEG, PNG or WebP.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-lg px-2 text-xl leading-none text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="space-y-2.5 px-5 py-4">
          <button
            type="button"
            className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left ring-1 ring-slate-200/90 transition-colors hover:bg-slate-50 hover:ring-slate-300"
            onClick={() => cameraRef.current?.click()}
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-700 ring-1 ring-rose-100">
              <Camera size={20} strokeWidth={2.1} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-slate-900">Take photo</span>
              <span className="mt-0.5 block text-xs text-slate-500">Use the camera on this device</span>
            </span>
            <ChevronRight size={16} className="shrink-0 text-slate-300" aria-hidden="true" />
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left ring-1 ring-slate-200/90 transition-colors hover:bg-slate-50 hover:ring-slate-300"
            onClick={() => libraryRef.current?.click()}
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-800 ring-1 ring-sky-100">
              <ImageIcon size={20} strokeWidth={2.1} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-slate-900">Photo library</span>
              <span className="mt-0.5 block text-xs text-slate-500">Choose an existing picture</span>
            </span>
            <ChevronRight size={16} className="shrink-0 text-slate-300" aria-hidden="true" />
          </button>
        </div>
        <div className="border-t border-slate-100 bg-slate-50/90 px-5 py-3">
          <button type="button" className="btn-secondary w-full" onClick={() => setOpen(false)}>
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body,
  ) : null;

  const openSheet = () => {
    if (!disabled) setOpen(true);
  };

  const trigger = typeof children === 'function' ? (
    children({ openSheet, disabled, open })
  ) : (
    <button
      type="button"
      disabled={disabled}
      className={className}
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={openSheet}
    >
      {children}
    </button>
  );

  const stretch = typeof children !== 'function' && /\bw-full\b/.test(className);

  return (
    <div className={`relative inline-flex ${stretch ? 'w-full' : ''} ${wrapperClassName}`.trim()}>
      <input
        ref={cameraRef}
        type="file"
        accept={accept}
        capture="environment"
        className="sr-only"
        disabled={disabled}
        aria-label={`Take ${ariaLabel}`}
        onChange={pick}
      />
      <input
        ref={libraryRef}
        type="file"
        accept={accept}
        className="sr-only"
        disabled={disabled}
        aria-label={`Upload ${ariaLabel}`}
        onChange={pick}
      />
      {stretch ? <div className="w-full">{trigger}</div> : trigger}
      {sheet}
    </div>
  );
}
