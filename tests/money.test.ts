import { describe, expect, it } from "vitest";

import {
  contractFlag,
  daysLate,
  formatBaht,
  generateSchedule,
  installmentState,
  outstanding,
  overdueCount,
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

describe("daysLate", () => {
  it("counts days after the due date", () =>
    expect(daysLate("2026-09-15", "2026-09-20")).toBe(5));
  it("is zero when paid on time", () =>
    expect(daysLate("2026-09-15", "2026-09-15")).toBe(0));
  it("is zero when paid early", () =>
    expect(daysLate("2026-09-15", "2026-09-10")).toBe(0));
  it("counts across a month boundary", () =>
    expect(daysLate("2026-09-15", "2026-10-01")).toBe(16));
});
