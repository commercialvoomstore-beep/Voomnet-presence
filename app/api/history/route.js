import { NextResponse } from 'next/server';
import { seedIfEmpty, readStore, requireAdmin, getSettings, fullName } from '@/lib/db';
import {
  abidjanNow,
  historyStatus,
  lateMinutes,
  timeToMinutes,
  workedMinutes,
} from '@/lib/rules';

const MAX_DAYS = 62;
const MAX_ROWS = 800;

function isoDays(from, to) {
  const days = [];
  const cursor = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (cursor <= end && days.length < MAX_DAYS) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

// GET /api/history — historique des pointages avec filtres (réservé administrateur)
// ?from=YYYY-MM-DD&to=YYYY-MM-DD&service=...&status=present|retard|absent|termine&q=...
export async function GET(request) {
  await seedIfEmpty();
  const admin = await requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: 'Accès administrateur requis.' }, { status: 401 });
  }

  const now = abidjanNow();
  const settings = await getSettings();
  const params = request.nextUrl.searchParams;

  const to = /^\d{4}-\d{2}-\d{2}$/.test(params.get('to') || '') ? params.get('to') : now.date;
  let from = /^\d{4}-\d{2}-\d{2}$/.test(params.get('from') || '') ? params.get('from') : null;
  if (!from) {
    const d = new Date(`${to}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 29);
    from = d.toISOString().slice(0, 10);
  }
  if (from > to) {
    return NextResponse.json({ error: 'Plage de dates invalide.' }, { status: 400 });
  }

  const serviceFilter = (params.get('service') || '').trim().toLowerCase();
  const statusFilter = (params.get('status') || '').trim();
  const q = (params.get('q') || '').trim().toLowerCase();

  const attendance = await readStore('attendance');
  const employees = await readStore('employees');

  const rows = [];
  for (const date of isoDays(from, to)) {
    // Jour ouvré ? (calculé sur l'index du jour de la semaine de cette date)
    const weekdayIndex = new Date(`${date}T00:00:00Z`).getUTCDay();
    const workday = Array.isArray(settings.workdays) && settings.workdays.includes(weekdayIndex);
    for (const emp of employees) {
      const record = attendance[emp.matricule]?.[date] || null;
      if (!workday && !record) continue; // hors jour ouvré sans pointage : rien à signaler
      const rec = { arrival: record?.arrival || null, departure: record?.departure || null };
      const status = historyStatus(rec, settings);
      // Durée de présence : calculable si arrivée + (départ ou journée en cours)
      let worked = null;
      if (rec.arrival) {
        if (rec.departure) {
          worked = Math.max(0, timeToMinutes(rec.departure) - timeToMinutes(rec.arrival));
        } else if (date === now.date) {
          worked = workedMinutes(rec, settings, now);
        }
      }
      rows.push({
        date,
        matricule: emp.matricule,
        name: fullName(emp),
        service: emp.department || '',
        arrival: rec.arrival,
        departure: rec.departure,
        status,
        late: lateMinutes(rec.arrival, settings),
        worked,
        workday,
      });
    }
  }

  const filtered = rows.filter((r) => {
    if (serviceFilter && (r.service || '').toLowerCase() !== serviceFilter) return false;
    if (statusFilter && r.status !== statusFilter) return false;
    if (q && !r.matricule.includes(q) && !(r.name || '').toLowerCase().includes(q)) return false;
    return true;
  });

  filtered.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return (a.name || '').localeCompare(b.name || '', 'fr');
  });

  const services = [...new Set(employees.map((e) => e.department).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'fr')
  );

  return NextResponse.json({
    from,
    to: isoDays(from, to).slice(-1)[0] || to,
    total: filtered.length,
    truncated: filtered.length > MAX_ROWS,
    rows: filtered.slice(0, MAX_ROWS),
    services,
  });
}
