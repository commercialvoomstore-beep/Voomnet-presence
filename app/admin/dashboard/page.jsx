'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { STATUS_LABELS, WEEKDAYS_FR } from '@/lib/rules';

const STATUS_PILL = {
  present: 'pill-present',
  retard: 'pill-retard',
  absent: 'pill-absent',
  depart_en_attente: 'pill-attente',
  termine: 'pill-termine',
  weekend: 'pill-weekend',
};

function TopBar({ label, onLogout }) {
  const [now, setNow] = useState(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <header className="topbar">
      <div className="container topbar-inner">
        <div className="brand">
          <div className="brand-mark">VP</div>
          <div>
            <div className="brand-name">VOOMNET Presence</div>
            <div className="brand-sub">Command Center</div>
          </div>
        </div>
        <div className="row">
          <div className="clock">
            <div className="clock-time">
              {now ? now.toLocaleTimeString('fr-FR', { timeZone: 'Africa/Abidjan', hour12: false }) : '--:--:--'}
            </div>
            <div className="clock-date">
              {now
                ? now.toLocaleDateString('fr-FR', {
                    timeZone: 'Africa/Abidjan',
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })
                : '…'}
            </div>
          </div>
          <span className="pill pill-attente">{label}</span>
          <button className="btn btn-ghost btn-sm" onClick={onLogout}>
            Déconnexion
          </button>
        </div>
      </div>
    </header>
  );
}

