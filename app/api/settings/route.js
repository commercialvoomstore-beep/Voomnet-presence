import { NextResponse } from 'next/server';
import { seedIfEmpty, getSettings, readStore, writeStore, requireAdmin } from '@/lib/db';
import { isValidHHMM } from '@/lib/rules';

// GET /api/settings — règles horaires (lecture publique, données non sensibles)
export async function GET() {
  await seedIfEmpty();
  const settings = await getSettings();
  return NextResponse.json({ settings });
}

// POST /api/settings — mise à jour des règles horaires (réservé administrateur)
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

  const current = await getSettings();
  const next = { ...current };

  if (body?.arrivalTime !== undefined) {
    if (!isValidHHMM(body.arrivalTime)) {
      return NextResponse.json({ error: "Heure d'arrivée invalide (HH:MM)." }, { status: 400 });
    }
    next.arrivalTime = body.arrivalTime;
  }
  if (body?.departureTime !== undefined) {
    if (!isValidHHMM(body.departureTime)) {
      return NextResponse.json({ error: 'Heure de départ invalide (HH:MM).' }, { status: 400 });
    }
    next.departureTime = body.departureTime;
  }
  if (body?.toleranceMinutes !== undefined) {
    const tolerance = Number(body.toleranceMinutes);
    if (!Number.isInteger(tolerance) || tolerance < 0 || tolerance > 120) {
      return NextResponse.json({ error: 'Tolérance invalide (0 à 120 minutes).' }, { status: 400 });
    }
    next.toleranceMinutes = tolerance;
  }
  if (body?.workdays !== undefined) {
    const workdays = body.workdays;
    const valid =
      Array.isArray(workdays) &&
      workdays.every((d) => Number.isInteger(d) && d >= 0 && d <= 6) &&
      new Set(workdays).size === workdays.length;
    if (!valid || workdays.length === 0) {
      return NextResponse.json({ error: 'Jours ouvrés invalides.' }, { status: 400 });
    }
    next.workdays = [...workdays].sort((a, b) => a - b);
  }

  next.timezone = 'Africa/Abidjan'; // fuseau fixe du prototype
  await writeStore('settings', next);
  return NextResponse.json({ ok: true, settings: next });
}
