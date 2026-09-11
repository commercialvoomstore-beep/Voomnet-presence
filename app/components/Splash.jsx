'use client';

import { useEffect, useState } from 'react';

// Splash screen premium "Luxury Enterprise" — séquence staged :
// 1. apparition du logo 2. léger mouvement 3. wordmark 4. ligne de progression 5. sortie.
export default function Splash({ onDone, minDuration = 2300 }) {
  const [phase, setPhase] = useState('enter'); // enter -> progress -> exit -> done
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (mq?.matches) {
      setReduced(true);
      const t = setTimeout(() => {
        setPhase('done');
        onDone?.();
      }, 400);
      return () => clearTimeout(t);
    }
    const t1 = setTimeout(() => setPhase('progress'), 900);
    const t2 = setTimeout(() => setPhase('exit'), minDuration);
    const t3 = setTimeout(() => {
      setPhase('done');
      onDone?.();
    }, minDuration + 550);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [minDuration, onDone]);

  if (phase === 'done') return null;

  return (
    <div className={`splash ${phase === 'exit' ? 'splash-exit' : ''}`} role="status" aria-label="Chargement de VOOMNET Presence">
      <div className="splash-inner">
        <div className="splash-mark">
          {/* Marque VOOMNET recréée en vectoriel (4 carrés marine/violet) */}
          <svg viewBox="0 0 200 200" aria-hidden="true">
            <rect className="splash-cell c1" x="4" y="4" width="90" height="90" rx="26" fill="#1a1a63" />
            <rect className="splash-slit s1" x="64" y="18" width="7" height="62" rx="3.5" fill="#ffffff" />
            <rect className="splash-cell c2" x="106" y="4" width="90" height="90" rx="26" fill="#611e93" />
            <rect className="splash-slit s2" x="166" y="18" width="7" height="62" rx="3.5" fill="#ffffff" />
            <rect className="splash-cell c3" x="4" y="106" width="90" height="90" rx="26" fill="#611e93" />
            <rect className="splash-slit s3" x="64" y="120" width="7" height="62" rx="3.5" fill="#ffffff" />
            <rect className="splash-cell c4" x="106" y="106" width="90" height="90" rx="26" fill="#1a1a63" />
            <rect className="splash-slit s4" x="166" y="120" width="7" height="62" rx="3.5" fill="#ffffff" />
          </svg>
          {!reduced && <span className="splash-halo" aria-hidden="true" />}
        </div>
        <div className="splash-word">
          <div className="splash-title">VOOMNET</div>
          <div className="splash-sub">PRESENCE</div>
        </div>
        <div className="splash-tag">White Enterprise Technology</div>
        <div className="splash-progress" aria-hidden="true">
          <span className={phase === 'enter' ? '' : 'run'} />
        </div>
      </div>
    </div>
  );
}
