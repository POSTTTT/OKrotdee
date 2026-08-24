import { describe, expect, it } from "vitest";

import {
  activeInstallments,
  addCarEvent,
  addPayment,
  availableCars,
  cancelContract,
  carEvents,
  clientContracts,
  collectedBetween,
  completeContractIfPaid,
  createCar,
  createClient,
  createContract,
  getCar,
  getClient,
  getContract,
  getInstallment,
  installmentsFor,
  listCars,
  listClients,
  listContracts,
  overdueRow,
  paymentsFor,
  repossessContract,
  setCarStatus,
  setLateFee,
  toDollarPlaceholders,
  updateCar,
  updateClient,
} from "../src/db";
import { contractFlag, outstanding, overdueCount } from "../src/money";
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

const CLIENT = {
  first_name: "Somchai",
  last_name: "Jaidee",
  thai_id: "1101700207269",
  phone: "0812345678",
  address: "Bangkok",
  note: null,
};

describe("clients", () => {
  it("creates and reads back a client", async () => {
    const db = memoryDb();
    const id = await createClient(db, CLIENT);
    const client = await getClient(db, id);
    expect(client?.first_name).toBe("Somchai");
    expect(client?.thai_id).toBe("1101700207269");
  });

  it("stores a missing Thai ID as null", async () => {
    const db = memoryDb();
    const id = await createClient(db, { ...CLIENT, thai_id: null });
    expect((await getClient(db, id))?.thai_id).toBeNull();
  });

  it("rejects a duplicate Thai ID", async () => {
    const db = memoryDb();
    await createClient(db, CLIENT);
    await expect(createClient(db, { ...CLIENT, first_name: "Malee" })).rejects.toThrow();
  });

  it("lists clients alphabetically", async () => {
    const db = memoryDb();
    await createClient(db, { ...CLIENT, first_name: "Somchai", thai_id: null });
    await createClient(db, { ...CLIENT, first_name: "Malee", thai_id: null });
    const names = (await listClients(db)).map((c) => c.first_name);
    expect(names).toEqual(["Malee", "Somchai"]);
  });

  it("searches by phone", async () => {
    const db = memoryDb();
    await createClient(db, { ...CLIENT, thai_id: null });
    await createClient(db, {
      ...CLIENT,
      first_name: "Malee",
      phone: "0999999999",
      thai_id: null,
    });
    const found = await listClients(db, "0812");
    expect(found).toHaveLength(1);
    expect(found[0].first_name).toBe("Somchai");
  });

  it("searches by name and Thai ID", async () => {
    const db = memoryDb();
    await createClient(db, CLIENT);
    expect(await listClients(db, "Jaidee")).toHaveLength(1);
    expect(await listClients(db, "11017")).toHaveLength(1);
    expect(await listClients(db, "nobody")).toHaveLength(0);
  });

  it("updates a client", async () => {
    const db = memoryDb();
    const id = await createClient(db, CLIENT);
    await updateClient(db, id, { ...CLIENT, last_name: "Changed" });
    expect((await getClient(db, id))?.last_name).toBe("Changed");
  });

  it("returns no contracts for a new client", async () => {
    const db = memoryDb();
    const id = await createClient(db, CLIENT);
    expect(await clientContracts(db, id)).toEqual([]);
  });
});

const CAR = {
  brand: "Toyota",
  series: "Vios",
  model_year: 2018,
  color: "White",
  plate_number: "1กก1234",
  registration_no: "กท-1234",
  chassis_no: "MR0000000000",
  mileage: 85000,
  cost_price: 45000000,
  asking_price: 60000000,
  note: null,
};

