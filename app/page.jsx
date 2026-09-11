'use client';

import Link from 'next/link';
import { useState } from 'react';
import Splash from './components/Splash';
import { LiveClock, LiveDot } from './components/primitives';

export default function HomePage() {
  const [ready, setReady] = useState(false);

  return (
    <main className="container page">
      {!ready && <Splash onDone={() => setReady(true)} />}

      <header className="row-between">
        <div className="brand-logo">
          <img src="/voomnet-mark.svg" alt="VOOMNET" width="40" height="40" />
          <div>
            <div className="brand-name">VOOMNET Presence</div>
            <div className="brand-sub">Solutions IT &amp; Télécoms</div>
          </div>
        </div>
        <LiveClock />
      </header>

      <section className="home-hero">
        <div className="home-logo">
          <img src="/voomnet-logo.svg" alt="VOOMNET TECHNOLOGY" />
        </div>
        <h1 className="hero-title">
          Supervision des présences <span>VOOMNET</span>
        </h1>
        <div className="home-slogan">Innover. Connecter. Performer.</div>
        <p className="hero-sub">
          Pointage hebdomadaire du lundi au vendredi — arrivée, pauses, départ et suivi en temps réel.
        </p>
        <div className="home-clock">
          <LiveClock size="md" />
        </div>
        <div className="home-live">
          <LiveDot label="SYSTÈME EN LIGNE" />
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
            Connexion par matricule 3CX et code personnel à usage unique pour pointer arrivée,
            pauses et départ.
          </p>
          <span className="btn btn-accent">Pointer ma présence →</span>
        </Link>
      </section>

      <footer className="mt-3 muted small" style={{ textAlign: 'center' }}>
        VOOMNET TECHNOLOGY © 2026 · Innover. Connecter. Performer. · Fuseau Africa/Abidjan
      </footer>
    </main>
  );
}
