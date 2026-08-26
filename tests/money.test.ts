import { describe, expect, it } from "vitest";

import {
  contractFlag,
  formatBaht,
  generateSchedule,
  installmentState,
  lateCount,
  lateFee,
  outstanding,
  overdueCount,
  scheduleStrikes,
  settledOn,
  toSatang,
} from "../src/money";

describe("toSatang", () => {
  it("handles whole baht", () => expect(toSatang("15400")).toBe(1540000));
  it("handles commas and spaces", () => expect(toSatang(" 15,400 ")).toBe(1540000));
  it("handles decimals", () => expect(toSatang("15400.50")).toBe(1540050));
  it("rounds half up", () => expect(toSatang("0.005")).toBe(1));
  it("handles numbers", () => expect(toSatang(15400)).toBe(1540000));
  it("rejects garbage", () => expect(() => toSatang("abc")).toThrow());
  it("rejects an empty string", () => expect(() => toSatang("")).toThrow());
});

describe("formatBaht", () => {
  it("groups thousands", () => expect(formatBaht(1540000)).toBe("15,400.00"));
  it("keeps satang", () => expect(formatBaht(1540050)).toBe("15,400.50"));
  it("handles zero", () => expect(formatBaht(0)).toBe("0.00"));
  it("handles negatives", () => expect(formatBaht(-1540000)).toBe("-15,400.00"));
});

describe("generateSchedule", () => {
  it("starts on the first due date", () => {
    expect(generateSchedule("2026-09-15", 3, 15)[0]).toBe("2026-09-15");
  });

  it("advances one month at a time", () => {
    expect(generateSchedule("2026-09-15", 3, 15)).toEqual([
      "2026-09-15",
      "2026-10-15",
      "2026-11-15",
    ]);
  });

  it("crosses the year boundary", () => {
    expect(generateSchedule("2026-11-15", 3, 15)[2]).toBe("2027-01-15");
  });

  it("clamps to a short month", () => {
    expect(generateSchedule("2027-01-31", 2, 31)[1]).toBe("2027-02-28");
  });

  it("clamps to a leap February", () => {
    expect(generateSchedule("2028-01-31", 2, 31)[1]).toBe("2028-02-29");
  });

  it("recovers after a clamped month", () => {
    expect(generateSchedule("2027-01-31", 3, 31)[2]).toBe("2027-03-31");
  });

  it("honours a first due date off the due day", () => {
    expect(generateSchedule("2026-09-20", 2, 15)).toEqual(["2026-09-20", "2026-10-15"]);
  });

  it("generates a forty-month contract", () => {
    const dates = generateSchedule("2026-09-15", 40, 15);
    expect(dates).toHaveLength(40);
    expect(dates[39]).toBe("2029-12-15");
  });

  it("rejects zero installments", () => {
    expect(() => generateSchedule("2026-09-15", 0, 15)).toThrow();
  });

  it("rejects a due day out of range", () => {
    expect(() => generateSchedule("2026-09-15", 3, 32)).toThrow();
  });
});

describe("outstanding", () => {
  it("subtracts payments", () => expect(outstanding(1540000, 0, 1000000)).toBe(540000));
  it("includes the late fee", () => expect(outstanding(1540000, 50000, 1540000)).toBe(50000));
  it("goes negative on overpayment", () =>
    expect(outstanding(1540000, 0, 1600000)).toBe(-60000));
});

describe("installmentState", () => {
  it("is PAID when nothing is outstanding", () => {
    expect(installmentState(1540000, 0, 1540000, "2026-09-15", "2026-10-01")).toBe("PAID");
  });

  it("is PAID when overpaid", () => {
    expect(installmentState(1540000, 0, 1600000, "2026-09-15", "2026-10-01")).toBe("PAID");
  });

  it("prefers PARTIAL over OVERDUE", () => {
    expect(installmentState(1540000, 0, 1000000, "2026-09-15", "2026-10-01")).toBe("PARTIAL");
  });

  it("is OVERDUE when past due and untouched", () => {
    expect(installmentState(1540000, 0, 0, "2026-09-15", "2026-10-01")).toBe("OVERDUE");
  });

  it("is UPCOMING when due in the future", () => {
    expect(installmentState(1540000, 0, 0, "2026-09-15", "2026-09-01")).toBe("UPCOMING");
  });

  it("is not yet overdue on the due date itself", () => {
    expect(installmentState(1540000, 0, 0, "2026-09-15", "2026-09-15")).toBe("UPCOMING");
  });

  it("keeps an installment open for an unpaid late fee", () => {
    expect(installmentState(1540000, 50000, 1540000, "2026-09-15", "2026-10-01")).toBe(
      "PARTIAL",
    );
  });
});

