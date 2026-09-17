import { NextResponse } from 'next/server';
import {
  seedIfEmpty,
  readStore,
  writeStore,
  requireAdmin,
  generateUniqueCode,
  getSettings,
  codeExpiryFrom,
  isCodeExpired,
  newEmployeeDefaults,
  migrateEmployee,
  fullName,
  STATUTS_PRO,
  STATUTS_COMPTE,
  ROLES_EMPLOYE,
} from '@/lib/db';

// Champs modifiables via l'API (le matricule et la date de création sont immuables)
const EDITABLE = [
  'firstName', 'lastName', 'sexe', 'dateNaissance', 'lieuNaissance', 'nationalite',
  'telephone', 'email', 'adresse', 'photo',
  'poste', 'fonction', 'department', 'direction', 'responsable', 'dateEntree', 'site',
  'statutProfessionnel', 'typeContrat', 'dateDebutContrat', 'dateFinContrat',
  'periodeEssai', 'remuneration', 'modeRemuneration', 'numeroCNPS', 'referenceContrat',
  'observationsRH', 'emailPro', 'role', 'statutCompte',
];

const isIsoDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) && !Number.isNaN(Date.parse(v));
const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v || '').trim());

function validate(input, { isCreate, employees, selfMatricule = null }) {
  const errors = [];
  const clean = {};

  if (isCreate) {
    const matricule = String(input.matricule || '').trim();
    if (!/^\d{3,10}$/.test(matricule)) {
      errors.push('Matricule invalide : 3 à 10 chiffres.');
    } else if (employees.some((e) => e.matricule === matricule)) {
      errors.push(`Matricule ${matricule} déjà utilisé.`);
    } else {
      clean.matricule = matricule;
    }
  }

  for (const key of ['firstName', 'lastName']) {
    if (input[key] !== undefined || isCreate) {
      const value = String(input[key] ?? '').trim();
      if (value.length < 2 || value.length > 60) errors.push('Prénom et nom obligatoires (2 à 60 caractères).');
      else clean[key] = value;
    }
  }

  const optionalText = (key, max) => {
    if (input[key] !== undefined) {
      const value = String(input[key] ?? '').trim();
      if (value.length > max) errors.push(`Champ "${key}" trop long (max ${max} caractères).`);
      else clean[key] = value;
    }
  };
  ['lieuNaissance', 'nationalite', 'adresse', 'poste', 'fonction', 'department', 'direction',
   'responsable', 'site', 'typeContrat', 'periodeEssai', 'remuneration', 'modeRemuneration',
   'numeroCNPS', 'referenceContrat', 'observationsRH'].forEach((k) =>
    optionalText(k, k === 'observationsRH' || k === 'adresse' ? 500 : 120)
  );

  if (input.sexe !== undefined || isCreate) {
    const sexe = String(input.sexe ?? '');
    if (sexe !== '' && sexe !== 'M' && sexe !== 'F') errors.push('Sexe invalide.');
    else clean.sexe = sexe;
  }

  if (input.telephone !== undefined) {
    const telephone = String(input.telephone ?? '').trim();
    if (telephone !== '' && (telephone.length < 6 || telephone.length > 20)) {
      errors.push('Numéro de téléphone invalide.');
    } else clean.telephone = telephone;
  }

  for (const key of ['email', 'emailPro']) {
    if (input[key] !== undefined) {
      const value = String(input[key] ?? '').trim();
      if (value !== '' && !isEmail(value)) errors.push(`Adresse e-mail invalide (${key}).`);
      else clean[key] = value;
    }
  }

  for (const key of ['dateNaissance', 'dateEntree', 'dateDebutContrat', 'dateFinContrat']) {
    if (input[key] !== undefined) {
      const value = String(input[key] ?? '').trim();
      if (value !== '' && !isIsoDate(value)) errors.push(`Date invalide (${key}).`);
      else clean[key] = value;
    }
  }

  if (input.photo !== undefined) {
    const photo = input.photo === null ? null : String(input.photo);
    if (photo && !photo.startsWith('data:image/')) errors.push('Format de photo invalide.');
    else if (photo && photo.length > 900000) errors.push('Photo trop volumineuse (max ~600 Ko).');
    else clean.photo = photo;
  }

  if (input.statutProfessionnel !== undefined || isCreate) {
    const statut = String(input.statutProfessionnel ?? 'CDI');
    if (!STATUTS_PRO.includes(statut)) errors.push('Statut professionnel invalide (CDI, CDD ou STAGIAIRE).');
    else clean.statutProfessionnel = statut;
  }

  if (input.statutCompte !== undefined || isCreate) {
    const statut = String(input.statutCompte ?? 'actif');
    if (!STATUTS_COMPTE.includes(statut)) errors.push('Statut du compte invalide.');
    else clean.statutCompte = statut;
  }

  if (input.role !== undefined || isCreate) {
    const role = String(input.role ?? 'employee');
    if (!ROLES_EMPLOYE.includes(role)) errors.push('Rôle invalide.');
    else clean.role = role;
  }

  // Cohérence contractuelle : un CDD exige une période début/fin valide
  const merged = isCreate
    ? { ...newEmployeeDefaults(), ...clean }
    : { ...employees.find((e) => e.matricule === selfMatricule), ...clean };
  if (merged.statutProfessionnel === 'CDD') {
    if (!merged.dateDebutContrat || !merged.dateFinContrat) {
      errors.push('Un contrat CDD exige une date de début et une date de fin.');
    } else if (merged.dateFinContrat <= merged.dateDebutContrat) {
      errors.push('La date de fin du CDD doit être postérieure à la date de début.');
    }
  }
  if (merged.statutProfessionnel === 'STAGIAIRE' && merged.dateDebutContrat && merged.dateFinContrat) {
    if (merged.dateFinContrat <= merged.dateDebutContrat) {
      errors.push('La date de fin du stage doit être postérieure à la date de début.');
    }
  }

  return { errors, clean };
}

