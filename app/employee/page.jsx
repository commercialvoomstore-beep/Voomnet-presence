'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function EmployeeLoginPage() {
  const router = useRouter();
  const [matricule, setMatricule] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/employee', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId: matricule, code }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Connexion impossible.');
        return;
      }
      localStorage.setItem('vp_session', data.sessionToken);
      localStorage.setItem('vp_matricule', data.employee.matricule);
      router.push('/employee/espace');
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
            <div className="brand-sub">Espace Employé</div>
          </div>
        </div>
        <h1 className="auth-title">Pointage</h1>
        <p className="auth-sub">
          Saisissez votre matricule 3CX et le code personnel communiqué par votre administrateur.
          Le code est à usage unique.
        </p>

        {error && <div className="alert alert-error mb-2">{error}</div>}

        <form onSubmit={onSubmit} className="stack">
          <div className="field">
            <label htmlFor="matricule">Matricule 3CX</label>
            <input
              id="matricule"
              className="input"
              inputMode="numeric"
              placeholder="ex. 1009"
              value={matricule}
              onChange={(e) => setMatricule(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="code">Code personnel</label>
            <input
              id="code"
              className="input mono"
              inputMode="numeric"
              placeholder="6 chiffres"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
            />
          </div>
          <button className="btn btn-accent btn-block btn-lg" type="submit" disabled={loading}>
            {loading ? 'Vérification…' : 'Accéder à mon espace'}
          </button>
        </form>

        <div className="auth-hint">
          Workflow : l&apos;administrateur vous communique le code affiché dans le registre du
          Command Center. Après connexion, le code est consommé et un nouveau code est généré
          automatiquement.
        </div>

        <p className="small muted mt-2" style={{ textAlign: 'center' }}>
          <Link href="/">← Retour à l&apos;accueil</Link>
        </p>
      </div>
    </main>
  );
}
