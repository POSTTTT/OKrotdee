/**
 * Bringing clients and cars in from a spreadsheet the shop already keeps.
 * The staff say which column holds which field; every row is checked before
 * anything is written, so a bad file costs nothing.
 */

import { read, utils } from "xlsx";

import { createCar, createClient, type CarFields, type ClientFields, type Db } from "./db";
import { toSatang } from "./money";
import { thaiId } from "./validate";

export type ImportKind = "clients" | "cars";

/** The fields a column can be matched to, in the order the dialog lists them. */
export const FIELDS: Record<ImportKind, string[]> = {
  clients: ["first_name", "last_name", "nickname", "thai_id", "phone", "address", "lo_work", "note"],
  cars: [
    "brand",
    "series",
    "model_year",
    "color",
    "plate_number",
    "registration_no",
    "chassis_no",
    "mileage",
    "cost_price",
    "asking_price",
    "insurance_expires_on",
    "note",
  ],
};

/** Field name to column index; a field left unmatched is absent. */
export type Mapping = Record<string, number>;

/**
 * Every row of the first sheet as text, header row first. A CSV is read as
 * plain text: left to itself the parser turns 0812345678 into a number and
 * 15/02/2025 into an American date.
 */
export function readSheet(bytes: Uint8Array, fileName: string): string[][] {
  const book = /\.csv$/i.test(fileName)
    ? read(new TextDecoder().decode(bytes), { type: "string", raw: true })
    : read(bytes, { type: "array", cellDates: true });
  const rows = utils.sheet_to_json<unknown[]>(book.Sheets[book.SheetNames[0]], {
    header: 1,
    raw: true,
    defval: "",
  });
  return rows
    .map((row) =>
      row.map((cell) =>
        // Excel dates arrive as midnight UTC.
        cell instanceof Date ? cell.toISOString().slice(0, 10) : String(cell).trim(),
      ),
    )
    .filter((row) => row.some(Boolean));
}

/** Match a header to a field when it is the field's name or its label in either language. */
export function guessMapping(
  headers: string[],
  kind: ImportKind,
  labels: Record<string, string>[],
): Mapping {
  const mapping: Mapping = {};
  const norm = (s: string) => s.toLowerCase().replace(/[\s._-]/g, "");
  for (const field of FIELDS[kind]) {
    const names = [field, ...labels.map((l) => l[field])].filter(Boolean).map(norm);
    const index = headers.findIndex((h) => names.includes(norm(h)));
    if (index >= 0) mapping[field] = index;
  }
  return mapping;
}

/** Read 15/2/2025, 15/2/2568 or 2025-02-15 as an ISO date. */
export function toIsoDate(text: string): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
  let [y, mo, d] = m ? [+m[1], +m[2], +m[3]] : [0, 0, 0];
  if (!m) {
    m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(text);
    if (!m) throw new Error("err_import_date");
    [d, mo, y] = [+m[1], +m[2], +m[3]];
  }
  // Thai paperwork counts years from the Buddha: 2568 is 2025.
  if (y > 2400) y -= 543;
  if (mo < 1 || mo > 12 || d < 1 || d > new Date(Date.UTC(y, mo, 0)).getUTCDate()) {
    throw new Error("err_import_date");
  }
  return `${y}-${pad(mo)}-${pad(d)}`;
}

function whole(text: string): number {
  const n = Number(text.replace(/,/g, ""));
  if (!Number.isInteger(n)) throw new Error("err_import_number");
  return n;
}

/** One phone per line, as the form keeps them. Excel drops a mobile number's leading 0. */
function phones(text: string): string {
  return text
    .split(/[\n,]/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => (/^[689]\d{8}$/.test(p) ? "0" + p : p))
    .join("\n");
}

function toClient(cell: (f: string) => string | null): ClientFields {
  let first = cell("first_name");
  let last = cell("last_name");
  // A sheet often keeps the whole name in one column.
  if (first && !last && /\s/.test(first)) [first, last] = first.split(/\s+(.*)/);
  if (!first || !last) throw new Error("err_name_required");
  const id = cell("thai_id");
  const phone = cell("phone");
  return {
    first_name: first,
    last_name: last,
    nickname: cell("nickname"),
    thai_id: id ? thaiId(id) : null,
    phone: phone ? phones(phone) : null,
    address: cell("address"),
    lo_work: cell("lo_work"),
    note: cell("note"),
  };
}

function toCar(cell: (f: string) => string | null): CarFields {
  const brand = cell("brand");
  if (!brand) throw new Error("err_brand_required");
  const or = <T>(f: string, parse: (s: string) => T) => {
    const v = cell(f);
    return v === null ? null : parse(v);
  };
  const year = or("model_year", whole);
  return {
    brand,
    series: cell("series"),
    model_year: year !== null && year > 2400 ? year - 543 : year,
    color: cell("color"),
    plate_number: cell("plate_number"),
    registration_no: cell("registration_no"),
    chassis_no: cell("chassis_no"),
    mileage: or("mileage", whole),
    cost_price: or("cost_price", toSatang),
    asking_price: or("asking_price", toSatang),
    insurance_expires_on: or("insurance_expires_on", toIsoDate),
    note: cell("note"),
  };
}

export interface RowError {
  /** The row's number as the spreadsheet shows it. */
  line: number;
  error: string;
}

export interface Prepared<T> {
  ready: { line: number; fields: T }[];
  errors: RowError[];
}

/** Check every data row (header excluded) without writing anything. */
export function prepare(
  kind: ImportKind,
  rows: string[][],
  mapping: Mapping,
): Prepared<ClientFields | CarFields> {
  const result: Prepared<ClientFields | CarFields> = { ready: [], errors: [] };
  rows.slice(1).forEach((row, i) => {
    const cell = (f: string) => (f in mapping ? row[mapping[f]] || null : null);
    const line = i + 2;
    try {
      result.ready.push({ line, fields: kind === "clients" ? toClient(cell) : toCar(cell) });
    } catch (e) {
      result.errors.push({ line, error: e instanceof Error ? e.message : String(e) });
    }
  });
  return result;
}

/**
 * Write the rows that passed. A row the database refuses — a Thai ID or plate
 * already on file — is reported and the rest still go in.
 */
export async function importRows(
  db: Db,
  kind: ImportKind,
  ready: Prepared<ClientFields | CarFields>["ready"],
): Promise<{ imported: number; errors: RowError[] }> {
  let imported = 0;
  const errors: RowError[] = [];
  for (const { line, fields } of ready) {
    try {
      if (kind === "clients") await createClient(db, fields as ClientFields);
      else await createCar(db, fields as CarFields);
      imported++;
    } catch (e) {
      const message = String(e);
      errors.push({
        line,
        error: !message.includes("UNIQUE")
          ? message
          : kind === "clients"
            ? "err_thai_id_taken"
            : "err_plate_taken",
      });
    }
  }
  return { imported, errors };
}
