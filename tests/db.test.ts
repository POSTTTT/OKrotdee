import { describe, expect, it } from "vitest";

import {
  addCarEvent,
  availableCars,
  carEvents,
  clientContracts,
  createCar,
  createClient,
  createContract,
  getCar,
  getClient,
  listCars,
  listClients,
  listContracts,
  setCarStatus,
  toDollarPlaceholders,
  updateCar,
  updateClient,
} from "../src/db";
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
    await expect(createContract(db, CONTRACT)).rejects.toThrow(/not available/);
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
