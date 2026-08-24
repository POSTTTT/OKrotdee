import Database from "better-sqlite3";

import type { Db } from "../src/db";
import { SCHEMA } from "../src/schema";

/** The Db interface backed by better-sqlite3, for tests. */
export function memoryDb(): Db {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);

  return {
    async select<T>(sql: string, params: unknown[] = []): Promise<T[]> {
      return db.prepare(sql).all(...(params as any[])) as T[];
    },
    async execute(sql: string, params: unknown[] = []) {
      const result = db.prepare(sql).run(...(params as any[]));
      return { lastInsertId: Number(result.lastInsertRowid) };
    },
  };
}
