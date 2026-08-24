import { describe, expect, it } from "vitest";

import { payment, thaiId, ValidationError } from "../src/validate";

describe("thaiId", () => {
  it("accepts a valid number", () => expect(thaiId("1101700207269")).toBe("1101700207269"));

  it("strips dashes and spaces", () =>
    expect(thaiId("1-1017-00207-26-9")).toBe("1101700207269"));

  it("rejects a bad checksum", () =>
    expect(() => thaiId("1101700207266")).toThrow(ValidationError));

  it("rejects the wrong length", () =>
    expect(() => thaiId("110170020726")).toThrow(ValidationError));

  it("rejects non-digits", () =>
    expect(() => thaiId("110170020726X")).toThrow(ValidationError));
});

describe("payment", () => {
  it("accepts a normal payment", () => {
    expect(() => payment(1540000, "2026-09-15", "2026-09-20")).not.toThrow();
  });

  it("accepts a payment made today", () => {
    expect(() => payment(1540000, "2026-09-20", "2026-09-20")).not.toThrow();
  });

  it("rejects a zero amount", () => {
    expect(() => payment(0, "2026-09-15", "2026-09-20")).toThrow(ValidationError);
  });

  it("rejects a negative amount", () => {
    expect(() => payment(-100, "2026-09-15", "2026-09-20")).toThrow(ValidationError);
  });

  it("rejects a future date", () => {
    expect(() => payment(1540000, "2026-09-25", "2026-09-20")).toThrow(ValidationError);
  });
});
