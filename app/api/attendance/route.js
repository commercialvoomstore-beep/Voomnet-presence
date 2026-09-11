import { NextResponse } from 'next/server';
import {
  seedIfEmpty,
  readStore,
  writeStore,
  requireAdmin,
  requireEmployee,
  getSession,
  getSettings,
} from '@/lib/db';
import { abidjanNow, computeStatus, computeCounters, isWorkday } from '@/lib/rules';

function todayRecord(attendance, employeeId, date) {
  if (!attendance[employeeId]) attendance[employeeId] = {};
  if (!attendance[employeeId][date]) attendance[employeeId][date] = { arrival: null, departure: null };
  return attendance[employeeId][date];
}

function historyOf(attendance, employeeId, limit = 14) {
  const days = Object.entries(attendance[employeeId] || {})
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .slice(0, limit)
    .map(([date, record]) => ({ date, ...record }));
  return days;
}

// GET /api/attendance — tableau de bord complet (réservé administrateur)
export async function GET(request) {
  await seedIfEmpty();
  const admin = await requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: 'Accès administrateur requis.' }, { status: 401 });
  }

  const now = abidjanNow();
  const settings = await getSettings();
  const attendance = await readStore('attendance');
  const employees = await readStore('employees');

  const board = employees.map((emp) => {
    const record = attendance[emp.matricule]?.[now.date] || null;
    return {
      matricule: emp.matricule,
      name: emp.name,
      department: emp.department,
      registeredAt: emp.registeredAt,
      photo: emp.photo,
      today: record
        ? {
            arrival: record.arrival,
            departure: record.departure,
            status: computeStatus(record, settings, now),
          }
        : { arrival: null, departure: null, status: computeStatus(null, settings, now) },
      history: historyOf(attendance, emp.matricule, 7),
    };
  });

  return NextResponse.json({
    now,
    isWorkday: isWorkday(now, settings),
    settings,
    counters: computeCounters(board, settings, now),
    employees: board,
  });
}

// POST /api/attendance — pointage employé (arrival | departure)
export async function POST(request) {
  await seedIfEmpty();
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 });
  }

  const employeeId = String(body?.employeeId || '').trim();
  const action = String(body?.action || '').trim();
  const sessionToken = String(body?.sessionToken || '').trim();

  if (!['arrival', 'departure'].includes(action)) {
    return NextResponse.json({ error: 'Action invalide (arrival | departure).' }, { status: 400 });
  }

  // Vérification de la session : jeton dédié à cet employé, ou jeton admin (supervision)
  const session = await getSession(sessionToken);
  const isAdminSession = session && session.role === 'admin';
  if (!session || (!isAdminSession && (session.role !== 'employee' || session.employeeId !== employeeId))) {
    return NextResponse.json({ error: 'Session invalide ou expirée.' }, { status: 401 });
  }

  const employees = await readStore('employees');
  const employee = employees.find((e) => e.matricule === employeeId);
  if (!employee) {
    return NextResponse.json({ error: 'Matricule inconnu.' }, { status: 404 });
  }

  const now = abidjanNow();
  const settings = await getSettings();

  // Vérification du jour ouvré
  if (!isWorkday(now, settings)) {
    return NextResponse.json({ error: 'Jour non ouvré : pointage impossible.' }, { status: 403 });
  }

  const attendance = await readStore('attendance');
  const record = todayRecord(attendance, employeeId, now.date);

  if (action === 'arrival') {
    // Blocage du double pointage d'arrivée
    if (record.arrival) {
      return NextResponse.json(
        { error: 'Double pointage : arrivée déjà enregistrée à ' + record.arrival + '.' },
        { status: 409 }
      );
    }
    record.arrival = now.time;
  } else {
    if (!record.arrival) {
      return NextResponse.json({ error: "Pointez d'abord votre arrivée." }, { status: 400 });
    }
    if (record.departure) {
      return NextResponse.json(
        { error: 'Double pointage : départ déjà enregistré à ' + record.departure + '.' },
        { status: 409 }
      );
    }
    record.departure = now.time;
  }

  await writeStore('attendance', attendance);

  return NextResponse.json({
    ok: true,
    action,
    date: now.date,
    today: {
      arrival: record.arrival,
      departure: record.departure,
      status: computeStatus(record, settings, now),
    },
  });
}
