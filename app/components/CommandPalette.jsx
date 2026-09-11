'use client';

import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { STATUS_LABELS } from '@/lib/rules';

// Recherche intelligente ⌘K : noms, matricules + mots-clés de statut (données réelles).
const KEYWORDS = [
  ['présent', 'present'],
  ['presents', 'present'],
  ['retard', 'retard'],
  ['pause', 'pause'],
  ['absent', 'absent'],
  ['attente', 'depart_en_attente'],
  ['départ', 'depart_en_attente'],
  ['depart', 'depart_en_attente'],
  ['terminé', 'termine'],
  ['termine', 'termine'],
];

const STATUS_PILL = {
  present: 'pill-present',
  retard: 'pill-retard',
  pause: 'pill-pause',
  absent: 'pill-absent',
  depart_en_attente: 'pill-attente',
  termine: 'pill-termine',
  weekend: 'pill-weekend',
};

function CommandPalette({ open, employees, departureTime, onSelect, onClose }) {
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setCursor(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open ]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return employees;
    const kw = KEYWORDS.find(([word]) => q.includes(word));
    return employees.filter((e) => {
      if (kw && e.today.status === kw[1]) return true;
      return (
        e.matricule.includes(q) ||
        (e.name || '').toLowerCase().includes(q) ||
        (STATUS_LABELS[e.today.status] || '').toLowerCase().includes(q)
      );
    });
  }, [employees, query]);

  useEffect(() => setCursor(0), [query]);

  if (!open) return null;

  return (
    <div className="palette-overlay" onClick={onClose}>
      <div
        className="palette"
        role="dialog"
        aria-modal="true"
        aria-label="Rechercher un employé"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose();
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setCursor((c) => Math.min(results.length - 1, c + 1));
          }
          if (e.key === 'ArrowUp') {
            e.preventDefault();
            setCursor((c) => Math.max(0, c - 1));
          }
          if (e.key === 'Enter' && results[cursor]) {
            onSelect(results[cursor]);
          }
        }}
      >
        <div className="palette-input-row">
          <span aria-hidden="true">⌘K</span>
          <input
            ref={inputRef}
            className="palette-input"
            placeholder="Rechercher un employé, un statut…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Rechercher un employé"
          />
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Fermer la recherche">
            ✕
          </button>
        </div>
        <ul className="palette-list">
          {results.map((e, i) => (
            <li key={e.matricule}>
              <button
                type="button"
                className={`palette-item ${i === cursor ? 'active' : ''}`}
                onMouseEnter={() => setCursor(i)}
                onClick={() => onSelect(e)}
              >
                <span className="palette-name">{e.name}</span>
                <span className="small muted mono">{e.matricule}</span>
                <span className={`pill ${STATUS_PILL[e.today.status]}`}>{STATUS_LABELS[e.today.status]}</span>
                <span className="small num soft">
                  {e.today.arrival ? `↑ ${e.today.arrival.slice(0, 5)}` : '—'} · ↓ {departureTime}
                </span>
              </button>
            </li>
          ))}
          {results.length === 0 && (
            <li className="palette-empty">Aucun collaborateur ne correspond à « {query} ».</li>
          )}
        </ul>
      </div>
    </div>
  );
}

export default memo(CommandPalette);
