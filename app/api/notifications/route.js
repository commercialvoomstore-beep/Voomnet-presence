import { NextResponse } from 'next/server';
import { seedIfEmpty, readStore, writeStore, requireAdmin } from '@/lib/db';

// GET /api/notifications — historique des envois (réservé administrateur)
export async function GET(request) {
  await seedIfEmpty();
  const admin = await requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: 'Accès administrateur requis.' }, { status: 401 });
  }
  const notifications = await readStore('notifications');
  return NextResponse.json({
    notifications: [...notifications].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 30),
  });
}

// POST /api/notifications — envoi ciblé : toute l'équipe ({ target: "all" }) ou un employé ({ target: "1009" })
export async function POST(request) {
  await seedIfEmpty();
  const admin = await requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: 'Accès administrateur requis.' }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 });
  }

  const target = String(body?.target || '').trim();
  const message = String(body?.message || '').trim();
  if (!message || message.length > 500) {
    return NextResponse.json({ error: 'Message vide ou trop long (500 caractères max).' }, { status: 400 });
  }
  if (target !== 'all') {
    const employees = await readStore('employees');
    if (!employees.some((e) => e.matricule === target)) {
      return NextResponse.json({ error: 'Cible inconnue.' }, { status: 404 });
    }
  }

  const notifications = await readStore('notifications');
  const item = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    target,
    message,
    createdAt: new Date().toISOString(),
    deletedBy: [],
  };
  notifications.push(item);
  await writeStore('notifications', notifications);

  return NextResponse.json({ ok: true, notification: item });
}
