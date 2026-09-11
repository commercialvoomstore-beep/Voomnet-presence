'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { STATUS_LABELS, abidjanNow, hhmmToMinutes } from '@/lib/rules';

const STATUS_PILL = {
  present: 'pill-present',
  retard: 'pill-retard',
  absent: 'pill-absent',
  depart_en_attente: 'pill-attente',
  termine: 'pill-termine',
  weekend: 'pill-weekend',
};

function useAbidjanClock() {
  const [now, setNow] = useState(null);
  useEffect(() => {
    const tick = () => setNow(abidjanNow(new Date()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function countdownText(now, departureTime) {
  if (!now) return '--:--:--';
  const target = hhmmToMinutes(departureTime) * 60;
  const current = now.minutes * 60 + Number(now.time.slice(6, 8));
  const diff = target - current;
  if (diff <= 0) return 'Journée théorique terminée';
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  const s = diff % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function EmployeeSpace() {
  const router = useRouter();
  const [session, setSession] = useState(null);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [banner, setBanner] = useState(null);
  const [busy, setBusy] = useState(false);
  const [nameEdit, setNameEdit] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const fileRef = useRef(null);
  const clock = useAbidjanClock();

  const logout = useCallback(() => {
    localStorage.removeItem('vp_session');
    localStorage.removeItem('vp_matricule');
    router.push('/employee');
  }, [router]);

  const flash = useCallback((type, text) => {
    setBanner({ type, text });
    setTimeout(() => setBanner(null), 4000);
  }, []);

  const load = useCallback(async () => {
    if (!session) return;
    try {
      const res = await fetch('/api/employee', { headers: { 'x-session-token': session } });
      if (res.status === 401) return logout();
      const json = await res.json();
      setData(json);
    } catch {
      /* réessai au prochain cycle */
    }
  }, [session, logout]);

  useEffect(() => {
    const s = localStorage.getItem('vp_session');
    if (!s) {
      router.replace('/employee');
      return;
    }
    setSession(s);
  }, [router, logout]);

  useEffect(() => {
    load();
    const id = setInterval(load, 10000);
    return () => clearInterval(id);
  }, [load]);

  async function point(action) {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: localStorage.getItem('vp_matricule'),
          sessionToken: session,
          action,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        flash('error', json.error || 'Pointage refusé.');
        return;
      }
      flash(
        'ok',
        action === 'arrival'
          ? `Arrivée enregistrée à ${json.today.arrival}.`
          : `Départ enregistré à ${json.today.departure}. Bonne fin de journée !`
      );
      load();
    } catch {
      flash('error', 'Erreur réseau.');
    } finally {
      setBusy(false);
    }
  }

  async function postEmployee(body, okText) {
    const res = await fetch('/api/employee', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-session-token': session },
      body: JSON.stringify({ sessionToken: session, ...body }),
    });
    const json = await res.json();
    if (!res.ok) {
      flash('error', json.error || 'Action impossible.');
      return false;
    }
    if (okText) flash('ok', okText);
    load();
    return true;
  }

  async function onPhoto(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    // Redimensionnement côté navigateur (max 320px) pour rester léger
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 320 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    await postEmployee({ action: 'updateProfile', photo: dataUrl }, 'Photo de profil mise à jour.');
    e.target.value = '';
  }

  if (!session || !data) {
    return (
      <main className="center-page">
        <div className="spinner" /> Chargement de votre espace…
      </main>
    );
  }

  const { employee, today, history, notifications, settings } = data;
  const canArrive = !today.arrival;
  const canDepart = !!today.arrival && !today.departure;

  return (
    <>
      <header className="topbar">
        <div className="container topbar-inner">
          <div className="brand">
            <div className="brand-mark">VP</div>
            <div>
              <div className="brand-name">VOOMNET Presence</div>
              <div className="brand-sub">Espace Employé</div>
            </div>
          </div>
          <div className="row">
            <div className="clock">
              <div className="clock-time">
                {clock ? clock.time : '--:--:--'}
              </div>
              <div className="clock-date">
                {clock
                  ? new Date().toLocaleDateString('fr-FR', {
                      timeZone: 'Africa/Abidjan',
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })
                  : '…'}
              </div>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={logout}>
              Déconnexion
            </button>
          </div>
        </div>
      </header>

      <main className="container page">
        {banner && <div className={`alert ${banner.type === 'ok' ? 'alert-ok' : 'alert-error'} mb-2`}>{banner.text}</div>}
        {today.status === 'weekend' && (
          <div className="alert alert-info mb-2">
            Aujourd&apos;hui n&apos;est pas un jour ouvré : aucun pointage n&apos;est requis.
          </div>
        )}

        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', alignItems: 'start' }}>
          {/* Profil */}
          <div className="card card-pad">
            <div className="card-title">Mon profil</div>
            <div className="row" style={{ gap: 16 }}>
              <div className="avatar avatar-lg">
                {employee.photo ? (
                  <img src={employee.photo} alt="Photo de profil" />
                ) : (
                  (employee.name || '?').slice(0, 2).toUpperCase()
                )}
              </div>
              <div>
                {nameEdit ? (
                  <div className="row">
                    <input
                      className="input"
                      style={{ maxWidth: 180 }}
                      value={nameDraft}
                      onChange={(e) => setNameDraft(e.target.value)}
                      maxLength={60}
                    />
                    <button
                      className="btn btn-sm"
                      onClick={async () => {
                        if (await postEmployee({ action: 'updateProfile', name: nameDraft }, 'Nom mis à jour.')) {
                          setNameEdit(false);
                        }
                      }}
                    >
                      Enregistrer
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setNameEdit(false)}>
                      Annuler
                    </button>
                  </div>
                ) : (
                  <div style={{ fontWeight: 800, fontSize: 18 }}>
                    {employee.name}{' '}
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ marginLeft: 8 }}
                      onClick={() => {
                        setNameDraft(employee.name);
                        setNameEdit(true);
                      }}
                    >
                      Renommer
                    </button>
                  </div>
                )}
                <div className="small muted mono mt-1">Matricule 3CX : {employee.matricule}</div>
                <div className="small muted">Département : {employee.department}</div>
                <div className="small muted">Inscrit le : {employee.registeredAt}</div>
              </div>
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPhoto} />
            <button className="btn btn-ghost btn-sm mt-2" onClick={() => fileRef.current?.click()}>
              📷 Ajouter une photo depuis l&apos;appareil
            </button>
          </div>

          {/* Pointage */}
          <div className="card card-pad">
            <div className="card-title">Pointage du jour</div>
            <div className="row-between">
              <span className={`pill ${STATUS_PILL[today.status]}`}>{STATUS_LABELS[today.status]}</span>
              <div className="small muted">
                Arrivée {settings.arrivalTime} · tolérance {settings.toleranceMinutes} min · départ{' '}
                {settings.departureTime}
              </div>
            </div>

            <div className="grid mt-2" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="card" style={{ boxShadow: 'none', padding: 14, textAlign: 'center' }}>
                <div className="small muted">Arrivée réelle</div>
                <div className="countdown">{today.arrival || '--:--:--'}</div>
              </div>
              <div className="card" style={{ boxShadow: 'none', padding: 14, textAlign: 'center' }}>
                <div className="small muted">Départ réel</div>
                <div className="countdown">{today.departure || '--:--:--'}</div>
              </div>
            </div>

            <div className="card mt-2" style={{ boxShadow: 'none', padding: 14, textAlign: 'center', background: '#f8fafb' }}>
              <div className="small muted">Compteur avant {settings.departureTime}</div>
              <div className="countdown mt-1">{countdownText(clock, settings.departureTime)}</div>
            </div>

            {error && <div className="alert alert-error mt-2">{error}</div>}

            <div className="row mt-2">
              <button
                className="btn btn-accent btn-lg"
                style={{ flex: 1 }}
                disabled={!canArrive || busy || today.status === 'weekend'}
                onClick={() => point('arrival')}
              >
                ↑ Pointer l&apos;arrivée
              </button>
              <button
                className="btn btn-lg"
                style={{ flex: 1 }}
                disabled={!canDepart || busy || today.status === 'weekend'}
                onClick={() => point('departure')}
              >
                ↓ Pointer le départ
              </button>
            </div>
            {!canArrive && !canDepart && (
              <p className="small muted mt-1" style={{ textAlign: 'center' }}>
                Journée complète enregistrée — double pointage bloqué.
              </p>
            )}
          </div>
        </div>

        <div className="grid mt-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', alignItems: 'start' }}>
          {/* Historique */}
          <div className="card card-pad">
            <div className="card-title">Mon historique</div>
            {history.length === 0 && <div className="small muted">Aucun pointage enregistré.</div>}
            <div className="table-wrap">
              {history.length > 0 && (
                <table className="table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Arrivée</th>
                      <th>Départ</th>
                      <th>Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((h) => (
                      <tr key={h.date}>
                        <td className="num">{h.date}</td>
                        <td className="num">{h.arrival || '—'}</td>
                        <td className="num">{h.departure || '—'}</td>
                        <td>
                          <span className={`pill ${STATUS_PILL[h.status]}`}>{STATUS_LABELS[h.status]}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Notifications */}
          <div className="card card-pad">
            <div className="card-title">Mes notifications</div>
            {notifications.length === 0 && (
              <div className="small muted">Aucune notification pour le moment.</div>
            )}
            <div className="stack" style={{ gap: 10 }}>
              {notifications.map((n) => (
                <div key={n.id} className="notif">
                  <div>
                    <div className="notif-msg">{n.message}</div>
                    <div className="notif-meta">
                      {n.target === 'all' ? "Diffusée à toute l'équipe" : 'Message personnel'} ·{' '}
                      {new Date(n.createdAt).toLocaleString('fr-FR')}
                    </div>
                  </div>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => postEmployee({ action: 'deleteNotification', id: n.id }, null)}
                    title="Supprimer"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
