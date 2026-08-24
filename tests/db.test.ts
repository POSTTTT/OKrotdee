import { describe, expect, it } from "vitest";

import { toDollarPlaceholders } from "../src/db";
import { memoryDb } from "./helpers";

describe("toDollarPlaceholders", () => {
  it("numbers placeholders in order", () => {
    expect(toDollarPlaceholders("INSERT INTO t (a, b) VALUES (?, ?)")).toBe(
      "INSERT INTO t (a, b) VALUES ($1, $2)",
    );
  });

  it("leaves SQL without placeholders alone", () => {
    expect(toDollarPlaceholders("SELECT * FROM t")).toBe("SELECT * FROM t");
  });
});

describe("memoryDb", () => {
  it("round-trips a row", async () => {
    const db = memoryDb();
    const { lastInsertId } = await db.execute(
      "INSERT INTO clients (first_name, last_name, created_at) VALUES (?, ?, ?)",
      ["Somchai", "Jaidee", "2026-08-24T10:00:00"],
    );
    expect(lastInsertId).toBe(1);
    const rows = await db.select<{ first_name: string }>("SELECT * FROM clients");
    expect(rows[0].first_name).toBe("Somchai");
  });

  it("starts empty for each database", async () => {
    const db = memoryDb();
    expect(await db.select("SELECT * FROM clients")).toEqual([]);
  });
});
