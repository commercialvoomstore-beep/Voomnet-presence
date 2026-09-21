#!/usr/bin/env node
// Importe le stockage local (data/*.json) dans PostgreSQL/Neon.
//   node scripts/db-import.mjs --dry-run   comparer sans rien écrire
//   node scripts/db-import.mjs             importer (remplace le contenu des tables)
//   node scripts/db-import.mjs --only=attendance,codes
//
// L'import est un remplacement complet : les tables sont videes puis rechargementes
// dans un ordre compatible avec les clés étrangères.

import { closePool, databaseUrl, queryOne } from '../lib/store/client.js';
import { readStoreJson } from '../lib/store/json.js';
import { writeStorePg, isSchemaReady } from '../lib/store/pgsql.js';

const flags = process.argv.slice(2);
const DRY = flags.includes('--dry-run');

// Ordre imposé par les références (attendance et codes pointent sur employees).
const ORDER = [
  { store: 'settings', table: 'settings', label: 'paramètres de présence' },
  { store: 'admins', table: 'admins', label: 'comptes administrateurs' },
  { store: 'employees', table: 'employees', label: 'fiches employés' },
  { store: 'attendance', table: 'attendance', label: 'pointages' },
  { store: 'codes', table: 'access_codes', label: 'codes d’accès' },
  { store: 'codesHistory', table: 'code_events', label: 'journal des codes' },
  { store: 'sessions', table: 'sessions', label: 'sessions ouvertes' },
  { store: 'notifications', table: 'notifications', label: 'notifications' },
];

const only = flags.find((f) => f.startsWith('--only='));
const wanted = only ? new Set(only.slice('--only='.length).split(',').map((s) => s.trim())) : null;

function sizeOf(store, data) {
  if (store === 'settings') return Object.keys(data || {}).length ? 1 : 0;
  if (Array.isArray(data)) return data.length;
  return Object.keys(data || {}).length;
}

async function count(table) {
  const row = await queryOne(`SELECT count(*)::int AS n FROM ${table}`);
  return row?.n ?? 0;
}

async function main() {
  if (!databaseUrl()) {
    console.error('DATABASE_URL absent : import impossible (on est en mode fichier).');
    process.exit(2);
  }
  if (!(await isSchemaReady())) {
    console.error('Schéma absent ou incomplet : lancez d’abord `npm run db:migrate`.');
    process.exit(2);
  }

  const label = DRY ? '[simulation]' : '[import]';
  console.log(`base : ${databaseUrl().replace(/:[^:@/]*@/, ':****@')}  ${label}\n`);

  let imported = 0;
  for (const item of ORDER) {
    if (wanted && !wanted.has(item.store)) continue;
    const data = await readStoreJson(item.store);
    const from = sizeOf(item.store, data);
    const before = (await count(item.table));

    if (DRY) {
      console.log(
        `  ${item.store.padEnd(14)} ${String(from).padStart(5)} en local  ` +
          `| ${String(before).padStart(5)} en base  ${before ? '(sera remplacé)' : ''}`
      );
      continue;
    }

    await writeStorePg(item.store, data);
    const after = await count(item.table);
    imported += after;
    const warn = after < from ? `  ! ${from - after} ligne(s) écartée(s) (référence inconnue ou forme invalide)` : '';
    console.log(`  ${item.store.padEnd(14)} ${String(from).padStart(5)} lu  ->  ${String(after).padStart(5)} écrit ${warn}`);
  }

  if (!DRY) console.log(`\n  ${imported} ligne(s) en base après import.`);
  await closePool();
}

main().catch((err) => {
  console.error('db-import :', err.message);
  process.exit(1);
});
