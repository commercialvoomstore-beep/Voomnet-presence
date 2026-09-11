'use client';

import { memo } from 'react';

// État réel du système : chaque ligne reflète une condition vérifiée, jamais décorative.
function Row({ ok, label, detail }) {
  return (
    <div className="sys-row">
      <span className={`sys-dot ${ok ? 'ok' : 'ko'}`} aria-hidden="true" />
      <span className="sys-label">{label}</span>
      {detail && <span className="sys-detail">{detail}</span>}
    </div>
  );
}

function SystemStatus({ online, polling, lastSync, error }) {
  return (
    <div className="sys-card" role="status" aria-label="État du système">
      <div className="card-title" style={{ marginBottom: 10 }}>System status</div>
      <Row ok={online && !error} label="Services opérationnels" detail={error ? 'interrompus' : undefined} />
      <Row ok={polling && !error} label="Synchronisation active" detail={polling ? 'toutes les 5 s' : undefined} />
      <Row ok={online && !error} label="API connectée" />
      <Row ok={!!lastSync && !error} label="Temps réel actif" detail={lastSync ? `sync ${lastSync}` : undefined} />
    </div>
  );
}

export default memo(SystemStatus);
