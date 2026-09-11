'use client';

import { memo } from 'react';

// Flux d'événements réels (arrivées, pauses, départs) — insertion animée fade + slide.
const TONE_ICON = {
  success: '🟢',
  warn: '🟠',
  info: '🔵',
  violet: '🟣',
  neutral: '⚪',
};

function LiveFeed({ events }) {
  if (!events || events.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon" aria-hidden="true">📡</div>
        <div className="empty-title">Aucune activité récente</div>
        <div className="empty-sub">Les événements apparaîtront ici en temps réel.</div>
      </div>
    );
  }
  return (
    <ul className="feed" aria-live="polite">
      {events.map((ev) => (
        <li key={ev.id} className={`feed-item feed-${ev.tone || 'neutral'} feed-enter`}>
          <span className="feed-icon" aria-hidden="true">{TONE_ICON[ev.tone] || '⚪'}</span>
          <span className="feed-body">
            <span className="feed-head">
              <strong>{ev.name}</strong>
              <time className="feed-time num">{ev.time}</time>
            </span>
            <span className="feed-msg">{ev.message}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export default memo(LiveFeed);