// GET /api/employees — registre RH complet + codes d'accès (réservé administrateur)
export async function GET(request) {
  await seedIfEmpty();
  const admin = await requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: 'Accès administrateur requis.' }, { status: 401 });
  }
  const employees = await readStore('employees');
  const codes = await readStore('codes');
  const codesHistory = [...(await readStore('codesHistory'))].sort((a, b) =>
    (a.at < b.at ? 1 : -1)
  );
  const rows = employees.map((emp) => {
    const entry = codes[emp.matricule] || null;
    return {
      ...emp,
      name: fullName(emp),
      accessCode: entry?.code || null,
      codeGeneratedAt: entry?.generatedAt || null,
      codeExpiresAt: entry?.expiresAt || null,
      codeStatus: !entry ? 'none' : isCodeExpired(entry) ? 'expired' : 'available',
    };
  });
  return NextResponse.json({ employees: rows, codesHistory });
}

// POST /api/employees — création d'un employé + génération de son code d'accès
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

  const employees = await readStore('employees');
  const { errors, clean } = validate(body || {}, { isCreate: true, employees });
  if (errors.length > 0) {
    return NextResponse.json({ error: errors[0], errors }, { status: 400 });
  }

  const employee = {
    ...newEmployeeDefaults(),
    ...clean,
    name: '',
    createdAt: new Date().toISOString(),
    lastLoginAt: null,
  };
  employee.name = fullName(employee);
  employees.push(employee);
  await writeStore('employees', employees);

  const codes = await readStore('codes');
  const genAt = new Date().toISOString();
  codes[employee.matricule] = {
    code: generateUniqueCode(employee.matricule, codes),
    generatedAt: genAt,
    expiresAt: codeExpiryFrom(await getSettings(), genAt),
  };
  await writeStore('codes', codes);

  return NextResponse.json({
    ok: true,
    employee: { ...employee, accessCode: codes[employee.matricule].code },
    accessCode: codes[employee.matricule].code,
  });
}

// PATCH /api/employees — modification d'une fiche ({ matricule, patch })
export async function PATCH(request) {
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

  const matricule = String(body?.matricule || '').trim();
  const patch = body?.patch && typeof body.patch === 'object' ? body.patch : null;
  if (!matricule || !patch) {
    return NextResponse.json({ error: 'Matricule et modifications requis.' }, { status: 400 });
  }

  const employees = await readStore('employees');
  const employee = employees.find((e) => e.matricule === matricule);
  if (!employee) {
    return NextResponse.json({ error: 'Employé introuvable.' }, { status: 404 });
  }

  const filtered = {};
  for (const key of EDITABLE) {
    if (patch[key] !== undefined) filtered[key] = patch[key];
  }
  const { errors, clean } = validate(filtered, { isCreate: false, employees, selfMatricule: matricule });
  if (errors.length > 0) {
    return NextResponse.json({ error: errors[0], errors }, { status: 400 });
  }

  Object.assign(employee, migrateEmployee({ ...employee, ...clean }));
  await writeStore('employees', employees);

  const codes = await readStore('codes');
  return NextResponse.json({
    ok: true,
    employee: {
      ...employee,
      name: fullName(employee),
      accessCode: codes[employee.matricule]?.code || null,
      codeGeneratedAt: codes[employee.matricule]?.generatedAt || null,
    },
  });
}
