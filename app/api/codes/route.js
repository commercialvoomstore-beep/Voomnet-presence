import { NextResponse } from 'next/server';
import { seedIfEmpty, readStore, writeStore, requireAdmin, generateCode } from '@/lib/db';

// GET /api/codes — registre des codes individuels (réservé administrateur)
export async function GET(request) {
  await seedIfEmpty();
  const admin = await requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: 'Accès administrateur requis.' }, { status: 401 });
  }
  const codes = await readStore('codes');
  const employees = await readStore('employees');
  const registry = employees.map((emp) => ({
    matricule: emp.matricule,
    name: emp.name,
    code: codes[emp.matricule]?.code || null,
    generatedAt: codes[emp.matricule]?.generatedAt || null,
  }));
  return NextResponse.json({ registry });
}

// POST /api/codes — régénération d'un code ({ matricule }) ou de tous ({ all: true })
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
    body = {};
  }

  const codes = await readStore('codes');
  const employees = await readStore('employees');
  const generatedAt = new Date().toISOString();

  if (body?.all) {
    for (const emp of employees) {
      codes[emp.matricule] = { code: generateCode(), generatedAt };
    }
  } else {
    const matricule = String(body?.matricule || '').trim();
    if (!employees.some((e) => e.matricule === matricule)) {
      return NextResponse.json({ error: 'Matricule inconnu.' }, { status: 404 });
    }
    codes[matricule] = { code: generateCode(), generatedAt };
  }

  await writeStore('codes', codes);
  const registry = employees.map((emp) => ({
    matricule: emp.matricule,
    name: emp.name,
    code: codes[emp.matricule]?.code || null,
    generatedAt: codes[emp.matricule]?.generatedAt || null,
  }));
  return NextResponse.json({ ok: true, registry });
}
