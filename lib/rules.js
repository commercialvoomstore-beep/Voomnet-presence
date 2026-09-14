// Règles métier de pointage — fuseau Africa/Abidjan (UTC+0, pas d'heure d'été)
// Module pur (sans fs) : importable côté serveur ET côté client.

export const TIMEZONE = 'Africa/Abidjan';

const WEEKDAY_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export const WEEKDAYS_FR = [
  'dimanche',
  'lundi',
  'mardi',
  'mercredi',
  'jeudi',
  'vendredi',
  'samedi',
];

// Date et heure "murales" d'Abidjan, indépendantes du fuseau du serveur
export function abidjanNow(date = new Date()) {
  const ymd = new Intl.DateTimeFormat('fr-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date); // 2026-09-11

  const time = new Intl.DateTimeFormat('fr-FR', {
    timeZone: TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date); // 08:05:12

  const wdShort = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    weekday: 'short',
  }).format(date); // Fri

  const [h, m, s] = time.split(':').map(Number);

  return {
    date: ymd,
    time,
    hhmm: time.slice(0, 5),
    minutes: h * 60 + m,
    seconds: h * 3600 + m * 60 + (s || 0),
    weekday: wdShort,
    weekdayIndex: WEEKDAY_INDEX[wdShort],
  };
}

export function hhmmToMinutes(value) {
  const [h, m] = String(value).split(':').map(Number);
  return h * 60 + m;
}

export function timeToMinutes(value) {
  // "HH:MM:SS" ou "HH:MM" -> minutes depuis minuit
  return hhmmToMinutes(String(value || '').slice(0, 5));
}

export function timeToSeconds(value) {
  const parts = String(value || '').split(':').map(Number);
  return (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
}

export function minutesToHHMM(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function isValidHHMM(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || ''));
}

export function isWorkday(now, settings) {
  return Array.isArray(settings.workdays) && settings.workdays.includes(now.weekdayIndex);
}

// Retard strictement après la tolérance : arrivée 08:00 + 15 min -> retard à partir de 08:16
export function isLate(arrivalTime, settings) {
  return (
    hhmmToMinutes(String(arrivalTime).slice(0, 5)) >
    hhmmToMinutes(settings.arrivalTime) + Number(settings.toleranceMinutes || 0)
  );
}

// Minutes de retard (0 si à l'heure). null si pas d'arrivée.
export function lateMinutes(arrivalTime, settings) {
  if (!arrivalTime) return null;
  const diff =
    timeToMinutes(arrivalTime) -
    (hhmmToMinutes(settings.arrivalTime) + Number(settings.toleranceMinutes || 0));
  return Math.max(0, diff);
}

// ——— Pauses (temps réel, données réelles) ———
// record.pauses : [{ start: "HH:MM:SS", end: "HH:MM:SS" | null }]

export function isOnPause(record) {
  const pauses = record?.pauses || [];
  if (pauses.length === 0) return false;
  const last = pauses[pauses.length - 1];
  return !!last.start && !last.end;
}

// Durée totale des pauses closes, en minutes (pause ouverte exclue)
export function closedPauseMinutes(record) {
  const pauses = record?.pauses || [];
  let total = 0;
  for (const p of pauses) {
    if (p.start && p.end) {
      total += Math.max(0, Math.round((timeToSeconds(p.end) - timeToSeconds(p.start)) / 60));
    }
  }
  return total;
}

// Durée de la pause ouverte en minutes (0 si aucune)
export function openPauseMinutes(record, now) {
  if (!isOnPause(record)) return 0;
  const pauses = record.pauses;
  const start = timeToMinutes(pauses[pauses.length - 1].start);
  return Math.max(0, now.minutes - start);
}

// Statut normalisé d'un employé pour la journée en cours
export function computeStatus(record, settings, now) {
  if (!isWorkday(now, settings)) return 'weekend';
  if (!record || !record.arrival) return 'absent';
  if (record.departure) return 'termine';
  if (isOnPause(record)) return 'pause';
  if (now.minutes >= hhmmToMinutes(settings.departureTime)) return 'depart_en_attente';
  return isLate(record.arrival, settings) ? 'retard' : 'present';
}

// Statut d'une journée d'historique (indépendant de l'heure actuelle)
export function historyStatus(record, settings) {
  if (!record || !record.arrival) return 'absent';
  if (record.departure) return 'termine';
  return isLate(record.arrival, settings) ? 'retard' : 'present';
}

export const STATUS_LABELS = {
  present: 'Présent',
  retard: 'En retard',
  pause: 'En pause',
  absent: 'Absent',
  depart_en_attente: 'Départ en attente',
  termine: 'Journée terminée',
  weekend: 'Hors jour ouvré',
};

// Compteurs du Command Center
export function computeCounters(employees, settings, now) {
  const counters = {
    presents: 0,
    retards: 0,
    pauses: 0,
    absents: 0,
    departs_en_attente: 0,
    terminees: 0,
  };
  for (const emp of employees) {
    switch (emp.today?.status) {
      case 'present':
        counters.presents += 1;
        break;
      case 'retard':
        counters.retards += 1;
        break;
      case 'pause':
        counters.pauses += 1;
        break;
      case 'absent':
        counters.absents += 1;
        break;
      case 'depart_en_attente':
        counters.departs_en_attente += 1;
        break;
      case 'termine':
        counters.terminees += 1;
        break;
      default:
        break;
    }
  }
  if (!isWorkday(now, settings)) counters.absents = 0;
  return counters;
}

// ——— Durées (minutes). null si non calculable ———

// Temps de présence net = (fin - arrivée) - pauses closes. fin = départ réel ou heure actuelle.
export function workedMinutes(record, settings, now) {
  if (!record || !record.arrival) return null;
  const start = timeToMinutes(record.arrival);
  const end = record.departure ? timeToMinutes(record.departure) : now.minutes;
  const gross = Math.max(0, end - start);
  let pauses = closedPauseMinutes(record);
  if (!record.departure && isOnPause(record)) {
    // La pause ouverte n'est pas du temps travaillé : la retrancher aussi
    pauses += openPauseMinutes(record, now);
  }
  return Math.max(0, gross - pauses);
}

// Temps supplémentaire = départ réel après le départ théorique (0 sinon). null si pas de départ.
export function overtimeMinutes(record, settings) {
  if (!record?.departure) return null;
  return Math.max(0, timeToMinutes(record.departure) - hhmmToMinutes(settings.departureTime));
}

// Secondes restantes avant le départ théorique (négatif si dépassé)
export function secondsToDeparture(now, departureTime) {
  return hhmmToMinutes(departureTime) * 60 - now.seconds;
}

// ——— Formatages ———

export function formatHm(totalMinutes) {
  if (totalMinutes === null || totalMinutes === undefined) return '—';
  const m = Math.max(0, Math.round(totalMinutes));
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h === 0) return `${rest}m`;
  return `${String(h).padStart(2, '0')}h ${String(rest).padStart(2, '0')}m`;
}

export function formatHMS(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rest = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}
