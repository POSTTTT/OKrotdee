import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import DueRows from "../DueRows";
import { useApp } from "../context";
import { daysInMonth, formatDate, monthYear, toIso } from "../dates";
import { activeInstallments, type DashboardRow } from "../db";
import {
  formatBaht,
  installmentState,
  outstanding,
  todayIso,
  type InstallmentState,
} from "../money";

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
  // Which view a day (or a month) was opened from, so there is a way back out
  // of it. Null once the reader picks a view themselves.
  const [from, setFrom] = useState<View | null>(null);
  // Which way the last move through time went, so the sheet arrives from the
  // side it came from. Cleared by anything that is not a step.
  const [dir, setDir] = useState("");

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

  /* Whatever is on the grid, read as a list underneath: the same slice of
     time, in the order the money falls due. */
  const listed = useMemo(() => {
    const [from, to] =
      view === "year"
        ? [`${year}-01-01`, `${year}-12-31`]
        : [days[0], days[days.length - 1]];
    return rows.filter((r) => r.due_date >= from && r.due_date <= to);
  }, [rows, days, year, view]);

  // The month rarely ends on a Saturday; without the tail the last week is a
  // hole in the grid rather than a row of days that have not come yet.
  const tail = view === "month" ? (7 - ((blanks + days.length) % 7)) % 7 : 0;

  const step = (by: number) => {
    setDir(by > 0 ? "next" : "prev");
    setAt((iso) => {
      if (view === "day") return addDays(iso, by);
      if (view === "week") return addDays(iso, by * 7);
      const [y, m, d] = iso.split("-").map(Number);
      const total = y * 12 + (m - 1) + (view === "month" ? by : by * 12);
      return toIso(Math.floor(total / 12), (total % 12) + 1, d);
    });
  };

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

  /* A cell in a week or a month says how many payments land on it, in the
     colour of the worst of them. The list underneath carries the names and
     the figures, so the grid stays a shape the eye can count. */
  const badge = (iso: string) => {
    const list = byDay.get(iso) ?? [];
    if (list.length === 0) return null;
    const states = list.map((r) =>
      installmentState(r.amount_due, r.late_fee, r.paid_total, r.due_date, today),
    );
    const rank: InstallmentState[] = ["OVERDUE", "PARTIAL", "UPCOMING", "PAID"];
    const worst = rank.find((state) => states.includes(state)) ?? "PAID";
    return (
      <span className={`tag count ${worst}`}>
        {list.length} {t("installments")}
      </span>
    );
  };

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
        {from && (
          <span className="lead">
            <button
              className="ghost"
              onClick={() => {
                setDir("");
                setView(from);
                setFrom(null);
              }}
            >
              ← {t("back")}
            </button>
          </span>
        )}
        <h1>{t("calendar")}</h1>
        <span className="actions">
          <span className="views">
            {VIEWS.map((v) => (
              <button
                key={v}
                className={`ghost${v === view ? " on" : ""}`}
                onClick={() => {
                  if (v === "day") setAt(today);
                  setDir("");
                  setFrom(null);
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
            <button
              className="ghost"
              onClick={() => {
                setDir("");
                setAt(today);
              }}
            >
              {t("today")}
            </button>
            <button className="ghost" onClick={() => step(1)}>
              ›
            </button>
          </span>
        </span>
      </div>
      {/* Everything that belongs to the slice of time on screen, keyed on it:
          stepping a month draws a new sheet, arriving from the side it came
          from, so the change is seen and not read off the heading. */}
      <div className={`sheet ${dir}`} key={`${view}-${at}`}>
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
                    setDir("");
                    setFrom("year");
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
            {days.map((iso) => {
              // A day on the grid opens as a day of its own — the same gesture a
              // month cell makes in the year view.
              const pick = () => {
                setDir("");
                setFrom(view);
                setAt(iso);
                setView("day");
              };
              return (
                <div
                  key={iso}
                  className={`day${iso === today ? " today" : ""}${view === "day" ? "" : " pick"}`}
                  role={view === "day" ? undefined : "button"}
                  tabIndex={view === "day" ? undefined : 0}
                  onClick={(event) => {
                    // A payment inside the cell opens its contract instead.
                    if (view === "day" || (event.target as HTMLElement).closest("a")) return;
                    pick();
                  }}
                  onKeyDown={(event) => {
                    if (view === "day" || (event.key !== "Enter" && event.key !== " ")) return;
                    event.preventDefault();
                    pick();
                  }}
                >
                  <span className="n">{Number(iso.slice(8))}</span>
                  {view === "day" ? entries(iso) : badge(iso)}
                </div>
              );
            })}
            {Array.from({ length: tail }, (_, i) => (
              <div key={`tail${i}`} className="day blank" />
            ))}
          </div>
        )}

        {/* A single day is already its own list — repeating it underneath says
            nothing twice. */}
        {view !== "day" && (
          <>
            <h2>{t("installments")}</h2>
            <div className="scroll">
              <DueRows items={listed} />
            </div>
          </>
        )}
      </div>
    </>
  );
}
