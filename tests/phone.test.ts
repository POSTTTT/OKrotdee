import { describe, expect, it } from "vitest";

import { formatPhone, phoneList } from "../src/phone";

describe("formatPhone", () => {
  it("groups a mobile number the way it is read", () => {
    expect(formatPhone("0992549191")).toBe("099-254-9191");
  });

  it("groups a landline on its shorter prefix", () => {
    expect(formatPhone("021234567")).toBe("02-123-4567");
  });

  it("leaves anything else exactly as it was entered", () => {
    expect(formatPhone("081-101-2001")).toBe("081-101-2001");
    expect(formatPhone("ต่อ 102")).toBe("ต่อ 102");
    expect(formatPhone("+66992549191")).toBe("+66992549191");
  });
});

describe("phoneList", () => {
  it("formats every number a client has and drops the blanks", () => {
    expect(phoneList("0992549191\n\n021234567")).toEqual(["099-254-9191", "02-123-4567"]);
    expect(phoneList(null)).toEqual([]);
  });
});
