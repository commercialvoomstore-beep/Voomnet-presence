import { NextResponse } from 'next/server';
import {
  seedIfEmpty,
  readStore,
  writeStore,
  requireEmployee,
  getSession,
  getSettings,
  normalizeRecord,
} from '@/lib/db';
import { abidjanNow, computeStatus, historyStatus } from '@/lib/rules';

function safeEmployee(emp) {
  return {
    matricule: emp.matricule,
    name: emp.name,
    department: emp.department,
    registeredAt: emp.registeredAt,
    photo: emp.photo || null,
  };
}

// GET /api/employee — espace personnel : profil, journée, historique, notifications
export async function GET(request) {
  await seedIfEmpty();
  const session = await requireEmployee(request);
  if (!session) {
    return NextResponse.json({ error: 'Session employé invalide ou expirée.' }, { status: 401 });
  }

  const employees = await readStore('employees');
  const found = employees.find((e) => e.matricule === session.employeeId);
  if (!found) {
    return NextResponse.json({ error: 'Employé introuvable.' }, { status: 404 });
  }
  const employee = found;

  const now = abidjanNow();
  const settings = await getSettings();
  const attendance = await readStore('attendance');
  const notificationsAll = await readStore('notifications');
  const record = attendance[employee.matricule]?.[now.date] || null;

  const notifications = notificationsAll
    .filter((n) => (n.target === 'all' || n.target === employee.matricule) && !(n.deletedBy || []).includes(employee.matricule))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  const history = Object.entries(attendance[employee.matricule] || {})
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .slice(0, 14)
    .map(([date, r]) => {
      const rec = normalizeRecord({ ...r });
      return { date, arrival: rec.arrival, departure: rec.departure, pauses: rec.pauses, status: historyStatus(rec, settings) };
    });

  const todayRecord = record ? normalizeRecord({ ...record }) : null;

  return NextResponse.json({
    now,
    settings,
    employee: safeEmployee(employee),
    today: todayRecord
      ? { arrival: todayRecord.arrival, departure: todayRecord.departure, pauses: todayRecord.pauses, status: computeStatus(todayRecord, settings, now) }
      : { arrival: null, departure: null, pauses: [], status: computeStatus(null, settings, now) },
    history,
    notifications,
  });
}

// POST /api/employee — actions : mise à jour du profil (nom, photo) et suppression de notifications
// Authentification : en-tête x-session-token OU champ sessionToken du corps (cohérent avec /api/attendance)
export async function POST(request) {
  await seedIfEmpty();
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 });
  }

  const headerSession = await requireEmployee(request);
  const bodySession = body?.sessionToken
    ? await getSession(String(body.sessionToken))
    : null;
  const session =
    (headerSession && headerSession.role === 'employee' ? headerSession : null) ||
    (bodySession && bodySession.role === 'employee' ? bodySession : null);
  if (!session) {
    return NextResponse.json({ error: 'Session employé invalide ou expirée.' }, { status: 401 });
  }

  const employees = await readStore('employees');
  const employee = employees.find((e) => e.matricule === session.employeeId);
  if (!employee) {
    return NextResponse.json({ error: 'Employé introuvable.' }, { status: 404 });
  }

  const action = String(body?.action || '');

  if (action === 'updateProfile') {
    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (name.length < 2 || name.length > 60) {
        return NextResponse.json({ error: 'Nom invalide (2 à 60 caractères).' }, { status: 400 });
      }
      employee.name = name;
    }
    if (body.photo !== undefined) {
      const photo = body.photo === null ? null : String(body.photo);
      if (photo && !photo.startsWith('data:image/')) {
        return NextResponse.json({ error: 'Format de photo invalide.' }, { status: 400 });
      }
      if (photo && photo.length > 900000) {
        return NextResponse.json({ error: 'Photo trop volumineuse (max ~600 Ko).' }, { status: 400 });
      }
      employee.photo = photo;
    }
    await writeStore('employees', employees);
    return NextResponse.json({ ok: true, employee: safeEmployee(employee) });
  }

  if (action === 'deleteNotification') {
    const id = String(body?.id || '');
    const notificationsAll = await readStore('notifications');
    const target = notificationsAll.find((n) => n.id === id);
    if (!target) {
      return NextResponse.json({ error: 'Notification introuvable.' }, { status: 404 });
    }
    if (target.target !== 'all' && target.target !== employee.matricule) {
      return NextResponse.json({ error: 'Notification non autorisée.' }, { status: 403 });
    }
    target.deletedBy = [...(target.deletedBy || []), employee.matricule];
    await writeStore('notifications', notificationsAll);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Action inconnue.' }, { status: 400 });
}
