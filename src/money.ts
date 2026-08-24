/**
 * Money, schedules, and derived contract status.
 *
 * Every amount here is an integer number of satang (1 THB = 100 satang);
 * floating-point money is never used. Every date is an ISO-8601 string,
 * which compares correctly with < and >.
 */

export type InstallmentState = "PAID" | "PARTIAL" | "OVERDUE" | "UPCOMING";
export type ContractFlag = "OK" | "OVERDUE" | "REPOSSESS_ELIGIBLE";

export interface OverdueRow {
  dueDate: string;
  amountDue: number;
  lateFee: number;
  paidTotal: number;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Parse a user-entered baht amount into integer satang, rounding half up. */
export function toSatang(value: string | number): number {
  const text = String(value).replace(/,/g, "").trim();
  const match = /^(-)?(\d+)(?:\.(\d+))?$/.exec(text);
  if (!match) throw new Error(`not a valid amount: ${value}`);
  const [, sign, whole, fraction = ""] = match;
  const digits = (fraction + "000").slice(0, 3);
  const satang = Number(whole) * 100 + Number(digits.slice(0, 2));
  const rounded = Number(digits[2]) >= 5 ? satang + 1 : satang;
  return sign ? -rounded : rounded;
}

/** Render integer satang as baht, e.g. 1540000 -> "15,400.00". */
export function formatBaht(satang: number): string {
  const sign = satang < 0 ? "-" : "";
  const absolute = Math.abs(satang);
  const whole = Math.floor(absolute / 100).toLocaleString("en-US");
  return `${sign}${whole}.${pad(absolute % 100)}`;
}

/**
 * Return `count` due dates: the first exactly on `firstDue`, then `dueDay`
 * of each following month, clamped to each month's last day.
 */
export function generateSchedule(
  firstDue: string,
  count: number,
  dueDay: number,
): string[] {
  if (count < 1) throw new Error("a contract needs at least one installment");
  if (dueDay < 1 || dueDay > 31) throw new Error("dueDay must be between 1 and 31");

  const [year, month] = firstDue.split("-").map(Number);
  const dates = [firstDue];
  for (let offset = 1; offset < count; offset++) {
    const months = month - 1 + offset;
    const y = year + Math.floor(months / 12);
    const m = (months % 12) + 1;
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    dates.push(`${y}-${pad(m)}-${pad(Math.min(dueDay, lastDay))}`);
  }
  return dates;
}

/** What is still owed on one installment, in satang. May be negative. */
export function outstanding(amountDue: number, lateFee: number, paidTotal: number): number {
  return amountDue + lateFee - paidTotal;
}

/**
 * One display label for an installment. PARTIAL wins over OVERDUE: an
 * installment that is past due and partly paid reads as PARTIAL, but still
 * counts toward overdueCount.
 */
export function installmentState(
  amountDue: number,
  lateFee: number,
  paidTotal: number,
  dueDate: string,
  today: string,
): InstallmentState {
  if (outstanding(amountDue, lateFee, paidTotal) <= 0) return "PAID";
  if (paidTotal > 0) return "PARTIAL";
  if (dueDate < today) return "OVERDUE";
  return "UPCOMING";
}

/** How many installments are past due with money still owed. */
export function overdueCount(rows: OverdueRow[], today: string): number {
  return rows.filter(
    (r) => r.dueDate < today && outstanding(r.amountDue, r.lateFee, r.paidTotal) > 0,
  ).length;
}

/** Translate an overdue count into the dashboard warning level. */
export function contractFlag(overdue: number): ContractFlag {
  if (overdue >= 2) return "REPOSSESS_ELIGIBLE";
  if (overdue === 1) return "OVERDUE";
  return "OK";
}

/** Days between the due date and the payment, never negative. */
export function daysLate(dueDate: string, paidOn: string): number {
  const difference = Date.parse(`${paidOn}T00:00:00Z`) - Date.parse(`${dueDate}T00:00:00Z`);
  return Math.max(0, Math.round(difference / 86_400_000));
}

/** Today in the machine's own timezone, as an ISO date string. */
export function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
