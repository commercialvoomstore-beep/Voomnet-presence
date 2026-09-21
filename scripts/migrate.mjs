#!/usr/bin/env node
// Migrateur SQL minimal pour db/migrations/*.sql.
//   node scripts/migrate.mjs              appliquer les migrations en attente
//   node scripts/migrate.mjs --dry-run    afficher sans ecrire
//   node scripts/migrate.mjs --status     état appliqué / en attente
//
// Chaque fichier est appliqué dans sa transaction et enregistré dans vp_migrations
// avec une empreinte sha256, pour signaler une modification a posteriori.

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { query, queryOne, exec, transaction, closePool, databaseUrl } from '../lib/store/client.js';

const flags = new Set(process.argv.slice(2));
const DRY = flags.has('--dry-run');
const STATUS = flags.has('--status');
const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'db', 'migrations');

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, 16);
}

async function main() {
  const url = databaseUrl();
  if (!url) {
    console.error('DATABASE_URL est vide : rien à migrer (mode fichier JSON).');
    console.error('Renseignez la chaîne de connexion Neon dans .env.local puis relancez.');
    process.exit(2);
  }
  console.log(`base : ${url.replace(/:[^:@/]*@/, ':****@')}${DRY ? '  [simulation]' : ''}`);

  await query(`CREATE TABLE IF NOT EXISTS vp_migrations (
    version    text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now(),
    checksum   text
  )`);

  const applied = new Map(
    (await query('SELECT version, checksum, applied_at FROM vp_migrations ORDER BY version')).map((r) => [r.version, r])
  );

  const files = (await fs.readdir(DIR)).filter((f) => f.endsWith('.sql')).sort();
  let pending = 0;

  for (const file of files) {
    const sql = await fs.readFile(path.join(DIR, file), 'utf8');
    const sum = sha256(sql);
    const prev = applied.get(file);

    if (prev) {
      const drift = prev.checksum && prev.checksum !== sum;
      console.log(
        `  ${drift ? '!' : '✓'} ${file}  appliqué ${new Date(prev.applied_at).toISOString().slice(0, 10)}` +
          (drift ? '   ATTENTION : contenu modifié après application' : '')
      );
      continue;
    }

    pending += 1;
    if (STATUS) continue;

    if (DRY) {
      console.log(`  · ${file}  en attente (${sql.split(';').filter((s) => s.trim()).length} ordres)`);
      continue;
    }

    try {
      await transaction(async (tx) => {
        await tx.exec(sql);
        await tx.exec('INSERT INTO vp_migrations (version, checksum) VALUES ($1, $2)', [file, sum]);
      });
      console.log(`  + ${file}  appliqué`);
    } catch (err) {
      console.error(`  x ${file}  échec : ${err.message}`);
      process.exitCode = 1;
      break;
    }
  }

  if (STATUS) console.log(`  ${pending} migration(s) en attente`);
  else if (!pending && !DRY) console.log('  rien à faire : schéma à jour');

  await closePool();
}

main().catch((err) => {
  console.error('migrate :', err.message);
  process.exit(1);
});