describe("cars", () => {
  it("creates a car as available", async () => {
    const db = memoryDb();
    const id = await createCar(db, CAR);
    const car = await getCar(db, id);
    expect(car?.status).toBe("available");
    expect(car?.asking_price).toBe(60000000);
  });

  it("writes an acquired event for a new car", async () => {
    const db = memoryDb();
    const id = await createCar(db, CAR);
    const events = await carEvents(db, id);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("acquired");
  });

  it("rejects a duplicate plate number", async () => {
    const db = memoryDb();
    await createCar(db, CAR);
    await expect(createCar(db, { ...CAR, brand: "Honda" })).rejects.toThrow();
  });

  it("filters by status", async () => {
    const db = memoryDb();
    await createCar(db, CAR);
    expect(await listCars(db, "available")).toHaveLength(1);
    expect(await listCars(db, "sold")).toHaveLength(0);
  });

  it("searches by plate number and brand", async () => {
    const db = memoryDb();
    await createCar(db, CAR);
    expect(await listCars(db, undefined, "Toyota")).toHaveLength(1);
    expect(await listCars(db, undefined, "กก1234")).toHaveLength(1);
    expect(await listCars(db, undefined, "Honda")).toHaveLength(0);
  });

  it("updates a car without touching its status", async () => {
    const db = memoryDb();
    const id = await createCar(db, CAR);
    await setCarStatus(db, id, "on_contract");
    await updateCar(db, id, { ...CAR, color: "Black" });
    const car = await getCar(db, id);
    expect(car?.color).toBe("Black");
    expect(car?.status).toBe("on_contract");
  });

  it("rejects an invalid status", async () => {
    const db = memoryDb();
    const id = await createCar(db, CAR);
    await expect(setCarStatus(db, id, "wrecked" as never)).rejects.toThrow();
  });

  it("keeps timeline events in date order", async () => {
    const db = memoryDb();
    const id = await createCar(db, CAR);
    await addCarEvent(db, id, "2020-01-01", "note", null, "Older note");
    const events = await carEvents(db, id);
    expect(events[0].note).toBe("Older note");
    expect(events).toHaveLength(2);
  });
});

const CONTRACT = {
  client_id: 1,
  car_id: 1,
  car_price: 60000000,
  down_payment: 10000000,
  installment_amount: 1540000,
  installment_count: 40,
  due_day: 15,
  first_due_date: "2026-09-15",
  note: null,
};

async function seeded() {
  const db = memoryDb();
  await createClient(db, { ...CLIENT, thai_id: null });
  await createCar(db, CAR);
  return db;
}

describe("createContract", () => {
  it("generates the full schedule", async () => {
    const db = await seeded();
    const id = await createContract(db, CONTRACT);
    const rows = await db.select<{ due_date: string; amount_due: number }>(
      "SELECT * FROM installments WHERE contract_id = ? ORDER BY seq",
      [id],
    );
    expect(rows).toHaveLength(40);
    expect(rows[0].due_date).toBe("2026-09-15");
    expect(rows[1].due_date).toBe("2026-10-15");
    expect(rows[39].due_date).toBe("2029-12-15");
    expect(new Set(rows.map((r) => r.amount_due))).toEqual(new Set([1540000]));
  });

  it("puts the car on contract", async () => {
    const db = await seeded();
    await createContract(db, CONTRACT);
    expect((await getCar(db, 1))?.status).toBe("on_contract");
  });

  it("writes a contract_started event", async () => {
    const db = await seeded();
    const id = await createContract(db, CONTRACT);
    const events = await carEvents(db, 1);
    expect(events.map((e) => e.type)).toEqual(["acquired", "contract_started"]);
    expect(events[1].contract_id).toBe(id);
  });

  it("refuses a car that is not available", async () => {
    const db = await seeded();
    await createContract(db, CONTRACT);
    await expect(createContract(db, CONTRACT)).rejects.toThrow(/err_car_not_available/);
    expect(await listContracts(db)).toHaveLength(1);
  });

  it("refuses zero installments", async () => {
    const db = await seeded();
    await expect(
      createContract(db, { ...CONTRACT, installment_count: 0 }),
    ).rejects.toThrow();
    expect(await listContracts(db)).toHaveLength(0);
  });

  it("lists contracts with client and car joined", async () => {
    const db = await seeded();
    await createContract(db, CONTRACT);
    const [contract] = await listContracts(db);
    expect(contract.first_name).toBe("Somchai");
    expect(contract.brand).toBe("Toyota");
    expect(contract.status).toBe("active");
  });

  it("filters contracts by status", async () => {
    const db = await seeded();
    await createContract(db, CONTRACT);
    expect(await listContracts(db, "active")).toHaveLength(1);
    expect(await listContracts(db, "completed")).toHaveLength(0);
  });

  it("drops the car out of the available list", async () => {
    const db = await seeded();
    expect(await availableCars(db)).toHaveLength(1);
    await createContract(db, CONTRACT);
    expect(await availableCars(db)).toHaveLength(0);
  });
});

