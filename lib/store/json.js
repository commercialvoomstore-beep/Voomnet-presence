// Stockage local de démonstration — fichiers JSON dans data/ (exclu de Git).
// Déplacé tel quel depuis lib/db.js pour que le mode PostgreSQL et le mode
// fichier partagent la même interface (readStore / writeStore).

import fs from 'fs/promises';
import path from 'path';

export const DATA_DIR = path.join(process.cwd(), 'data');

export const FILES = {
  admins: 'admins.json',
  employees: 'employees.json',
  codes: 'codes.json',
  sessions: 'sessions.json',
  settings: 'settings.json',
  attendance: 'attendance.json',
  notifications: 'notifications.json',
  codesHistory: 'codesHistory.json',
};

export async function pathOf(name) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  return path.join(DATA_DIR, FILES[name]);
}

export async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

export async function writeJson(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await writeJsonAtomic(filePath, data);
}

async function writeJsonAtomic(filePath, data) {
  const tmp = `${filePath}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
  await fs.rename(tmp, filePath); // remplacement atomique : jamais de fichier à demi écrit
}

// Valeur par défaut d'un store absent (cartes = objets, listes = tableaux)
export function emptyValue(name) {
  return name === 'attendance' || name === 'codes' || name === 'settings' ? {} : [];
}

export async function readStoreJson(name) {
  const p = await pathOf(name);
  return readJson(p, emptyValue(name));
}

export async function writeStoreJson(name, data) {
  const p = await pathOf(name);
  await writeJson(p, data);
}
