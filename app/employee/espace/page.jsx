'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  STATUS_LABELS,
  abidjanNow,
  closedPauseMinutes,
  formatHm,
  hhmmToMinutes,
  isOnPause,
  lateMinutes,
  workedMinutes,
} from '@/lib/rules';

const STATUS_PILL = {
  present: 'pill-present',
  retard: 'pill-retard',
  pause: 'pill-pause',
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
      const lastPause = (json.today.pauses || []).slice(-1)[0];
      flash(
        'ok',
        action === 'arrival'
          ? `Arrivée enregistrée à ${json.today.arrival}.`
          : action === 'departure'
            ? `Départ enregistré à ${json.today.departure}. Bonne fin de journée !`
            : action === 'pause_start'
              ? `Pause démarrée à ${lastPause?.start || ''}.`
              : 'Retour de pause enregistré. Bon courage !'
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
  const onPause = isOnPause(today);
  const canDepart = !!today.arrival && !today.departure && !onPause;
  const canPause = !!today.arrival && !today.departure && !onPause;
  const pauses = today.pauses || [];
  const nowRef = clock || abidjanNow(new Date());
  const worked = workedMinutes(today, settings, nowRef);
  const late = lateMinutes(today.arrival, settings);

  const timeline = [];
  if (today.arrival) {
    timeline.push({ time: today.arrival, label: late > 0 ? `Arrivée — en retard de ${formatHm(late)}` : 'Arrivée — à l\u2019heure', tone: late > 0 ? 'warn' : 'success' });
  }
  pauses.forEach((p, i) => {
    timeline.push({ time: p.start, label: `Pause ${pauses.length > 1 ? i + 1 : ''} — début`.trim(), tone: 'info' });
    if (p.end) timeline.push({ time: p.end, label: 'Retour de pause', tone: 'info' });
  });
  if (today.departure) {
    timeline.push({ time: today.departure, label: 'Départ réel — journée terminée', tone: 'success' });
  } else if (today.arrival) {
    timeline.push({ time: settings.departureTime, label: 'Départ théorique (attendu)', tone: 'pending' });
  }

  return (
    <>
      <header className="topbar">
        <div className="container topbar-inner">
          <div className="brand-logo">
            <img src="/voomnet-mark.svg" alt="VOOMNET" width="38" height="38" />
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

        {/* HÉROS PROFIL */}
        <section className="emp-hero fade-up">
          <div className="emp-hero-inner">
            <div className="avatar">
              {employee.photo ? (
                <img src={employee.photo} alt="Photo de profil" />
              ) : (
                (employee.name || '?').slice(0, 2).toUpperCase()
              )}
            </div>
            <div style={{ flex: 1, minWidth: 220 }}>
              {nameEdit ? (
                <div className="row" style={{ flexWrap: 'wrap' }}>
                  <input
                    className="input"
                    style={{ maxWidth: 200 }}
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    maxLength={60}
                    aria-label="Nouveau nom"
                  />
                  <button
                    className="btn btn-sm"
                    style={{ background: '#fff', color: 'var(--voom-navy)', boxShadow: 'none' }}
                    onClick={async () => {
                      if (await postEmployee({ action: 'updateProfile', name: nameDraft }, 'Nom mis à jour.')) {
                        setNameEdit(false);
                      }
                    }}
                  >
                    Enregistrer
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ background: 'transparent', color: '#fff', borderColor: 'rgba(255,255,255,0.4)' }}
                    onClick={() => setNameEdit(false)}
                  >
                    Annuler
                  </button>
                </div>
              ) : (
                <div className="emp-name">
                  {employee.name}{' '}
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ marginLeft: 8, background: 'rgba(255,255,255,0.14)', color: '#fff', borderColor: 'rgba(255,255,255,0.3)' }}
                    onClick={() => {
                      setNameDraft(employee.name);
                      setNameEdit(true);
                    }}
                  >
                    Renommer
                  </button>
                </div>
              )}
              <div className="emp-chips">
                <span className="emp-chip mono">3CX {employee.matricule}</span>
                <span className="emp-chip">{employee.department}</span>
                <span className="emp-chip">Inscrit le {employee.registeredAt}</span>
              </div>
            </div>
            <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
              <span className={`pill ${STATUS_PILL[today.status]}`}>{STATUS_LABELS[today.status]}</span>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPhoto} />
              <button
                className="btn btn-sm"
                style={{ background: '#fff', color: 'var(--voom-navy)', boxShadow: 'none' }}
                onClick={() => fileRef.current?.click()}
              >
                📷 Photo
              </button>
            </div>
          </div>
        </section>

        <div className="emp-grid">
          {/* POINTAGE */}
          <div className="cc-card fade-up" style={{ animationDelay: '80ms' }}>
            <div className="cc-card-head">
              <span className="cc-card-title">⚡ Pointage du jour</span>
            </div>
            <div className="emp-statusbar">
              <span className={`pill ${STATUS_PILL[today.status]}`}>{STATUS_LABELS[today.status]}</span>
              <div className="small muted">
                {settings.arrivalTime} · tolérance {settings.toleranceMinutes} min · départ {settings.departureTime}
              </div>
            </div>

            <div className="emp-tiles">
              <div className="emp-tile">
                <div className="t">↑ Arrivée réelle</div>
                <div className="v">{today.arrival || '--:--:--'}</div>
              </div>
              <div className="emp-tile">
                <div className="t">↓ Départ réel</div>
                <div className="v">{today.departure || '--:--:--'}</div>
              </div>
            </div>

            <div className="emp-count">
              <div className="t small muted">Compteur avant {settings.departureTime}</div>
              <div className="v">{countdownText(clock, settings.departureTime)}</div>
            </div>

            <div className="emp-stats">
              <div className="stat-chip"><b>{formatHm(worked)}</b><span>Travaillé</span></div>
              <div className="stat-chip"><b>{late === null ? '—' : late === 0 ? "À l'heure" : `+${formatHm(late)}`}</b><span>Retard</span></div>
              <div className="stat-chip"><b>{pauses.length === 0 ? '—' : formatHm(closedPauseMinutes(today))}</b><span>Pauses ({pauses.length})</span></div>
            </div>

            {error && <div className="alert alert-error mt-2">{error}</div>}

            <div className="emp-btns">
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
            <div className="mt-2">
              {onPause ? (
                <button
                  className="btn btn-violet btn-block"
                  disabled={busy}
                  onClick={() => point('pause_end')}
                >
                  ▶ Terminer ma pause (en pause depuis {pauses[pauses.length - 1]?.start})
                </button>
              ) : (
                <button
                  className="btn btn-ghost btn-block"
                  disabled={!canPause || busy || today.status === 'weekend'}
                  onClick={() => point('pause_start')}
                >
                  ⏸ Démarrer une pause
                  {pauses.length > 0 && ` (${pauses.length} déjà prise${pauses.length > 1 ? 's' : ''} · ${formatHm(closedPauseMinutes(today))})`}
                </button>
              )}
            </div>
            {!canArrive && !canDepart && (
              <p className="small muted mt-1" style={{ textAlign: 'center' }}>
                Journée complète enregistrée — double pointage bloqué.
              </p>
            )}
          </div>

          {/* TIMELINE */}
          <div className="cc-card fade-up" style={{ animationDelay: '140ms' }}>
            <div className="cc-card-head">
              <span className="cc-card-title">🕓 Ma journée</span>
            </div>
            {timeline.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon" aria-hidden="true">🌅</div>
                <div className="empty-title">Journée pas encore commencée</div>
                <div className="empty-sub">Pointez votre arrivée pour démarrer la timeline.</div>
              </div>
            ) : (
              <ol className="timeline">
                {timeline.map((ev, i) => (
                  <li key={i} className={`timeline-item tone-${ev.tone}`}>
                    <span className="timeline-dot" aria-hidden="true" />
                    <span className="timeline-time num">{ev.time}</span>
                    <span className="timeline-label">{ev.label}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>

        <div className="grid mt-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', alignItems: 'start' }}>
          {/* HISTORIQUE */}
          <div className="cc-card">
            <div className="cc-card-head">
              <span className="cc-card-title">📅 Mon historique</span>
            </div>
            {history.length === 0 && (
              <div className="empty-state">
                <div className="empty-icon" aria-hidden="true">📋</div>
                <div className="empty-title">Aucun pointage enregistré</div>
                <div className="empty-sub">Vos 14 derniers jours apparaîtront ici.</div>
              </div>
            )}
            <div className="table-scroll">
              {history.length > 0 && (
                <table className="table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Arrivée</th>
                      <th>Départ</th>
                      <th>Pauses</th>
                      <th>Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((h) => (
                      <tr key={h.date}>
                        <td className="num">{h.date}</td>
                        <td className="num">{h.arrival || '—'}</td>
                        <td className="num">{h.departure || '—'}</td>
                        <td className="num small">
                          {(h.pauses || []).length === 0 ? '—' : `${(h.pauses || []).length} (${formatHm(closedPauseMinutes(h))})`}
                        </td>
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

          {/* NOTIFICATIONS */}
          <div className="cc-card">
            <div className="cc-card-head">
              <span className="cc-card-title">🔔 Mes notifications</span>
            </div>
            {notifications.length === 0 && (
              <div className="empty-state">
                <div className="empty-icon" aria-hidden="true">🔕</div>
                <div className="empty-title">Aucune notification</div>
                <div className="empty-sub">Les messages de l&apos;administration apparaîtront ici.</div>
              </div>
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
                    aria-label="Supprimer la notification"
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
