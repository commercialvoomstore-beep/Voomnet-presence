'use client';

import { memo, useMemo } from 'react';
import { hhmmToMinutes, timeToMinutes } from '@/lib/rules';

// Graphique "Évolution de la présence" — 100 % données réelles :
// barres = arrivées par tranche de 30 min ; courbe = collaborateurs sur site par tranche.
const START = 7 * 60; // 07:00
const END = 19 * 60; // 19:00
const STEP = 30;

function PresenceFlow({ employees, settings, nowMinutes }) {
  const { buckets, arrivals, maxArr, onSite, maxSite } = useMemo(() => {
    const n = Math.ceil((END - START) / STEP);
    const buckets = Array.from({ length: n }, (_, i) => START + i * STEP);
    const arrivals = new Array(n).fill(0);
    const onSite = new Array(n).fill(0);

    for (const emp of employees) {
      const t = emp.today;
      if (!t?.arrival) continue;
      const aMin = timeToMinutes(t.arrival);
      const dMin = t.departure ? timeToMinutes(t.departure) : null;
      const ai = Math.floor((aMin - START) / STEP);
      if (ai >= 0 && ai < n) arrivals[ai] += 1;
      for (let i = 0; i < n; i++) {
        const bStart = buckets[i];
        const bMid = bStart + STEP / 2;
        const present = aMin <= bMid && (dMin === null || dMin > bStart);
        if (present) onSite[i] += 1;
      }
    }
    return {
      buckets,
      arrivals,
      maxArr: Math.max(1, ...arrivals),
      onSite,
      maxSite: Math.max(1, ...onSite),
    };
  }, [employees]);

  const totalArrivals = arrivals.reduce((a, b) => a + b, 0);
  if (totalArrivals === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon" aria-hidden="true">📊</div>
        <div className="empty-title">Aucun pointage aujourd&apos;hui</div>
        <div className="empty-sub">Le graphique se dessinera dès les premières arrivées.</div>
      </div>
    );
  }

  const W = 720;
  const H = 220;
  const PAD_L = 34;
  const PAD_B = 26;
  const PAD_T = 10;
  const iw = W - PAD_L - 8;
  const ih = H - PAD_T - PAD_B;
  const bw = iw / buckets.length;

  const x = (i) => PAD_L + i * bw;
  const ySite = (v) => PAD_T + ih - (v / maxSite) * ih;
  const yArr = (v) => PAD_T + ih - (v / maxArr) * ih;

  // Courbe en escalier (step) pour les personnes sur site
  let path = `M ${x(0)} ${ySite(onSite[0])}`;
  for (let i = 1; i < buckets.length; i++) {
    path += ` L ${x(i)} ${ySite(onSite[i - 1])} L ${x(i)} ${ySite(onSite[i])}`;
  }
  path += ` L ${x(buckets.length - 1) + bw} ${ySite(onSite[buckets.length - 1])}`;
  const area = `${path} L ${x(buckets.length - 1) + bw} ${PAD_T + ih} L ${x(0)} ${PAD_T + ih} Z`;

  // Marqueur "maintenant"
  const nowX = PAD_L + ((Math.min(Math.max(nowMinutes, START), END) - START) / (END - START)) * iw;
  const depX = PAD_L + ((hhmmToMinutes(settings.departureTime) - START) / (END - START)) * iw;

  const yTicks = Array.from({ length: maxSite + 1 }, (_, v) => v);

  return (
    <div className="flow-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="flow-svg" role="img" aria-label="Évolution de la présence sur la journée">
        <defs>
          <linearGradient id="flowArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#611e93" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#611e93" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {yTicks.map((v) => (
          <g key={v}>
            <line x1={PAD_L} y1={ySite(v)} x2={W - 8} y2={ySite(v)} className="flow-grid" />
            <text x={PAD_L - 6} y={ySite(v) + 4} className="flow-tick" textAnchor="end">{v}</text>
          </g>
        ))}
        {buckets.map((b, i) =>
          (b - START) % 120 === 0 ? (
            <text key={b} x={x(i)} y={H - 8} className="flow-tick">
              {`${String(Math.floor(b / 60)).padStart(2, '0')}:00`}
            </text>
          ) : null
        )}
        {arrivals.map((v, i) =>
          v > 0 ? (
            <rect
              key={i}
              x={x(i) + bw * 0.22}
              y={yArr(v)}
              width={bw * 0.56}
              height={PAD_T + ih - yArr(v)}
              rx="3"
              className="flow-bar"
            />
          ) : null
        )}
        <path d={area} fill="url(#flowArea)" />
        <path d={path} fill="none" className="flow-line" />
        {depX >= PAD_L && depX <= W - 8 && (
          <g>
            <line x1={depX} y1={PAD_T} x2={depX} y2={PAD_T + ih} className="flow-dep" />
            <text x={depX + 4} y={PAD_T + 12} className="flow-dep-label">{settings.departureTime}</text>
          </g>
        )}
        {nowX >= PAD_L && nowX <= W - 8 && (
          <line x1={nowX} y1={PAD_T} x2={nowX} y2={PAD_T + ih} className="flow-now" />
        )}
      </svg>
      <div className="flow-legend">
        <span><i className="legend-line" /> Sur site</span>
        <span><i className="legend-bar" /> Arrivées / 30 min</span>
        <span><i className="legend-dep" /> Départ théorique {settings.departureTime}</span>
      </div>
    </div>
  );
}

export default memo(PresenceFlow);
