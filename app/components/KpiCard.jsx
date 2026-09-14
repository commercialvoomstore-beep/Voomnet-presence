'use client';

import { memo, useEffect, useRef, useState } from 'react';
import AnimatedNumber from './AnimatedNumber';

// Carte KPI premium : micro-animation élégante quand la valeur réelle change.
function KpiCard({ icon, label, value, hint, tone = 'neutral', delta = 0, index = 0, onClick = null }) {
  const [pulse, setPulse] = useState(false);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setPulse(true);
    const t = setTimeout(() => setPulse(false), 320);
    return () => clearTimeout(t);
  }, [value]);

  return (
    <button
      type="button"
      className={`kpi kpi-${tone} ${pulse ? 'kpi-pulse' : ''} ${onClick ? 'kpi-clickable' : ''} fade-up`}
      style={{ animationDelay: `${index * 60}ms` }}
      onClick={onClick || undefined}
      aria-label={`${label} : ${value}. ${hint || ''}`}
    >
      <span className="kpi-icon" aria-hidden="true">{icon}</span>
      <span className="kpi-body">
        <span className="kpi-label">{label}</span>
        <span className="kpi-value">
          <AnimatedNumber value={value} />
        </span>
        <span className="kpi-hint">
          {hint}
          {delta !== 0 && (
            <span className={`kpi-delta ${delta > 0 ? 'up' : 'down'}`}>
              {delta > 0 ? ` ↑ +${delta}` : ` ↓ ${delta}`}
            </span>
          )}
        </span>
      </span>
    </button>
  );
}

export default memo(KpiCard);
