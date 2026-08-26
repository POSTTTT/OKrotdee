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
  if (!match) throw new Error("err_invalid_amount");
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
  if (count < 1) throw new Error("err_installment_min_one");
  if (dueDay < 1 || dueDay > 31) throw new Error("err_due_day_range");

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

/**
 * Days a client may pay past the due date without it counting against them.
 * A payment due on the 15th is on time up to and including the 18th.
 */
export const GRACE_DAYS = 3;

/** Shift an ISO date by whole days. */
function addDays(iso: string, days: number): string {
  const moved = new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000);
  return moved.toISOString().slice(0, 10);
}

/**
 * Shift an ISO date by whole months, clamped to the end of a short month, so
 * 31 January plus one month is 28 February.
 */
function addMonths(iso: string, months: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const total = month - 1 + months;
  const y = year + Math.floor(total / 12);
  const m = (total % 12 + 12) % 12 + 1;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${y}-${pad(m)}-${pad(Math.min(day, lastDay))}`;
}

/**
 * How many times one installment counts as late.
 *
 * Nothing is counted inside the grace period, so an installment due on
 * 15/2 and paid by 18/2 is not late. Paying on 19/2 is one strike, and every
 * further month that passes adds another: still unpaid on 19/3 is two.
 *
 * Pass the payment date for a settled installment, or today's date for one
 * still owing, in which case the count keeps climbing.
 */
export function lateCount(dueDate: string, asOf: string): number {
  let count = 0;
  // The date each successive strike lands on: due + grace + 1 day, then the
  // same day of each following month.
  while (asOf >= addDays(addMonths(dueDate, count), GRACE_DAYS + 1)) count++;
  return count;
}

/**
 * The shop charges 15% of the installment for each time it is late. The fee
 * is computed, never stored: it follows from the due date and the day the
 * money arrived, so correcting a payment corrects the fee with it.
 */
export const LATE_FEE_RATE = 0.15;

/**
 * The day a charge was finally covered, or null while any of it is still
 * owed. A charge paid in parts is late until the last part is in.
 */
export function settledOn(
  amount: number,
  payments: { paid_on: string; amount: number }[],
): string | null {
  let running = 0;
  for (const p of [...payments].sort((a, b) => a.paid_on.localeCompare(b.paid_on))) {
    running += p.amount;
    if (running >= amount) return p.paid_on;
  }
  return null;
}

/**
 * How many strikes a charge has collected, when it was promised in parts.
 *
 * Payments cover the promised parts in date order, so a part counts as met on
 * the day the money reaching it arrives. Keeping to the arrangement — 10,000
 * on the 15th and 10,000 on the 19th, both promised — collects nothing.
 */
export function scheduleStrikes(
  promised: { due_on: string; amount: number }[],
  payments: { paid_on: string; amount: number }[],
  today: string,
): number {
  let target = 0;
  let strikes = 0;
  for (const part of [...promised].sort((a, b) => a.due_on.localeCompare(b.due_on))) {
    target += part.amount;
    strikes += lateCount(part.due_on, settledOn(target, payments) ?? today);
  }
  return strikes;
}

/**
 * The late fee owed on one installment, in satang. Rounded once per strike,
 * so 15% of 15,400.00 is 2,310.00 and twenty-four strikes come to 55,440.00.
 */
export function lateFee(installmentAmount: number, timesLate: number): number {
  return Math.round(installmentAmount * LATE_FEE_RATE) * timesLate;
}

/** Today in the machine's own timezone, as an ISO date string. */
export function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
