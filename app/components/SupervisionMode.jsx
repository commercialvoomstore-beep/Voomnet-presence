'use client';

import { memo, useEffect } from 'react';
import AnimatedNumber from './AnimatedNumber';
import { LiveClock } from './primitives';

// Mode supervision : affichage mural ultra-clair (données réelles uniquement).
function Cell({ label, value, tone }) {
  return (
    <div className={`super-cell super-${tone}`}>
      <div className="super-value"><AnimatedNumber value={value} /></div>
      <div className="super-label">{label}</div>
    </div>
  );
}

function SupervisionMode({ counters, onClose }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  const c = counters || {};
  return (
    <div className="super-overlay" role="dialog" aria-modal="true" aria-label="Mode supervision">
      <div className="super-top">
        <div className="super-brand">
          <img src="/voomnet-mark.svg" alt="VOOMNET" width="40" height="40" />
          <div>
            <div className="super-brand-name">VOOMNET Presence</div>
            <div className="super-brand-sub">Mode supervision</div>
          </div>
        </div>
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          ✕ Quitter (Échap)
        </button>
      </div>
      <div className="super-clock">
        <LiveClock size="xl" />
      </div>
      <div className="super-grid">
        <Cell label="Présents" value={c.presents || 0} tone="success" />
        <Cell label="Absents" value={c.absents || 0} tone="danger" />
        <Cell label="En retard" value={c.retards || 0} tone="warn" />
        <Cell label="En pause" value={c.pauses || 0} tone="info" />
        <Cell label="Départs en attente" value={c.departs_en_attente || 0} tone="violet" />
        <Cell label="Journées terminées" value={c.terminees || 0} tone="neutral" />
      </div>
    </div>
  );
}

export default memo(SupervisionMode);
