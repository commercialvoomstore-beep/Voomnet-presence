-- VOOMNET Presence — schéma initial (PostgreSQL / Neon)
-- Concu pour coexister avec le mode « fichiers JSON » : les colonnes portées
-- sont relationnelles (clés, dates, statuts) et le reste de la fiche est
-- conservé en jsonb `data`, afin que les routes existantes retrouvent exactement
-- les mêmes formes d'objets qu'avec data/*.json.

-- ——— Employés ———
CREATE TABLE employees (
  matricule   text PRIMARY KEY,
  name        text        NOT NULL DEFAULT '',
  department  text,
  poste       text,
  statut      text        NOT NULL DEFAULT 'actif',
  created_at  timestamptz NOT NULL DEFAULT now(),
  ord         integer     NOT NULL DEFAULT 0,
  data        jsonb       NOT NULL
);
CREATE INDEX employees_department_idx ON employees (department);
CREATE INDEX employees_ord_idx ON employees (ord);

-- ——— Pointages : une ligne par (matricule, journée) ———
CREATE TABLE attendance (
  matricule text NOT NULL REFERENCES employees (matricule) ON DELETE CASCADE,
  day       date NOT NULL,
  arrival   text,
  departure text,
  pauses    jsonb NOT NULL DEFAULT '[]'::jsonb,
  data      jsonb NOT NULL,
  PRIMARY KEY (matricule, day)
);
CREATE INDEX attendance_day_idx ON attendance (day DESC);

-- ——— Codes d'accès actifs : un par employé ———
CREATE TABLE access_codes (
  matricule    text PRIMARY KEY REFERENCES employees (matricule) ON DELETE CASCADE,
  code         text        NOT NULL UNIQUE,
  generated_at timestamptz,
  expires_at   timestamptz,
  used_at      timestamptz,
  single_use   boolean     NOT NULL DEFAULT true,
  data         jsonb       NOT NULL
);
CREATE INDEX access_codes_code_idx ON access_codes (code);

-- ——— Journal des codes (émis / utilisés / révoqués) ———
CREATE TABLE code_events (
  id        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code      text,
  matricule text,
  name      text,
  status    text        NOT NULL,
  at        timestamptz NOT NULL DEFAULT now(),
  data      jsonb       NOT NULL
);
CREATE INDEX code_events_matricule_idx ON code_events (matricule, at DESC);

-- ——— Comptes administrateurs ———
CREATE TABLE admins (
  email      text PRIMARY KEY,
  role       text        NOT NULL,
  label      text,
  salt       text        NOT NULL,
  hash       text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  data       jsonb       NOT NULL
);

-- ——— Sessions (horodatage en millisecondes epoch, comme le format JSON) ———
-- Pas de cle etrangere sur employee_id : une session peut survivre quelques
-- heures a la suppression du compte, et son nettoyage se fait par expires_at.
CREATE TABLE sessions (
  token       text PRIMARY KEY,
  role        text        NOT NULL,
  employee_id text,
  created_at  bigint      NOT NULL,
  expires_at  bigint      NOT NULL,
  data        jsonb       NOT NULL
);
CREATE INDEX sessions_expiry_idx ON sessions (expires_at);

-- ——— Notifications internes (message admin -> cible) ———
CREATE TABLE notifications (
  id         text PRIMARY KEY,
  target     text        NOT NULL,
  message    text        NOT NULL,
  created_at timestamptz NOT NULL,
  deleted_by jsonb       NOT NULL DEFAULT '[]'::jsonb,
  ord        integer     NOT NULL DEFAULT 0,
  data       jsonb       NOT NULL
);
CREATE INDEX notifications_target_idx ON notifications (target, created_at DESC);

-- ——— Paramètres de présence : ligne unique ———
CREATE TABLE settings (
  id                smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  arrival_time      text        NOT NULL,
  tolerance_minutes smallint    NOT NULL,
  departure_time    text        NOT NULL,
  workdays          smallint[]  NOT NULL,
  timezone          text        NOT NULL,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  data              jsonb       NOT NULL
);
