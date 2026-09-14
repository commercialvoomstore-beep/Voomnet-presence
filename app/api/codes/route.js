import { NextResponse } from 'next/server';
import { seedIfEmpty, readStore, writeStore, requireAdmin, generateUniqueCode, pushCodeHistory } from '@/lib/db';

function serializeRegistry(employees, codes) {
  return employees.map((emp) => ({
    matricule: emp.matricule,
    name: emp.name,
    code: codes[emp.matricule]?.code || null,
    generatedAt: codes[emp.matricule]?.generatedAt || null,
  }));
}

async function getHistory(limit = 12) {
  const history = await readStore('codesHistory');
  return [...history].sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, limit);
}

// GET /api/codes — registre des codes individuels + derniers codes invalidés (admin)
export async function GET(request) {
  await seedIfEmpty();
  const admin = await requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: 'Accès administrateur requis.' }, { status: 401 });
  }
  const codes = await readStore('codes');
  const employees = await readStore('employees');
  return NextResponse.json({ registry: serializeRegistry(employees, codes), history: await getHistory() });
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

  async function rotate(matricule) {
    const emp = employees.find((e) => e.matricule === matricule);
    const old = codes[matricule]?.code;
    if (old) {
      await pushCodeHistory({ code: old, matricule, name: emp?.name || matricule, status: 'revoked' });
    }
    codes[matricule] = { code: generateUniqueCode(matricule, codes), generatedAt };
  }

  if (body?.all) {
    for (const emp of employees) {
      await rotate(emp.matricule);
    }
  } else {
    const matricule = String(body?.matricule || '').trim();
    if (!employees.some((e) => e.matricule === matricule)) {
      return NextResponse.json({ error: 'Matricule inconnu.' }, { status: 404 });
    }
    await rotate(matricule);
  }

  await writeStore('codes', codes);
  return NextResponse.json({ ok: true, registry: serializeRegistry(employees, codes), history: await getHistory() });
}
