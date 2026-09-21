// Adaptateur PostgreSQL (Neon) pour les mêmes « stores » que le mode fichier.
//
// Contrat volontairement identique à lib/store/json.js : readStore(name) renvoie
// la collection entière (tableau ou objet) et writeStore(name, data) la remplace,
// afin qu'aucune route existante n'ait être reecrite. Les champs qui comptent
// pour les requêtes (matricule, date, statut, jeton) sont en colonnes relationnelles
// indexées ; le reste de la fiche est gardé en jsonb `data`.
//
// Phase 2 envisageable : requêtes ciblées (matricule + plage de dates) au lieu du
// chargement intégral, une fois les routes branchées sur des helpers SQL.

import { query, queryOne, transaction } from './client.js';
import { DEFAULT_SETTINGS } from './defaults.js';

const json = (v) => JSON.stringify(v === undefined ? null : v);

// epoch(ms) depuis un champ nombre ou date ISO, 0 si absent — `src` = expression jsonb
const epochMs = (src, field) => `
  CASE
    WHEN jsonb_typeof(${src} -> '${field}') = 'number' THEN (${src} ->> '${field}')::bigint
    WHEN nullif(${src} ->> '${field}', '') IS NOT NULL
      THEN (extract(epoch FROM (${src} ->> '${field}')::timestamptz) * 1000)::bigint
    ELSE 0
  END`;

// timestamptz depuis un champ ISO ou epoch, NULL si absent
const tsCol = (src, field) => `
  CASE
    WHEN jsonb_typeof(${src} -> '${field}') = 'number'
      THEN to_timestamp((${src} ->> '${field}')::double precision / 1000.0)
    WHEN nullif(${src} ->> '${field}', '') IS NOT NULL THEN (${src} ->> '${field}')::timestamptz
    ELSE NULL
  END`;

// ——— employees ———
const employees = {
  async read() {
    const rows = await query('SELECT data FROM employees ORDER BY ord, matricule');
    return rows.map((r) => r.data);
  },
  async write(list) {
    const items = Array.isArray(list) ? list : [];
    const keys = items.map((e) => String(e?.matricule ?? '')).filter(Boolean);
    await transaction(async (tx) => {
      await tx.exec('DELETE FROM employees WHERE NOT (matricule = ANY($1::text[]))', [keys]);
      if (!items.length) return;
      await tx.exec(
        `INSERT INTO employees (matricule, name, department, poste, statut, ord, data)
         SELECT x.e ->> 'matricule',
                coalesce(nullif(x.e ->> 'name', ''),
                         nullif(trim(coalesce(x.e ->> 'firstName', '') || ' ' || coalesce(x.e ->> 'lastName', '')), ''),
                         ''),
                x.e ->> 'department', x.e ->> 'poste',
                coalesce(x.e ->> 'statutCompte', 'actif'),
                (x.o - 1)::int, x.e
           FROM jsonb_array_elements($1::jsonb) WITH ORDINALITY AS x(e, o)
          WHERE jsonb_typeof(x.e) = 'object' AND coalesce(x.e ->> 'matricule', '') <> ''
         ON CONFLICT (matricule) DO UPDATE
            SET name = EXCLUDED.name, department = EXCLUDED.department, poste = EXCLUDED.poste,
                statut = EXCLUDED.statut, ord = EXCLUDED.ord, data = EXCLUDED.data`,
        [json(items)]
      );
    });
  },
};

// ——— attendance : { [matricule]: { [date]: { arrival, departure, pauses } } } ———
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const attendance = {
  async read() {
    const rows = await query(
      `SELECT matricule, to_char(day, 'YYYY-MM-DD') AS day, data
         FROM attendance ORDER BY matricule, day`
    );
    const out = {};
    for (const r of rows) {
      if (!out[r.matricule]) out[r.matricule] = {};
      out[r.matricule][r.day] = r.data;
    }
    return out;
  },
  async write(map) {
    const payload = map && typeof map === 'object' ? map : {};
    // On ne retient que les journées bien formées : une clé invalide ferait échouer
    // toute la transaction (et perdrait les pointages valides du même mouvement).
    const clean = {};
    let expected = 0;
    for (const [matricule, days] of Object.entries(payload)) {
      if (!days || typeof days !== 'object') continue;
      const kept = {};
      for (const [day, record] of Object.entries(days)) {
        if (DAY_RE.test(day) && record && typeof record === 'object') {
          kept[day] = record;
          expected += 1;
        } else {
          console.warn(`[voomnet:db] entree de pointage ignorée : ${matricule} / ${day}`);
        }
      }
      if (Object.keys(kept).length) clean[matricule] = kept;
    }
    await transaction(async (tx) => {
      await tx.exec('DELETE FROM attendance');
      if (!expected) return;
      const written = await tx.raw(
        `INSERT INTO attendance (matricule, day, arrival, departure, pauses, data)
         SELECT m.key, d.key::date, d.value ->> 'arrival', d.value ->> 'departure',
                coalesce(d.value -> 'pauses', '[]'::jsonb), d.value
           FROM jsonb_each($1::jsonb) AS m(key, days)
           JOIN LATERAL jsonb_each(m.days) AS d(key, value)
             ON jsonb_typeof(d.value) = 'object'
          WHERE m.key IN (SELECT matricule FROM employees)
         ON CONFLICT (matricule, day) DO UPDATE
            SET arrival = EXCLUDED.arrival, departure = EXCLUDED.departure,
                pauses = EXCLUDED.pauses, data = EXCLUDED.data`,
        [json(clean)]
      );
      const inserted = written.rowCount ?? 0;
      if (inserted < expected) {
        const known = new Set((await tx.query('SELECT matricule FROM employees')).map((r) => r.matricule));
        const orphans = Object.keys(clean).filter((k) => !known.has(k));
        console.warn(
          `[voomnet:db] ${expected - inserted} pointage(s) ignoré(s) : matricule(s) absent(s) du ` +
            `registre [${orphans.join(', ') || '?'}]. En mode fichier ils seraient restés orphelins.`
        );
      }
    });
  },
};

