// Règles métier de pointage — fuseau Africa/Abidjan (UTC+0, pas d'heure d'été)

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

  const [h, m] = time.split(':').map(Number);

  return {
    date: ymd,
    time,
    hhmm: time.slice(0, 5),
    minutes: h * 60 + m,
    weekday: wdShort,
    weekdayIndex: WEEKDAY_INDEX[wdShort],
  };
}

export function hhmmToMinutes(value) {
  const [h, m] = String(value).split(':').map(Number);
  return h * 60 + m;
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

// Statut normalisé d'un employé pour la journée en cours
export function computeStatus(record, settings, now) {
  if (!isWorkday(now, settings)) return 'weekend';
  if (!record || !record.arrival) return 'absent';
  if (record.departure) return 'termine';
  if (now.minutes >= hhmmToMinutes(settings.departureTime)) return 'depart_en_attente';
  return isLate(record.arrival, settings) ? 'retard' : 'present';
}

export const STATUS_LABELS = {
  present: 'Présent',
  retard: 'En retard',
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
