import { NextResponse } from 'next/server';
import { seedIfEmpty, readStore, writeStore, createSession, generateUniqueCode, pushCodeHistory } from '@/lib/db';

// POST /api/auth/employee — connexion employé (matricule 3CX + code personnel à usage unique)
// Format des codes : 3CX-{matricule}-{suffixe} (ex. 3CX-1009-589)
export async function POST(request) {
  try {
    await seedIfEmpty();
    const body = await request.json();
    const employeeId = String(body?.employeeId || '').trim();
    const code = String(body?.code || '').trim().toUpperCase();
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

    // Workflow officiel : consommation du code (historisé) puis régénération automatique
    await pushCodeHistory({ code: entry.code, matricule: employeeId, name: employee.name, status: 'used' });
    codes[employeeId] = { code: generateUniqueCode(employeeId, codes), generatedAt: new Date().toISOString() };
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
