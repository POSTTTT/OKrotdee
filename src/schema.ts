/** The database schema. Executed on every start; every statement is idempotent. */

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS clients (
  id          INTEGER PRIMARY KEY,
  first_name  TEXT NOT NULL,
  last_name   TEXT NOT NULL,
  nickname    TEXT,
  thai_id     TEXT UNIQUE,
  phone       TEXT,
  -- Where the client lives ("lo living" on the intake sheet).
  address     TEXT,
  lo_work     TEXT,
  note        TEXT,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cars (
  id              INTEGER PRIMARY KEY,
  brand           TEXT NOT NULL,
  series          TEXT,
  model_year      INTEGER,
  color           TEXT,
  plate_number    TEXT UNIQUE,
  registration_no TEXT,
  chassis_no      TEXT,
  mileage         INTEGER,
  cost_price      INTEGER,
  asking_price    INTEGER,
  -- Some cars arrive with insurance already paid for; this is the day it runs out.
  insurance_expires_on TEXT,
  status          TEXT NOT NULL
                  CHECK (status IN ('available','on_contract','sold','repossessed')),
  note            TEXT,
  created_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS contracts (
  id                 INTEGER PRIMARY KEY,
  client_id          INTEGER NOT NULL REFERENCES clients(id),
  car_id             INTEGER NOT NULL REFERENCES cars(id),
  car_price          INTEGER NOT NULL,
  down_payment       INTEGER NOT NULL DEFAULT 0,
  installment_amount INTEGER NOT NULL,
  installment_count  INTEGER NOT NULL,
  due_day            INTEGER NOT NULL CHECK (due_day BETWEEN 1 AND 31),
  first_due_date     TEXT NOT NULL,
  status             TEXT NOT NULL
                     CHECK (status IN ('active','completed','repossessed','cancelled')),
  note               TEXT,
  created_at         TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS installments (
  id          INTEGER PRIMARY KEY,
  contract_id INTEGER NOT NULL REFERENCES contracts(id),
  seq         INTEGER NOT NULL,
  due_date    TEXT NOT NULL,
  amount_due  INTEGER NOT NULL,
  late_fee    INTEGER NOT NULL DEFAULT 0,
  UNIQUE (contract_id, seq)
);

CREATE TABLE IF NOT EXISTS payments (
  id             INTEGER PRIMARY KEY,
  installment_id INTEGER NOT NULL REFERENCES installments(id),
  paid_on        TEXT NOT NULL,
  amount         INTEGER NOT NULL CHECK (amount > 0),
  method         TEXT,
  note           TEXT,
  created_at     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS car_events (
  id          INTEGER PRIMARY KEY,
  car_id      INTEGER NOT NULL REFERENCES cars(id),
  event_date  TEXT NOT NULL,
  type        TEXT NOT NULL
              CHECK (type IN ('acquired','contract_started','contract_completed',
                              'repossessed','sold','note')),
  contract_id INTEGER REFERENCES contracts(id),
  note        TEXT
);

-- Money taken outside the installment schedule: the down payment, and the
-- insurance fee with the police fine that comes with it. Insurance is paid
-- again every year on no fixed date, so a contract has as many rows as the
-- staff have recorded.
CREATE TABLE IF NOT EXISTS fees (
  id             INTEGER PRIMARY KEY,
  contract_id    INTEGER NOT NULL REFERENCES contracts(id),
  type           TEXT NOT NULL CHECK (type IN ('down','insurance')),
  due_on         TEXT NOT NULL,
  -- Null until the money is actually in hand.
  paid_on        TEXT,
  amount         INTEGER NOT NULL CHECK (amount > 0),
  officer_amount INTEGER,
  -- The fine is often paid on its own day, so it keeps its own date.
  officer_paid_on TEXT,
  note           TEXT,
  created_at     TEXT NOT NULL
);

-- What the client promised to pay and when. A down payment is often agreed
-- as two or three parts on dates of their own; each part is judged against
-- its own promised date, so keeping to the arrangement costs nothing.
-- A fee with no parts here is due in full on the fee's own due date.
CREATE TABLE IF NOT EXISTS fee_schedule (
  id         INTEGER PRIMARY KEY,
  fee_id     INTEGER NOT NULL REFERENCES fees(id),
  due_on     TEXT NOT NULL,
  amount     INTEGER NOT NULL CHECK (amount > 0),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_fee_schedule_fee ON fee_schedule(fee_id);

-- Parts of a fee handed over on different days. The down payment is often
-- settled in more than one go, and the fee counts as late until the last of
-- it is in.
CREATE TABLE IF NOT EXISTS fee_payments (
  id         INTEGER PRIMARY KEY,
  fee_id     INTEGER NOT NULL REFERENCES fees(id),
  paid_on    TEXT NOT NULL,
  amount     INTEGER NOT NULL CHECK (amount > 0),
  note       TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_fee_payments_fee ON fee_payments(fee_id);

-- Money received against a late fee. The fee itself is never stored: it is
-- 15% of the charge for every strike, recomputed from the dates. Only what
-- the client has handed over is a fact worth keeping.
--
-- The two late fees are kept apart: one on the installments, one on the down
-- payment. They are owed on different amounts and paid off separately.
CREATE TABLE IF NOT EXISTS late_fee_payments (
  id          INTEGER PRIMARY KEY,
  contract_id INTEGER NOT NULL REFERENCES contracts(id),
  kind        TEXT NOT NULL DEFAULT 'installment'
              CHECK (kind IN ('installment','down')),
  paid_on     TEXT NOT NULL,
  amount      INTEGER NOT NULL CHECK (amount > 0),
  note        TEXT,
  created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_late_fee_payments_contract
  ON late_fee_payments(contract_id);

CREATE INDEX IF NOT EXISTS idx_fees_contract ON fees(contract_id);

CREATE INDEX IF NOT EXISTS idx_installments_contract ON installments(contract_id);
CREATE INDEX IF NOT EXISTS idx_payments_installment  ON payments(installment_id);
CREATE INDEX IF NOT EXISTS idx_car_events_car        ON car_events(car_id);
CREATE INDEX IF NOT EXISTS idx_contracts_client      ON contracts(client_id);
CREATE INDEX IF NOT EXISTS idx_contracts_car         ON contracts(car_id);
`;

/**
 * Columns added after the first release. SQLite has no "ADD COLUMN IF NOT
 * EXISTS", so these are run separately from SCHEMA and their duplicate-column
 * error is ignored; databases created fresh already have them.
 */
export const MIGRATIONS = [
  "ALTER TABLE clients ADD COLUMN nickname TEXT",
  "ALTER TABLE clients ADD COLUMN lo_work TEXT",
  // contract_fees allowed one row per type; fees replaces it. Never held data.
  "DROP TABLE IF EXISTS contract_fees",
  "ALTER TABLE fees ADD COLUMN officer_paid_on TEXT",
  // A down payment recorded before fee_payments existed becomes its first
  // payment. Guarded, so a later start does not copy it twice.
  "INSERT INTO fee_payments (fee_id, paid_on, amount, note, created_at)" +
    " SELECT id, paid_on, amount, note, created_at FROM fees" +
    " WHERE type = 'down' AND paid_on IS NOT NULL" +
    " AND NOT EXISTS (SELECT 1 FROM fee_payments WHERE fee_id = fees.id)",
  // The date now lives on the payment, not the charge.
  "UPDATE fees SET paid_on = NULL WHERE type = 'down'",
  // Late fees were one pot before the down payment had its own. Everything
  // recorded until now was against the installments.
  "ALTER TABLE late_fee_payments ADD COLUMN kind TEXT NOT NULL DEFAULT 'installment'",
  "ALTER TABLE cars ADD COLUMN insurance_expires_on TEXT",
];

/** Bump whenever REBUILDS grows. Stored in the file as PRAGMA user_version. */
export const SCHEMA_VERSION = 1;

/**
 * Changes ALTER TABLE cannot express, so the table is copied instead. Applied
 * once per database, in order, and only when its user_version is behind.
 */
export const REBUILDS = [
  // v1: fees gained a due date, and paid_on became optional so a fee can be
  // recorded before the client has paid it. Existing rows were all paid.
  `CREATE TABLE fees_rebuilt (
     id             INTEGER PRIMARY KEY,
     contract_id    INTEGER NOT NULL REFERENCES contracts(id),
     type           TEXT NOT NULL CHECK (type IN ('down','insurance')),
     due_on         TEXT NOT NULL,
     paid_on        TEXT,
     amount         INTEGER NOT NULL CHECK (amount > 0),
     officer_amount INTEGER,
     note           TEXT,
     created_at     TEXT NOT NULL
   )`,
  `INSERT INTO fees_rebuilt (id, contract_id, type, due_on, paid_on, amount,
     officer_amount, note, created_at)
   SELECT id, contract_id, type, paid_on, paid_on, amount, officer_amount, note,
     created_at FROM fees`,
  "DROP TABLE fees",
  "ALTER TABLE fees_rebuilt RENAME TO fees",
  "CREATE INDEX IF NOT EXISTS idx_fees_contract ON fees(contract_id)",
];
