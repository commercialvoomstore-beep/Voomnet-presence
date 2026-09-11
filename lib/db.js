// Stockage local de démonstration — fichiers JSON dans data/ (exclu de Git).
// Production prévue : PostgreSQL + Drizzle ORM (voir README, section Passage en production).

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const DATA_DIR = path.join(process.cwd(), 'data');

const FILES = {
  admins: 'admins.json',
  employees: 'employees.json',
  codes: 'codes.json',
  sessions: 'sessions.json',
  settings: 'settings.json',
  attendance: 'attendance.json',
  notifications: 'notifications.json',
};

export const DEFAULT_SETTINGS = {
  arrivalTime: '08:00',
  toleranceMinutes: 15,
  departureTime: '17:00',
  workdays: [1, 2, 3, 4, 5],
  timezone: 'Africa/Abidjan',
};

function hashPassword(password, salt) {
  return crypto.scryptSync(String(password), salt, 64).toString('hex');
}

export function generateCode() {
  return String(crypto.randomInt(100000, 1000000));
}

export function generateToken() {
  return crypto.randomBytes(24).toString('hex');
}

async function pathOf(name) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  return path.join(DATA_DIR, FILES[name]);
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

async function writeJson(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
}

// Amorçage au premier lancement : comptes admin, employés, codes, paramètres
export async function seedIfEmpty() {
  const adminsPath = await pathOf('admins');
  if (!(await exists(adminsPath))) {
    const demo = [
      { email: 'admin@voomnet.ci', password: 'Admin@2026!', role: 'super_admin', label: 'Super Admin' },
      { email: 'it@voomnet.ci', password: 'ItAdmin@2026!', role: 'it_admin', label: 'Admin IT' },
    ];
    const admins = demo.map((a) => {
      const salt = crypto.randomBytes(16).toString('hex');
      return { email: a.email, role: a.role, label: a.label, salt, hash: hashPassword(a.password, salt) };
    });
    await writeJson(adminsPath, admins);
  }

  const employeesPath = await pathOf('employees');
  let employees = await readJson(employeesPath, null);
  if (!employees) {
    // Noms placeholder modifiables dans l'espace employé — aucune donnée personnelle réelle en dur.
    employees = ['1009', '1000', '1004'].map((m) => ({
      matricule: m,
      name: `Employé ${m}`,
      department: 'Non renseigné',
      registeredAt: 'Non renseignée',
      photo: null,
    }));
    await writeJson(employeesPath, employees);
  }

  const codesPath = await pathOf('codes');
  let codes = await readJson(codesPath, null);
  if (!codes) {
    codes = {};
    for (const emp of employees) {
      codes[emp.matricule] = { code: generateCode(), generatedAt: new Date().toISOString() };
    }
    await writeJson(codesPath, codes);
  } else {
    // Garantir l'existence d'un code pour tout employé ajouté localement
    let dirty = false;
    for (const emp of employees) {
      if (!codes[emp.matricule]) {
        codes[emp.matricule] = { code: generateCode(), generatedAt: new Date().toISOString() };
        dirty = true;
      }
    }
    if (dirty) await writeJson(codesPath, codes);
  }

  const settingsPath = await pathOf('settings');
  if (!(await exists(settingsPath))) {
    await writeJson(settingsPath, DEFAULT_SETTINGS);
  }

  for (const name of ['sessions', 'notifications']) {
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
  const p = await pathOf(name);
  const fallback = name === 'attendance' || name === 'codes' ? {} : [];
  return readJson(p, fallback);
}

export async function writeStore(name, data) {
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
  const candidate = hashPassword(password, admin.salt);
  const ok =
    candidate.length === admin.hash.length &&
    crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(admin.hash));
  return ok ? admin : null;
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
