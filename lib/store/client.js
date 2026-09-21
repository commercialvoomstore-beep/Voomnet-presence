// Client PostgreSQL — Neon (ou toute instance PG compatible).
// La base est active dès que DATABASE_URL est défini ; sans cette variable,
// l'application reste sur son stockage local data/*.json (mode démonstration).
//
// Choix du pilote : `pg` + Pool (TCP). Pour Neon, utiliser l'URL **poolée**
// (hôte `*-pooler.*`, port 5432 ou 6432) en environnement sans-connexion
// persistante ; les requêtes sont envoyées en mode simple (pas de prepared
// statements nommés), donc le pooling transactionnel de PgBouncer est compatible.

import { Pool } from 'pg';

// Survit au rechargement à chaud de Next.js (un seul pool par processus).
const holder = globalThis.__vpPgPool ? globalThis : {};

export function databaseUrl() {
  return String(process.env.DATABASE_URL || '').trim();
}

export function pgEnabled() {
  return databaseUrl().length > 0;
}

// TLS : `sslmode` de l'URL fait foi, `DB_SSL` le force. Hôte Neon => TLS imposé.
function resolveSsl(url) {
  const forced = String(process.env.DB_SSL || '').trim().toLowerCase();
  if (['disable', 'false', 'off'].includes(forced)) return false;
  if (['no-verify', 'allow'].includes(forced)) return { rejectUnauthorized: false };
  if (['require', 'verify-full', 'true'].includes(forced)) return { rejectUnauthorized: true };

  let mode = '';
  let host = '';
  try {
    const u = new URL(url);
    mode = (u.searchParams.get('sslmode') || '').toLowerCase();
    host = u.hostname;
  } catch {
    return { rejectUnauthorized: true }; // URL opaque (style DSN) : on securise par defaut
  }
  if (mode === 'disable') return false;
  if (mode === 'no-verify') return { rejectUnauthorized: false };
  if (/(^|\.)neon\.(tech|run)$/.test(host.split('.').slice(-2).join('.')) || /\.neon\.(tech|run)$/.test(host)) {
    return { rejectUnauthorized: true };
  }
  return mode ? { rejectUnauthorized: mode !== 'require' } : false;
}

function num(name, fallback) {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

export function getPool() {
  if (!holder.__vpPgPool) {
    const url = databaseUrl();
    if (!url) throw new Error('DATABASE_URL absent : mode PostgreSQL desactive.');
    holder.__vpPgPool = new Pool({
      connectionString: url,
      ssl: resolveSsl(url),
      max: num('DATABASE_POOL_MAX', 10),
      idleTimeoutMillis: num('DB_IDLE_TIMEOUT_MS', 30000),
      connectionTimeoutMillis: num('DB_CONNECT_TIMEOUT_MS', 10000),
      query_timeout: num('DB_QUERY_TIMEOUT_MS', 15000),
      application_name: String(process.env.DB_APP_NAME || 'voomnet-presence'),
    });
    // Un client oisif qui casse ne doit pas emporter le processus Node.
    holder.__vpPgPool.on('error', (err) => {
      console.error('[voomnet:db] erreur de client oisif:', err.message);
    });
  }
  return holder.__vpPgPool;
}

// Conventions de retour — identiques hors et dans une transaction :
//   raw()      -> résultat pg complet (rows, rowCount, fields)
//   query()    -> rows
//   queryOne() -> première ligne ou null
//   exec()     -> rowCount
function apiFor(client) {
  return {
    raw: (text, params) => client.query(text, params),
    query: async (text, params) => (await client.query(text, params)).rows,
    queryOne: async (text, params) => (await client.query(text, params)).rows[0] ?? null,
    exec: async (text, params) => (await client.query(text, params)).rowCount,
  };
}

const poolApi = {
  raw: (text, params) => getPool().query(text, params),
  query: async (text, params) => (await getPool().query(text, params)).rows,
  queryOne: async (text, params) => (await getPool().query(text, params)).rows[0] ?? null,
  exec: async (text, params) => (await getPool().query(text, params)).rowCount,
};

export const raw = poolApi.raw;
export const query = poolApi.query;
export const queryOne = poolApi.queryOne;
export const exec = poolApi.exec;

// Execute fn dans une transaction ; `tx` est lie à la même connexion.
export async function transaction(fn) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const out = await fn(apiFor(client));
    await client.query('COMMIT');
    return out;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* connexion deja morte */
    }
    throw err;
  } finally {
    client.release();
  }
}

export async function closePool() {
  if (holder.__vpPgPool) {
    await holder.__vpPgPool.end();
    holder.__vpPgPool = null;
  }
}

// État de la connexion (script de diagnostic `npm run db:status`).
export async function describeDatabase() {
  const info = await queryOne(
    `select current_database() as database,
            current_setting('server_version') as version,
            coalesce(nullif(current_setting('search_path'), ''), '$user, public') as search_path,
            pg_backend_pid() as pid`
  );
  const tables = await poolApi.query(
    `select table_name as name,
            (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
              where n.nspname = 'public' and c.relname = t.table_name) as present,
            pg_size_pretty(pg_total_relation_size(format('public.%I', t.table_name)::regclass)) as size
       from information_schema.tables t
      where table_schema = 'public' and table_type = 'BASE TABLE'
      order by table_name`
  );
  return { ...info, tables };
}
