import Database from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";

import { statements } from "../src/db";
import { MIGRATIONS, REBUILDS, SCHEMA } from "../src/schema";

let db: Database.Database;

beforeEach(() => {
  db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
});

describe("applying the schema the way the app does", () => {
  /**
   * openDatabase cannot send the whole script at once: the SQL plugin takes
   * one statement per call, so it strips comments and splits on ";". A
   * semicolon inside a comment used to cut a statement in half, which only
   * showed up in the running app because these tests used exec() on the whole
   * script.
   */
  it("runs statement by statement, comments and all", () => {
    const fresh = new Database(":memory:");
    for (const statement of statements(SCHEMA)) fresh.exec(statement);
    const tables = (
      fresh.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as {
        name: string;
      }[]
    ).map((t) => t.name);
    expect(tables).toEqual(
      expect.arrayContaining([
        "clients",
        "cars",
        "contracts",
        "installments",
        "payments",
        "car_events",
        "fees",
        "fee_schedule",
        "fee_payments",
        "late_fee_payments",
      ]),
    );
  });
});

/** The database as it was before refinancing had a word for it anywhere. */
function beforeRefinancing(): Database.Database {
  const old = new Database(":memory:");
  old.exec(
    SCHEMA.replace("'cancelled','refinanced'", "'cancelled'")
      .replace("'repossessed','refinanced','sold','note'", "'repossessed','sold','note'")
      .replace("'repossessed','refinanced','note'", "'repossessed','note'")
      .replace("  refinanced_from    INTEGER REFERENCES contracts(id),\n", ""),
  );
  old.prepare(
    "INSERT INTO clients (id, first_name, last_name, created_at)" +
      " VALUES (1, 'A', 'B', '2026-08-24T10:00:00')",
  ).run();
  old.prepare(
    "INSERT INTO cars (id, brand, status, created_at)" +
      " VALUES (1, 'Toyota', 'available', '2026-08-24T10:00:00')",
  ).run();
  old.prepare(
    "INSERT INTO contracts (id, client_id, car_id, car_price, down_payment," +
      " installment_amount, installment_count, due_day, first_due_date, status," +
      " created_at) VALUES (7, 1, 1, 60000000, 10000000, 1540000, 40, 15," +
      " '2026-09-15', 'active', '2026-08-24T10:00:00')",
  ).run();
  old.prepare(
    "INSERT INTO installments (contract_id, seq, due_date, amount_due)" +
      " VALUES (7, 1, '2026-09-15', 1540000)",
  ).run();
  old.prepare(
    "INSERT INTO car_events (id, car_id, event_date, type, contract_id)" +
      " VALUES (3, 1, '2026-08-24', 'contract_started', 7)",
  ).run();
  return old;
}

describe("the rebuilds refinancing needed", () => {
  /**
   * The shop's database is full of contracts written before refinancing
   * existed, in tables whose CHECK does not know the word. Every row has to
   * come across, and the new word has to be taken afterwards.
   */
  it("carries the rows across and accepts the new status and event", () => {
    const old = beforeRefinancing();

    // The same switch openDatabase throws: dropping a table is what the
    // tables pointing at it would otherwise refuse.
    old.pragma("foreign_keys = OFF");
    for (const version of REBUILDS.slice(1)) {
      for (const statement of version) old.exec(statement);
    }
    for (const statement of MIGRATIONS) {
      try {
        old.exec(statement);
      } catch {
        // Already applied, which is how openDatabase runs them too.
      }
    }
    old.pragma("foreign_keys = ON");

    expect(old.prepare("SELECT car_price FROM contracts WHERE id = 7").get()).toEqual({
      car_price: 60000000,
    });
    expect(
      old.prepare("SELECT COUNT(*) AS n FROM installments WHERE contract_id = 7").get(),
    ).toEqual({ n: 1 });
    expect(old.prepare("SELECT type FROM car_events WHERE id = 3").get()).toEqual({
      type: "contract_started",
    });

    expect(() =>
      old.prepare("UPDATE contracts SET status = 'refinanced' WHERE id = 7").run(),
    ).not.toThrow();
    expect(() =>
      old
        .prepare(
          "INSERT INTO car_events (car_id, event_date, type, contract_id)" +
            " VALUES (1, '2026-09-03', 'refinanced', 7)",
        )
        .run(),
    ).not.toThrow();
    expect(() =>
      old
        .prepare(
          "INSERT INTO client_events (client_id, event_date, type, contract_id)" +
            " VALUES (1, '2026-09-03', 'refinanced', 7)",
        )
        .run(),
    ).not.toThrow();
    // The column the new contract points back through arrives with them.
    expect(() =>
      old.prepare("UPDATE contracts SET refinanced_from = NULL WHERE id = 7").run(),
    ).not.toThrow();
  });
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
