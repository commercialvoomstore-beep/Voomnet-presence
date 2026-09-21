// Amorçage côté PostgreSQL — mêmes objets qu'au premier lancement du mode fichier.
// Les comptes de démonstration restent disponibles hors production, mais leurs mots
// de passe peuvent (doivent) être fournis par variables d’environnement.

import { query, queryOne } from './client.js';
import { readStorePg, writeStorePg, isSchemaReady } from './pgsql.js';
import { DEFAULT_SETTINGS, DEFAULT_EMPLOYEES } from './defaults.js';
import { hashPassword, newSalt } from './security.js';
import { generateUniqueCode, isCurrentCodeFormat } from './codes.js';

const env = (name, fallback) => {
  const v = String(process.env[name] || '').trim();
  return v || fallback;
};

// Comptes créés au tout premier lancement, dans les deux pilotes.
// En l'absence des variables d'environnement, on retombe sur le couple de démonstration
// historiquement codé dans lib/db.js (à ne jamais conserver en production).
export function demoAdmins() {
  return [
    {
      email: env('VP_ADMIN_SUPER_EMAIL', 'admin@voomnet.ci'),
      password: env('VP_ADMIN_SUPER_PASSWORD', 'Admin@2026!'),
      role: 'super_admin',
      label: 'Super Admin',
    },
    {
      email: env('VP_ADMIN_IT_EMAIL', 'it@voomnet.ci'),
      password: env('VP_ADMIN_IT_PASSWORD', 'ItAdmin@2026!'),
      role: 'it_admin',
      label: 'Admin IT',
    },
  ];
}

async function countOf(table) {
  const row = await queryOne(`SELECT count(*)::int AS n FROM ${table}`);
  return row?.n ?? 0;
}

async function seedAdmins() {
  if (await countOf('admins')) return;
  const admins = demoAdmins().map((a) => {
    const salt = newSalt();
    return { email: a.email, role: a.role, label: a.label, salt, hash: hashPassword(a.password, salt) };
  });
  await writeStorePg('admins', admins);
}

export class SchemaMissingError extends Error {
  constructor() {
    super('Schéma PostgreSQL absent ou incomplet : lancez `npm run db:migrate`.');
    this.name = 'SchemaMissingError';
  }
}

// Appelé à chaque requête : tout est idempotent et ne coute que quelques COUNT.
export async function seedPg() {
  if (!(await isSchemaReady())) throw new SchemaMissingError();

  await seedAdmins();

  if (!(await queryOne('SELECT 1 FROM settings WHERE id = 1'))) {
    await writeStorePg('settings', DEFAULT_SETTINGS);
  }

  let employees = await readStorePg('employees');
  if (!employees.length) {
    employees = DEFAULT_EMPLOYEES.map((e) => ({ ...e, photo: null }));
    await writeStorePg('employees', employees);
  } else {
    // Migration : les anciens placeholders « Employé XXXX » basculent vers les fiches de démo
    let dirty = false;
    employees = employees.map((emp) => {
      if (/^Employé \d+$/.test(String(emp.name || ''))) {
        const ref = DEFAULT_EMPLOYEES.find((d) => d.matricule === emp.matricule);
        if (ref) {
          dirty = true;
          return { ...emp, name: ref.name, department: ref.department, registeredAt: ref.registeredAt };
        }
      }
      return emp;
    });
    if (dirty) await writeStorePg('employees', employees);
  }

  const codes = await readStorePg('codes');
  const history = await readStorePg('codesHistory');
  let dirty = false;
  for (const emp of employees) {
    const current = codes[emp.matricule] && codes[emp.matricule].code;
    if (!current || !isCurrentCodeFormat(current, emp.matricule)) {
      if (current) {
        history.push({ code: current, matricule: emp.matricule, name: emp.name, status: 'revoked', at: new Date().toISOString() });
      }
      codes[emp.matricule] = { code: generateUniqueCode(emp.matricule, codes), generatedAt: new Date().toISOString() };
      dirty = true;
    }
  }
  if (dirty) {
    await writeStorePg('codes', codes);
    await writeStorePg('codesHistory', history.slice(-60));
  }

  // Purge des sessions echues (le mode fichier la faisait à chaque connexion)
  await query('DELETE FROM sessions WHERE expires_at > 0 AND expires_at < $1', [Date.now()]);
}