describe("overdueCount", () => {
  const row = (dueDate: string, paidTotal = 0) => ({
    dueDate,
    amountDue: 1540000,
    lateFee: 0,
    paidTotal,
  });

  it("ignores future installments", () => {
    expect(overdueCount([row("2026-10-15"), row("2026-11-15")], "2026-10-01")).toBe(0);
  });

  it("counts unpaid past installments", () => {
    const rows = [row("2026-08-15"), row("2026-09-15"), row("2026-10-15")];
    expect(overdueCount(rows, "2026-10-01")).toBe(2);
  });

  it("includes partially paid past installments", () => {
    expect(overdueCount([row("2026-08-15", 1000000)], "2026-10-01")).toBe(1);
  });

  it("excludes fully paid past installments", () => {
    expect(overdueCount([row("2026-08-15", 1540000)], "2026-10-01")).toBe(0);
  });
});

describe("contractFlag", () => {
  it("maps overdue counts to warning levels", () => {
    expect(contractFlag(0)).toBe("OK");
    expect(contractFlag(1)).toBe("OVERDUE");
    expect(contractFlag(2)).toBe("REPOSSESS_ELIGIBLE");
    expect(contractFlag(7)).toBe("REPOSSESS_ELIGIBLE");
  });
});

describe("lateCount", () => {
  const due = "2025-02-15";

  it("counts nothing inside the grace period", () => {
    expect(lateCount(due, "2025-02-15")).toBe(0);
    expect(lateCount(due, "2025-02-18")).toBe(0);
    // Paying early is never late.
    expect(lateCount(due, "2025-02-01")).toBe(0);
  });

  it("counts one strike from the day after the grace period", () => {
    expect(lateCount(due, "2025-02-19")).toBe(1);
    expect(lateCount(due, "2025-03-18")).toBe(1);
  });

  it("adds a strike for every further month that passes", () => {
    expect(lateCount(due, "2025-03-19")).toBe(2);
    expect(lateCount(due, "2025-04-18")).toBe(2);
    expect(lateCount(due, "2025-04-19")).toBe(3);
  });

  it("clamps to the end of a short month", () => {
    // Due 31 January: the next strike lands on 28 February plus grace.
    expect(lateCount("2025-01-31", "2025-02-03")).toBe(0);
    expect(lateCount("2025-01-31", "2025-02-04")).toBe(1);
    expect(lateCount("2025-01-31", "2025-03-03")).toBe(1);
    expect(lateCount("2025-01-31", "2025-03-04")).toBe(2);
  });

  it("crosses a year end", () => {
    expect(lateCount("2025-12-15", "2025-12-18")).toBe(0);
    expect(lateCount("2025-12-15", "2025-12-19")).toBe(1);
    expect(lateCount("2025-12-15", "2026-01-19")).toBe(2);
  });
});

describe("lateFee", () => {
  it("charges 15% of the installment for each time it is late", () => {
    // 15,400.00 baht, in satang.
    expect(lateFee(1_540_000, 1)).toBe(231_000);
    // The whole contract in the shop's own example: 24 strikes.
    expect(lateFee(1_540_000, 24)).toBe(5_544_000);
  });

  it("charges nothing when the installment was paid on time", () => {
    expect(lateFee(1_540_000, 0)).toBe(0);
  });

  it("rounds once per strike, not once at the end", () => {
    // 15% of 100.03 is 15.0045 satang short of a round satang.
    expect(lateFee(10_003, 1)).toBe(1_500);
    expect(lateFee(10_003, 3)).toBe(4_500);
  });
});

