import { NextResponse } from 'next/server';
import { seedIfEmpty, readStore, writeStore, createSession, generateCode } from '@/lib/db';

// POST /api/auth/employee — connexion employé (matricule 3CX + code personnel à usage unique)
export async function POST(request) {
  try {
    await seedIfEmpty();
    const body = await request.json();
    const employeeId = String(body?.employeeId || '').trim();
    const code = String(body?.code || '').trim();
    if (!employeeId || !code) {
      return NextResponse.json({ error: 'Matricule et code requis.' }, { status: 400 });
    }

    const employees = await readStore('employees');
    const employee = employees.find((e) => e.matricule === employeeId);
    if (!employee) {
      return NextResponse.json({ error: 'Matricule inconnu.' }, { status: 401 });
    }

    const codes = await readStore('codes');
    const entry = codes[employeeId];
    if (!entry || entry.code !== code) {
      return NextResponse.json({ error: 'Code invalide ou déjà consommé.' }, { status: 401 });
    }

    // Workflow officiel : consommation du code puis régénération automatique
    codes[employeeId] = { code: generateCode(), generatedAt: new Date().toISOString() };
    await writeStore('codes', codes);

    const sessionToken = await createSession('employee', employeeId);

    return NextResponse.json({
      sessionToken,
      employee: {
        matricule: employee.matricule,
        name: employee.name,
        department: employee.department,
        registeredAt: employee.registeredAt,
        photo: employee.photo,
      },
    });
  } catch {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 });
  }
}
