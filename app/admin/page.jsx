'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Connexion impossible.');
        return;
      }
      localStorage.setItem('vp_admin', data.token);
      localStorage.setItem('vp_admin_label', data.label || 'Administrateur');
      router.push('/admin/dashboard');
    } catch {
      setError('Erreur réseau.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-wrap">
      <div className="auth-card">
        <div className="brand">
          <div className="brand-mark">VP</div>
          <div>
            <div className="brand-name">VOOMNET Presence</div>
            <div className="brand-sub">Command Center</div>
          </div>
        </div>
        <h1 className="auth-title">Connexion administrateur</h1>
        <p className="auth-sub">Supervision, registre des codes, notifications et paramètres.</p>

        {error && <div className="alert alert-error mb-2">{error}</div>}

        <form onSubmit={onSubmit} className="stack">
          <div className="field">
            <label htmlFor="email">Identifiant</label>
            <input
              id="email"
              className="input"
              type="email"
              autoComplete="username"
              placeholder="admin@voomnet.ci"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="password">Mot de passe</label>
            <input
              id="password"
              className="input"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <button className="btn btn-block btn-lg" type="submit" disabled={loading}>
            {loading ? 'Connexion…' : 'Ouvrir le Command Center'}
          </button>
        </form>

        <div className="auth-hint">
          Comptes de démonstration (stockage local) : <code>admin@voomnet.ci</code> ·{' '}
          <code>it@voomnet.ci</code> — mot de passe défini localement dans <code>data/</code>.
        </div>

        <p className="small muted mt-2" style={{ textAlign: 'center' }}>
          <Link href="/">← Retour à l&apos;accueil</Link>
        </p>
      </div>
    </main>
  );
}
