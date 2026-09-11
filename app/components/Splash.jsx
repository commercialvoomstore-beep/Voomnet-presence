'use client';

import { useEffect, useState } from 'react';

// Constellation ICT en fond (coordonnées fixes = rendu déterministe)
const NODES = [
  [60, 70], [190, 35], [330, 80], [470, 40], [615, 80], [745, 55],
  [100, 210], [255, 175], [405, 215], [560, 175], [705, 225],
  [140, 360], [330, 330], [505, 370], [665, 350],
  [255, 455], [475, 460], [35, 425], [765, 425], [405, 115],
];
const LINKS = [
  [0, 1], [1, 2], [2, 3], [3, 4], [4, 5],
  [0, 6], [1, 7], [2, 19], [3, 19], [4, 9], [5, 10],
  [6, 7], [7, 8], [8, 9], [9, 10],
  [6, 11], [7, 12], [8, 13], [9, 14], [10, 18],
  [11, 12], [12, 13], [13, 14],
  [11, 15], [12, 15], [13, 16], [14, 18], [15, 16],
  [2, 8], [19, 8], [4, 8],
];
const HOT = new Set([2, 8, 13, 19]);

// Splash premium v2 : UNE seule timeline continue (~2,7 s), sans redémarrage.
export default function Splash({ onDone, minDuration = 2700 }) {
  const [exit, setExit] = useState(false);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      const t = setTimeout(() => {
        setGone(true);
        onDone?.();
      }, 350);
      return () => clearTimeout(t);
    }
    const t1 = setTimeout(() => setExit(true), minDuration);
    const t2 = setTimeout(() => {
      setGone(true);
      onDone?.();
    }, minDuration + 600);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [minDuration, onDone]);

  if (gone) return null;

  return (
    <div className={`sp2 ${exit ? 'sp2-exit' : ''}`} role="status" aria-label="Chargement de VOOMNET Presence">
      <svg className="sp2-net" viewBox="0 0 800 500" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        {LINKS.map(([a, b], i) => (
          <line key={i} x1={NODES[a][0]} y1={NODES[a][1]} x2={NODES[b][0]} y2={NODES[b][1]} />
        ))}
        {NODES.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={HOT.has(i) ? 4.5 : 3} className={HOT.has(i) ? 'hot' : ''} />
        ))}
      </svg>

      <div className="sp2-core">
        <div className="sp2-stage">
          <svg className="sp2-orbit" viewBox="0 0 240 240" aria-hidden="true">
            <circle className="sp2-dash" cx="120" cy="120" r="114" />
            <circle className="sp2-prog" cx="120" cy="120" r="104" transform="rotate(-90 120 120)" />
          </svg>
          <div className="sp2-markclip">
            <svg className="sp2-mark" viewBox="0 0 200 200" aria-hidden="true">
              <rect className="sp2-cell d1" x="4" y="4" width="90" height="90" rx="26" fill="#1a1a63" />
              <rect className="sp2-cell d2" x="106" y="4" width="90" height="90" rx="26" fill="#611e93" />
              <rect className="sp2-cell d3" x="4" y="106" width="90" height="90" rx="26" fill="#611e93" />
              <rect className="sp2-cell d4" x="106" y="106" width="90" height="90" rx="26" fill="#1a1a63" />
              <rect className="sp2-slit" x="64" y="18" width="7" height="62" rx="3.5" fill="#ffffff" />
              <rect className="sp2-slit" x="166" y="18" width="7" height="62" rx="3.5" fill="#ffffff" />
              <rect className="sp2-slit" x="64" y="120" width="7" height="62" rx="3.5" fill="#ffffff" />
              <rect className="sp2-slit" x="166" y="120" width="7" height="62" rx="3.5" fill="#ffffff" />
            </svg>
            <span className="sp2-sweep" aria-hidden="true" />
          </div>
        </div>

        <div className="sp2-word" aria-label="VOOMNET">VOOMNET</div>
        <div className="sp2-pres">PRESENCE</div>
        <div className="sp2-slogan">Innover. Connecter. Performer.</div>
        <div className="sp2-bar" aria-hidden="true"><i /></div>
      </div>
    </div>
  );
}
