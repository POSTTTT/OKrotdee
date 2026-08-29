/**
 * The database interface and every query in the application.
 *
 * Queries are written with `?` placeholders and take the Db interface, so
 * the same code runs against @tauri-apps/plugin-sql in the application and
 * against better-sqlite3 in tests.
 */

import Database from "@tauri-apps/plugin-sql";

import {
  generateSchedule,
  lateFee,
  outstanding,
  scheduleStrikes,
  todayIso,
  type OverdueRow,
} from "./money";
import { MIGRATIONS, REBUILDS, SCHEMA, SCHEMA_VERSION } from "./schema";

export interface Db {
  select<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  execute(sql: string, params?: unknown[]): Promise<{ lastInsertId: number }>;
}

/** Rewrite `?` placeholders as `$1, $2, …`, which is how the plugin binds them. */
export function toDollarPlaceholders(sql: string): string {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

/**
 * Split a SQL script into single statements, which is all the SQL plugin
 * takes. Comments come out first: the split is on ";", and a semicolon inside
 * a comment would otherwise cut a statement in half.
 */
export function statements(sql: string): string[] {
  return sql
    .replace(/--[^\n]*/g, "")
    .split(";")
    .filter((statement) => statement.trim());
}

/** An ISO-8601 timestamp for created_at columns. */
export function nowIso(): string {
  return new Date().toISOString().slice(0, 19);
}

/** Open the application database, enable foreign keys, and apply the schema. */
export async function openDatabase(): Promise<Db> {
  const database = await Database.load("sqlite:okrotdee.db");

  const db: Db = {
    async select<T>(sql: string, params: unknown[] = []): Promise<T[]> {
      return database.select<T[]>(toDollarPlaceholders(sql), params);
    },
    async execute(sql: string, params: unknown[] = []) {
      const result = await database.execute(toDollarPlaceholders(sql), params);
      return { lastInsertId: Number(result.lastInsertId ?? 0) };
    },
  };

  // @tauri-apps/plugin-sql pools connections and PRAGMA foreign_keys is
  // per-connection, so this only guarantees enforcement on the connection
  // executing this call, not on every connection the app uses over its
  // lifetime. Tests use a single unpooled better-sqlite3 connection (see
  // tests/helpers.ts), where the same pragma is a real guarantee.
  await database.execute("PRAGMA foreign_keys = ON");

  // A database with no tables yet gets the current schema outright, so the
  // rebuilds below — which describe tables as they were in older versions —
  // must not run against it.
  const fresh =
    (await db.select("SELECT name FROM sqlite_master WHERE type = 'table' LIMIT 1")).length === 0;

  for (const statement of statements(SCHEMA)) {
    await database.execute(statement);
  }

  const [{ user_version }] = await db.select<{ user_version: number }>("PRAGMA user_version");
  if (!fresh && user_version < SCHEMA_VERSION) {
    for (const statement of REBUILDS) await database.execute(statement);
  }
  if (user_version < SCHEMA_VERSION) {
    // Not a bound parameter: SQLite does not allow one in a PRAGMA.
    await database.execute(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  }

  // Columns added since. Run after the rebuilds, so a rebuilt table gets them
  // too; already applied on every start after the first.
  for (const statement of MIGRATIONS) {
    await database.execute(statement).catch(() => {});
  }
  return db;
}

export interface Client {
  id: number;
  first_name: string;
  last_name: string;
  nickname: string | null;
  thai_id: string | null;
  phone: string | null;
  /** Where the client lives. */
  address: string | null;
  lo_work: string | null;
  note: string | null;
  created_at: string;
}

export type ClientFields = Omit<Client, "id" | "created_at">;

export interface ContractRow {
  id: number;
  client_id: number;
  car_id: number;
  car_price: number;
  down_payment: number;
  installment_amount: number;
  installment_count: number;
  due_day: number;
  first_due_date: string;
  status: string;
  note: string | null;
  created_at: string;
  first_name?: string;
  last_name?: string;
  brand?: string;
  series?: string | null;
  plate_number?: string | null;
}

export async function listClients(db: Db, q?: string): Promise<Client[]> {
  if (q) {
    const like = `%${q}%`;
    return db.select<Client>(
      "SELECT * FROM clients" +
        " WHERE first_name LIKE ? OR last_name LIKE ? OR nickname LIKE ?" +
        " OR phone LIKE ? OR thai_id LIKE ?" +
        " ORDER BY first_name, last_name",
      [like, like, like, like, like],
    );
  }
  return db.select<Client>("SELECT * FROM clients ORDER BY first_name, last_name");
}

export async function getClient(db: Db, id: number): Promise<Client | undefined> {
  return (await db.select<Client>("SELECT * FROM clients WHERE id = ?", [id]))[0];
}

export async function createClient(db: Db, fields: ClientFields): Promise<number> {
  const { lastInsertId } = await db.execute(
    "INSERT INTO clients (first_name, last_name, nickname, thai_id, phone," +
      " address, lo_work, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [
      fields.first_name,
      fields.last_name,
      fields.nickname,
      fields.thai_id,
      fields.phone,
      fields.address,
      fields.lo_work,
      fields.note,
      nowIso(),
    ],
  );
  return lastInsertId;
}

export async function updateClient(db: Db, id: number, fields: ClientFields): Promise<void> {
  await db.execute(
    "UPDATE clients SET first_name = ?, last_name = ?, nickname = ?, thai_id = ?," +
      " phone = ?, address = ?, lo_work = ?, note = ? WHERE id = ?",
    [
      fields.first_name,
      fields.last_name,
      fields.nickname,
      fields.thai_id,
      fields.phone,
      fields.address,
      fields.lo_work,
      fields.note,
      id,
    ],
  );
}

/** Every contract this client signed, as the main client or alongside one. */
export async function clientContracts(db: Db, clientId: number): Promise<ContractRow[]> {
  return db.select<ContractRow>(
    "SELECT c.*, cars.brand, cars.series, cars.plate_number FROM contracts c" +
      " JOIN cars ON cars.id = c.car_id WHERE c.client_id = ?" +
      " OR c.id IN (SELECT contract_id FROM contract_clients WHERE client_id = ?)" +
      " ORDER BY c.created_at DESC",
    [clientId, clientId],
  );
}

/** The people signing alongside the main client, who stays on the contract row. */
export async function contractCoClients(db: Db, contractId: number): Promise<Client[]> {
  return db.select<Client>(
    "SELECT cl.* FROM contract_clients cc JOIN clients cl ON cl.id = cc.client_id" +
      " WHERE cc.contract_id = ? ORDER BY cl.first_name, cl.last_name",
    [contractId],
  );
}

export async function addContractCoClient(
  db: Db,
  contractId: number,
  clientId: number,
): Promise<void> {
  const contract = await getContract(db, contractId);
  if (!contract) throw new Error("err_no_such_contract");
  // The main client is already on the contract; listing them again would show
  // the same person twice.
  if (contract.client_id === clientId) throw new Error("err_client_already_on_contract");
  await db.execute(
    "INSERT OR IGNORE INTO contract_clients (contract_id, client_id, created_at)" +
      " VALUES (?, ?, ?)",
    [contractId, clientId, nowIso()],
  );
}

export async function removeContractCoClient(
  db: Db,
  contractId: number,
  clientId: number,
): Promise<void> {
  await db.execute(
    "DELETE FROM contract_clients WHERE contract_id = ? AND client_id = ?",
    [contractId, clientId],
  );
}

/**
 * Delete a client who was entered in error. Refused once contracts reference
 * them: the app's connections do not all have PRAGMA foreign_keys on, so this
 * check, not the constraint, is what protects the history.
 */
export async function deleteClient(db: Db, id: number): Promise<void> {
  if ((await clientContracts(db, id)).length > 0) {
    throw new Error("err_client_has_contracts");
  }
  await db.execute("DELETE FROM clients WHERE id = ?", [id]);
}

export type CarStatus = "available" | "on_contract" | "sold" | "repossessed";

export interface Car {
  id: number;
  brand: string;
  series: string | null;
  model_year: number | null;
  color: string | null;
  plate_number: string | null;
  registration_no: string | null;
  chassis_no: string | null;
  mileage: number | null;
  cost_price: number | null;
  asking_price: number | null;
  /** The day the car's own insurance runs out, when it came with one. */
  insurance_expires_on: string | null;
  status: CarStatus;
  note: string | null;
  created_at: string;
}

export type CarFields = Omit<Car, "id" | "status" | "created_at">;

export interface CarEvent {
  id: number;
  car_id: number;
  event_date: string;
  type: string;
  contract_id: number | null;
  note: string | null;
}

const CAR_VALUES = (f: CarFields) => [
  f.brand,
  f.series,
  f.model_year,
  f.color,
  f.plate_number,
  f.registration_no,
  f.chassis_no,
  f.mileage,
  f.cost_price,
  f.asking_price,
  f.insurance_expires_on,
  f.note,
];

export async function listCars(db: Db, status?: string, q?: string): Promise<Car[]> {
  let sql = "SELECT * FROM cars WHERE 1 = 1";
  const params: unknown[] = [];
  if (status) {
    sql += " AND status = ?";
    params.push(status);
  }
  if (q) {
    sql += " AND (brand LIKE ? OR series LIKE ? OR plate_number LIKE ?)";
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  return db.select<Car>(sql + " ORDER BY brand, series", params);
}

export async function getCar(db: Db, id: number): Promise<Car | undefined> {
  return (await db.select<Car>("SELECT * FROM cars WHERE id = ?", [id]))[0];
}

export async function addCarEvent(
  db: Db,
  carId: number,
  eventDate: string,
  type: string,
  contractId: number | null = null,
  note: string | null = null,
): Promise<void> {
  await db.execute(
    "INSERT INTO car_events (car_id, event_date, type, contract_id, note)" +
      " VALUES (?, ?, ?, ?, ?)",
    [carId, eventDate, type, contractId, note],
  );
}

export async function createCar(db: Db, fields: CarFields): Promise<number> {
  const { lastInsertId } = await db.execute(
    "INSERT INTO cars (brand, series, model_year, color, plate_number," +
      " registration_no, chassis_no, mileage, cost_price, asking_price," +
      " insurance_expires_on, note, status, created_at)" +
      " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'available', ?)",
    [...CAR_VALUES(fields), nowIso()],
  );
  await addCarEvent(db, lastInsertId, todayIso(), "acquired");
  return lastInsertId;
}

export async function updateCar(db: Db, id: number, fields: CarFields): Promise<void> {
  await db.execute(
    "UPDATE cars SET brand = ?, series = ?, model_year = ?, color = ?," +
      " plate_number = ?, registration_no = ?, chassis_no = ?, mileage = ?," +
      " cost_price = ?, asking_price = ?, insurance_expires_on = ?, note = ?" +
      " WHERE id = ?",
    [...CAR_VALUES(fields), id],
  );
}

export async function setCarStatus(db: Db, id: number, status: CarStatus): Promise<void> {
  await db.execute("UPDATE cars SET status = ? WHERE id = ?", [status, id]);
}

/** Delete a car entered in error, along with its timeline. Refused once any
 * contract references it. */
export async function deleteCar(db: Db, id: number): Promise<void> {
  if ((await carContracts(db, id)).length > 0) {
    throw new Error("err_car_has_contracts");
  }
  await db.execute("DELETE FROM car_events WHERE car_id = ?", [id]);
  await db.execute("DELETE FROM cars WHERE id = ?", [id]);
}

/** Correct a timeline entry: the day it happened, and what was written about it. */
export async function setCarEvent(
  db: Db,
  id: number,
  eventDate: string,
  note: string | null,
): Promise<void> {
  await db.execute("UPDATE car_events SET event_date = ?, note = ? WHERE id = ?", [
    eventDate,
    note,
    id,
  ]);
}

/** Remove a timeline entry recorded by mistake. */
export async function deleteCarEvent(db: Db, id: number): Promise<void> {
  await db.execute("DELETE FROM car_events WHERE id = ?", [id]);
}

export async function carEvents(db: Db, carId: number): Promise<CarEvent[]> {
  return db.select<CarEvent>(
    "SELECT * FROM car_events WHERE car_id = ? ORDER BY event_date, id",
    [carId],
  );
}

/** The active contract on this car, if there is one. */
export async function activeContractForCar(
  db: Db,
  carId: number,
): Promise<ContractRow | undefined> {
  return (
    await db.select<ContractRow>(
      "SELECT * FROM contracts WHERE car_id = ? AND status = 'active' LIMIT 1",
      [carId],
    )
  )[0];
}

export async function carContracts(db: Db, carId: number): Promise<ContractRow[]> {
  return db.select<ContractRow>(
    "SELECT c.*, cl.first_name, cl.last_name FROM contracts c" +
      " JOIN clients cl ON cl.id = c.client_id WHERE c.car_id = ?" +
      " ORDER BY c.created_at DESC",
    [carId],
  );
}

export interface ContractFields {
  client_id: number;
  car_id: number;
  car_price: number;
  down_payment: number;
  installment_amount: number;
  installment_count: number;
  due_day: number;
  first_due_date: string;
  note: string | null;
}

export async function availableCars(db: Db): Promise<Car[]> {
  return db.select<Car>(
    "SELECT * FROM cars WHERE status = 'available' ORDER BY brand, series",
  );
}

export async function listContracts(db: Db, status?: string): Promise<ContractRow[]> {
  let sql =
    "SELECT c.*, cl.first_name, cl.last_name, cars.brand, cars.series," +
    " cars.plate_number FROM contracts c" +
    " JOIN clients cl ON cl.id = c.client_id" +
    " JOIN cars ON cars.id = c.car_id";
  const params: unknown[] = [];
  if (status) {
    sql += " WHERE c.status = ?";
    params.push(status);
  }
  return db.select<ContractRow>(sql + " ORDER BY c.created_at DESC", params);
}

export async function createContract(db: Db, fields: ContractFields): Promise<number> {
  const car = await getCar(db, fields.car_id);
  if (!car || car.status !== "available") throw new Error("err_car_not_available");
  // A car's status can be edited by hand; the contracts table is the truth
  // about whether it is already financed.
  if (await activeContractForCar(db, fields.car_id)) {
    throw new Error("err_car_has_active_contract");
  }

  // Validate before writing: the SQL plugin pools connections, so these
  // statements cannot share one transaction.
  const dates = generateSchedule(
    fields.first_due_date,
    fields.installment_count,
    fields.due_day,
  );

  const { lastInsertId } = await db.execute(
    "INSERT INTO contracts (client_id, car_id, car_price, down_payment," +
      " installment_amount, installment_count, due_day, first_due_date, note," +
      " status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)",
    [
      fields.client_id,
      fields.car_id,
      fields.car_price,
      fields.down_payment,
      fields.installment_amount,
      fields.installment_count,
      fields.due_day,
      fields.first_due_date,
      fields.note,
      nowIso(),
    ],
  );

  for (const [index, dueDate] of dates.entries()) {
    await db.execute(
      "INSERT INTO installments (contract_id, seq, due_date, amount_due)" +
        " VALUES (?, ?, ?, ?)",
      [lastInsertId, index + 1, dueDate, fields.installment_amount],
    );
  }

  await setCarStatus(db, fields.car_id, "on_contract");
  await addCarEvent(db, fields.car_id, todayIso(), "contract_started", lastInsertId);
  return lastInsertId;
}

export interface InstallmentRow {
  id: number;
  contract_id: number;
  seq: number;
  due_date: string;
  amount_due: number;
  late_fee: number;
  paid_total: number;
  /** The most recent payment date, or null while nothing has been paid. */
  last_paid_on: string | null;
}

export interface Payment {
  id: number;
  installment_id: number;
  paid_on: string;
  amount: number;
  method: string | null;
  note: string | null;
  created_at: string;
}

const INSTALLMENTS_SQL = (where: string) =>
  "SELECT i.*, COALESCE(SUM(p.amount), 0) AS paid_total," +
  " MAX(p.paid_on) AS last_paid_on FROM installments i" +
  " LEFT JOIN payments p ON p.installment_id = i.id" +
  ` WHERE ${where} GROUP BY i.id ORDER BY i.seq`;

/** A database row in the shape money.ts takes. */
export function overdueRow(i: InstallmentRow): OverdueRow {
  return {
    dueDate: i.due_date,
    amountDue: i.amount_due,
    lateFee: i.late_fee,
    paidTotal: i.paid_total,
  };
}

export async function getContract(db: Db, id: number): Promise<ContractRow | undefined> {
  return (
    await db.select<ContractRow>(
      "SELECT c.*, cl.first_name, cl.last_name, cars.brand, cars.series," +
        " cars.plate_number FROM contracts c" +
        " JOIN clients cl ON cl.id = c.client_id" +
        " JOIN cars ON cars.id = c.car_id WHERE c.id = ?",
      [id],
    )
  )[0];
}

export async function installmentsFor(db: Db, contractId: number): Promise<InstallmentRow[]> {
  return db.select<InstallmentRow>(INSTALLMENTS_SQL("i.contract_id = ?"), [contractId]);
}

export async function getInstallment(db: Db, id: number): Promise<InstallmentRow | undefined> {
  return (await db.select<InstallmentRow>(INSTALLMENTS_SQL("i.id = ?"), [id]))[0];
}

export async function paymentsFor(db: Db, installmentId: number): Promise<Payment[]> {
  return db.select<Payment>(
    "SELECT * FROM payments WHERE installment_id = ? ORDER BY paid_on, id",
    [installmentId],
  );
}

export async function setLateFee(db: Db, installmentId: number, lateFee: number): Promise<void> {
  await db.execute("UPDATE installments SET late_fee = ? WHERE id = ?", [
    lateFee,
    installmentId,
  ]);
}

export async function addPayment(
  db: Db,
  installmentId: number,
  paidOn: string,
  amount: number,
  method: string | null,
  note: string | null,
): Promise<void> {
  await db.execute(
    "INSERT INTO payments (installment_id, paid_on, amount, method, note, created_at)" +
      " VALUES (?, ?, ?, ?, ?, ?)",
    [installmentId, paidOn, amount, method, note, nowIso()],
  );
}

export async function getPayment(db: Db, id: number): Promise<Payment | undefined> {
  return (await db.select<Payment>("SELECT * FROM payments WHERE id = ?", [id]))[0];
}

/** Correct a payment that was entered wrongly. */
export async function updatePayment(
  db: Db,
  id: number,
  paidOn: string,
  amount: number,
  method: string | null,
  note: string | null,
): Promise<void> {
  await db.execute(
    "UPDATE payments SET paid_on = ?, amount = ?, method = ?, note = ? WHERE id = ?",
    [paidOn, amount, method, note, id],
  );
}

export async function deletePayment(db: Db, id: number): Promise<void> {
  await db.execute("DELETE FROM payments WHERE id = ?", [id]);
}

/** Close the contract and mark the car sold once nothing is outstanding. */
export async function completeContractIfPaid(db: Db, contractId: number): Promise<boolean> {
  const rows = await installmentsFor(db, contractId);
  if (rows.some((r) => outstanding(r.amount_due, r.late_fee, r.paid_total) > 0)) {
    return false;
  }
  const contract = await getContract(db, contractId);
  if (!contract || contract.status !== "active") return false;

  await db.execute("UPDATE contracts SET status = 'completed' WHERE id = ?", [contractId]);
  await setCarStatus(db, contract.car_id, "sold");
  await addCarEvent(db, contract.car_id, todayIso(), "contract_completed", contractId);
  return true;
}

/**
 * Bring the contract's status in line with what has been paid, after money is
 * recorded, corrected, or removed. Repossessed and cancelled are staff
 * decisions and are never undone here.
 */
export async function syncContractStatus(db: Db, contractId: number): Promise<void> {
  if (await completeContractIfPaid(db, contractId)) return;

  const contract = await getContract(db, contractId);
  if (!contract || contract.status !== "completed") return;

  const rows = await installmentsFor(db, contractId);
  const owed = rows.some((r) => outstanding(r.amount_due, r.late_fee, r.paid_total) > 0);
  if (!owed) return;

  // A payment was corrected downwards or removed, so the contract is running
  // again and the car is not sold after all.
  await db.execute("UPDATE contracts SET status = 'active' WHERE id = ?", [contractId]);
  await setCarStatus(db, contract.car_id, "on_contract");
}

/** Close the contract and take the car back. Staff-initiated only. */
export async function repossessContract(db: Db, contractId: number): Promise<void> {
  const contract = await getContract(db, contractId);
  if (!contract) throw new Error("err_no_such_contract");
  if (contract.status !== "active") return;
  await db.execute("UPDATE contracts SET status = 'repossessed' WHERE id = ?", [contractId]);
  await setCarStatus(db, contract.car_id, "repossessed");
  await addCarEvent(db, contract.car_id, todayIso(), "repossessed", contractId);
}

/** Void a contract entered in error and free the car. */
export async function cancelContract(db: Db, contractId: number): Promise<void> {
  const contract = await getContract(db, contractId);
  if (!contract) throw new Error("err_no_such_contract");
  if (contract.status !== "active") return;
  await db.execute("UPDATE contracts SET status = 'cancelled' WHERE id = ?", [contractId]);
  await setCarStatus(db, contract.car_id, "available");
}

/**
 * Delete a contract entered in error, along with everything recorded against
 * it: its schedule, its payments, its fees and their parts. The car goes back
 * on the lot if this contract was the one holding it.
 */
export async function deleteContract(db: Db, contractId: number): Promise<void> {
  const contract = await getContract(db, contractId);
  if (!contract) throw new Error("err_no_such_contract");
  await db.execute(
    "DELETE FROM payments WHERE installment_id IN (SELECT id FROM installments WHERE contract_id = ?)",
    [contractId],
  );
  await db.execute("DELETE FROM installments WHERE contract_id = ?", [contractId]);
  await db.execute(
    "DELETE FROM fee_payments WHERE fee_id IN (SELECT id FROM fees WHERE contract_id = ?)",
    [contractId],
  );
  await db.execute(
    "DELETE FROM fee_schedule WHERE fee_id IN (SELECT id FROM fees WHERE contract_id = ?)",
    [contractId],
  );
  await db.execute("DELETE FROM fees WHERE contract_id = ?", [contractId]);
  await db.execute("DELETE FROM late_fee_payments WHERE contract_id = ?", [contractId]);
  await db.execute("DELETE FROM car_events WHERE contract_id = ?", [contractId]);
  await db.execute("DELETE FROM contracts WHERE id = ?", [contractId]);
  if (contract.status === "active") await setCarStatus(db, contract.car_id, "available");
}

export type FeeType = "down" | "insurance";

export interface Fee {
  id: number;
  contract_id: number;
  type: FeeType;
  due_on: string;
  /** Null until the client has actually paid. */
  paid_on: string | null;
  amount: number;
  /** The police fine taken with an insurance fee. Null on a down payment. */
  officer_amount: number | null;
  /** The fine is often paid on its own day, so it keeps its own date. */
  officer_paid_on: string | null;
  note: string | null;
  created_at: string;
}

export type FeeFields = Omit<Fee, "id" | "contract_id" | "created_at">;

/** Every fee recorded against a contract, oldest first. */
export async function contractFees(db: Db, contractId: number): Promise<Fee[]> {
  return db.select<Fee>(
    "SELECT * FROM fees WHERE contract_id = ? ORDER BY due_on, id",
    [contractId],
  );
}

export async function getFee(db: Db, id: number): Promise<Fee | undefined> {
  return (await db.select<Fee>("SELECT * FROM fees WHERE id = ?", [id]))[0];
}

/** Record a fee, or correct the one at `id`. */
export async function saveFee(
  db: Db,
  contractId: number,
  fields: FeeFields,
  id: number | null = null,
): Promise<void> {
  if (id) {
    await db.execute(
      "UPDATE fees SET type = ?, due_on = ?, paid_on = ?, amount = ?," +
        " officer_amount = ?, officer_paid_on = ?, note = ? WHERE id = ?",
      [
        fields.type,
        fields.due_on,
        fields.paid_on,
        fields.amount,
        fields.officer_amount,
        fields.officer_paid_on,
        fields.note,
        id,
      ],
    );
    return;
  }
  await db.execute(
    "INSERT INTO fees (contract_id, type, due_on, paid_on, amount, officer_amount," +
      " officer_paid_on, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [
      contractId,
      fields.type,
      fields.due_on,
      fields.paid_on,
      fields.amount,
      fields.officer_amount,
      fields.officer_paid_on,
      fields.note,
      nowIso(),
    ],
  );
}

export async function deleteFee(db: Db, id: number): Promise<void> {
  await db.execute("DELETE FROM fees WHERE id = ?", [id]);
}

export interface FeeSchedulePart {
  id: number;
  fee_id: number;
  due_on: string;
  amount: number;
  created_at: string;
}

/** What the client promised to pay against one fee, and when. */
export async function feeSchedule(db: Db, feeId: number): Promise<FeeSchedulePart[]> {
  return db.select<FeeSchedulePart>(
    "SELECT * FROM fee_schedule WHERE fee_id = ? ORDER BY due_on, id",
    [feeId],
  );
}

export async function addFeeSchedulePart(
  db: Db,
  feeId: number,
  dueOn: string,
  amount: number,
): Promise<void> {
  await db.execute(
    "INSERT INTO fee_schedule (fee_id, due_on, amount, created_at) VALUES (?, ?, ?, ?)",
    [feeId, dueOn, amount, nowIso()],
  );
}

export async function deleteFeeSchedulePart(db: Db, id: number): Promise<void> {
  await db.execute("DELETE FROM fee_schedule WHERE id = ?", [id]);
}

export interface FeePayment {
  id: number;
  fee_id: number;
  paid_on: string;
  amount: number;
  note: string | null;
  created_at: string;
}

/** What has been handed over against one fee, oldest first. */
export async function feePayments(db: Db, feeId: number): Promise<FeePayment[]> {
  return db.select<FeePayment>(
    "SELECT * FROM fee_payments WHERE fee_id = ? ORDER BY paid_on, id",
    [feeId],
  );
}

export async function addFeePayment(
  db: Db,
  feeId: number,
  paidOn: string,
  amount: number,
  note: string | null = null,
): Promise<void> {
  await db.execute(
    "INSERT INTO fee_payments (fee_id, paid_on, amount, note, created_at)" +
      " VALUES (?, ?, ?, ?, ?)",
    [feeId, paidOn, amount, note, nowIso()],
  );
}

export async function deleteFeePayment(db: Db, id: number): Promise<void> {
  await db.execute("DELETE FROM fee_payments WHERE id = ?", [id]);
}

/**
 * The late fee owed on the down payment: 15% of the whole charge for every
 * strike, counted until the last part of it is in.
 */
export async function downFeeFine(
  db: Db,
  contractId: number,
  today: string,
): Promise<number> {
  const down = (await contractFees(db, contractId)).find((f) => f.type === "down");
  if (!down) return 0;
  const promised = await feeSchedule(db, down.id);
  return lateFee(
    down.amount,
    scheduleStrikes(
      // With no arrangement on file, the whole down payment is due at once.
      promised.length > 0 ? promised : [{ due_on: down.due_on, amount: down.amount }],
      await feePayments(db, down.id),
      today,
    ),
  );
}

/** Which of a contract's two late fees a payment is against. */
export type LateFeeKind = "installment" | "down";

export interface LateFeePayment {
  id: number;
  contract_id: number;
  kind: LateFeeKind;
  paid_on: string;
  amount: number;
  note: string | null;
  created_at: string;
}

export type LateFeePaymentFields = Omit<
  LateFeePayment,
  "id" | "contract_id" | "kind" | "created_at"
>;

export async function lateFeePayments(
  db: Db,
  contractId: number,
  kind: LateFeeKind,
): Promise<LateFeePayment[]> {
  return db.select<LateFeePayment>(
    "SELECT * FROM late_fee_payments WHERE contract_id = ? AND kind = ?" +
      " ORDER BY paid_on, id",
    [contractId, kind],
  );
}

export async function getLateFeePayment(
  db: Db,
  id: number,
): Promise<LateFeePayment | undefined> {
  return (
    await db.select<LateFeePayment>("SELECT * FROM late_fee_payments WHERE id = ?", [id])
  )[0];
}

/** Record money received against the late fee, or correct an earlier entry. */
export async function saveLateFeePayment(
  db: Db,
  contractId: number,
  kind: LateFeeKind,
  fields: LateFeePaymentFields,
  id: number | null = null,
): Promise<void> {
  if (id) {
    await db.execute(
      "UPDATE late_fee_payments SET paid_on = ?, amount = ?, note = ? WHERE id = ?",
      [fields.paid_on, fields.amount, fields.note, id],
    );
    return;
  }
  await db.execute(
    "INSERT INTO late_fee_payments (contract_id, kind, paid_on, amount, note," +
      " created_at) VALUES (?, ?, ?, ?, ?, ?)",
    [contractId, kind, fields.paid_on, fields.amount, fields.note, nowIso()],
  );
}

export async function deleteLateFeePayment(db: Db, id: number): Promise<void> {
  await db.execute("DELETE FROM late_fee_payments WHERE id = ?", [id]);
}

export interface DashboardRow extends InstallmentRow {
  first_name: string;
  last_name: string;
  brand: string;
  series: string | null;
  plate_number: string | null;
}

/** Every installment on every active contract, with who and what it is for. */
export async function activeInstallments(db: Db): Promise<DashboardRow[]> {
  return db.select<DashboardRow>(
    "SELECT i.*, COALESCE(SUM(p.amount), 0) AS paid_total," +
      " MAX(p.paid_on) AS last_paid_on," +
      " cl.first_name, cl.last_name, cars.brand, cars.series, cars.plate_number" +
      " FROM installments i" +
      " JOIN contracts c ON c.id = i.contract_id" +
      " JOIN clients cl ON cl.id = c.client_id" +
      " JOIN cars ON cars.id = c.car_id" +
      " LEFT JOIN payments p ON p.installment_id = i.id" +
      " WHERE c.status = 'active'" +
      " GROUP BY i.id ORDER BY i.due_date, i.id",
  );
}

/** Satang received between two ISO dates, inclusive. */
export async function collectedBetween(db: Db, start: string, end: string): Promise<number> {
  const rows = await db.select<{ total: number }>(
    "SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE paid_on BETWEEN ? AND ?",
    [start, end],
  );
  return rows[0]?.total ?? 0;
}
