import { describe, expect, it } from "vitest";

import { daysInMonth, formatDate, parts, toIso } from "../src/dates";

describe("dates", () => {
  it("formats a stored date as day/month/year", () => {
    expect(formatDate("2025-10-15")).toBe("15/10/2025");
    // No leading zeros, and the year stays as stored.
    expect(formatDate("2025-02-05")).toBe("5/2/2025");
    // Anything that is not a date is shown as it is, never as a wrong date.
    expect(formatDate("")).toBe("");
  });

  it("clamps a day that the chosen month does not have", () => {
    expect(toIso(2025, 2, 31)).toBe("2025-02-28");
    expect(toIso(2024, 2, 31)).toBe("2024-02-29");
    expect(toIso(2025, 12, 5)).toBe("2025-12-05");
    expect(daysInMonth(2025, 4)).toBe(30);
  });

  it("reads an ISO date apart", () => {
    expect(parts("2025-10-15")).toEqual({ year: 2025, month: 10, day: 15 });
    expect(parts("15/10/2025")).toBeNull();
  });
});
