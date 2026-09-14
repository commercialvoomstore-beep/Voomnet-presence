'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  STATUS_LABELS,
  WEEKDAYS_FR,
  formatHm,
  hhmmToMinutes,
  isLate,
  openPauseMinutes,
  workedMinutes,
} from '@/lib/rules';
import AnimatedNumber from '@/app/components/AnimatedNumber';
import CommandPalette from '@/app/components/CommandPalette';
import DotGrid from '@/app/components/DotGrid';
import EmployeePanel from '@/app/components/EmployeePanel';
import EmployeesTable from '@/app/components/EmployeesTable';
import KpiCard from '@/app/components/KpiCard';
import LiveFeed from '@/app/components/LiveFeed';
import PresenceFlow from '@/app/components/PresenceFlow';
import PresenceRing from '@/app/components/PresenceRing';
import SupervisionMode from '@/app/components/SupervisionMode';
import Toasts from '@/app/components/Toasts';
import { Countdown, LiveClock, initials, useNowTick } from '@/app/components/primitives';

const STATUS_PILL = {
  present: 'pill-present',
  retard: 'pill-retard',
  pause: 'pill-pause',
  absent: 'pill-absent',
  depart_en_attente: 'pill-attente',
  termine: 'pill-termine',
  weekend: 'pill-weekend',
};

const FILTERS = [
  ['all', 'Tous'],
  ['present', 'Présents'],
  ['absent', 'Absents'],
  ['retard', 'En retard'],
  ['pause', 'En pause'],
  ['depart_en_attente', 'Départs en attente'],
  ['termine', 'Journée terminée'],
];