async function contracted() {
  const db = await seeded();
  const id = await createContract(db, CONTRACT);
  return { db, id };
}

describe("payments", () => {
  it("reads a contract joined with its client and car", async () => {
    const { db, id } = await contracted();
    const contract = await getContract(db, id);
    expect(contract?.first_name).toBe("Somchai");
    expect(contract?.plate_number).toBe("1กก1234");
  });

  it("starts every installment unpaid", async () => {
    const { db, id } = await contracted();
    const rows = await installmentsFor(db, id);
    expect(rows).toHaveLength(40);
    expect(rows[0].paid_total).toBe(0);
    expect(rows[0].late_fee).toBe(0);
  });

  it("records a full payment", async () => {
    const { db, id } = await contracted();
    const [first] = await installmentsFor(db, id);
    await addPayment(db, first.id, "2026-09-15", 1540000, "cash", null);
    const row = await getInstallment(db, first.id);
    expect(row?.paid_total).toBe(1540000);
    expect(outstanding(row!.amount_due, row!.late_fee, row!.paid_total)).toBe(0);
  });

  it("leaves a balance after a partial payment", async () => {
    const { db, id } = await contracted();
    const [first] = await installmentsFor(db, id);
    await addPayment(db, first.id, "2026-09-15", 1000000, "cash", null);
    const row = await getInstallment(db, first.id);
    expect(outstanding(row!.amount_due, row!.late_fee, row!.paid_total)).toBe(540000);
  });

  it("settles an installment with two partial payments", async () => {
    const { db, id } = await contracted();
    const [first] = await installmentsFor(db, id);
    await addPayment(db, first.id, "2026-09-15", 1000000, "cash", null);
    await addPayment(db, first.id, "2026-09-20", 540000, "transfer", "rest");
    const row = await getInstallment(db, first.id);
    expect(row?.paid_total).toBe(1540000);
    expect(await paymentsFor(db, first.id)).toHaveLength(2);
  });

  it("adds the late fee to what is owed", async () => {
    const { db, id } = await contracted();
    const [first] = await installmentsFor(db, id);
    await setLateFee(db, first.id, 50000);
    await addPayment(db, first.id, "2026-09-20", 1540000, "cash", null);
    const row = await getInstallment(db, first.id);
    expect(row?.late_fee).toBe(50000);
    expect(outstanding(row!.amount_due, row!.late_fee, row!.paid_total)).toBe(50000);
  });

  it("does not complete a contract while anything is owed", async () => {
    const { db, id } = await contracted();
    const [first] = await installmentsFor(db, id);
    await addPayment(db, first.id, "2026-09-15", 1540000, "cash", null);
    expect(await completeContractIfPaid(db, id)).toBe(false);
    expect((await getContract(db, id))?.status).toBe("active");
  });

  it("completes the contract when every installment is paid", async () => {
    const { db, id } = await contracted();
    for (const installment of await installmentsFor(db, id)) {
      await addPayment(db, installment.id, "2026-09-15", 1540000, "cash", null);
    }
    expect(await completeContractIfPaid(db, id)).toBe(true);
    expect((await getContract(db, id))?.status).toBe("completed");
    expect((await getCar(db, 1))?.status).toBe("sold");
    const events = await carEvents(db, 1);
    expect(events[events.length - 1].type).toBe("contract_completed");
  });

  it("completes only once", async () => {
    const { db, id } = await contracted();
    for (const installment of await installmentsFor(db, id)) {
      await addPayment(db, installment.id, "2026-09-15", 1540000, "cash", null);
    }
    expect(await completeContractIfPaid(db, id)).toBe(true);
    expect(await completeContractIfPaid(db, id)).toBe(false);
    expect(await carEvents(db, 1)).toHaveLength(3);
  });

  it("keeps an unpaid late fee from completing the contract", async () => {
    const { db, id } = await contracted();
    const installments = await installmentsFor(db, id);
    await setLateFee(db, installments[0].id, 50000);
    for (const installment of installments) {
      await addPayment(db, installment.id, "2026-09-15", 1540000, "cash", null);
    }
    expect(await completeContractIfPaid(db, id)).toBe(false);
  });
});

