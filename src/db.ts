/**
 * The database interface and every query in the application.
 *
 * Queries are written with `?` placeholders and take the Db interface, so
 * the same code runs against @tauri-apps/plugin-sql in the application and
 * against better-sqlite3 in tests.
 */

import Database from "@tauri-apps/plugin-sql";

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
