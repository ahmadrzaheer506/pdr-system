import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * Keeps tab controls on one row. When they overflow, left/right arrows
 * page to the next or previous group instead of wrapping the strip.
 */
export default function ScrollTabBar({
  children,
  value,
  className = '',
  trackClassName = '',
  fadeFrom = 'from-white',
  'aria-label': ariaLabel,
}) {
  const scrollerRef = useRef(null);
  const [canBack, setCanBack] = useState(false);
  const [canNext, setCanNext] = useState(false);
  const childCount = React.Children.count(children);

  const sync = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setCanBack(el.scrollLeft > 4);
    setCanNext(max > 4 && el.scrollLeft < max - 4);
  }, []);

  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el) return undefined;
    sync();
    el.addEventListener('scroll', sync, { passive: true });
    window.addEventListener('resize', sync);
    let observer;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(sync);
      observer.observe(el);
    }
    return () => {
      el.removeEventListener('scroll', sync);
      window.removeEventListener('resize', sync);
      observer?.disconnect();
    };
  }, [sync, childCount, value]);

  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el || value == null || value === '') return;
    const active = el.querySelector(`[data-tab="${String(value).replace(/"/g, '')}"]`);
    try {
      active?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
    } catch {
      /* jsdom */
    }
  }, [value]);

  const go = (dir) => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(el.clientWidth * 0.8, 160), behavior: 'smooth' });
  };

  return (
    <div className={`relative min-w-0 ${className}`}>
      {canBack && (
        <div
          className={`pointer-events-none absolute inset-y-0 left-0 z-10 flex items-center bg-gradient-to-r ${fadeFrom} to-transparent pl-0.5 pr-8`}
        >
          <button
            type="button"
            aria-label="Previous tabs"
            onClick={() => go(-1)}
            className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-full text-slate-500 hover:bg-white hover:text-slate-800 hover:shadow-sm"
          >
            <ChevronLeft size={18} strokeWidth={2.25} />
          </button>
        </div>
      )}
      <div
        ref={scrollerRef}
        data-tab-scroller=""
        role={ariaLabel ? 'tablist' : undefined}
        aria-label={ariaLabel}
        className={`no-scrollbar flex min-w-0 items-center overflow-x-auto scroll-smooth ${trackClassName}`}
      >
        {children}
      </div>
      {canNext && (
        <div
          className={`pointer-events-none absolute inset-y-0 right-0 z-10 flex items-center bg-gradient-to-l ${fadeFrom} to-transparent pr-0.5 pl-8`}
        >
          <button
            type="button"
            aria-label="Next tabs"
            onClick={() => go(1)}
            className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-full text-slate-500 hover:bg-white hover:text-slate-800 hover:shadow-sm"
          >
            <ChevronRight size={18} strokeWidth={2.25} />
          </button>
        </div>
      )}
    </div>
  );
}
