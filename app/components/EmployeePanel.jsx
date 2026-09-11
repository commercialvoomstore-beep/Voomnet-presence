'use client';

import { memo, useEffect } from 'react';
import {
  STATUS_LABELS,
  abidjanNow,
  closedPauseMinutes,
  formatHm,
  lateMinutes,
  openPauseMinutes,
  overtimeMinutes,
  workedMinutes,
} from '@/lib/rules';
import { initials } from './primitives';

const STATUS_PILL = {
  present: 'pill-present',
  retard: 'pill-retard',
  pause: 'pill-pause',
  absent: 'pill-absent',
  depart_en_attente: 'pill-attente',
  termine: 'pill-termine',
  weekend: 'pill-weekend',
};

// Panneau latéral premium : timeline réelle de la journée + durées calculées.
function EmployeePanel({ emp, settings, onClose }) {
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

  if (!emp) return null;

  const now = abidjanNow(new Date());
  const t = emp.today || {};
  const pauses = t.pauses || [];
  const worked = workedMinutes(t, settings, now);
  const late = lateMinutes(t.arrival, settings);
  const overtime = overtimeMinutes(t, settings);

  const timeline = [];
  if (t.arrival) timeline.push({ time: t.arrival, label: 'Arrivée', tone: late > 0 ? 'warn' : 'success' });
  pauses.forEach((p, i) => {
    timeline.push({ time: p.start, label: `Pause ${pauses.length > 1 ? i + 1 : ''} — début`.trim(), tone: 'info' });
    if (p.end) timeline.push({ time: p.end, label: 'Retour de pause', tone: 'info' });
  });
  if (t.departure) {
    timeline.push({ time: t.departure, label: 'Départ réel', tone: 'success' });
  } else if (t.arrival) {
    timeline.push({ time: settings.departureTime, label: 'Départ théorique (attendu)', tone: 'pending' });
  }

  return (
    <div className="panel-overlay" onClick={onClose}>
      <aside
        className="panel"
        role="dialog"
        aria-modal="true"
        aria-label={`Détails de ${emp.name}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="panel-head">
          <div className="row" style={{ gap: 14 }}>
            <div className="avatar avatar-lg" style={{ width: 56, height: 56, fontSize: 18 }}>
              {emp.photo ? <img src={emp.photo} alt="" /> : initials(emp.name)}
            </div>
            <div>
              <div className="panel-name">{emp.name}</div>
              <div className="small muted mono">3CX {emp.matricule} · {emp.department}</div>
              <div className="mt-1">
                <span className={`pill ${STATUS_PILL[t.status] || 'pill-weekend'}`}>{STATUS_LABELS[t.status]}</span>
              </div>
            </div>
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Fermer le panneau">
            ✕
          </button>
        </div>

        <div className="panel-section">
          <div className="card-title">Timeline de la journée</div>
          {timeline.length === 0 ? (
            <div className="empty-state" style={{ padding: '18px 8px' }}>
              <div className="empty-title">Aucun pointage aujourd&apos;hui</div>
              <div className="empty-sub">L&apos;employé n&apos;a pas encore pointé son arrivée.</div>
            </div>
          ) : (
            <ol className="timeline">
              {timeline.map((ev, i) => (
                <li key={i} className={`timeline-item tone-${ev.tone}`}>
                  <span className="timeline-dot" aria-hidden="true" />
                  <span className="timeline-time num">{ev.time}</span>
                  <span className="timeline-label">{ev.label}</span>
                </li>
              ))}
            </ol>
          )}
        </div>

        <div className="panel-section">
          <div className="card-title">Indicateurs calculés</div>
          <dl className="metrics">
            <div className="metric"><dt>Durée travaillée</dt><dd className="num">{formatHm(worked)}</dd></div>
            <div className="metric"><dt>Départ théorique</dt><dd className="num">{settings.departureTime}</dd></div>
            <div className="metric"><dt>Départ réel</dt><dd className="num">{t.departure || '—'}</dd></div>
            <div className="metric"><dt>Retard</dt><dd className="num">{late === null ? '—' : late === 0 ? "À l'heure" : `+${formatHm(late)}`}</dd></div>
            <div className="metric"><dt>Pauses</dt><dd className="num">{pauses.length === 0 ? '—' : `${formatHm(closedPauseMinutes(t) + openPauseMinutes(t, now))} (${pauses.length})`}</dd></div>
            <div className="metric"><dt>Temps supplémentaire</dt><dd className="num">{overtime === null || overtime === 0 ? '—' : `+${formatHm(overtime)}`}</dd></div>
          </dl>
        </div>

        <div className="panel-section">
          <div className="card-title">Historique (7 derniers jours)</div>
          {(!emp.history || emp.history.length === 0) && <div className="small muted">Aucun pointage.</div>}
          {(emp.history || []).map((h) => (
            <div key={h.date} className="small num history-row">
              <span
                className="history-dot"
                style={{
                  background:
                    h.status === 'present' ? 'var(--success)'
                    : h.status === 'retard' ? 'var(--warn)'
                    : h.status === 'termine' ? 'var(--ink-faint)'
                    : h.status === 'depart_en_attente' ? 'var(--info)'
                    : 'var(--danger)',
                }}
              />
              {h.date} · ↑ {h.arrival || '—'} · ↓ {h.departure || '—'}
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}

export default memo(EmployeePanel);
