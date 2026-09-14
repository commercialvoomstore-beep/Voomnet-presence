'use client';

import { memo, useEffect, useState } from 'react';

// Anneau circulaire premium : animation 0 -> valeur au chargement, arc progressif + compteur.
function PresenceRing({ rate = 0, size = 196, stroke = 16 }) {
  const [animated, setAnimated] = useState(0);

  useEffect(() => {
    let raf;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setAnimated(rate);
      return;
    }
    const start = performance.now();
    const dur = 1100;
    const tick = (t) => {
      const p = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setAnimated(rate * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [rate]);

  const r = (size - stroke) / 2;
  const c = size / 2;
  const circ = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, animated));
  const offset = circ * (1 - clamped / 100);

  return (
    <div className="ring-wrap" role="img" aria-label={`Taux de présence : ${Math.round(rate)} %`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <defs>
          <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#2b2e5c" />
            <stop offset="100%" stopColor="#7a7ea6" />
          </linearGradient>
        </defs>
        <circle cx={c} cy={c} r={r} fill="none" stroke="#eceff4" strokeWidth={stroke} />
        <circle
          cx={c}
          cy={c}
          r={r}
          fill="none"
          stroke="url(#ringGrad)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${c} ${c})`}
          className="ring-arc"
        />
      </svg>
      <div className="ring-center">
        <div className="ring-value">{Math.round(clamped)}%</div>
        <div className="ring-label">Taux de présence</div>
      </div>
    </div>
  );
}

export default memo(PresenceRing);
