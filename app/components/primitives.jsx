'use client';

import { memo, useEffect, useState } from 'react';
import { abidjanNow, formatHMS, hhmmToMinutes } from '@/lib/rules';

// Horloge réelle synchronisée chaque seconde (Africa/Abidjan)
export function useNowTick(intervalMs = 1000) {
  const [now, setNow] = useState(() => abidjanNow(new Date()));
  useEffect(() => {
    const id = setInterval(() => setNow(abidjanNow(new Date())), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export const LiveClock = memo(function LiveClock({ showDate = true, size = 'md' }) {
  const now = useNowTick(1000);
  const [mounted, setMounted] = useState(false);
  const [dateStr, setDateStr] = useState('…');
  useEffect(() => {
    setMounted(true);
  }, []);
  useEffect(() => {
    if (!mounted) return;
    setDateStr(
      new Date().toLocaleDateString('fr-FR', {
        timeZone: 'Africa/Abidjan',
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    );
  }, [now.date, mounted]);
  // Placeholder identique côté serveur et client : zéro erreur d'hydratation.
  if (!mounted) {
    return (
      <div className={`live-clock ${size}`}>
        <div className="live-clock-time" aria-live="off">--:--:--</div>
        {showDate && <div className="live-clock-date">…</div>}
      </div>
    );
  }
  return (
    <div className={`live-clock ${size}`}>
      <div className="live-clock-time" aria-live="off">{now.time}</div>
      {showDate && <div className="live-clock-date">{dateStr} — Abidjan</div>}
    </div>
  );
});

// Compte à rebours intelligent vers le départ théorique (temps réel, sans rechargement)
export const Countdown = memo(function Countdown({ departureTime, compact = false }) {
  const now = useNowTick(1000);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  if (!mounted) {
    return <span className={`countdown-live ${compact ? 'compact' : ''}`}>--:--:--</span>;
  }
  const diff = hhmmToMinutes(departureTime) * 60 - now.seconds;
  if (diff <= 0) return <span className="countdown-done">Heure théorique dépassée</span>;
  return (
    <span
      className={`countdown-live ${compact ? 'compact' : ''}`}
      title="Temps avant l'heure théorique de départ."
    >
      ⏱ {formatHMS(diff)}
    </span>
  );
});

// Pastille LIVE à pulsation subtile
export const LiveDot = memo(function LiveDot({ label = 'LIVE', lastSync = null }) {
  return (
    <span className="live-dot" title={lastSync ? `Dernière synchronisation : ${lastSync}` : 'Temps réel actif'}>
      <span className="live-dot-pulse" aria-hidden="true" />
      <span className="live-dot-label">{label}</span>
      {lastSync && <span className="live-dot-sync">· sync {lastSync}</span>}
    </span>
  );
});

export function initials(name) {
  return String(name || '?')
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}
