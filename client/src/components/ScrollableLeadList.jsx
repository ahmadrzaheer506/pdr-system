import React, { useLayoutEffect, useRef, useState } from 'react';

/**
 * Caps a card list at `limit` visible rows, then scrolls the rest.
 */
export default function ScrollableLeadList({
  labelledBy,
  count,
  limit = 2,
  fallbackClass = 'max-h-[22rem]',
  className = '',
  children,
}) {
  const listRef = useRef(null);
  const [maxHeight, setMaxHeight] = useState(null);
  const scroll = count > limit;

  useLayoutEffect(() => {
    const el = listRef.current;
    if (!scroll || !el) {
      setMaxHeight(null);
      return undefined;
    }

    const measure = () => {
      const lastShown = el.children[limit - 1];
      if (!lastShown) {
        setMaxHeight(null);
        return;
      }
      const height = Math.ceil(lastShown.getBoundingClientRect().bottom - el.getBoundingClientRect().top);
      setMaxHeight(height > 1 ? height : null);
    };

    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    Array.from(el.children).forEach((child) => ro.observe(child));
    return () => ro.disconnect();
  }, [scroll, count, limit]);

  return (
    <div
      ref={listRef}
      role="list"
      aria-labelledby={labelledBy}
      className={`space-y-2 ${scroll ? `overflow-y-auto overscroll-contain pr-1 ${fallbackClass}` : ''} ${className}`.trim()}
      style={scroll && maxHeight ? { maxHeight } : undefined}
    >
      {children}
    </div>
  );
}
