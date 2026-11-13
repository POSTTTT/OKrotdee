import { describe, expect, it } from "vitest";

import {
  activeInstallments,
  contractRuleChanges,
  contractRules,
  createCar,
  createClient,
  createContract,
  getContract,
  setContractRules,
  setShopRules,
  shopRules,
} from "../src/db";
import {
  DEFAULT_RULES,
  contractFlag,
  lateCount,
  lateFee,
  rulesOn,
} from "../src/money";
import { memoryDb } from "./helpers";

const RULES = { graceDays: 5, feePercent: 10, repossessAfter: 3 };

async function seeded() {
  const db = memoryDb();
  await createClient(db, {
    first_name: "Somchai",
    last_name: "Jaidee",
    nickname: null,
    thai_id: null,
    phone: null,
    address: null,
    lo_work: null,
    note: null,
  });
  await createCar(db, {
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
  return db;
}

const CONTRACT = {
  client_id: 1,
  car_id: 1,
  car_price: 60_000_000,
  down_payment: 0,
  installment_amount: 1_540_000,
  installment_count: 12,
  due_day: 15,
  first_due_date: "2026-09-15",
  note: null,
};

describe("rules in the maths", () => {
  it("counts late only after the contract's grace period", () => {
    expect(lateCount("2025-02-15", "2025-02-20", RULES)).toBe(0);
    expect(lateCount("2025-02-15", "2025-02-21", RULES)).toBe(1);
    expect(lateCount("2025-02-15", "2025-03-21", RULES)).toBe(2);
  });

  it("charges the contract's percent", () => {
    expect(lateFee(1_540_000, 2, RULES)).toBe(308_000);
  });

  it("flags for repossession at the contract's threshold", () => {
    expect(contractFlag(2, RULES)).toBe("OVERDUE");
    expect(contractFlag(3, RULES)).toBe("REPOSSESS_ELIGIBLE");
  });
});

describe("rulesOn", () => {
  const base = DEFAULT_RULES;
  const changes = [
    { startsOn: "2026-06-01", rules: { ...RULES, feePercent: 20 } },
    { startsOn: "2026-03-01", rules: RULES },
  ];

  it("uses the contract's own rules before any change", () => {
    expect(rulesOn(base, changes, "2026-02-28")).toEqual(base);
  });

  it("uses the latest change already started, in any order", () => {
    expect(rulesOn(base, changes, "2026-03-01")).toEqual(RULES);
    expect(rulesOn(base, changes, "2026-05-31")).toEqual(RULES);
    expect(rulesOn(base, changes, "2026-06-01").feePercent).toBe(20);
  });
});

describe("shop and contract rules", () => {
  it("starts with the rules the shop always used", async () => {
    expect(await shopRules(memoryDb())).toEqual(DEFAULT_RULES);
  });

  it("copies the shop rules onto a new contract, and leaves old ones alone", async () => {
    const db = await seeded();
    const before = await createContract(db, CONTRACT);
    await setShopRules(db, RULES);
    await createCar(db, {
      brand: "Honda",
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
    const after = await createContract(db, { ...CONTRACT, car_id: 2 });
    expect(contractRules((await getContract(db, before))!)).toEqual(DEFAULT_RULES);
    expect(contractRules((await getContract(db, after))!)).toEqual(RULES);
  });

  it("changes one contract only from the chosen due date on", async () => {
    const db = await seeded();
    const id = await createContract(db, CONTRACT);
    await setContractRules(db, id, RULES, "2026-11-01");
    const base = contractRules((await getContract(db, id))!);
    const changes = await contractRuleChanges(db, id);
    // Installments due before the change keep the rules they were fined under.
    expect(rulesOn(base, changes, "2026-10-15")).toEqual(DEFAULT_RULES);
    expect(rulesOn(base, changes, "2026-11-15")).toEqual(RULES);
    expect(await shopRules(db)).toEqual(DEFAULT_RULES);
  });

  it("gives the dashboard the rules in force today", async () => {
    const db = await seeded();
    const id = await createContract(db, CONTRACT);
    await setContractRules(db, id, RULES, "2000-01-01");
    await setContractRules(db, id, { ...RULES, repossessAfter: 9 }, "2999-01-01");
    const [row] = await activeInstallments(db);
    expect(contractRules(row)).toEqual(RULES);
  });

  it("lets a second change on the same day replace the first", async () => {
    const db = await seeded();
    const id = await createContract(db, CONTRACT);
    await setContractRules(db, id, RULES, "2026-11-01");
    await setContractRules(db, id, { ...RULES, feePercent: 12 }, "2026-11-01");
    const changes = await contractRuleChanges(db, id);
    expect(changes).toHaveLength(1);
    expect(changes[0].rules.feePercent).toBe(12);
  });

  it("refuses rules that would charge nonsense", async () => {
    const db = await seeded();
    const id = await createContract(db, CONTRACT);
    for (const bad of [
      { ...RULES, graceDays: -1 },
      { ...RULES, graceDays: 1.5 },
      { ...RULES, feePercent: 101 },
      { ...RULES, feePercent: NaN },
      { ...RULES, repossessAfter: 0 },
    ]) {
      await expect(setContractRules(db, id, bad, "2026-11-01")).rejects.toThrow(
        "err_rules_invalid",
      );
      await expect(setShopRules(db, bad)).rejects.toThrow("err_rules_invalid");
    }
  });
});
