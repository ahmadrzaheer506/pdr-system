import React, { useEffect, useState } from 'react';

const ALT = 'Paul Douglas Roofing and Building Ltd';
const API_SRC = '/api/branding/logo';
const FALLBACK_SRC = '/logo.png';
const LOGO_EVENT = 'pdr-branding-logo';

/** Tell chrome (sidebar/login) to reload the uploaded logo. */
export function bumpBrandLogo(src) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(LOGO_EVENT, { detail: src || `${API_SRC}?v=${Date.now()}` }));
}

/**
 * Company wordmark used in chrome (login, sidebars).
 * Prefers the uploaded Settings logo; falls back to the seed PNG.
 */
export default function BrandLogo({ className = 'h-12 w-auto', decorative = false, src, alt }) {
  const [failed, setFailed] = useState(false);
  const [liveSrc, setLiveSrc] = useState(src || API_SRC);

  useEffect(() => {
    setFailed(false);
    setLiveSrc(src || API_SRC);
  }, [src]);

  useEffect(() => {
    const onBump = (event) => {
      setFailed(false);
      setLiveSrc(event.detail || `${API_SRC}?v=${Date.now()}`);
    };
    window.addEventListener(LOGO_EVENT, onBump);
    return () => window.removeEventListener(LOGO_EVENT, onBump);
  }, []);

  const url = failed ? FALLBACK_SRC : liveSrc;
  return (
    <img
      src={url}
      alt={decorative ? '' : (alt || ALT)}
      className={`object-contain select-none ${className}`}
      draggable={false}
      onError={() => { if (!failed) setFailed(true); }}
    />
  );
}
