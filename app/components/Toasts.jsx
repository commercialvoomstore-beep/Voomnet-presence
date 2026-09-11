'use client';

import { memo } from 'react';

// Notifications live non bloquantes (déclenchées uniquement par des changements réels).
const TONE_ICON = { success: '🟢', warn: '🟠', info: '🔵', neutral: '✓' };

function Toasts({ toasts, onDismiss }) {
  if (!toasts || toasts.length === 0) return null;
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.tone || 'neutral'}`}>
          <span className="toast-icon" aria-hidden="true">{TONE_ICON[t.tone] || '✓'}</span>
          <div className="toast-body">
            <div className="toast-title">{t.title}</div>
            {t.message && <div className="toast-msg">{t.message}</div>}
          </div>
          <button type="button" className="toast-close" onClick={() => onDismiss(t.id)} aria-label="Fermer la notification">
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}

export default memo(Toasts);
