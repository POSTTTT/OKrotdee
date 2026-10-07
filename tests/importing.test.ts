import { describe, expect, it } from "vitest";
import { utils, write } from "xlsx";

import { getCar, listCars, listClients } from "../src/db";
import { guessMapping, importRows, prepare, readSheet, toIsoDate } from "../src/importing";
import { LABELS } from "../src/lang";
import { memoryDb } from "./helpers";

const csv = (text: string) => new TextEncoder().encode(text);

describe("readSheet", () => {
  it("reads an xlsx with dates and numbers as text", () => {
    const book = utils.book_new();
    utils.book_append_sheet(
      book,
      utils.aoa_to_sheet([
        ["ยี่ห้อ", "ประกันหมด"],
        ["Toyota", new Date(Date.UTC(2025, 1, 15))],
        ["", ""],
      ]),
      "a",
    );
    const bytes = new Uint8Array(write(book, { type: "array", bookType: "xlsx" }));
    expect(readSheet(bytes, "cars.xlsx")).toEqual([
      ["ยี่ห้อ", "ประกันหมด"],
      ["Toyota", "2025-02-15"],
    ]);
  });

  it("leaves a csv's leading zeros and dates alone", () => {
    expect(readSheet(csv("phone,date\n0812345678,15/02/2025\n"), "x.CSV")).toEqual([
      ["phone", "date"],
      ["0812345678", "15/02/2025"],
    ]);
  });
});

describe("toIsoDate", () => {
  it("reads day/month/year in either era", () => {
    expect(toIsoDate("15/2/2025")).toBe("2025-02-15");
    expect(toIsoDate("15/02/2568")).toBe("2025-02-15");
    expect(toIsoDate("2025-02-15")).toBe("2025-02-15");
    expect(() => toIsoDate("31/2/2025")).toThrow("err_import_date");
    expect(() => toIsoDate("soon")).toThrow("err_import_date");
  });
});

describe("guessMapping", () => {
  it("matches headers by field name or label", () => {
    const headers = ["ทะเบียน", "Brand", "whatever", "model_year"];
    expect(guessMapping(headers, "cars", Object.values(LABELS))).toEqual({
      plate_number: 0,
      brand: 1,
      model_year: 3,
    });
  });
});

describe("prepare", () => {
  it("checks clients row by row", () => {
    const rows = [
      ["name", "id", "phone"],
      ["สมชาย ใจดี", "", "812345678, 02-123-4567"],
      ["สมหญิง", "", ""],
      ["ก ข", "1234567890123", ""],
    ];
    const { ready, errors } = prepare("clients", rows, { first_name: 0, thai_id: 1, phone: 2 });
    expect(ready).toEqual([
      {
        line: 2,
        fields: expect.objectContaining({
          first_name: "สมชาย",
          last_name: "ใจดี",
          thai_id: null,
          phone: "0812345678\n02-123-4567",
        }),
      },
    ]);
    expect(errors).toEqual([
      { line: 3, error: "err_name_required" },
      { line: 4, error: "err_thai_id_checksum" },
    ]);
  });

  it("converts car years, money and dates", () => {
    const rows = [
      ["brand", "year", "cost", "km", "ins"],
      ["Honda", "2560", "350,000.50", "120,000", "1/3/2569"],
      ["", "2020", "", "", ""],
      ["Mazda", "", "", "lots", ""],
    ];
    const mapping = { brand: 0, model_year: 1, cost_price: 2, mileage: 3, insurance_expires_on: 4 };
    const { ready, errors } = prepare("cars", rows, mapping);
    expect(ready[0].fields).toMatchObject({
      brand: "Honda",
      model_year: 2017,
      cost_price: 35000050,
      mileage: 120000,
      insurance_expires_on: "2026-03-01",
      series: null,
    });
    expect(errors).toEqual([
      { line: 3, error: "err_brand_required" },
      { line: 4, error: "err_import_number" },
    ]);
  });
});

describe("importRows", () => {
  it("writes what it can and reports the duplicates", async () => {
    const db = memoryDb();
    const rows = [["brand", "plate"], ["Toyota", "กข 1234"], ["Honda", "กข 1234"], ["Isuzu", ""]];
    const { ready } = prepare("cars", rows, { brand: 0, plate_number: 1 });
    expect(await importRows(db, "cars", ready)).toEqual({
      imported: 2,
      errors: [{ line: 3, error: "err_plate_taken" }],
    });
    const cars = await listCars(db);
    expect(cars.map((c) => c.brand).sort()).toEqual(["Isuzu", "Toyota"]);
    expect((await getCar(db, cars[0].id))?.status).toBe("available");
  });

  it("refuses a Thai ID already on file", async () => {
    const db = memoryDb();
    const rows = [["n", "id"], ["ก ข", "1101700203450"], ["ค ง", "1101700203450"]];
    const { ready, errors } = prepare("clients", rows, { first_name: 0, thai_id: 1 });
    expect(errors).toEqual([]);
    expect((await importRows(db, "clients", ready)).errors).toEqual([
      { line: 3, error: "err_thai_id_taken" },
    ]);
    expect(await listClients(db)).toHaveLength(1);
  });
});
