import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { useApp } from "../context";
import { daysInMonth, formatDate, monthYear, toIso } from "../dates";
import { activeInstallments, type DashboardRow } from "../db";
import { formatBaht, installmentState, outstanding, todayIso } from "../money";

type View = "day" | "week" | "month" | "year";

const VIEWS: View[] = ["day", "week", "month", "year"];

/** An ISO date `n` days from another. Negative goes back. */
function addDays(iso: string, n: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + n)).toISOString().slice(0, 10);
}

/** The Sunday of the week a date falls in. */
function weekStart(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return addDays(iso, -new Date(Date.UTC(year, month - 1, day)).getUTCDay());
}

function intl(lang: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(lang === "th" ? "th-TH-u-ca-gregory" : "en-GB", {
    timeZone: "UTC",
    ...options,
  });
}

/** Sunday-first weekday names in the reader's language. */
function weekdayNames(lang: string): string[] {
  const format = intl(lang, { weekday: "short" });
  // 2024-01-07 was a Sunday; any Sunday would do.
  return [0, 1, 2, 3, 4, 5, 6].map((i) => format.format(Date.UTC(2024, 0, 7 + i)));
}

/**
 * When the money comes in, read as time rather than as a list. The dashboard
 * answers "who owes now"; this answers "what does the day, the week, the
 * month or the year ahead look like".
 */
export default function Calendar() {
  const { db, t, lang } = useApp();
  const [rows, setRows] = useState<DashboardRow[]>([]);
  const today = todayIso();
  const [at, setAt] = useState(today);
  const [view, setView] = useState<View>("month");

  useEffect(() => {
    activeInstallments(db).then(setRows);
  }, [db]);

  const [year, mon] = at.split("-").map(Number);
  const month = at.slice(0, 7);

  /** The days on screen, and how many empty cells come before the first. */
  const [days, blanks] = useMemo<[string[], number]>(() => {
    if (view === "day") return [[at], 0];
    if (view === "week") {
      const start = weekStart(at);
      return [Array.from({ length: 7 }, (_, i) => addDays(start, i)), 0];
    }
    const first = `${month}-01`;
    const count = daysInMonth(year, mon);
    return [
      Array.from({ length: count }, (_, i) => addDays(first, i)),
      new Date(Date.UTC(year, mon - 1, 1)).getUTCDay(),
    ];
  }, [at, month, year, mon, view]);

  /** Every installment on the screen, filed under the day it falls due. */
  const byDay = useMemo(() => {
    const map = new Map<string, DashboardRow[]>();
    for (const row of rows) map.set(row.due_date, [...(map.get(row.due_date) ?? []), row]);
    return map;
  }, [rows]);

  /** A year is read as twelve totals, not as 365 cells. */
  const byMonth = useMemo(() => {
    const map = new Map<string, DashboardRow[]>();
    for (const row of rows) {
      const key = row.due_date.slice(0, 7);
      map.set(key, [...(map.get(key) ?? []), row]);
    }
    return map;
  }, [rows]);

  // The month rarely ends on a Saturday; without the tail the last week is a
  // hole in the grid rather than a row of days that have not come yet.
  const tail = view === "month" ? (7 - ((blanks + days.length) % 7)) % 7 : 0;

  const step = (by: number) =>
    setAt((iso) => {
      if (view === "day") return addDays(iso, by);
      if (view === "week") return addDays(iso, by * 7);
      const [y, m, d] = iso.split("-").map(Number);
      const total = y * 12 + (m - 1) + (view === "month" ? by : by * 12);
      return toIso(Math.floor(total / 12), (total % 12) + 1, d);
    });

  const heading =
    view === "year"
      ? String(year)
      : view === "month"
        ? monthYear(`${month}-01`, lang)
        : view === "week"
          ? `${formatDate(days[0])} – ${formatDate(days[6])}`
          : intl(lang, { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(
              Date.UTC(year, mon - 1, Number(at.slice(8))),
            );

  const entries = (iso: string) =>
    (byDay.get(iso) ?? []).map((r) => {
      const state = installmentState(r.amount_due, r.late_fee, r.paid_total, r.due_date, today);
      return (
        <Link key={r.id} className={`tag due ${state}`} to={`/contracts/${r.contract_id}`}>
          <strong>{formatBaht(outstanding(r.amount_due, r.late_fee, r.paid_total))}</strong>
          <small>
            {r.first_name} {r.last_name}
          </small>
        </Link>
      );
    });

  return (
    <>
      <div className="pagehead">
        <h1>{t("calendar")}</h1>
        <span className="actions">
          <span className="views">
            {VIEWS.map((v) => (
              <button
                key={v}
                className={`ghost${v === view ? " on" : ""}`}
                onClick={() => {
                  if (v === "day") setAt(today);
                  setView(v);
                }}
              >
                {t(v)}
              </button>
            ))}
          </span>
          <span className="views stepper">
            <button className="ghost" onClick={() => step(-1)}>
              ‹
            </button>
            <button className="ghost" onClick={() => setAt(today)}>
              {t("today")}
            </button>
            <button className="ghost" onClick={() => step(1)}>
              ›
            </button>
          </span>
        </span>
      </div>
      <h2>{heading}</h2>

      {view === "year" ? (
        <div className="calendar year">
          {Array.from({ length: 12 }, (_, i) => {
            const key = `${year}-${String(i + 1).padStart(2, "0")}`;
            const list = byMonth.get(key) ?? [];
            const owed = list.reduce(
              (sum, r) => sum + outstanding(r.amount_due, r.late_fee, r.paid_total),
              0,
            );
            return (
              <button
                key={key}
                className={`day ghost${key === today.slice(0, 7) ? " today" : ""}`}
                onClick={() => {
                  setAt(`${key}-01`);
                  setView("month");
                }}
              >
                <span className="n">{intl(lang, { month: "long" }).format(Date.UTC(year, i, 1))}</span>
                <strong>{formatBaht(owed)}</strong>
                <small>
                  {list.length} {t("installments")}
                </small>
              </button>
            );
          })}
        </div>
      ) : (
        <div className={`calendar${view === "day" ? " one" : ""}`}>
          {(view === "day"
            ? [intl(lang, { weekday: "short" }).format(Date.UTC(year, mon - 1, Number(at.slice(8))))]
            : weekdayNames(lang)
          ).map((name) => (
            <div key={name} className="weekday">
              {name}
            </div>
          ))}
          {Array.from({ length: blanks }, (_, i) => (
            <div key={`blank${i}`} className="day blank" />
          ))}
          {days.map((iso) => (
            <div key={iso} className={`day${iso === today ? " today" : ""}`}>
              <span className="n">{Number(iso.slice(8))}</span>
              {entries(iso)}
            </div>
          ))}
          {Array.from({ length: tail }, (_, i) => (
            <div key={`tail${i}`} className="day blank" />
          ))}
        </div>
      )}
    </>
  );
}