function TopBar({ label, onOpenPalette, onSupervision, onLogout }) {
  return (
    <header className="topbar">
      <div className="container container-wide topbar-inner">
        <div className="brand-logo">
          <img src="/voomnet-mark.svg" alt="VOOMNET" width="38" height="38" />
          <div>
            <div className="brand-name">VOOMNET Presence</div>
            <div className="brand-sub">Command Center</div>
          </div>
        </div>
        <div className="row" style={{ gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <button type="button" className="search-btn" onClick={onOpenPalette} aria-label="Rechercher un employé">
            ⌘K Rechercher…
          </button>
          <LiveClock showDate={false} />
          <span className="role-pill">{label}</span>
          <button type="button" className="btn btn-violet btn-sm" onClick={onSupervision}>
            👁 Supervision
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onLogout}>
            Déconnexion
          </button>
        </div>
      </div>
    </header>
  );
}

export default function AdminDashboard() {
  const router = useRouter();
  const [token, setToken] = useState(null);
  const [label, setLabel] = useState('Admin');
  const [tab, setTab] = useState('supervision');
  const [board, setBoard] = useState(null);
  const [registry, setRegistry] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [codesHistory, setCodesHistory] = useState([]);
  const [copiedCode, setCopiedCode] = useState(null);
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [banner, setBanner] = useState(null);
  const [boardError, setBoardError] = useState(false);
  const [supervision, setSupervision] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [prevCounters, setPrevCounters] = useState(null);

  const [settingsForm, setSettingsForm] = useState(null);
  const [settingsMsg, setSettingsMsg] = useState(null);
  const [notifTarget, setNotifTarget] = useState('all');
  const [notifMessage, setNotifMessage] = useState('');
  const [notifMsg, setNotifMsg] = useState(null);

  const prevSnap = useRef(null);
  const countersRef = useRef(null);
  const toastId = useRef(0);
  const tick = useNowTick(1000);

  const authHeaders = useCallback(() => ({ 'x-admin-token': token || '' }), [token]);

  const flash = useCallback((type, text) => {
    setBanner({ type, text });
    setTimeout(() => setBanner(null), 4000);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('vp_admin');
    localStorage.removeItem('vp_admin_label');
    router.push('/admin');
  }, [router]);

  const pushToast = useCallback((tone, title, message) => {
    const id = `t${Date.now()}-${toastId.current++}`;
    setToasts((list) => [...list.slice(-3), { id, tone, title, message }]);
    setTimeout(() => {
      setToasts((list) => list.filter((t) => t.id !== id));
    }, 6500);
  }, []);

  const dismissToast = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    const t = localStorage.getItem('vp_admin');
    if (!t) {
      router.replace('/admin');
      return;
    }
    setToken(t);
    setLabel(localStorage.getItem('vp_admin_label') || 'Admin');
  }, [router]);

  // Raccourci ⌘K / Ctrl+K
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Détection des changements réels -> toasts live (aucune donnée simulée)
  const diffAndNotify = useCallback(
    (employees, settings) => {
      const snap = {};
      for (const e of employees) {
        const pauses = e.today.pauses || [];
        const last = pauses[pauses.length - 1];
        snap[e.matricule] = {
          arrival: e.today.arrival,
          departure: e.today.departure,
          pauses: pauses.length,
          openPause: !!(last && last.start && !last.end),
          status: e.today.status,
        };
      }
      const prev = prevSnap.current;
      prevSnap.current = snap;
      if (!prev) return;
      for (const e of employees) {
        const p = prev[e.matricule];
        const s = snap[e.matricule];
        if (!p) continue;
        if (!p.arrival && s.arrival) {
          const late = isLate(s.arrival, settings);
          pushToast(
            late ? 'warn' : 'success',
            late ? `${e.name} est en retard` : `${e.name} vient d'arriver`,
            late ? `Arrivée tardive à ${s.arrival}.` : `Arrivée enregistrée à ${s.arrival}.`
          );
        }
        if (!p.departure && s.departure) {
          pushToast('success', `${e.name} a terminé sa journée`, `Départ enregistré à ${s.departure}.`);
        }
        if (!p.openPause && s.openPause) {
          pushToast('info', `${e.name} est en pause`, 'Début de pause enregistré.');
        }
        if (p.openPause && !s.openPause && s.pauses >= p.pauses) {
          pushToast('info', `${e.name} est de retour`, 'Fin de pause enregistrée.');
        }
        if (p.status !== 'depart_en_attente' && s.status === 'depart_en_attente') {
          pushToast('warn', `Départ attendu : ${e.name}`, `L'heure théorique (${settings.departureTime}) est dépassée.`);
        }
      }
    },
    [pushToast]
  );

  const loadBoard = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/attendance', { headers: { 'x-admin-token': token } });
      if (res.status === 401) return logout();
      if (!res.ok) throw new Error('load-failed');
      const data = await res.json();
      setPrevCounters(countersRef.current);
      countersRef.current = data.counters;
      setBoard(data);
      diffAndNotify(data.employees, data.settings);
      setBoardError(false);
      setSelected((sel) =>
        sel ? data.employees.find((e) => e.matricule === sel.matricule) || null : null
      );
    } catch {
      setBoardError(true);
    }
  }, [token, logout, diffAndNotify]);

  const loadCodes = useCallback(async () => {
    if (!token) return;
    const res = await fetch('/api/codes', { headers: authHeaders() });
    if (!res.ok) return;
    const data = await res.json();
    setRegistry(data.registry);
    setCodesHistory(data.history || []);
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

  // Événements réels du jour pour le flux live
  const events = useMemo(() => {
    if (!board) return [];
    const list = [];
    for (const e of board.employees) {
      const t = e.today;
      if (t.arrival) {
        const late = isLate(t.arrival, board.settings);
        list.push({
          id: `${e.matricule}-arr`,
          time: t.arrival,
          name: e.name,
          message: late ? 'Arrivée tardive enregistrée' : 'Arrivée enregistrée',
          tone: late ? 'warn' : 'success',
        });
      }
      (t.pauses || []).forEach((p, i) => {
        list.push({
          id: `${e.matricule}-ps${i}`,
          time: p.start,
          name: e.name,
          message: 'Début de pause',
          tone: 'info',
        });
        if (p.end) {
          list.push({
            id: `${e.matricule}-pe${i}`,
            time: p.end,
            name: e.name,
            message: 'Retour de pause',
            tone: 'info',
          });
        }
      });
      if (t.departure) {
        list.push({
          id: `${e.matricule}-dep`,
          time: t.departure,
          name: e.name,
          message: `Départ enregistré à ${t.departure}`,
          tone: 'violet',
        });
      }
    }
    return list.sort((a, b) => (a.time < b.time ? 1 : -1)).slice(0, 9);
  }, [board]);

  // Alertes réelles : retards, attentes, absents, pauses longues
  const attention = useMemo(() => {
    if (!board) return [];
    const items = [];
    const c = board.counters;
    if (c.retards > 0) {
      items.push({
        key: 'retard',
        tone: 'warn',
        num: c.retards,
        label: c.retards > 1 ? 'employés en retard' : 'employé en retard',
        filter: 'retard',
      });
    }
    if (c.departs_en_attente > 0) {
      items.push({
        key: 'attente',
        tone: 'violet',
        num: c.departs_en_attente,
        label: c.departs_en_attente > 1 ? 'départs en attente' : 'départ en attente',
        filter: 'depart_en_attente',
      });
    }
    const lateThreshold =
      hhmmToMinutes(board.settings.arrivalTime) + Number(board.settings.toleranceMinutes || 0);
    if (board.isWorkday && c.absents > 0 && tick.minutes > lateThreshold) {
      items.push({
        key: 'absent',
        tone: 'danger',
        num: c.absents,
        label: c.absents > 1 ? 'absents à surveiller' : 'absent à surveiller',
        filter: 'absent',
      });
    }
    const longPauses = board.employees.filter(
      (e) => e.today.status === 'pause' && openPauseMinutes(e.today, tick) >= 45
    ).length;
    if (longPauses > 0) {
      items.push({
        key: 'pause',
        tone: 'info',
        num: longPauses,
        label: longPauses > 1 ? 'pauses longues (≥ 45 min)' : 'pause longue (≥ 45 min)',
        filter: 'pause',
      });
    }
    return items;
  }, [board, tick]);

  const counts = useMemo(() => {
    const m = { all: board?.employees.length || 0 };
    for (const [key] of FILTERS) {
      if (key === 'all') continue;
      m[key] = board ? board.employees.filter((e) => e.today.status === key).length : 0;
    }
    return m;
  }, [board]);

  async function copyCode(code) {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = code;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    setCopiedCode(code);
    setTimeout(() => setCopiedCode((c) => (c === code ? null : c)), 1600);
  }

  async function regenerate(matricule) {
    const res = await fetch('/api/codes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(matricule ? { matricule } : { all: true }),
    });
    if (res.ok) {
      const data = await res.json();
      setRegistry(data.registry);
      setCodesHistory(data.history || []);
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
  const total = board.employees.length;
  const arrived = c.presents + c.retards + (c.pauses || 0) + c.departs_en_attente + c.terminees;
  const onSite = c.presents + c.retards + (c.pauses || 0) + c.departs_en_attente;
  const rate = total === 0 ? 0 : Math.round((arrived / total) * 100);
  const hour = tick.minutes / 60;
  const greeting = hour < 18 ? 'Bonjour' : 'Bonsoir';
  const dateLong = new Date()
    .toLocaleDateString('fr-FR', {
      timeZone: 'Africa/Abidjan',
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
    .toUpperCase();

  const delta = (key) => (prevCounters ? (c[key] || 0) - (prevCounters[key] || 0) : 0);

  // Clôture réelle : jour ouvré + tous les arrivés sont partis + heure théorique passée
  const depTarget = hhmmToMinutes(board.settings.departureTime);
  const closed =
    board.isWorkday && arrived > 0 && arrived === c.terminees && tick.minutes >= depTarget;
  const avgWorked = (() => {
    if (!closed) return null;
    const vals = board.employees
      .map((e) => workedMinutes(e.today, board.settings, tick))
      .filter((v) => v !== null);
    if (vals.length === 0) return null;
    return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
  })();

  const focusFilter = (filter) => {
    setTab('supervision');
    setStatusFilter(filter);
    setTimeout(() => {
      document.getElementById('cc-table')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);
  };

  return (
    <>
      <TopBar
        label={label}
        onOpenPalette={() => setPaletteOpen(true)}
        onSupervision={() => setSupervision(true)}
        onLogout={logout}
      />
      <main className="container container-wide page">
        {banner && <div className={`alert ${banner.type === 'ok' ? 'alert-ok' : 'alert-error'} mb-2`}>{banner.text}</div>}
        {!board.isWorkday && (
          <div className="alert alert-info mb-2">
            Aujourd&apos;hui n&apos;est pas un jour ouvré configuré — le pointage est désactivé.
          </div>
        )}
        {boardError && (
          <div className="error-state mb-2">
            <div className="empty-title">⚠ Données momentanément indisponibles</div>
            <div className="empty-sub">Vérifiez votre connexion puis réessayez.</div>
            <button type="button" className="btn btn-sm mt-1" onClick={loadBoard}>
              Réessayer
            </button>
          </div>
        )}

        <nav className="tabs" aria-label="Navigation du Command Center">
          {[
            ['supervision', 'Supervision'],
            ['codes', 'Registre des codes'],
            ['notifications', 'Notifications'],
            ['annuaire', 'Employés'],
            ['parametres', 'Paramètres'],
          ].map(([key, lbl]) => (
            <button
              key={key}
              type="button"
              className={`tab ${tab === key ? 'tab-active' : ''}`}
              onClick={() => setTab(key)}
            >
              {lbl}
            </button>
          ))}
        </nav>

        {tab === 'supervision' && (
          <div>
            {closed && (
              <div className="closed-banner">
                <div className="closed-badge">✓</div>
                <div>
                  <div className="closed-title">Journée clôturée</div>
                  <div className="closed-sub">
                    Présence finale {rate} % ({arrived}/{total}) · {c.terminees} départ
                    {c.terminees > 1 ? 's' : ''} enregistré{c.terminees > 1 ? 's' : ''} ·{' '}
                    {c.retards} retard{c.retards > 1 ? 's' : ''}
                    {avgWorked !== null && <> · durée moyenne {formatHm(avgWorked)}</>}
                  </div>
                </div>
              </div>
            )}

            {/* HERO */}
            <div className="cc-hero">
              <div className="cc-hero-main fade-up">
                <div className="cc-greeting">{greeting}, Administrateur 👋</div>
                <h1 className="cc-title">Centre de contrôle de présence</h1>
                <div className="cc-sub">Supervision des présences — fuseau Africa/Abidjan</div>
                <div className="cc-meta">
                  <span className="cc-date">{dateLong}</span>
                  <LiveClock showDate={false} />
                </div>
              </div>
              <div className="cc-hero-side fade-up" style={{ animationDelay: '80ms' }}>
                <PresenceRing rate={board.isWorkday ? rate : 0} size={168} stroke={15} />
                <div className="hero-stats">
                  <div className="hs-row">
                    <span className="hs-num"><AnimatedNumber value={arrived} /></span>
                    <span className="hs-lbl">arrivée{arrived > 1 ? 's' : ''} sur {total} collaborateur{total > 1 ? 's' : ''}</span>
                  </div>
                  <div className="hs-row">
                    <span className="hs-num"><AnimatedNumber value={onSite} /></span>
                    <span className="hs-lbl">encore sur site</span>
                  </div>
                  <div className="hs-row">
                    <span className="hs-num"><AnimatedNumber value={c.terminees} /></span>
                    <span className="hs-lbl">journée{c.terminees > 1 ? 's' : ''} terminée{c.terminees > 1 ? 's' : ''}</span>
                  </div>
                  <div className="hero-evo">
                    {board.isWorkday ? `Évolution depuis ce matin : +${arrived}` : 'Hors jour ouvré — aucune activité attendue.'}
                  </div>
                </div>
              </div>
            </div>

            {/* KPI */}
            <div className="kpi-grid">
              <KpiCard icon="🟢" label="Présents" value={c.presents} hint="Sur site" tone="success" delta={delta('presents')} index={0} onClick={() => focusFilter('present')} />
              <KpiCard icon="🔴" label="Absents" value={c.absents} hint="À surveiller" tone="danger" delta={delta('absents')} index={1} onClick={() => focusFilter('absent')} />
              <KpiCard icon="🟠" label="En retard" value={c.retards} hint="Attention requise" tone="warn" delta={delta('retards')} index={2} onClick={() => focusFilter('retard')} />
              <KpiCard icon="🔵" label="En pause" value={c.pauses || 0} hint="Actuellement" tone="info" delta={delta('pauses')} index={3} onClick={() => focusFilter('pause')} />
              <KpiCard icon="🟣" label="Départs en attente" value={c.departs_en_attente} hint="Après l'heure théorique" tone="violet" delta={delta('departs_en_attente')} index={4} onClick={() => focusFilter('depart_en_attente')} />
              <div className="kpi kpi-navy fade-up" style={{ animationDelay: '300ms' }} aria-label={`Prochain départ théorique : ${board.settings.departureTime}`}>
                <span className="kpi-icon" aria-hidden="true">🕐</span>
                <span className="kpi-body">
                  <span className="kpi-label">Prochain départ</span>
                  <span className="kpi-value num">{board.settings.departureTime}</span>
                  <span className="kpi-hint"><Countdown departureTime={board.settings.departureTime} compact /></span>
                </span>
              </div>
            </div>

            {/* FLUX + ATTENTION + STATUS */}
            <div className="cc-grid-3">
              <div className="cc-card fade-up" style={{ animationDelay: '120ms' }}>
                <div className="cc-card-head">
                  <span className="cc-card-title">⚠ Actions requises</span>
                </div>
                {attention.length === 0 ? (
                  <div className="attention-ok">✓ Tout est sous contrôle — aucune action requise.</div>
                ) : (
                  <div className="attention-grid">
                    {attention.map((a) => (
                      <div key={a.key} className={`attention-card ${a.tone}`}>
                        <span className="attention-num"><AnimatedNumber value={a.num} /></span>
                        <span className="attention-label">{a.label}</span>
                        <button type="button" className="attention-link" onClick={() => focusFilter(a.filter)}>
                          Voir → Superviser
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="cc-card fade-up" style={{ animationDelay: '180ms' }}>
                <div className="cc-card-head">
                  <span className="cc-card-title">🕘 Activité récente</span>
                </div>
                <LiveFeed events={events} />
              </div>
              <div className="cc-card fade-up" style={{ animationDelay: '240ms' }}>
                <div className="cc-card-head">
                  <span className="cc-card-title">👥 Qui est présent ?</span>
                </div>
                <DotGrid employees={board.employees} departureTime={board.settings.departureTime} onSelect={setSelected} />
              </div>
            </div>

            {/* GRAPHIQUE */}
            <div className="cc-card mb-2 fade-up" style={{ animationDelay: '200ms' }}>
              <div className="cc-card-head">
                <span className="cc-card-title">📈 Évolution de la présence</span>
                <span className="small muted">Données du jour · {board.now.date}</span>
              </div>
              <PresenceFlow employees={board.employees} settings={board.settings} nowMinutes={tick.minutes} />
            </div>

            {/* TABLEAU LIVE VIEW */}
            <div className="cc-card table-card fade-up" id="cc-table" style={{ animationDelay: '260ms' }}>
              <div className="table-head">
                <span className="cc-card-title">👥 Collaborateurs</span>
                <div className="cc-actions">
                  <input
                    className="input"
                    style={{ maxWidth: 240 }}
                    placeholder="Rechercher (nom ou matricule)…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    aria-label="Rechercher un employé"
                  />
                  <button type="button" className="search-btn" style={{ minWidth: 0 }} onClick={() => setPaletteOpen(true)}>
                    ⌘K
                  </button>
                </div>
              </div>
              <div style={{ padding: '0 20px 12px' }}>
                <div className="chips" role="tablist" aria-label="Filtrer par statut">
                  {FILTERS.map(([key, lbl]) => (
                    <button
                      key={key}
                      type="button"
                      role="tab"
                      aria-selected={statusFilter === key}
                      className={`chip ${statusFilter === key ? 'chip-active' : ''}`}
                      onClick={() => setStatusFilter(key)}
                    >
                      {lbl}
                      <span className="chip-count">{counts[key] ?? 0}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="table-scroll">
                <table className="table table-sticky">
                  <thead>
                    <tr>
                      <th>Employé</th>
                      <th>Statut</th>
                      <th>Arrivée</th>
                      <th>Départ théorique</th>
                      <th>Départ réel</th>
                      <th>Durée</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((emp) => {
                      const t = emp.today;
                      const highlight = t.status === 'retard' || t.status === 'depart_en_attente';
                      return (
                        <tr
                          key={emp.matricule}
                          className={`${highlight ? 'row-attention' : ''} ${selected?.matricule === emp.matricule ? 'row-selected' : ''} clickable-row`}
                          onClick={() => setSelected(emp)}
                        >
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
                            <span className={`pill ${STATUS_PILL[t.status]}`}>
                              {STATUS_LABELS[t.status]}
                            </span>
                          </td>
                          <td className="num">{t.arrival || '—'}</td>
                          <td className="num">{board.settings.departureTime}</td>
                          <td className="num">{t.departure || '—'}</td>
                          <td className="num">{formatHm(workedMinutes(t, board.settings, tick))}</td>
                          <td>
                            <button
                              type="button"
                              className="btn btn-soft btn-sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelected(emp);
                              }}
                            >
                              Détails
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {filtered.length === 0 && (
                      <tr>
                        <td colSpan={7}>
                          <div className="empty-state">
                            <div className="empty-icon" aria-hidden="true">🔍</div>
                            <div className="empty-title">Aucun employé ne correspond</div>
                            <div className="empty-sub">Modifiez la recherche ou les filtres.</div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {tab === 'codes' && (
          <div className="stack">
            <div className="cc-card table-card">
              <div className="table-head">
                <span className="cc-card-title">🔑 Registre des codes individuels <span className="title-soft">— à usage unique</span></span>
                <button type="button" className="btn btn-soft btn-sm" onClick={() => regenerate(null)}>
                  Régénérer tout
                </button>
              </div>
              <div className="table-scroll">
                <table className="table table-sticky">
                  <thead>
                    <tr>
                      <th>Employé</th>
                      <th>Matricule 3CX</th>
                      <th>Code actuel</th>
                      <th>Statut</th>
                      <th>Généré le</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {registry.map((r) => (
                      <tr key={r.matricule}>
                        <td>
                          <div style={{ fontWeight: 700, color: 'var(--text-primary, #1c2333)' }}>{r.name}</div>
                        </td>
                        <td className="num mono">{r.matricule}</td>
                        <td>
                          <span className="code-display">{r.code}</span>
                        </td>
                        <td>
                          <span className="status-badge badge-available">Disponible</span>
                        </td>
                        <td className="small muted">
                          {r.generatedAt ? new Date(r.generatedAt).toLocaleString('fr-FR') : '—'}
                        </td>
                        <td>
                          <div className="row" style={{ gap: 8 }}>
                            <button
                              type="button"
                              className="btn btn-soft btn-sm"
                              onClick={() => copyCode(r.code)}
                              aria-label={`Copier le code de ${r.name}`}
                            >
                              {copiedCode === r.code ? '✓ Copié' : 'Copier'}
                            </button>
                            <button type="button" className="btn btn-soft btn-sm" onClick={() => regenerate(r.matricule)}>
                              Régénérer
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="small muted" style={{ padding: '12px 20px 20px' }}>
                Communiquez le code à l&apos;employé : après sa connexion, le code est consommé et un
                nouveau code est généré automatiquement.
              </p>
            </div>

            <div className="cc-card">
              <div className="cc-card-head">
                <span className="cc-card-title">🗂 Derniers codes invalidés</span>
              </div>
              {codesHistory.length === 0 ? (
                <div className="empty-state" style={{ padding: '18px 8px' }}>
                  <div className="empty-title">Aucun code invalidé</div>
                  <div className="empty-sub">Les codes consommés ou régénérés apparaîtront ici.</div>
                </div>
              ) : (
                <div className="history-list">
                  {codesHistory.map((h, i) => (
                    <div key={`${h.code}-${i}`} className="history-row">
                      <span className="mono num">{h.code}</span>
                      <span className={`status-badge ${h.status === 'used' ? 'badge-used' : 'badge-revoked'}`}>
                        {h.status === 'used' ? 'Utilisé' : 'Désactivé'}
                      </span>
                      <span className="small soft">{h.name || `3CX ${h.matricule}`} · 3CX {h.matricule}</span>
                      <span className="small muted">{h.at ? new Date(h.at).toLocaleString('fr-FR') : '—'}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'notifications' && (
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', alignItems: 'start' }}>
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
              {notifications.length === 0 && (
                <div className="empty-state">
                  <div className="empty-icon" aria-hidden="true">✉️</div>
                  <div className="empty-title">Aucune notification envoyée</div>
                  <div className="empty-sub">Les envois apparaîtront ici.</div>
                </div>
              )}
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
          <div className="cc-card table-card">
            <div className="table-head">
              <span className="cc-card-title">👥 Employees List <span className="title-soft">— profils réels du personnel</span></span>
            </div>
            <div style={{ padding: '0 20px 20px' }}>
              <EmployeesTable employees={board.employees} onSelect={setSelected} />
            </div>
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

      {selected && (tab === 'supervision' || tab === 'annuaire') && (
        <EmployeePanel emp={selected} settings={board.settings} onClose={() => setSelected(null)} />
      )}
      <CommandPalette
        open={paletteOpen}
        employees={board.employees}
        departureTime={board.settings.departureTime}
        onSelect={(emp) => {
          setSelected(emp);
          setPaletteOpen(false);
          setTab('supervision');
        }}
        onClose={() => setPaletteOpen(false)}
      />
      {supervision && (
        <SupervisionMode counters={c} onClose={() => setSupervision(false)} />
      )}
      <Toasts toasts={toasts} onDismiss={dismissToast} />
    </>
  );
}
