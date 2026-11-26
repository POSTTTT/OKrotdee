import { describe, expect, it } from "vitest";

import { PROVINCES, joinPlate, splitPlate } from "../src/provinces";

describe("plate and province", () => {
  it("has every province once", () => {
    expect(PROVINCES).toHaveLength(77);
    expect(new Set(PROVINCES).size).toBe(77);
  });

  it("splits a saved plate at a known province", () => {
    expect(splitPlate("2ขข4734 ชลบุรี")).toEqual({ number: "2ขข4734", province: "ชลบุรี" });
    expect(splitPlate("ขค 2481 กรุงเทพมหานคร")).toEqual({
      number: "ขค 2481",
      province: "กรุงเทพมหานคร",
    });
  });

  it("keeps a plate whole when its province is not on the list", () => {
    expect(splitPlate("ผห1185")).toEqual({ number: "ผห1185", province: "" });
    expect(splitPlate("กข1 กทม")).toEqual({ number: "กข1 กทม", province: "" });
    expect(splitPlate(null)).toEqual({ number: "", province: "" });
  });

  it("joins the parts back into one line", () => {
    expect(joinPlate("ฆม4290", "ชลบุรี")).toBe("ฆม4290 ชลบุรี");
    expect(joinPlate("ฆม4290", null)).toBe("ฆม4290");
    expect(joinPlate(null, null)).toBeNull();
  });
});