// ——— codes : { [matricule]: { code, generatedAt, ... } } ———
const codes = {
  async read() {
    const rows = await query('SELECT matricule, data FROM access_codes ORDER BY matricule');
    const out = {};
    for (const r of rows) out[r.matricule] = r.data;
    return out;
  },
  async write(map) {
    const payload = map && typeof map === 'object' ? map : {};
    const keys = Object.keys(payload);
    await transaction(async (tx) => {
      await tx.exec('DELETE FROM access_codes WHERE NOT (matricule = ANY($1::text[]))', [keys]);
      if (!keys.length) return;
      await tx.exec(
        `INSERT INTO access_codes (matricule, code, generated_at, expires_at, used_at, single_use, data)
         SELECT v.key, v.value ->> 'code',
                ${tsCol('v.value', 'generatedAt')},
                ${tsCol('v.value', 'expiresAt')},
                ${tsCol('v.value', 'usedAt')},
                coalesce((nullif(v.value ->> 'singleUse', ''))::boolean, true),
                v.value
           FROM jsonb_each($1::jsonb) AS v(key, value)
          WHERE jsonb_typeof(v.value) = 'object'
            AND coalesce(v.value ->> 'code', '') <> ''
            AND v.key IN (SELECT matricule FROM employees)
         ON CONFLICT (matricule) DO UPDATE
            SET code = EXCLUDED.code, generated_at = EXCLUDED.generated_at,
                expires_at = EXCLUDED.expires_at, used_at = EXCLUDED.used_at,
                single_use = EXCLUDED.single_use, data = EXCLUDED.data`,
        [json(payload)]
      );
    });
  },
};

// ——— codesHistory : journal des codes émis / utilisés / révoqués ———
const codesHistory = {
  async read() {
    const rows = await query('SELECT data FROM code_events ORDER BY id');
    return rows.map((r) => r.data);
  },
  async write(list) {
    const items = Array.isArray(list) ? list : [];
    await transaction(async (tx) => {
      await tx.exec('DELETE FROM code_events');
      if (!items.length) return;
      await tx.exec(
        `INSERT INTO code_events (code, matricule, name, status, at, data)
         SELECT x.e ->> 'code', x.e ->> 'matricule', x.e ->> 'name',
                coalesce(x.e ->> 'status', 'generated'),
                coalesce(${tsCol('x.e', 'at')}, now()), x.e
           FROM jsonb_array_elements($1::jsonb) WITH ORDINALITY AS x(e, o)
          WHERE jsonb_typeof(x.e) = 'object'`,
        [json(items)]
      );
    });
  },
};

// ——— sessions ———
const sessions = {
  async read() {
    const rows = await query('SELECT data FROM sessions ORDER BY created_at, token');
    return rows.map((r) => r.data);
  },
  async write(list) {
    const items = Array.isArray(list) ? list : [];
    await transaction(async (tx) => {
      await tx.exec('DELETE FROM sessions');
      if (!items.length) return;
      await tx.exec(
        `INSERT INTO sessions (token, role, employee_id, created_at, expires_at, data)
         SELECT x.e ->> 'token', coalesce(x.e ->> 'role', 'employee'),
                nullif(x.e ->> 'employeeId', ''),
                ${epochMs('x.e', 'createdAt')}, ${epochMs('x.e', 'expiresAt')}, x.e
           FROM jsonb_array_elements($1::jsonb) WITH ORDINALITY AS x(e, o)
          WHERE jsonb_typeof(x.e) = 'object' AND coalesce(x.e ->> 'token', '') <> ''
         ON CONFLICT (token) DO UPDATE
            SET role = EXCLUDED.role, employee_id = EXCLUDED.employee_id,
                created_at = EXCLUDED.created_at, expires_at = EXCLUDED.expires_at,
                data = EXCLUDED.data`,
        [json(items)]
      );
    });
  },
};

