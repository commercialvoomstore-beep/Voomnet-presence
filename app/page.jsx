'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

function Clock() {
  const [now, setNow] = useState(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  if (!now) return <div className="clock-lg"><div className="clock-time">--:--:--</div></div>;
  return (
    <div className="clock-lg">
      <div className="clock-time">
        {now.toLocaleTimeString('fr-FR', { timeZone: 'Africa/Abidjan', hour12: false })}
      </div>
      <div className="clock-date">
        {now.toLocaleDateString('fr-FR', {
          timeZone: 'Africa/Abidjan',
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })}{' '}
        — Abidjan
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <main className="container page">
      <header className="row-between">
        <div className="brand">
          <div className="brand-mark">VP</div>
          <div>
            <div className="brand-name">VOOMNET Presence</div>
            <div className="brand-sub">White Enterprise Technology</div>
          </div>
        </div>
        <div className="clock">
          <div className="clock-time">
            {new Date().toLocaleTimeString('fr-FR', { timeZone: 'Africa/Abidjan', hour12: false })}
          </div>
        </div>
      </header>

      <section className="hero">
        <h1 className="hero-title">
          Supervision des présences <span>VOOMNET</span>
        </h1>
        <p className="hero-sub">
          Pointage hebdomadaire du lundi au vendredi — arrivée, départ et suivi en temps réel.
        </p>
        <div className="mt-3">
          <Clock />
        </div>
      </section>

      <section className="portals">
        <Link href="/admin" className="portal portal-admin">
          <div className="portal-icon">🛡️</div>
          <div className="portal-title">Command Center</div>
          <p className="portal-desc">
            Espace administrateur : supervision temps réel, registre des codes, notifications et
            règles horaires.
          </p>
          <span className="btn">Accéder à l&apos;administration →</span>
        </Link>

        <Link href="/employee" className="portal portal-employee">
          <div className="portal-icon">🕐</div>
          <div className="portal-title">Espace Employé</div>
          <p className="portal-desc">
            Connexion par matricule 3CX et code personnel à usage unique pour pointer arrivée et
            départ.
          </p>
          <span className="btn btn-accent">Pointer ma présence →</span>
        </Link>
      </section>

      <footer className="mt-3 muted small" style={{ textAlign: 'center' }}>
        Prototype de démonstration — VOOMNET TECHNOLOGY © 2026 · Fuseau Africa/Abidjan
      </footer>
    </main>
  );
}
