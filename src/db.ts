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
