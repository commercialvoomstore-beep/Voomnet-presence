'use client';

import { memo } from 'react';
import { STATUS_LABELS } from '@/lib/rules';

// Visualisation de l'effectif : un point = un collaborateur, couleur = statut réel.
function DotGrid({ employees, departureTime, onSelect }) {
  if (!employees || employees.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon" aria-hidden="true">👥</div>
        <div className="empty-title">Aucun collaborateur</div>
        <div className="empty-sub">L&apos;effectif apparaîtra ici.</div>
      </div>
    );
  }
  return (
    <div className="dots" role="list" aria-label="Effectif par statut">
      {employees.map((e) => (
        <button
          key={e.matricule}
          type="button"
          role="listitem"
          className={`dot dot-${e.today.status}`}
          onClick={() => onSelect(e)}
          aria-label={`${e.name} — ${STATUS_LABELS[e.today.status]}`}
        >
          <span className="dot-tip" aria-hidden="true">
            <strong>{e.name}</strong>
            <span>{STATUS_LABELS[e.today.status]}</span>
            <span>↑ {e.today.arrival || '—'} · ↓ {e.today.departure || departureTime}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

export default memo(DotGrid);
