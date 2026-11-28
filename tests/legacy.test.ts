import { describe, expect, it } from "vitest";

import {
  activeFeeDues,
  activeInstallments,
  carryOverpayments,
  collectedBetween,
  contractFees,
  createCar,
  createClient,
  createContract,
  downFeeFine,
  ensureDownFee,
  getInstallment,
  installmentsFor,
  insuranceExpiries,
  listClients,
  listContracts,
  similarClients,
  syncContractStatus,
} from "../src/db";
import { formatBaht, installmentState, lateCount, outstanding, scheduleFee } from "../src/money";
import { memoryDb } from "./helpers";

// What a shop may already have on file from an older version, or typed
// straight into the database: values no form of this version would accept.
// The new code has to read all of it without throwing or producing NaN.

const CAR = {
  series: null,
  model_year: null,
  color: null,
  registration_no: null,
  chassis_no: null,
  mileage: null,
  mileage_unit: "km",
  cost_price: null,
  asking_price: null,
  insurance_expires_on: null,
  note: null,
};
const CONTRACT = {
  car_price: 30000000,
  installment_amount: 1000000,
  installment_count: 3,
  due_day: 7,
  first_due_date: "2026-09-07",
  note: null,
};

async function oddShop() {
  const db = memoryDb();
  const client = await createClient(db, {
    first_name: "A",
    last_name: "B",
    nickname: null,
    thai_id: null,
    phone: null,
    address: null,
    lo_work: null,
    note: null,
  });
  // A Thai ID no check would pass, written straight in.
  await db.execute(
    "INSERT INTO clients (first_name, last_name, thai_id, created_at) VALUES ('C', 'D', '123', '2026-01-01')",
  );
  const cars = [];
  for (const [plate, expiry] of [
    ["1", ""],
    ["2", "not a date"],
    ["3", "2026-12-01"],
  ]) {
    const id = await createCar(db, { ...CAR, brand: "X", plate_number: plate });
    await db.execute("UPDATE cars SET insurance_expires_on = ? WHERE id = ?", [expiry, id]);
    cars.push(id);
  }

  // Installments of 0 and of a negative amount, a negative late fee, and a
  // payment far past everything owed.
  const odd = await createContract(db, {
    ...CONTRACT,
    client_id: client,
    car_id: cars[0],
    down_payment: 0,
  });
  const [i1, i2, i3] = await installmentsFor(db, odd);
  await db.execute("UPDATE installments SET amount_due = 0 WHERE id = ?", [i1.id]);
  await db.execute("UPDATE installments SET amount_due = -500000 WHERE id = ?", [i2.id]);
  await db.execute("UPDATE installments SET late_fee = -100000 WHERE id = ?", [i3.id]);
  await db.execute(
    "INSERT INTO payments (installment_id, paid_on, amount, created_at) VALUES (?, '2026-09-01', 999999999, '2026-09-01')",
    [i3.id],
  );

  // Two down payments, parts promising more than the fee, payments past the
  // parts, and insurance with a fine of 0 and of nothing.
  const fees = await createContract(db, {
    ...CONTRACT,
    client_id: client,
    car_id: cars[1],
    down_payment: 5000000,
  });
  const [down] = await contractFees(db, fees);
  await db.execute(
    "INSERT INTO fees (contract_id, type, due_on, amount, created_at) VALUES (?, 'down', '2026-08-01', 100, '2026-08-01')",
    [fees],
  );
  await db.execute(
    "INSERT INTO fee_schedule (fee_id, due_on, amount, created_at) VALUES (?, '2026-08-01', 90000000, '2026-08-01')",
    [down.id],
  );
  await db.execute(
    "INSERT INTO fee_payments (fee_id, paid_on, amount, created_at) VALUES (?, '2026-08-02', 99000000, '2026-08-02')",
    [down.id],
  );
  for (const officer of [0, null]) {
    await db.execute(
      "INSERT INTO fees (contract_id, type, due_on, amount, officer_amount, created_at)" +
        " VALUES (?, 'insurance', '2026-10-01', 100000, ?, '2026-10-01')",
      [fees, officer],
    );
  }

  // A contract whose schedule has gone entirely.
  const empty = await createContract(db, {
    ...CONTRACT,
    client_id: client,
    car_id: cars[2],
    down_payment: 100000,
  });
  await db.execute("DELETE FROM installments WHERE contract_id = ?", [empty]);

  return { db, odd, fees, empty, i3 };
}

/** Every number in every row is a real number. */
function noNaN(rows: object[]) {
  for (const row of rows) {
    for (const [key, value] of Object.entries(row)) {
      if (typeof value === "number") expect(Number.isFinite(value), key).toBe(true);
    }
  }
}

describe("data from older versions", () => {
  it("reads odd installments without throwing or NaN", async () => {
    const { db, odd, empty, i3 } = await oddShop();
    const rows = await installmentsFor(db, odd);
    noNaN(rows);
    expect(await installmentsFor(db, empty)).toEqual([]);
    expect((await getInstallment(db, i3.id))?.paid_total).toBe(999999999);
    for (const r of rows) {
      const owed = outstanding(r.amount_due, r.late_fee, r.paid_total);
      expect(Number.isFinite(owed)).toBe(true);
      expect(formatBaht(owed)).not.toContain("NaN");
      installmentState(r.amount_due, r.late_fee, r.paid_total, r.due_date, "2026-11-28");
    }
    noNaN(carryOverpayments([]));
  });

  it("builds the dashboard and calendar from them", async () => {
    const { db } = await oddShop();
    noNaN(await activeInstallments(db));
    const fees = await activeFeeDues(db);
    noNaN(fees);
    // A fine of 0 or of nothing is not a row of its own.
    expect(fees.filter((f) => f.kind === "officer")).toHaveLength(0);
    const expiries = await insuranceExpiries(db);
    expect(expiries.map((e) => e.due_date)).toEqual(["2026-12-01", "not a date"]);
    expect(Number.isFinite(await collectedBetween(db, "2026-01-01", "2026-12-31"))).toBe(true);
  });

  it("works out fines and down payments from them", async () => {
    const { db, fees, empty } = await oddShop();
    expect(Number.isFinite(await downFeeFine(db, fees, "2026-11-28"))).toBe(true);
    expect(await ensureDownFee(db, empty)).not.toBeNull();
    expect((await contractFees(db, fees)).filter((f) => f.type === "down")).toHaveLength(2);
  });

  it("keeps contract status and lists working", async () => {
    const { db, odd, empty } = await oddShop();
    await syncContractStatus(db, odd);
    await syncContractStatus(db, empty);
    expect((await listContracts(db)).length).toBe(3);
    const clients = await listClients(db);
    similarClients(clients, { first_name: "C", last_name: "D", phone: null });
  });

  it("never counts a due date that is not a date as late", () => {
    for (const bad of ["", "not a date", "2026/09/07", "2026-13-45"]) {
      expect(lateCount(bad, "2026-11-28")).toBe(0);
      expect(scheduleFee([{ due_on: bad, amount: 100000 }], [], "2026-11-28")).toBe(0);
    }
  });
});
