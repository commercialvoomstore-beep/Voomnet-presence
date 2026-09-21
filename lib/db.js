// Couche de persistance du prototype.
//
// Deux pilotes interchangeables derrière la même interface :
//   • 'json'     — fichiers dans data/ (aucun serveur requis, comportement d'origine)
//   • 'postgres' — Neon / toute base PostgreSQL, dès que DATABASE_URL est défini
//
// Les routes ignorent le pilote : elles lisent et remplacent des collections
// entières via readStore/writeStore. Les fichiers lib/store/* portent l'implémentation.

import {
  exists,
  pathOf,
  readJson,
  writeJson,
} from './store/json.js';
import { pgEnabled } from './store/client.js';
import { readStorePg, writeStorePg } from './store/pgsql.js';
import { seedPg } from './store/seed.js';
import { DEFAULT_SETTINGS, DEFAULT_EMPLOYEES } from './store/defaults.js';
import { generateToken, hashPassword, newSalt, verifyHash } from './store/security.js';
import { generateCode, generateUniqueCode, isCurrentCodeFormat } from './store/codes.js';

export { DEFAULT_SETTINGS, DEFAULT_EMPLOYEES };
export { generateCode, isCurrentCodeFormat, generateUniqueCode, generateToken };

// Pilote de stockage réellement actif (utile aux scripts et au diagnostic).
export function storageDriver() {
  return pgEnabled() ? 'postgres' : 'json';
}

export async function pushCodeHistory(entry) {
  const history = await readStore('codesHistory');
  history.push({ ...entry, at: new Date().toISOString() });
  await writeStore('codesHistory', history.slice(-60));
}

// Amorçage au premier lancement : comptes admin, employés, codes, paramètres
export async function seedIfEmpty() {
  if (pgEnabled()) return seedPg();

  const adminsPath = await pathOf('admins');
  if (!(await exists(adminsPath))) {
    const demo = [
      { email: 'admin@voomnet.ci', password: 'Admin@2026!', role: 'super_admin', label: 'Super Admin' },
      { email: 'it@voomnet.ci', password: 'ItAdmin@2026!', role: 'it_admin', label: 'Admin IT' },
    ];
    const admins = demo.map((a) => {
      const salt = newSalt();
      return { email: a.email, role: a.role, label: a.label, salt, hash: hashPassword(a.password, salt) };
    });
    await writeJson(adminsPath, admins);
  }

  const employeesPath = await pathOf('employees');
  let employees = await readJson(employeesPath, null);
  if (!employees) {
    employees = DEFAULT_EMPLOYEES.map((e) => ({ ...e, photo: null }));
    await writeJson(employeesPath, employees);
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
    if (dirty) await writeJson(employeesPath, employees);
  }

  const codesPath = await pathOf('codes');
  let codes = await readJson(codesPath, null);
  if (!codes) {
    codes = {};
    for (const emp of employees) {
      codes[emp.matricule] = { code: generateUniqueCode(emp.matricule, codes), generatedAt: new Date().toISOString() };
    }
    await writeJson(codesPath, codes);
  } else {
    // Garantir l'existence d'un code pour tout employé ajouté localement
    let dirty = false;
    for (const emp of employees) {
      if (!codes[emp.matricule]) {
        codes[emp.matricule] = { code: generateUniqueCode(emp.matricule, codes), generatedAt: new Date().toISOString() };
        dirty = true;
      }
    }
    // Migration : anciens codes à 6 chiffres -> format 3CX-{matricule}-{suffixe}
    for (const emp of employees) {
      const cur = codes[emp.matricule] && codes[emp.matricule].code;
      if (!isCurrentCodeFormat(cur, emp.matricule)) {
        await pushCodeHistory({ code: cur, matricule: emp.matricule, name: emp.name, status: 'revoked' });
        codes[emp.matricule] = { code: generateUniqueCode(emp.matricule, codes), generatedAt: new Date().toISOString() };
        dirty = true;
      }
    }
    if (dirty) await writeJson(codesPath, codes);
  }

  const settingsPath = await pathOf('settings');
  if (!(await exists(settingsPath))) {
    await writeJson(settingsPath, DEFAULT_SETTINGS);
  }

  for (const name of ['sessions', 'notifications', 'codesHistory']) {
    const p = await pathOf(name);
    if (!(await exists(p))) await writeJson(p, []);
  }

  const attendancePath = await pathOf('attendance');
  if (!(await exists(attendancePath))) {
    await writeJson(attendancePath, {});
  }
}

// Normalise un pointage journalier (compatibilité avec les données existantes sans pauses)
export function normalizeRecord(record) {
  if (!record || typeof record !== 'object') return { arrival: null, departure: null, pauses: [] };
  if (!Array.isArray(record.pauses)) record.pauses = [];
  if (!('arrival' in record)) record.arrival = null;
  if (!('departure' in record)) record.departure = null;
  return record;
}

export async function readStore(name) {
  if (pgEnabled()) return readStorePg(name);
  const p = await pathOf(name);
  const fallback = name === 'attendance' || name === 'codes' ? {} : [];
  return readJson(p, fallback);
}

// Remplacement complet d'une collection (une seule transaction en mode PostgreSQL).
export async function writeStore(name, data) {
  if (pgEnabled()) return writeStorePg(name, data);
  const p = await pathOf(name);
  await writeJson(p, data);
}

export async function getSettings() {
  const settings = await readStore('settings');
  return { ...DEFAULT_SETTINGS, ...settings };
}

export async function verifyAdmin(email, password) {
  const admins = await readStore('admins');
  const admin = admins.find((a) => a.email === String(email).trim().toLowerCase());
  if (!admin) return null;
  return verifyHash(password, admin.salt, admin.hash) ? admin : null;
}

// Sessions à durée limitée (12 h) — prototype ; production : JWT access/refresh
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export async function createSession(role, employeeId = null) {
  const sessions = await readStore('sessions');
  const token = generateToken();
  const now = Date.now();
  sessions.push({ token, role, employeeId, createdAt: now, expiresAt: now + SESSION_TTL_MS });
  await writeStore('sessions', sessions.filter((s) => s.expiresAt > now));
  return token;
}

export async function getSession(token) {
  if (!token) return null;
  const sessions = await readStore('sessions');
  const session = sessions.find((s) => s.token === token && s.expiresAt > Date.now());
  return session || null;
}

export async function destroySession(token) {
  const sessions = await readStore('sessions');
  await writeStore('sessions', sessions.filter((s) => s.token !== token));
}

// Jeton administrateur transmis via l'en-tête x-admin-token
export async function requireAdmin(request) {
  const session = await getSession(request.headers.get('x-admin-token'));
  return session && session.role === 'admin' ? session : null;
}

// Jeton employé transmis via l'en-tête x-session-token
export async function requireEmployee(request) {
  const session = await getSession(request.headers.get('x-session-token'));
  return session && session.role === 'employee' ? session : null;
}