describe("repossession", () => {
  it("closes the contract and takes the car back", async () => {
    const { db, id } = await contracted();
    await repossessContract(db, id);
    expect((await getContract(db, id))?.status).toBe("repossessed");
    expect((await getCar(db, 1))?.status).toBe("repossessed");
  });

  it("writes a repossessed event", async () => {
    const { db, id } = await contracted();
    await repossessContract(db, id);
    const events = await carEvents(db, 1);
    expect(events[events.length - 1].type).toBe("repossessed");
    expect(events[events.length - 1].contract_id).toBe(id);
  });

  it("lets a repossessed car be sold again", async () => {
    const { db, id } = await contracted();
    await repossessContract(db, id);
    await setCarStatus(db, 1, "available");
    await createClient(db, { ...CLIENT, first_name: "Malee", thai_id: null });
    const second = await createContract(db, { ...CONTRACT, client_id: 2 });
    expect(second).toBeGreaterThan(id);
    expect((await getCar(db, 1))?.status).toBe("on_contract");
  });

  it("returns the car to available on cancellation", async () => {
    const { db, id } = await contracted();
    await cancelContract(db, id);
    expect((await getContract(db, id))?.status).toBe("cancelled");
    expect((await getCar(db, 1))?.status).toBe("available");
  });

  it("only warns when two installments are missed", async () => {
    const { db, id } = await contracted();
    const rows = await installmentsFor(db, id);
    const flag = contractFlag(overdueCount(rows.map(overdueRow), "2099-01-01"));
    expect(flag).toBe("REPOSSESS_ELIGIBLE");
    expect((await getContract(db, id))?.status).toBe("active");
  });
});

describe("dashboard queries", () => {
  it("lists every installment on active contracts with its client and car", async () => {
    const { db } = await contracted();
    const rows = await activeInstallments(db);
    expect(rows).toHaveLength(40);
    expect(rows[0].first_name).toBe("Somchai");
    expect(rows[0].plate_number).toBe("1กก1234");
  });

  it("excludes installments of cancelled contracts", async () => {
    const { db, id } = await contracted();
    await cancelContract(db, id);
    expect(await activeInstallments(db)).toHaveLength(0);
  });

  it("totals money received in a date range", async () => {
    const { db, id } = await contracted();
    const [first, second] = await installmentsFor(db, id);
    await addPayment(db, first.id, "2026-09-15", 1540000, "cash", null);
    await addPayment(db, second.id, "2026-10-15", 1540000, "cash", null);
    expect(await collectedBetween(db, "2026-09-01", "2026-09-30")).toBe(1540000);
  });

  it("counts both ends of the range", async () => {
    const { db, id } = await contracted();
    const [first] = await installmentsFor(db, id);
    await addPayment(db, first.id, "2026-09-01", 1000000, "cash", null);
    expect(await collectedBetween(db, "2026-09-01", "2026-09-01")).toBe(1000000);
  });

  it("returns zero when nothing was collected", async () => {
    const { db } = await contracted();
    expect(await collectedBetween(db, "2026-09-01", "2026-09-30")).toBe(0);
  });
});
