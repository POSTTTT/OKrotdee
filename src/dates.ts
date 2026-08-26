/**
 * Dates on screen. Every date is stored and passed around as an ISO string
 * ("2025-10-15") and shown as day/month/year with Christian Era years.
 */

/** Split an ISO date into its numbers, or nulls when there is no date. */
export function parts(iso: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

/** How many days a month has, so 31 January cannot survive a switch to April. */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Build an ISO date, clamping the day to the end of a short month. */
export function toIso(year: number, month: number, day: number): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${year}-${pad(month)}-${pad(Math.min(day, daysInMonth(year, month)))}`;
}

/** Render an ISO date for reading, e.g. "15/2/2025". */
export function formatDate(iso: string): string {
  const p = parts(iso);
  if (!p) return iso;
  return `${p.day}/${p.month}/${p.year}`;
}