// ——— notifications ———
const notifications = {
  async read() {
    const rows = await query('SELECT data FROM notifications ORDER BY ord, created_at');
    return rows.map((r) => r.data);
  },
  async write(list) {
    const items = Array.isArray(list) ? list : [];
    await transaction(async (tx) => {
      await tx.exec('DELETE FROM notifications');
      if (!items.length) return;
      await tx.exec(
        `INSERT INTO notifications (id, target, message, created_at, deleted_by, ord, data)
         SELECT coalesce(nullif(x.e ->> 'id', ''), 'n' || x.o::text),
                coalesce(x.e ->> 'target', ''),
                coalesce(x.e ->> 'message', ''),
                coalesce(${tsCol('x.e', 'createdAt')}, now()),
                CASE WHEN jsonb_typeof(x.e -> 'deletedBy') = 'array'
                     THEN x.e -> 'deletedBy' ELSE '[]'::jsonb END,
                (x.o - 1)::int, x.e
           FROM jsonb_array_elements($1::jsonb) WITH ORDINALITY AS x(e, o)
          WHERE jsonb_typeof(x.e) = 'object'
         ON CONFLICT (id) DO UPDATE
            SET target = EXCLUDED.target, message = EXCLUDED.message,
                deleted_by = EXCLUDED.deleted_by, ord = EXCLUDED.ord, data = EXCLUDED.data`,
        [json(items)]
      );
    });
  },
};

// ——— admins ———
const admins = {
  async read() {
    const rows = await query('SELECT data FROM admins ORDER BY created_at, email');
    return rows.map((r) => r.data);
  },
  async write(list) {
    const items = Array.isArray(list) ? list : [];
    await transaction(async (tx) => {
      await tx.exec('DELETE FROM admins');
      if (!items.length) return;
      await tx.exec(
        `INSERT INTO admins (email, role, label, salt, hash, data)
         SELECT lower(x.e ->> 'email'), coalesce(x.e ->> 'role', 'admin'), x.e ->> 'label',
                coalesce(x.e ->> 'salt', ''), coalesce(x.e ->> 'hash', ''), x.e
           FROM jsonb_array_elements($1::jsonb) WITH ORDINALITY AS x(e, o)
          WHERE jsonb_typeof(x.e) = 'object' AND coalesce(x.e ->> 'email', '') <> ''
         ON CONFLICT (email) DO UPDATE
            SET role = EXCLUDED.role, label = EXCLUDED.label,
                salt = EXCLUDED.salt, hash = EXCLUDED.hash, data = EXCLUDED.data`,
        [json(items)]
      );
    });
  },
};

// ——— settings : ligne unique ———
const settings = {
  async read() {
    const row = await queryOne('SELECT data FROM settings WHERE id = 1');
    return row?.data ?? {};
  },
  async write(data) {
    const s = { ...DEFAULT_SETTINGS, ...(data && typeof data === 'object' ? data : {}) };
    const workdays = (Array.isArray(s.workdays) ? s.workdays : [])
      .map((d) => Number(d))
      .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
    await query(
      `INSERT INTO settings (id, arrival_time, tolerance_minutes, departure_time, workdays, timezone, data)
       VALUES (1, $1, $2, $3, $4::smallint[], $5, $6::jsonb)
       ON CONFLICT (id) DO UPDATE
          SET arrival_time = EXCLUDED.arrival_time, tolerance_minutes = EXCLUDED.tolerance_minutes,
              departure_time = EXCLUDED.departure_time, workdays = EXCLUDED.workdays,
              timezone = EXCLUDED.timezone, data = EXCLUDED.data, updated_at = now()`,
      [
        String(s.arrivalTime || DEFAULT_SETTINGS.arrivalTime),
        Math.max(0, Math.min(599, Number(s.toleranceMinutes) || 0)),
        String(s.departureTime || DEFAULT_SETTINGS.departureTime),
        workdays,
        String(s.timezone || DEFAULT_SETTINGS.timezone),
        json(s),
      ]
    );
  },
};

const STORES = {
  admins,
  employees,
  codes,
  sessions,
  settings,
  attendance,
  notifications,
  codesHistory,
};

export const PG_STORES = Object.keys(STORES);

export async function readStorePg(name) {
  const store = STORES[name];
  if (!store) throw new Error(`Store inconnu : ${name}`);
  return store.read();
}

export async function writeStorePg(name, data) {
  const store = STORES[name];
  if (!store) throw new Error(`Store inconnu : ${name}`);
  await store.write(data);
}

// Le schéma est-il en place ? (message d'erreur explicite plutôt qu'un 500 opaque)
export async function isSchemaReady() {
  const row = await queryOne(
    `SELECT count(*)::int AS found
       FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('employees','attendance','access_codes','code_events',
                           'admins','sessions','notifications','settings')`
  );
  return (row?.found ?? 0) === 8;
}
