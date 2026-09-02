import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

import DueRows from "../DueRows";
import { useApp } from "../context";
import { formatDate } from "../dates";
import { activeInstallments, overdueRow, type DashboardRow } from "../db";
import {
  contractFlag,
  formatBaht,
  installmentState,
  outstanding,
  overdueCount,
  todayIso,
} from "../money";

/** First and last day of the month containing `today`, as ISO dates. */
function monthBounds(today: string): [string, string] {
  const [year, month] = today.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const pad = (n: number) => String(n).padStart(2, "0");
  return [`${year}-${pad(month)}-01`, `${year}-${pad(month)}-${pad(lastDay)}`];
}

/** The card's mark: one stroke glyph, drawn rather than loaded. */
function Icon({ children }: { children: ReactNode }) {
  return (
    <span className="icon">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {children}
      </svg>
    </span>
  );
}

/**
 * The overdue list, folded by contract. One client behind on six installments
 * used to fill six rows and bury everyone else; now they are one row that
 * opens.
 */
function GroupedRows({ items }: { items: DashboardRow[] }) {
  const { t } = useApp();
  const [open, setOpen] = useState<number[]>([]);
  const today = todayIso();

  const groups = new Map<number, DashboardRow[]>();
  for (const row of items) {
    const list = groups.get(row.contract_id) ?? [];
    list.push(row);
    groups.set(row.contract_id, list);
  }

  const owed = (list: DashboardRow[]) =>
    list.reduce((sum, i) => sum + outstanding(i.amount_due, i.late_fee, i.paid_total), 0);

  return (
    <table>
      <thead>
        <tr>
          <th>{t("due_date")}</th>
          <th>{t("client")}</th>
          <th>{t("car")}</th>
          <th className="num">{t("balance")}</th>
          <th>{t("status")}</th>
        </tr>
      </thead>
      <tbody>
        {[...groups.values()].map((list) => {
          const head = list[0];
          const shown = open.includes(head.contract_id);
          return (
            <Fragment key={head.contract_id}>
              <tr
                className="clickable"
                onClick={(event) => {
                  if ((event.target as HTMLElement).closest("a")) return;
                  setOpen((ids) =>
                    shown
                      ? ids.filter((id) => id !== head.contract_id)
                      : [...ids, head.contract_id],
                  );
                }}
              >
                <td>
                  {list.length > 1 && <span className="caret">{shown ? "▾" : "▸"}</span>}
                  {formatDate(head.due_date)}
                </td>
                <td>
                  <Link to={`/contracts/${head.contract_id}`}>
                    {head.first_name} {head.last_name}
                  </Link>
                </td>
                <td>
                  {head.brand} {head.plate_number ?? ""}
                </td>
                <td className="num">{formatBaht(owed(list))}</td>
                <td>
                  <span className="tag OVERDUE">
                    {t("OVERDUE")}
                    {list.length > 1 ? ` × ${list.length}` : ""}
                  </span>
                </td>
              </tr>
              {shown &&
                list.map((i) => (
                  <tr key={i.id} className="child">
                    <td>{formatDate(i.due_date)}</td>
                    <td>
                      {t("seq")} {i.seq}
                    </td>
                    <td />
                    <td className="num">
                      {formatBaht(outstanding(i.amount_due, i.late_fee, i.paid_total))}
                    </td>
                    <td>
                      <span
                        className={`tag ${installmentState(
                          i.amount_due,
                          i.late_fee,
                          i.paid_total,
                          i.due_date,
                          today,
                        )}`}
                      >
                        {t(
                          installmentState(
                            i.amount_due,
                            i.late_fee,
                            i.paid_total,
                            i.due_date,
                            today,
                          ),
                        )}
                      </span>
                    </td>
                  </tr>
                ))}
            </Fragment>
          );
        })}
        {items.length === 0 && (
          <tr>
            <td colSpan={5}>{t("none_yet")}</td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

export default function Dashboard() {
  const { db, t } = useApp();
  const [rows, setRows] = useState<DashboardRow[]>([]);
  const [counts, setCounts] = useState({ clients: 0, cars: 0, contracts: 0 });
  const [open, setOpen] = useState<string | null>(null);
  const today = todayIso();

  useEffect(() => {
    activeInstallments(db).then(setRows);
    const one = async (sql: string) => (await db.select<{ c: number }>(sql))[0]?.c ?? 0;
    Promise.all([
      one("SELECT COUNT(*) AS c FROM clients"),
      one("SELECT COUNT(*) AS c FROM cars WHERE status = 'available'"),
      one("SELECT COUNT(*) AS c FROM contracts WHERE status = 'active'"),
    ]).then(([clients, cars, contracts]) => setCounts({ clients, cars, contracts }));
  }, [db, today]);

  const { dueThisMonth, overdue, flagged } = useMemo(() => {
    const [start, end] = monthBounds(today);
    const owing = (r: DashboardRow) => outstanding(r.amount_due, r.late_fee, r.paid_total) > 0;

    const byContract = new Map<number, DashboardRow[]>();
    for (const row of rows) {
      const list = byContract.get(row.contract_id) ?? [];
      list.push(row);
      byContract.set(row.contract_id, list);
    }

    return {
      dueThisMonth: rows.filter((r) => r.due_date >= start && r.due_date <= end && owing(r)),
      overdue: rows.filter((r) => r.due_date < today && owing(r)),
      flagged: [...byContract.values()]
        .filter(
          (list) =>
            contractFlag(overdueCount(list.map(overdueRow), today)) === "REPOSSESS_ELIGIBLE",
        )
        // list is ordered by due date, so list[0] is installment #1 and is
        // usually long paid. Show the oldest one still owing money.
        .map((list) => list.find(owing) ?? list[0]),
    };
  }, [rows, today]);

  const sections = [
    { key: "flagged", label: t("repossess_eligible"), caption: t("contracts"), items: flagged },
    { key: "overdue", label: t("overdue"), caption: t("installments"), items: overdue },
    { key: "due", label: t("due_this_month"), caption: t("installments"), items: dueThisMonth },
  ];
  const shown = sections.find((s) => s.key === open) ?? null;

  return (
    <>
      <div className="pagehead">
        <h1>{t("dashboard")}</h1>
      </div>
      <ul className="counts">
        <li className="count clients">
          <Link to="/clients">
            <span className="head">
              {t("clients")}
              <Icon>
                <circle cx="12" cy="8.5" r="3.5" />
                <path d="M5.5 20a6.5 6.5 0 0 1 13 0" />
              </Icon>
            </span>
            <strong>{counts.clients}</strong>
            <small>{t("registered")}</small>
          </Link>
        </li>
        <li className="count cars">
          <Link to="/cars">
            <span className="head">
              {t("cars")}
              <Icon>
                <path d="M4.5 16.5h15M6.5 11l1.4-3.5h8.2l1.4 3.5" />
                <path d="M4.5 16.5v-4a1.5 1.5 0 0 1 1.5-1.5h12a1.5 1.5 0 0 1 1.5 1.5v4" />
                <path d="M7 16.5v1.5M17 16.5v1.5" />
              </Icon>
            </span>
            <strong>{counts.cars}</strong>
            <small>{t("available")}</small>
          </Link>
        </li>
        <li className="count contracts">
          <Link to="/contracts">
            <span className="head">
              {t("contracts")}
              <Icon>
                <path d="M7 3.5h6.5L18 8v12.5H7z" />
                <path d="M9.5 12.5h6M9.5 16h4" />
              </Icon>
            </span>
            <strong>{counts.contracts}</strong>
            <small>{t("active")}</small>
          </Link>
        </li>
      </ul>

      {/* The three lists that matter, folded into the same card the counts
          wear. Only one is open at a time: the staff are answering one
          question — who to call today — not reading three tables. */}
      <ul className="counts sections">
        {sections.map((s) => (
          <li key={s.key} className={`count section${open === s.key ? " on" : ""}`}>
            <button type="button" onClick={() => setOpen(open === s.key ? null : s.key)}>
              <span className="head">
                {s.label}
                <Icon>
                  <path d="M8 10.5l4 4 4-4" />
                </Icon>
              </span>
              <strong>{s.items.length}</strong>
              <small>{s.caption}</small>
            </button>
          </li>
        ))}
      </ul>
      {shown && (
        <div className="drop">
          {shown.key === "overdue" ? (
            <GroupedRows items={shown.items} />
          ) : (
            <DueRows items={shown.items} />
          )}
        </div>
      )}
    </>
  );
}
