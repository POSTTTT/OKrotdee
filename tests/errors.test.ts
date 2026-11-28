import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { ERROR_CODES, errorMessage, errorText } from "../src/errors";
import { LABELS } from "../src/lang";

// Every message key the program can fail with, found in the source itself so a
// new one cannot be added without a code.
function keysInSource(): Set<string> {
  const keys = new Set<string>();
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (/\.tsx?$/.test(entry.name) && entry.name !== "lang.ts" && entry.name !== "errors.ts") {
        for (const [key] of readFileSync(path, "utf8").matchAll(/err_[a-z_]+/g)) keys.add(key);
      }
    }
  };
  walk(join(__dirname, "../src"));
  keys.delete("err_unexpected");
  return keys;
}

describe("error codes", () => {
  it("gives every error the program raises a code", () => {
    const missing = [...keysInSource()].filter((key) => !ERROR_CODES[key]);
    expect(missing).toEqual([]);
  });

  it("never gives two errors the same code", () => {
    const codes = Object.values(ERROR_CODES);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("has a message in both languages for every code", () => {
    for (const key of Object.keys(ERROR_CODES)) {
      expect(LABELS.th[key], key).toBeTruthy();
      expect(LABELS.en[key], key).toBeTruthy();
    }
  });

  it("shows our own message with its code, anything else as unexpected", () => {
    const t = (key: string) => LABELS.en[key] ?? key;
    expect(errorText("err_payment_date_future", t)).toBe(
      "Payment date cannot be in the future (E4002)",
    );
    expect(errorMessage(new Error("err_plate_taken"), t)).toContain("(E2002)");
    expect(errorMessage(new Error("disk I/O error"), t)).toBe(
      "Something went wrong. (E9000) disk I/O error",
    );
  });
});
