import Database from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";

import { SCHEMA } from "../src/schema";

let db: Database.Database;

beforeEach(() => {
  db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
});

const insertClient = () =>
  db
    .prepare("INSERT INTO clients (first_name, last_name, created_at) VALUES (?, ?, ?)")
    .run("Somchai", "Jaidee", "2026-08-24T10:00:00");

const insertCar = () =>
  db
    .prepare("INSERT INTO cars (brand, status, created_at) VALUES (?, 'available', ?)")
    .run("Toyota", "2026-08-24T10:00:00");

describe("SCHEMA", () => {
  it("creates every table", () => {
    const names = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((r: any) => r.name);
    for (const table of [
      "clients",
      "cars",
      "contracts",
      "installments",
      "payments",
      "car_events",
    ]) {
      expect(names).toContain(table);
    }
  });

  it("is safe to run twice", () => {
    expect(() => db.exec(SCHEMA)).not.toThrow();
  });

  it("keeps Thai IDs unique", () => {
    const insert = db.prepare(
      "INSERT INTO clients (first_name, last_name, thai_id, created_at) VALUES (?, ?, ?, ?)",
    );
    insert.run("A", "B", "1101700207269", "2026-08-24T10:00:00");
    expect(() => insert.run("C", "D", "1101700207269", "2026-08-24T10:00:00")).toThrow();
  });

  it("keeps plate numbers unique", () => {
    const insert = db.prepare(
      "INSERT INTO cars (brand, plate_number, status, created_at) VALUES (?, ?, 'available', ?)",
    );
    insert.run("Toyota", "1กก1234", "2026-08-24T10:00:00");
    expect(() => insert.run("Honda", "1กก1234", "2026-08-24T10:00:00")).toThrow();
  });

  it("constrains car status", () => {
    expect(() =>
      db
        .prepare("INSERT INTO cars (brand, status, created_at) VALUES (?, 'wrecked', ?)")
        .run("Toyota", "2026-08-24T10:00:00"),
    ).toThrow();
  });

  it("constrains contract status", () => {
    insertClient();
    insertCar();
    expect(() =>
      db
        .prepare(
          "INSERT INTO contracts (client_id, car_id, car_price, down_payment," +
            " installment_amount, installment_count, due_day, first_due_date, status," +
            " created_at) VALUES (1, 1, 1, 0, 1, 1, 15, '2026-09-15', 'paused', ?)",
        )
        .run("2026-08-24T10:00:00"),
    ).toThrow();
  });

  it("enforces foreign keys", () => {
    expect(() =>
      db
        .prepare(
          "INSERT INTO contracts (client_id, car_id, car_price, down_payment," +
            " installment_amount, installment_count, due_day, first_due_date, status," +
            " created_at) VALUES (999, 999, 1, 0, 1, 1, 15, '2026-09-15', 'active', ?)",
        )
        .run("2026-08-24T10:00:00"),
    ).toThrow();
  });

  it("requires a positive payment amount", () => {
    insertClient();
    insertCar();
    db.prepare(
      "INSERT INTO contracts (id, client_id, car_id, car_price, down_payment," +
        " installment_amount, installment_count, due_day, first_due_date, status," +
        " created_at) VALUES (1, 1, 1, 60000000, 10000000, 1540000, 40, 15," +
        " '2026-09-15', 'active', ?)",
    ).run("2026-08-24T10:00:00");
    db.prepare(
      "INSERT INTO installments (id, contract_id, seq, due_date, amount_due)" +
        " VALUES (1, 1, 1, '2026-09-15', 1540000)",
    ).run();
    expect(() =>
      db
        .prepare(
          "INSERT INTO payments (installment_id, paid_on, amount, created_at)" +
            " VALUES (1, '2026-09-15', 0, ?)",
        )
        .run("2026-08-24T10:00:00"),
    ).toThrow();
  });

  it("keeps installment sequence numbers unique per contract", () => {
    insertClient();
    insertCar();
    db.prepare(
      "INSERT INTO contracts (id, client_id, car_id, car_price, down_payment," +
        " installment_amount, installment_count, due_day, first_due_date, status," +
        " created_at) VALUES (1, 1, 1, 60000000, 10000000, 1540000, 40, 15," +
        " '2026-09-15', 'active', ?)",
    ).run("2026-08-24T10:00:00");
    const insert = db.prepare(
      "INSERT INTO installments (contract_id, seq, due_date, amount_due)" +
        " VALUES (1, 1, '2026-09-15', 1540000)",
    );
    insert.run();
    expect(() => insert.run()).toThrow();
  });
});
