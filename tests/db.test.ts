import { describe, expect, it } from "vitest";

import {
  addContractCoClient,
  activeContractForCar,
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
  contractCoClients,
  removeContractCoClient,
  addFeePayment,
  addFeeSchedulePart,
  contractFees,
  downFeeFine,
  feePayments,
  getFee,
  deleteCar,
  deleteClient,
  deleteContract,
  getCar,
  getClient,
  getContract,
  getInstallment,
  deleteFeePayment,
  deleteLateFeePayment,
  installmentsFor,
  lateFeePayments,
  saveLateFeePayment,
  listCars,
  listClients,
  listContracts,
  overdueRow,
  deletePayment,
  paymentsFor,
  syncContractStatus,
  updatePayment,
  repossessContract,
  deleteFee,
  saveFee,
  deleteCarEvent,
  setCarEvent,
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
  nickname: "Chai",
  thai_id: "1101700207269",
  phone: "0812345678",
  address: "Bangkok",
  lo_work: "Silom",
  note: null,
};

describe("clients", () => {
  it("creates and reads back a client", async () => {
    const db = memoryDb();
    const id = await createClient(db, CLIENT);
    const client = await getClient(db, id);
    expect(client?.first_name).toBe("Somchai");
    expect(client?.thai_id).toBe("1101700207269");
    expect(client?.nickname).toBe("Chai");
    expect(client?.lo_work).toBe("Silom");
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

  it("searches by nickname", async () => {
    const db = memoryDb();
    await createClient(db, { ...CLIENT, thai_id: null });
    await createClient(db, { ...CLIENT, first_name: "Malee", nickname: "Lek", thai_id: null });
    const found = await listClients(db, "Lek");
    expect(found).toHaveLength(1);
    expect(found[0].first_name).toBe("Malee");
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
  insurance_expires_on: null,
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

describe("timeline dates", () => {
  it("corrects the date on an entry logged under the wrong day", async () => {
    const db = memoryDb();
    const carId = await createCar(db, {
      brand: "Toyota",
      series: null,
      model_year: null,
      color: null,
      plate_number: null,
      registration_no: null,
      chassis_no: null,
      mileage: null,
      cost_price: null,
      asking_price: null,
      insurance_expires_on: null,
      note: null,
    });
    await addCarEvent(db, carId, "2026-01-05", "note", null, "wrong day");
    const [entry] = await carEvents(db, carId);

    await setCarEvent(db, entry.id, "2026-01-03", "right day");

    const [corrected] = await carEvents(db, carId);
    expect(corrected.event_date).toBe("2026-01-03");
    expect(corrected.note).toBe("right day");

    // The car keeps the "acquired" entry it was given when it was saved.
    await deleteCarEvent(db, entry.id);
    expect((await carEvents(db, carId)).map((x) => x.type)).toEqual(["acquired"]);
  });
});

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

  it("does not touch a contract that is already closed", async () => {
    const { db, id } = await contracted();
    await cancelContract(db, id);
    await setCarStatus(db, 1, "on_contract"); // the car went out on another deal
    await repossessContract(db, id);
    expect((await getContract(db, id))?.status).toBe("cancelled");
    expect((await getCar(db, 1))?.status).toBe("on_contract");
  });

  it("does not free the car when cancelling a closed contract", async () => {
    const { db, id } = await contracted();
    await repossessContract(db, id);
    await setCarStatus(db, 1, "on_contract"); // resold on a new contract
    await cancelContract(db, id);
    expect((await getContract(db, id))?.status).toBe("repossessed");
    expect((await getCar(db, 1))?.status).toBe("on_contract");
  });

  it("only warns when two installments are missed", async () => {
    const { db, id } = await contracted();
    const rows = await installmentsFor(db, id);
    const flag = contractFlag(overdueCount(rows.map(overdueRow), "2099-01-01"));
    expect(flag).toBe("REPOSSESS_ELIGIBLE");
    expect((await getContract(db, id))?.status).toBe("active");
  });
});

describe("one live contract per car", () => {
  it("refuses a second contract when the car status was set back by hand", async () => {
    const { db } = await contracted();
    await setCarStatus(db, 1, "available");
    await createClient(db, { ...CLIENT, first_name: "Malee", thai_id: null });
    await expect(createContract(db, { ...CONTRACT, client_id: 2 })).rejects.toThrow(
      "err_car_has_active_contract",
    );
    expect(await listContracts(db, "active")).toHaveLength(1);
  });

  it("finds the active contract on a car and nothing on a free one", async () => {
    const { db, id } = await contracted();
    expect((await activeContractForCar(db, 1))?.id).toBe(id);
    await cancelContract(db, id);
    expect(await activeContractForCar(db, 1)).toBeUndefined();
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

describe("delete", () => {
  const carFields = {
    brand: "Toyota",
    series: null,
    model_year: null,
    color: null,
    plate_number: null,
    registration_no: null,
    chassis_no: null,
    mileage: null,
    cost_price: null,
    asking_price: null,
    insurance_expires_on: null,
    note: null,
  };
  const clientFields = {
    first_name: "A",
    last_name: "B",
    nickname: null,
    thai_id: null,
    phone: null,
    address: null,
    lo_work: null,
    note: null,
  };

  it("removes an unused car with its timeline, and an unused client", async () => {
    const db = memoryDb();
    const carId = await createCar(db, carFields);
    const clientId = await createClient(db, clientFields);

    await deleteCar(db, carId);
    await deleteClient(db, clientId);

    expect(await getCar(db, carId)).toBeUndefined();
    expect(await carEvents(db, carId)).toHaveLength(0);
    expect(await getClient(db, clientId)).toBeUndefined();
  });

  it("refuses once a contract references them", async () => {
    const db = memoryDb();
    const carId = await createCar(db, carFields);
    const clientId = await createClient(db, clientFields);
    await createContract(db, {
      client_id: clientId,
      car_id: carId,
      car_price: 30000000,
      down_payment: 0,
      installment_amount: 500000,
      installment_count: 2,
      due_day: 5,
      first_due_date: "2026-01-05",
      note: null,
    });

    await expect(deleteCar(db, carId)).rejects.toThrow("err_car_has_contracts");
    await expect(deleteClient(db, clientId)).rejects.toThrow("err_client_has_contracts");
    expect(await getCar(db, carId)).toBeDefined();
    expect(await getClient(db, clientId)).toBeDefined();
  });

  it("takes a contract's payments and fees with it, and frees the car", async () => {
    const db = memoryDb();
    const carId = await createCar(db, carFields);
    const clientId = await createClient(db, clientFields);
    const contractId = await createContract(db, {
      client_id: clientId,
      car_id: carId,
      car_price: 30000000,
      down_payment: 0,
      installment_amount: 500000,
      installment_count: 2,
      due_day: 5,
      first_due_date: "2026-01-05",
      note: null,
    });
    const [first] = await installmentsFor(db, contractId);
    await addPayment(db, first.id, "2026-01-05", 500000, null, null);
    await saveFee(db, contractId, {
      type: "down",
      due_on: "2026-01-05",
      paid_on: null,
      amount: 100000,
      officer_amount: null,
      officer_paid_on: null,
      note: null,
    });
    const [fee] = await contractFees(db, contractId);
    await addFeePayment(db, fee.id, "2026-01-05", 100000);
    await saveLateFeePayment(db, contractId, "installment", {
      paid_on: "2026-01-06",
      amount: 1000,
      note: null,
    });

    await deleteContract(db, contractId);

    expect(await getContract(db, contractId)).toBeUndefined();
    expect(await installmentsFor(db, contractId)).toHaveLength(0);
    expect(await paymentsFor(db, first.id)).toHaveLength(0);
    expect(await contractFees(db, contractId)).toHaveLength(0);
    expect(await feePayments(db, fee.id)).toHaveLength(0);
    expect(await lateFeePayments(db, contractId, "installment")).toHaveLength(0);
    expect((await getCar(db, carId))?.status).toBe("available");
    // The car is free to sell again, not merely unreferenced.
    expect(await availableCars(db)).toHaveLength(1);
  });
});

describe("fees", () => {
  const insurance = (
    dueOn: string,
    amount: number,
    officer: number | null,
    paidOn: string | null = dueOn,
  ) => ({
    type: "insurance" as const,
    due_on: dueOn,
    paid_on: paidOn,
    amount,
    officer_amount: officer,
    officer_paid_on: null,
    note: null,
  });

  it("keeps one row per yearly insurance payment", async () => {
    const db = await seeded();
    const contractId = await createContract(db, CONTRACT);

    await saveFee(db, contractId, insurance("2026-09-02", 500000, 30000));
    await saveFee(db, contractId, insurance("2027-09-20", 520000, null));

    const rows = await contractFees(db, contractId);
    expect(rows.map((f) => f.due_on)).toEqual(["2026-09-02", "2027-09-20"]);
    expect(rows[0].officer_amount).toBe(30000);
    expect(rows[1].officer_amount).toBeNull();
  });

  it("keeps the police fine on its own payment date", async () => {
    const db = await seeded();
    const contractId = await createContract(db, CONTRACT);

    // The insurance is settled on the 2nd, the fine only two weeks later.
    await saveFee(db, contractId, {
      ...insurance("2026-09-01", 500000, 30000, "2026-09-02"),
      officer_paid_on: "2026-09-16",
    });

    const [row] = await contractFees(db, contractId);
    expect(row.paid_on).toBe("2026-09-02");
    expect(row.officer_paid_on).toBe("2026-09-16");
  });

  it("records a fee the client has not paid yet, then marks it paid", async () => {
    const db = await seeded();
    const contractId = await createContract(db, CONTRACT);

    await saveFee(db, contractId, insurance("2027-09-01", 520000, null, null));
    const owed = (await contractFees(db, contractId))[0];
    expect(owed.paid_on).toBeNull();

    await saveFee(
      db,
      contractId,
      insurance("2027-09-01", 520000, null, "2027-09-14"),
      owed.id,
    );
    expect((await getFee(db, owed.id))?.paid_on).toBe("2027-09-14");
  });

  it("corrects a fee in place and deletes one", async () => {
    const db = await seeded();
    const contractId = await createContract(db, CONTRACT);
    await saveFee(db, contractId, {
      type: "down",
      due_on: "2026-09-01",
      paid_on: "2026-09-01",
      amount: 2000000,
      officer_amount: null,
      officer_paid_on: null,
      note: null,
    });
    const down = (await contractFees(db, contractId))[0];

    await saveFee(
      db,
      contractId,
      { ...insurance("2026-09-03", 2500000, null), type: "down" },
      down.id,
    );
    const corrected = await getFee(db, down.id);
    expect(corrected?.amount).toBe(2500000);
    expect(await contractFees(db, contractId)).toHaveLength(1);

    await deleteFee(db, down.id);
    expect(await contractFees(db, contractId)).toHaveLength(0);
  });
});

describe("last payment date", () => {
  it("reports the most recent payment on the installment, and null before any", async () => {
    const db = await seeded();
    const contractId = await createContract(db, CONTRACT);
    const [first, second] = await installmentsFor(db, contractId);

    await addPayment(db, first.id, "2026-09-14", 500000, "cash", null);
    await addPayment(db, first.id, "2026-09-20", 500000, "cash", null);

    const rows = await installmentsFor(db, contractId);
    expect(rows[0].last_paid_on).toBe("2026-09-20");
    expect(rows[1].last_paid_on).toBeNull();
    expect((await getInstallment(db, second.id))?.last_paid_on).toBeNull();
  });
});

describe("correcting a payment", () => {
  /** A contract with one installment, paid in full and therefore closed. */
  async function closedContract() {
    const db = await seeded();
    const contractId = await createContract(db, { ...CONTRACT, installment_count: 1 });
    const [installment] = await installmentsFor(db, contractId);
    await addPayment(db, installment.id, "2026-09-15", CONTRACT.installment_amount, "cash", null);
    await syncContractStatus(db, contractId);
    return { db, contractId, installmentId: installment.id };
  }

  it("closes the contract and sells the car once the money is in", async () => {
    const { db, contractId } = await closedContract();
    expect((await getContract(db, contractId))?.status).toBe("completed");
    expect((await getCar(db, CONTRACT.car_id))?.status).toBe("sold");
  });

  it("reopens the contract when a payment is corrected downwards", async () => {
    const { db, contractId, installmentId } = await closedContract();
    const [payment] = await paymentsFor(db, installmentId);

    await updatePayment(db, payment.id, "2026-09-15", 100000, "cash", "was mistyped");
    await syncContractStatus(db, contractId);

    expect((await getContract(db, contractId))?.status).toBe("active");
    expect((await getCar(db, CONTRACT.car_id))?.status).toBe("on_contract");
    expect((await getInstallment(db, installmentId))?.paid_total).toBe(100000);
  });

  it("reopens the contract when a payment is deleted", async () => {
    const { db, contractId, installmentId } = await closedContract();
    const [payment] = await paymentsFor(db, installmentId);

    await deletePayment(db, payment.id);
    await syncContractStatus(db, contractId);

    expect((await getContract(db, contractId))?.status).toBe("active");
    expect(await paymentsFor(db, installmentId)).toHaveLength(0);
  });

  it("leaves a repossessed contract alone", async () => {
    const { db, contractId, installmentId } = await closedContract();
    await db.execute("UPDATE contracts SET status = 'repossessed' WHERE id = ?", [contractId]);
    const [payment] = await paymentsFor(db, installmentId);

    await deletePayment(db, payment.id);
    await syncContractStatus(db, contractId);

    expect((await getContract(db, contractId))?.status).toBe("repossessed");
  });
});

describe("late fee payments", () => {
  it("records what the client pays against the late fee, and corrects it", async () => {
    const db = await seeded();
    const contractId = await createContract(db, CONTRACT);

    await saveLateFeePayment(db, contractId, "installment", {
      paid_on: "2026-10-01",
      amount: 231000,
      note: null,
    });
    await saveLateFeePayment(db, contractId, "installment", {
      paid_on: "2026-11-02",
      amount: 231000,
      note: "second",
    });

    let rows = await lateFeePayments(db, contractId, "installment");
    expect(rows.map((r) => r.paid_on)).toEqual(["2026-10-01", "2026-11-02"]);
    expect(rows.reduce((sum, r) => sum + r.amount, 0)).toBe(462000);

    await saveLateFeePayment(
      db,
      contractId,
      "installment",
      { paid_on: "2026-11-02", amount: 100000, note: "was mistyped" },
      rows[1].id,
    );
    rows = await lateFeePayments(db, contractId, "installment");
    expect(rows[1].amount).toBe(100000);
    expect(rows).toHaveLength(2);

    await deleteLateFeePayment(db, rows[0].id);
    expect(await lateFeePayments(db, contractId, "installment")).toHaveLength(1);
  });

  it("keeps the two late fees in separate pots", async () => {
    const db = await seeded();
    const contractId = await createContract(db, CONTRACT);

    await saveLateFeePayment(db, contractId, "installment", {
      paid_on: "2026-10-01",
      amount: 231000,
      note: null,
    });
    await saveLateFeePayment(db, contractId, "down", {
      paid_on: "2026-10-01",
      amount: 300000,
      note: null,
    });

    const onInstallments = await lateFeePayments(db, contractId, "installment");
    const onDown = await lateFeePayments(db, contractId, "down");
    expect(onInstallments).toHaveLength(1);
    expect(onInstallments[0].amount).toBe(231000);
    expect(onDown).toHaveLength(1);
    expect(onDown[0].amount).toBe(300000);
  });
});

describe("the down payment's late fee", () => {
  /** A contract with a 20,000.00 down payment due on 15 February. */
  async function withDownFee() {
    const db = await seeded();
    const contractId = await createContract(db, CONTRACT);
    await saveFee(db, contractId, {
      type: "down",
      due_on: "2025-02-15",
      paid_on: null,
      amount: 2_000_000,
      officer_amount: null,
      officer_paid_on: null,
      note: null,
    });
    const fee = (await contractFees(db, contractId)).find((f) => f.type === "down")!;
    return { db, contractId, feeId: fee.id };
  }

  it("charges nothing when the whole down payment lands inside the grace period", async () => {
    const { db, contractId, feeId } = await withDownFee();
    await addFeePayment(db, feeId, "2025-02-15", 1_000_000);
    await addFeePayment(db, feeId, "2025-02-18", 1_000_000);
    expect(await downFeeFine(db, contractId, "2025-06-01")).toBe(0);
  });

  it("charges 15% of the whole down payment when the rest arrives late", async () => {
    const { db, contractId, feeId } = await withDownFee();
    await addFeePayment(db, feeId, "2025-02-15", 1_000_000);
    await addFeePayment(db, feeId, "2025-02-19", 1_000_000);
    // 15% of 20,000.00, not of the 10,000.00 that was still owed.
    expect(await downFeeFine(db, contractId, "2025-06-01")).toBe(300_000);
  });

  it("charges nothing when the client keeps to an agreed split", async () => {
    const { db, contractId, feeId } = await withDownFee();
    // 20,000 agreed as 10,000 on the 15th and 10,000 on the 19th.
    await addFeeSchedulePart(db, feeId, "2025-02-15", 1_000_000);
    await addFeeSchedulePart(db, feeId, "2025-02-19", 1_000_000);
    await addFeePayment(db, feeId, "2025-02-15", 1_000_000);
    await addFeePayment(db, feeId, "2025-02-19", 1_000_000);

    expect(await downFeeFine(db, contractId, "2025-06-01")).toBe(0);
  });

  it("charges when an agreed part is missed", async () => {
    const { db, contractId, feeId } = await withDownFee();
    await addFeeSchedulePart(db, feeId, "2025-02-15", 1_000_000);
    await addFeeSchedulePart(db, feeId, "2025-02-19", 1_000_000);
    // The first part on time, the second three weeks after it was promised.
    await addFeePayment(db, feeId, "2025-02-15", 1_000_000);
    await addFeePayment(db, feeId, "2025-03-12", 1_000_000);

    expect(await downFeeFine(db, contractId, "2025-06-01")).toBe(300_000);
  });

  it("keeps counting while any of it is still owed", async () => {
    const { db, contractId, feeId } = await withDownFee();
    await addFeePayment(db, feeId, "2025-02-15", 1_000_000);
    // Nothing since, and it is now well past the second strike on 19 March.
    expect(await downFeeFine(db, contractId, "2025-03-19")).toBe(600_000);
  });

  it("charges nothing on a contract with no down payment recorded", async () => {
    const db = await seeded();
    const contractId = await createContract(db, CONTRACT);
    expect(await downFeeFine(db, contractId, "2025-06-01")).toBe(0);
  });

  it("removes a part that was entered by mistake", async () => {
    const { db, feeId } = await withDownFee();
    await addFeePayment(db, feeId, "2025-02-15", 1_000_000, "cash");
    const [part] = await feePayments(db, feeId);
    expect(part.note).toBe("cash");
    await deleteFeePayment(db, part.id);
    expect(await feePayments(db, feeId)).toHaveLength(0);
  });
});

describe("co-signers", () => {
  it("lists a second signer, finds the contract from their page, and lets go", async () => {
    const db = await seeded();
    await createClient(db, { ...CLIENT, first_name: "Sup", thai_id: null });
    const id = await createContract(db, CONTRACT);

    // The main client cannot sign twice.
    await expect(addContractCoClient(db, id, 1)).rejects.toThrow(
      /err_client_already_on_contract/,
    );

    await addContractCoClient(db, id, 2);
    await addContractCoClient(db, id, 2);
    expect(await contractCoClients(db, id)).toHaveLength(1);
    // The contract shows on the co-signer's page too, so deleting them is refused.
    expect(await clientContracts(db, 2)).toHaveLength(1);
    await expect(deleteClient(db, 2)).rejects.toThrow(/err_client_has_contracts/);

    await removeContractCoClient(db, id, 2);
    expect(await contractCoClients(db, id)).toHaveLength(0);
    expect(await clientContracts(db, 2)).toHaveLength(0);
  });
});
