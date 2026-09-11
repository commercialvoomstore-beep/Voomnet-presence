import { NextResponse } from 'next/server';
import { seedIfEmpty, verifyAdmin, createSession } from '@/lib/db';

// POST /api/auth/admin — connexion administrateur (email + mot de passe)
export async function POST(request) {
  try {
    await seedIfEmpty();
    const body = await request.json();
    const { email, password } = body || {};
    if (!email || !password) {
      return NextResponse.json({ error: 'Email et mot de passe requis.' }, { status: 400 });
    }
    const admin = await verifyAdmin(email, password);
    if (!admin) {
      return NextResponse.json({ error: 'Identifiants administrateur invalides.' }, { status: 401 });
    }
    const token = await createSession('admin');
    return NextResponse.json({ token, role: admin.role, label: admin.label, email: admin.email });
  } catch {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 });
  }
}