describe("settledOn", () => {
  it("reports the day the last part arrived", () => {
    // 20,000 due: half on the due date, the rest four days later.
    expect(
      settledOn(2_000_000, [
        { paid_on: "2025-02-15", amount: 1_000_000 },
        { paid_on: "2025-02-19", amount: 1_000_000 },
      ]),
    ).toBe("2025-02-19");
  });

  it("reports nothing while any of it is still owed", () => {
    expect(settledOn(2_000_000, [{ paid_on: "2025-02-15", amount: 1_000_000 }])).toBeNull();
    expect(settledOn(2_000_000, [])).toBeNull();
  });

  it("ignores the order the payments were entered in", () => {
    expect(
      settledOn(2_000_000, [
        { paid_on: "2025-02-19", amount: 1_000_000 },
        { paid_on: "2025-02-15", amount: 1_000_000 },
      ]),
    ).toBe("2025-02-19");
  });

  it("settles on the payment that covers it, not a later extra", () => {
    expect(
      settledOn(2_000_000, [
        { paid_on: "2025-02-15", amount: 2_500_000 },
        { paid_on: "2025-03-01", amount: 100_000 },
      ]),
    ).toBe("2025-02-15");
  });
});

describe("the shop's down payment case", () => {
  it("charges 15% of the whole down payment when the rest arrives late", () => {
    const due = "2025-02-15";
    const charged = 2_000_000; // 20,000.00

    // Half on the due date, the rest on the 19th: one strike.
    const settled = settledOn(charged, [
      { paid_on: due, amount: 1_000_000 },
      { paid_on: "2025-02-19", amount: 1_000_000 },
    ]);
    expect(settled).toBe("2025-02-19");
    expect(lateFee(charged, lateCount(due, settled!))).toBe(300_000); // 3,000.00

    // The same halves, but the rest lands inside the grace period.
    const onTime = settledOn(charged, [
      { paid_on: due, amount: 1_000_000 },
      { paid_on: "2025-02-18", amount: 1_000_000 },
    ]);
    expect(lateFee(charged, lateCount(due, onTime!))).toBe(0);
  });
});

describe("scheduleStrikes", () => {
  const today = "2025-06-01";

  it("collects nothing when the client keeps to the arrangement", () => {
    // 20,000 agreed as two parts: 10,000 on the 15th, 10,000 on the 19th.
    const promised = [
      { due_on: "2025-02-15", amount: 1_000_000 },
      { due_on: "2025-02-19", amount: 1_000_000 },
    ];
    const payments = [
      { paid_on: "2025-02-15", amount: 1_000_000 },
      { paid_on: "2025-02-19", amount: 1_000_000 },
    ];
    expect(scheduleStrikes(promised, payments, today)).toBe(0);
    expect(lateFee(2_000_000, scheduleStrikes(promised, payments, today))).toBe(0);
  });

  it("still charges when the whole sum was due at once", () => {
    // No arrangement: all 20,000 due on the 15th, half of it arrives on the 19th.
    const promised = [{ due_on: "2025-02-15", amount: 2_000_000 }];
    const payments = [
      { paid_on: "2025-02-15", amount: 1_000_000 },
      { paid_on: "2025-02-19", amount: 1_000_000 },
    ];
    expect(scheduleStrikes(promised, payments, today)).toBe(1);
    expect(lateFee(2_000_000, scheduleStrikes(promised, payments, today))).toBe(300_000);
  });

  it("charges only the part that was missed", () => {
    const promised = [
      { due_on: "2025-02-15", amount: 1_000_000 },
      { due_on: "2025-02-19", amount: 1_000_000 },
    ];
    // The first part on time, the second a month and a half late.
    const payments = [
      { paid_on: "2025-02-15", amount: 1_000_000 },
      { paid_on: "2025-03-25", amount: 1_000_000 },
    ];
    expect(scheduleStrikes(promised, payments, today)).toBe(2);
  });

  it("keeps counting a promised part that has not arrived", () => {
    const promised = [
      { due_on: "2025-02-15", amount: 1_000_000 },
      { due_on: "2025-02-19", amount: 1_000_000 },
    ];
    const payments = [{ paid_on: "2025-02-15", amount: 1_000_000 }];
    // Nothing since. The second part was promised on the 19th, so its strikes
    // land on 23 February, 23 March and 23 April: three by 19 May.
    expect(scheduleStrikes(promised, payments, "2025-05-19")).toBe(3);
    // The fourth arrives on 23 May.
    expect(scheduleStrikes(promised, payments, "2025-05-23")).toBe(4);
  });

  it("reads the parts in date order however they were entered", () => {
    const promised = [
      { due_on: "2025-02-19", amount: 1_000_000 },
      { due_on: "2025-02-15", amount: 1_000_000 },
    ];
    const payments = [
      { paid_on: "2025-02-15", amount: 1_000_000 },
      { paid_on: "2025-02-19", amount: 1_000_000 },
    ];
    expect(scheduleStrikes(promised, payments, today)).toBe(0);
  });
});
