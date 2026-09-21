#!/usr/bin/env node
// État de la base : connexion, tables, volumetrie, migrations, et écart avec le
// stockage local data/*.json. Sortie machine-lisible avec --json.
//   node scripts/db-status.mjs [--json]

import { closePool, databaseUrl, describeDatabase, query, queryOne } from '../lib/store/client.js';
import { readStoreJson } from '../lib/store/json.js';

const TABLES = {
  employees: 'employees',
  attendance: 'attendance',
  codes: 'access_codes',
  codesHistory: 'code_events',
  sessions: 'sessions',
  notifications: 'notifications',
  admins: 'admins',
  settings: 'settings',
};

// settings est une ligne unique, les autres stores sont des collections
const sizeOf = (store, v) => {
  if (store === 'settings') return v && typeof v === 'object' && Object.keys(v).length ? 1 : 0;
  if (Array.isArray(v)) return v.length;
  return v && typeof v === 'object' ? Object.keys(v).length : 0;
};

async function main() {
  const url = databaseUrl();
  if (!url) {
    console.log(JSON.stringify({ driver: 'json', note: 'DATABASE_URL absent : stockage fichier data/*.json' }));
    return;
  }

  const info = await describeDatabase();
  let applied = [];
  try {
    applied = await query('SELECT version, applied_at FROM vp_migrations ORDER BY version');
  } catch {
    /* table vp_migrations absente : schéma non installé */
  }

  const rows = {};
  for (const [store, table] of Object.entries(TABLES)) {
    if (!info.tables.some((t) => t.name === table)) {
      rows[store] = { pg: null, json: sizeOf(store, await readStoreJson(store)) };
      continue;
    }
    const n = (await queryOne(`SELECT count(*)::int AS n FROM ${table}`))?.n ?? 0;
    rows[store] = { pg: n, json: sizeOf(store, await readStoreJson(store)) };
  }

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ driver: 'postgres', ...info, migrations: applied.map((a) => a.version), rows }, null, 2));
  } else {
    console.log(`base      ${info.database}  (PostgreSQL ${info.version})`);
    console.log(`hote      ${url.replace(/^postgres(?:ql)?:\/\//, '').split('?')[0].replace(/:[^:@/]*@/, ':****@')}`);
    console.log(`migrations ${applied.length ? applied.map((a) => `${a.version} (${String(a.applied_at).slice(0, 10)})`).join(', ') : 'aucune'}`);
    console.log('\nstore            base   data/*.json');
    for (const [store, r] of Object.entries(rows)) {
      const flag = r.pg === null ? '  table absente — lancer npm run db:migrate' : r.pg !== r.json ? '  ← écart' : '';
      console.log(`  ${store.padEnd(14)} ${String(r.pg ?? '—').padStart(5)}   ${String(r.json).padStart(5)}${flag}`);
    }
    console.log('\ntailles');
    for (const t of info.tables) console.log(`  ${t.name.padEnd(14)} ${t.size}`);
  }

  await closePool();
}

main().catch((err) => {
  console.error('db-status :', err.message);
  process.exit(1);
});
