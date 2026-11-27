import React from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

/**
 * Full-screen in-app photo viewer so images never replace the CRM.
 * Back / × close the overlay; arrows (and swipe / keyboard) move between photos.
 */
export default function ImageLightbox({
  open,
  items,
  index = 0,
  src,
  alt = 'Photo',
  onClose,
}) {
  const slides = React.useMemo(() => {
    if (Array.isArray(items) && items.length > 0) return items;
    if (src) return [{ src, alt }];
    return [];
  }, [items, src, alt]);

  const [current, setCurrent] = React.useState(index);
  const touchStartX = React.useRef(null);

  React.useEffect(() => {
    if (open) setCurrent(index);
  }, [open, index]);

  const count = slides.length;
  const safeIndex = count ? ((current % count) + count) % count : 0;
  const slide = slides[safeIndex];
  const canSlide = count > 1;

  const go = React.useCallback((dir) => {
    if (count < 2) return;
    setCurrent((i) => ((i + dir) % count + count) % count);
  }, [count]);

  React.useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
      if (e.key === 'ArrowLeft') go(-1);
      if (e.key === 'ArrowRight') go(1);
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose, go]);

  if (!open || !slide?.src) return null;

  const title = slide.alt || alt || 'Photo';

  const onTouchStart = (e) => {
    touchStartX.current = e.changedTouches?.[0]?.clientX ?? null;
  };
  const onTouchEnd = (e) => {
    const start = touchStartX.current;
    touchStartX.current = null;
    if (start == null) return;
    const end = e.changedTouches?.[0]?.clientX;
    if (end == null) return;
    const delta = end - start;
    if (delta > 48) go(-1);
    else if (delta < -48) go(1);
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex flex-col bg-slate-950/95"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <div className="flex shrink-0 items-center justify-between gap-3 px-3 py-3 text-white">
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl bg-white/15 px-3 py-2 text-sm font-semibold hover:bg-white/25"
        >
          Back
        </button>
        <p className="min-w-0 flex-1 truncate text-center text-sm text-white/80">{title}</p>
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl p-2 text-white/90 hover:bg-white/15"
          aria-label="Close photo"
        >
          <X size={22} />
        </button>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center px-12 py-3 sm:px-16">
        {canSlide ? (
          <button
            type="button"
            onClick={() => go(-1)}
            className="absolute left-2 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/30"
            aria-label="Previous photo"
          >
            <ChevronLeft size={26} />
          </button>
        ) : null}
        <img
          src={slide.src}
          alt={title}
          draggable={false}
          className="max-h-full max-w-full object-contain"
        />
        {canSlide ? (
          <button
            type="button"
            onClick={() => go(1)}
            className="absolute right-2 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/30"
            aria-label="Next photo"
          >
            <ChevronRight size={26} />
          </button>
        ) : null}
      </div>

      {canSlide ? (
        <div className="flex shrink-0 flex-col items-center gap-2 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-1">
          <p className="text-xs tabular-nums text-white/70">
            {safeIndex + 1} / {count}
          </p>
          <div className="flex max-w-full flex-wrap justify-center gap-1.5" role="tablist" aria-label="Photos">
            {slides.map((item, i) => (
              <button
                key={`${item.src}-${i}`}
                type="button"
                role="tab"
                aria-selected={i === safeIndex}
                aria-label={`Photo ${i + 1} of ${count}`}
                onClick={() => setCurrent(i)}
                className={`h-1.5 rounded-full transition-all ${
                  i === safeIndex ? 'w-6 bg-white' : 'w-1.5 bg-white/35 hover:bg-white/60'
                }`}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="pb-[max(0.75rem,env(safe-area-inset-bottom))]" />
      )}
    </div>,
    document.body,
  );
}
