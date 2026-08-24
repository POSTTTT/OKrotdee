/** The database schema. Executed on every start; every statement is idempotent. */

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS clients (
  id          INTEGER PRIMARY KEY,
  first_name  TEXT NOT NULL,
  last_name   TEXT NOT NULL,
  thai_id     TEXT UNIQUE,
  phone       TEXT,
  address     TEXT,
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

CREATE INDEX IF NOT EXISTS idx_installments_contract ON installments(contract_id);
CREATE INDEX IF NOT EXISTS idx_payments_installment  ON payments(installment_id);
CREATE INDEX IF NOT EXISTS idx_car_events_car        ON car_events(car_id);
CREATE INDEX IF NOT EXISTS idx_contracts_client      ON contracts(client_id);
CREATE INDEX IF NOT EXISTS idx_contracts_car         ON contracts(car_id);
`;