function initials(name) {
  return String(name || '?')
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export default function AdminDashboard() {
  const router = useRouter();
  const [token, setToken] = useState(null);
  const [label, setLabel] = useState('Admin');
  const [tab, setTab] = useState('supervision');
  const [board, setBoard] = useState(null);
  const [registry, setRegistry] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [banner, setBanner] = useState(null); // {type:'ok'|'error', text}

  // Paramètres (formulaire)
  const [settingsForm, setSettingsForm] = useState(null);
  const [settingsMsg, setSettingsMsg] = useState(null);

  // Notification (formulaire)
  const [notifTarget, setNotifTarget] = useState('all');
  const [notifMessage, setNotifMessage] = useState('');
  const [notifMsg, setNotifMsg] = useState(null);

  const authHeaders = useCallback(
    () => ({ 'x-admin-token': token || '' }),
    [token]
  );

  const flash = useCallback((type, text) => {
    setBanner({ type, text });
    setTimeout(() => setBanner(null), 4000);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('vp_admin');
    localStorage.removeItem('vp_admin_label');
    router.push('/admin');
  }, [router]);

  // Garde d'accès
  useEffect(() => {
    const t = localStorage.getItem('vp_admin');
    if (!t) {
      router.replace('/admin');
      return;
    }
    setToken(t);
    setLabel(localStorage.getItem('vp_admin_label') || 'Admin');
  }, [router]);

  const loadBoard = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/attendance', { headers: authHeaders() });
      if (res.status === 401) return logout();
      const data = await res.json();
      setBoard(data);
      setSelected((sel) =>
        sel ? data.employees.find((e) => e.matricule === sel.matricule) || null : null
      );
    } catch {
      /* réseau : réessai au prochain cycle */
    }
  }, [token, authHeaders, logout]);

  const loadCodes = useCallback(async () => {
    if (!token) return;
    const res = await fetch('/api/codes', { headers: authHeaders() });
    if (res.ok) setRegistry((await res.json()).registry);
  }, [token, authHeaders]);

  const loadNotifications = useCallback(async () => {
    if (!token) return;
    const res = await fetch('/api/notifications', { headers: authHeaders() });
    if (res.ok) setNotifications((await res.json()).notifications);
  }, [token, authHeaders]);

  const loadSettings = useCallback(async () => {
    const res = await fetch('/api/settings');
    if (res.ok) setSettingsForm((await res.json()).settings);
  }, []);

  // Supervision automatique : rafraîchissement périodique
  useEffect(() => {
    loadBoard();
    const id = setInterval(loadBoard, 5000);
    return () => clearInterval(id);
  }, [loadBoard]);

  useEffect(() => {
    loadCodes();
    loadSettings();
  }, [loadCodes, loadSettings]);

  useEffect(() => {
    if (tab === 'notifications') loadNotifications();
  }, [tab, loadNotifications]);

  const filtered = useMemo(() => {
    if (!board) return [];
    const q = search.trim().toLowerCase();
    return board.employees.filter((e) => {
      const matchQ =
        !q || e.matricule.includes(q) || (e.name || '').toLowerCase().includes(q);
      const matchS = statusFilter === 'all' || e.today.status === statusFilter;
      return matchQ && matchS;
    });
  }, [board, search, statusFilter]);

  async function regenerate(matricule) {
    const res = await fetch('/api/codes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(matricule ? { matricule } : { all: true }),
    });
    if (res.ok) {
      const data = await res.json();
      setRegistry(data.registry);
      flash('ok', matricule ? `Code régénéré pour ${matricule}.` : 'Tous les codes ont été régénérés.');
    } else {
      flash('error', 'Régénération impossible.');
    }
  }

  async function sendNotification(e) {
    e.preventDefault();
    setNotifMsg(null);
    const res = await fetch('/api/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ target: notifTarget, message: notifMessage }),
    });
    const data = await res.json();
    if (res.ok) {
      setNotifMessage('');
      setNotifMsg({ type: 'ok', text: 'Notification envoyée.' });
      loadNotifications();
    } else {
      setNotifMsg({ type: 'error', text: data.error || 'Envoi impossible.' });
    }
  }

  async function saveSettings(e) {
    e.preventDefault();
    setSettingsMsg(null);
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(settingsForm),
    });
    const data = await res.json();
    if (res.ok) {
      setSettingsForm(data.settings);
      setSettingsMsg({ type: 'ok', text: 'Paramètres enregistrés.' });
      loadBoard();
    } else {
      setSettingsMsg({ type: 'error', text: data.error || 'Enregistrement impossible.' });
    }
  }

  if (!token || !board) {
    return (
      <main className="center-page">
        <div className="spinner" /> Chargement du Command Center…
      </main>
    );
  }

  const c = board.counters;

  return (
    <>
      <TopBar label={label} onLogout={logout} />
      <main className="container page">
        {banner && <div className={`alert ${banner.type === 'ok' ? 'alert-ok' : 'alert-error'} mb-2`}>{banner.text}</div>}
        {!board.isWorkday && (
          <div className="alert alert-info mb-2">
            Aujourd&apos;hui n&apos;est pas un jour ouvré configuré — le pointage est désactivé.
          </div>
        )}

        <nav className="tabs">
          {[
            ['supervision', 'Supervision'],
            ['codes', 'Registre des codes'],
            ['notifications', 'Notifications'],
            ['annuaire', 'Annuaire'],
            ['parametres', 'Paramètres'],
          ].map(([key, lbl]) => (
            <button
              key={key}
              className={`tab ${tab === key ? 'tab-active' : ''}`}
              onClick={() => setTab(key)}
            >
              {lbl}
            </button>
          ))}
        </nav>

        {tab === 'supervision' && (
          <div className="stack">
            <div className="stats">
              <div className="stat stat-present">
                <div className="stat-value">{c.presents}</div>
                <div className="stat-label">Présents</div>
              </div>
              <div className="stat stat-retard">
                <div className="stat-value">{c.retards}</div>
                <div className="stat-label">En retard</div>
              </div>
              <div className="stat stat-absent">
                <div className="stat-value">{c.absents}</div>
                <div className="stat-label">Absents</div>
              </div>
              <div className="stat stat-attente">
                <div className="stat-value">{c.departs_en_attente}</div>
                <div className="stat-label">Départs en attente</div>
              </div>
              <div className="stat stat-termine">
                <div className="stat-value">{c.terminees}</div>
                <div className="stat-label">Journées terminées</div>
              </div>
            </div>

            <div className="card card-pad">
              <div className="row-between mb-2">
                <div className="row">
                  <input
                    className="input"
                    style={{ maxWidth: 260 }}
                    placeholder="Rechercher (nom ou matricule)…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  <select
                    className="select"
                    style={{ maxWidth: 220 }}
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                  >
                    <option value="all">Tous les statuts</option>
                    {Object.entries(STATUS_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
                <span className="small muted">
                  Arrivée {board.settings.arrivalTime} · tolérance {board.settings.toleranceMinutes} min ·
                  départ {board.settings.departureTime} · rafraîchi toutes les 5 s
                </span>
              </div>

              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Employé</th>
                      <th>Statut</th>
                      <th>Arrivée</th>
                      <th>Départ théorique</th>
                      <th>Départ réel</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((emp) => (
                      <tr key={emp.matricule}>
                        <td>
                          <div className="row">
                            <div className="avatar">
                              {emp.photo ? <img src={emp.photo} alt="" /> : initials(emp.name)}
                            </div>
                            <div>
                              <div style={{ fontWeight: 700 }}>{emp.name}</div>
                              <div className="small muted mono">3CX {emp.matricule}</div>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className={`pill ${STATUS_PILL[emp.today.status]}`}>
                            {STATUS_LABELS[emp.today.status]}
                          </span>
                        </td>
                        <td className="num">{emp.today.arrival || '—'}</td>
                        <td className="num">{board.settings.departureTime}</td>
                        <td className="num">{emp.today.departure || '—'}</td>
                        <td>
                          <button className="btn btn-ghost btn-sm" onClick={() => setSelected(emp)}>
                            Détails
                          </button>
                        </td>
                      </tr>
                    ))}
                    {filtered.length === 0 && (
                      <tr>
                        <td colSpan={6} className="muted" style={{ textAlign: 'center', padding: 24 }}>
                          Aucun employé ne correspond à la recherche.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {selected && (
              <div className="card card-pad">
                <div className="row-between mb-2">
                  <div className="card-title" style={{ marginBottom: 0 }}>
                    Panneau détaillé — {selected.name} (3CX {selected.matricule})
                  </div>
                  <button className="btn btn-ghost btn-sm" onClick={() => setSelected(null)}>
                    Fermer
                  </button>
                </div>
                <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                  <div>
                    <div className="small muted">Statut du jour</div>
                    <div className="mt-1">
                      <span className={`pill ${STATUS_PILL[selected.today.status]}`}>
                        {STATUS_LABELS[selected.today.status]}
                      </span>
                    </div>
                    <div className="small muted mt-2">Département</div>
                    <div>{selected.department}</div>
                    <div className="small muted mt-1">Date d&apos;inscription</div>
                    <div>{selected.registeredAt}</div>
                  </div>
                  <div>
                    <div className="small muted">Arrivée</div>
                    <div className="countdown" style={{ fontSize: 22 }}>
                      {selected.today.arrival || '—'}
                    </div>
                    <div className="small muted mt-1">Départ réel</div>
                    <div className="countdown" style={{ fontSize: 22 }}>
                      {selected.today.departure || '—'}
                    </div>
                  </div>
                  <div>
                    <div className="small muted mb-1">Historique (7 derniers jours)</div>
                    {selected.history.length === 0 && <div className="small muted">Aucun pointage.</div>}
                    {selected.history.map((h) => (
                      <div key={h.date} className="small num" style={{ padding: '3px 0' }}>
                        <span className={`history-dot ${STATUS_PILL[h.status].replace('pill-', '') === 'present' ? '' : ''}`}
                          style={{
                            background:
                              h.status === 'present' ? 'var(--success)'
                              : h.status === 'retard' ? 'var(--warn)'
                              : h.status === 'termine' ? 'var(--ink-faint)'
                              : h.status === 'depart_en_attente' ? 'var(--info)'
                              : 'var(--danger)',
                          }}
                        />
                        {h.date} · ↑ {h.arrival || '—'} · ↓ {h.departure || '—'}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'codes' && (
          <div className="card card-pad">
            <div className="row-between mb-2">
              <div className="card-title" style={{ marginBottom: 0 }}>
                Registre des codes individuels (à usage unique)
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => regenerate(null)}>
                Régénérer tout
              </button>
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Employé</th>
                    <th>Matricule 3CX</th>
                    <th>Code actuel</th>
                    <th>Généré le</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {registry.map((r) => (
                    <tr key={r.matricule}>
                      <td style={{ fontWeight: 700 }}>{r.name}</td>
                      <td className="num mono">{r.matricule}</td>
                      <td>
                        <span className="mono" style={{ fontSize: 16, fontWeight: 800, letterSpacing: '0.12em' }}>
                          {r.code}
                        </span>
                      </td>
                      <td className="small muted">
                        {r.generatedAt ? new Date(r.generatedAt).toLocaleString('fr-FR') : '—'}
                      </td>
                      <td>
                        <button className="btn btn-ghost btn-sm" onClick={() => regenerate(r.matricule)}>
                          Régénérer
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="small muted mt-2">
              Communiquez le code à l&apos;employé : après sa connexion, le code est consommé et un
              nouveau code est généré automatiquement.
            </p>
          </div>
        )}

        {tab === 'notifications' && (
          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', alignItems: 'start' }}>
            <div className="card card-pad">
              <div className="card-title">Nouvelle notification</div>
              <form onSubmit={sendNotification} className="stack">
                <div className="field">
                  <label htmlFor="target">Cible</label>
                  <select
                    id="target"
                    className="select"
                    value={notifTarget}
                    onChange={(e) => setNotifTarget(e.target.value)}
                  >
                    <option value="all">Toute l&apos;équipe</option>
                    {board.employees.map((emp) => (
                      <option key={emp.matricule} value={emp.matricule}>
                        {emp.name} — 3CX {emp.matricule}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="message">Message</label>
                  <textarea
                    id="message"
                    className="textarea"
                    maxLength={500}
                    placeholder="Ex. Réunion d'équipe à 15:00 en salle A."
                    value={notifMessage}
                    onChange={(e) => setNotifMessage(e.target.value)}
                    required
                  />
                </div>
                {notifMsg && (
                  <div className={`alert ${notifMsg.type === 'ok' ? 'alert-ok' : 'alert-error'}`}>
                    {notifMsg.text}
                  </div>
                )}
                <button className="btn" type="submit">Envoyer la notification</button>
              </form>
            </div>

            <div className="card card-pad">
              <div className="card-title">Historique des envois</div>
              {notifications.length === 0 && <div className="small muted">Aucune notification envoyée.</div>}
              <div className="stack" style={{ gap: 10 }}>
                {notifications.map((n) => (
                  <div key={n.id} className="notif">
                    <div>
                      <div className="notif-msg">{n.message}</div>
                      <div className="notif-meta">
                        {n.target === 'all'
                          ? "Toute l'équipe"
                          : `Employé 3CX ${n.target}`}{' '}
                        · {new Date(n.createdAt).toLocaleString('fr-FR')}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === 'annuaire' && (
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
            {board.employees.map((emp) => (
              <div key={emp.matricule} className="card card-pad">
                <div className="row" style={{ gap: 14 }}>
                  <div className="avatar avatar-lg">
                    {emp.photo ? <img src={emp.photo} alt="" /> : initials(emp.name)}
                  </div>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 16 }}>{emp.name}</div>
                    <div className="small muted mono">3CX {emp.matricule}</div>
                    <div className="mt-1">
                      <span className={`pill ${STATUS_PILL[emp.today.status]}`}>
                        {STATUS_LABELS[emp.today.status]}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="mt-2 small soft">
                  Département : {emp.department}
                  <br />
                  Inscrit le : {emp.registeredAt}
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'parametres' && settingsForm && (
          <div className="card card-pad" style={{ maxWidth: 560 }}>
            <div className="card-title">Règles horaires</div>
            <form onSubmit={saveSettings} className="stack">
              <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <div className="field">
                  <label htmlFor="arrival">Heure d&apos;arrivée</label>
                  <input
                    id="arrival"
                    type="time"
                    className="input"
                    value={settingsForm.arrivalTime}
                    onChange={(e) => setSettingsForm({ ...settingsForm, arrivalTime: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label htmlFor="departure">Départ théorique</label>
                  <input
                    id="departure"
                    type="time"
                    className="input"
                    value={settingsForm.departureTime}
                    onChange={(e) => setSettingsForm({ ...settingsForm, departureTime: e.target.value })}
                  />
                </div>
              </div>
              <div className="field">
                <label htmlFor="tolerance">Tolérance (minutes)</label>
                <input
                  id="tolerance"
                  type="number"
                  min={0}
                  max={120}
                  className="input"
                  value={settingsForm.toleranceMinutes}
                  onChange={(e) =>
                    setSettingsForm({ ...settingsForm, toleranceMinutes: Number(e.target.value) })
                  }
                />
                <span className="small muted">
                  Retard à partir de{' '}
                  <strong>
                    {String(Math.floor(
                      (Number(settingsForm.arrivalTime.slice(0, 2)) * 60 +
                        Number(settingsForm.arrivalTime.slice(3, 5)) +
                        Number(settingsForm.toleranceMinutes)) / 60
                    )).padStart(2, '0')}
                    h
                    {String(
                      (Number(settingsForm.arrivalTime.slice(0, 2)) * 60 +
                        Number(settingsForm.arrivalTime.slice(3, 5)) +
                        Number(settingsForm.toleranceMinutes)) % 60
                    ).padStart(2, '0')}
                  </strong>
                </span>
              </div>
              <div className="field">
                <label>Jours ouvrés</label>
                <div className="row" style={{ flexWrap: 'wrap', gap: 14 }}>
                  {WEEKDAYS_FR.map((day, index) => (
                    <label key={day} className="checkbox-row">
                      <input
                        type="checkbox"
                        checked={settingsForm.workdays.includes(index)}
                        onChange={(e) => {
                          const set = new Set(settingsForm.workdays);
                          if (e.target.checked) set.add(index);
                          else set.delete(index);
                          setSettingsForm({ ...settingsForm, workdays: [...set] });
                        }}
                      />
                      {day}
                    </label>
                  ))}
                </div>
              </div>
              <div className="small muted">Fuseau horaire : Africa/Abidjan (fixe)</div>
              {settingsMsg && (
                <div className={`alert ${settingsMsg.type === 'ok' ? 'alert-ok' : 'alert-error'}`}>
                  {settingsMsg.text}
                </div>
              )}
              <button className="btn" type="submit">Enregistrer les paramètres</button>
            </form>
          </div>
        )}
      </main>
    </>
  );
}
