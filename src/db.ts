/**
 * The database interface and every query in the application.
 *
 * Queries are written with `?` placeholders and take the Db interface, so
 * the same code runs against @tauri-apps/plugin-sql in the application and
 * against better-sqlite3 in tests.
 */

import Database from "@tauri-apps/plugin-sql";

import { todayIso } from "./money";
import { SCHEMA } from "./schema";

export interface Db {
  select<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  execute(sql: string, params?: unknown[]): Promise<{ lastInsertId: number }>;
}

/** Rewrite `?` placeholders as `$1, $2, …`, which is how the plugin binds them. */
export function toDollarPlaceholders(sql: string): string {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

/** An ISO-8601 timestamp for created_at columns. */
export function nowIso(): string {
  return new Date().toISOString().slice(0, 19);
}

/** Open the application database, enable foreign keys, and apply the schema. */
export async function openDatabase(): Promise<Db> {
  const database = await Database.load("sqlite:okroddee.db");

  const db: Db = {
    async select<T>(sql: string, params: unknown[] = []): Promise<T[]> {
      return database.select<T[]>(toDollarPlaceholders(sql), params);
    },
    async execute(sql: string, params: unknown[] = []) {
      const result = await database.execute(toDollarPlaceholders(sql), params);
      return { lastInsertId: Number(result.lastInsertId ?? 0) };
    },
  };

  await database.execute("PRAGMA foreign_keys = ON");
  for (const statement of SCHEMA.split(";")) {
    if (statement.trim()) await database.execute(statement);
  }
  return db;
}

export interface Client {
  id: number;
  first_name: string;
  last_name: string;
  thai_id: string | null;
  phone: string | null;
  address: string | null;
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
        " WHERE first_name LIKE ? OR last_name LIKE ? OR phone LIKE ? OR thai_id LIKE ?" +
        " ORDER BY first_name, last_name",
      [like, like, like, like],
    );
  }
  return db.select<Client>("SELECT * FROM clients ORDER BY first_name, last_name");
}

export async function getClient(db: Db, id: number): Promise<Client | undefined> {
  return (await db.select<Client>("SELECT * FROM clients WHERE id = ?", [id]))[0];
}

export async function createClient(db: Db, fields: ClientFields): Promise<number> {
  const { lastInsertId } = await db.execute(
    "INSERT INTO clients (first_name, last_name, thai_id, phone, address, note," +
      " created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [
      fields.first_name,
      fields.last_name,
      fields.thai_id,
      fields.phone,
      fields.address,
      fields.note,
      nowIso(),
    ],
  );
  return lastInsertId;
}

export async function updateClient(db: Db, id: number, fields: ClientFields): Promise<void> {
  await db.execute(
    "UPDATE clients SET first_name = ?, last_name = ?, thai_id = ?, phone = ?," +
      " address = ?, note = ? WHERE id = ?",
    [
      fields.first_name,
      fields.last_name,
      fields.thai_id,
      fields.phone,
      fields.address,
      fields.note,
      id,
    ],
  );
}

export async function clientContracts(db: Db, clientId: number): Promise<ContractRow[]> {
  return db.select<ContractRow>(
    "SELECT c.*, cars.brand, cars.series, cars.plate_number FROM contracts c" +
      " JOIN cars ON cars.id = c.car_id WHERE c.client_id = ?" +
      " ORDER BY c.created_at DESC",
    [clientId],
  );
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
      " registration_no, chassis_no, mileage, cost_price, asking_price, note," +
      " status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'available', ?)",
    [...CAR_VALUES(fields), nowIso()],
  );
  await addCarEvent(db, lastInsertId, todayIso(), "acquired");
  return lastInsertId;
}

export async function updateCar(db: Db, id: number, fields: CarFields): Promise<void> {
  await db.execute(
    "UPDATE cars SET brand = ?, series = ?, model_year = ?, color = ?," +
      " plate_number = ?, registration_no = ?, chassis_no = ?, mileage = ?," +
      " cost_price = ?, asking_price = ?, note = ? WHERE id = ?",
    [...CAR_VALUES(fields), id],
  );
}

export async function setCarStatus(db: Db, id: number, status: CarStatus): Promise<void> {
  await db.execute("UPDATE cars SET status = ? WHERE id = ?", [status, id]);
}

export async function carEvents(db: Db, carId: number): Promise<CarEvent[]> {
  return db.select<CarEvent>(
    "SELECT * FROM car_events WHERE car_id = ? ORDER BY event_date, id",
    [carId],
  );
}

export async function carContracts(db: Db, carId: number): Promise<ContractRow[]> {
  return db.select<ContractRow>(
    "SELECT c.*, cl.first_name, cl.last_name FROM contracts c" +
      " JOIN clients cl ON cl.id = c.client_id WHERE c.car_id = ?" +
      " ORDER BY c.created_at DESC",
    [carId],
  );
}
