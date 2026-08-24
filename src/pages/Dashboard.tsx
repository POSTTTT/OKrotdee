import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { backupTo, showBackups } from "../backup";
import { useApp } from "../context";
import { activeInstallments, collectedBetween, overdueRow, type DashboardRow } from "../db";
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

function Rows({ items }: { items: DashboardRow[] }) {
  const { t } = useApp();
  const today = todayIso();
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
        {items.map((i) => (
          <tr key={i.id}>
            <td>{i.due_date}</td>
            <td>
              <Link to={`/contracts/${i.contract_id}`}>
                {i.first_name} {i.last_name}
              </Link>
            </td>
            <td>
              {i.brand} {i.plate_number ?? ""}
            </td>
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
                {t(installmentState(i.amount_due, i.late_fee, i.paid_total, i.due_date, today))}
              </span>
            </td>
          </tr>
        ))}
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
  const [collected, setCollected] = useState(0);
  const [counts, setCounts] = useState({ clients: 0, cars: 0, contracts: 0 });
  const [backupError, setBackupError] = useState<string | null>(null);
  const today = todayIso();

  useEffect(() => {
    const [start, end] = monthBounds(today);
    activeInstallments(db).then(setRows);
    collectedBetween(db, start, end).then(setCollected);
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

  return (
    <>
      <h1>{t("dashboard")}</h1>
      {backupError && (
        <p className="flash alarm">
          {t("err_backup_failed")}: {backupError}
        </p>
      )}
      <div className="toolbar">
        <button
          onClick={async () => {
            setBackupError(null);
            try {
              const target = await backupTo(db);
              if (target) alert(`${t("backup_done")}: ${target}`);
            } catch (e) {
              setBackupError(String(e));
            }
          }}
        >
          {t("backup_now")}
        </button>
        <button onClick={() => showBackups().catch((e) => setBackupError(String(e)))}>
          {t("show_backups")}
        </button>
      </div>
      <ul className="counts">
        <li>
          <Link to="/clients">
            {t("clients")}: {counts.clients}
          </Link>
        </li>
        <li>
          <Link to="/cars">
            {t("available")}: {counts.cars}
          </Link>
        </li>
        <li>
          <Link to="/contracts">
            {t("active")}: {counts.contracts}
          </Link>
        </li>
        <li>
          {t("collected_this_month")}: {formatBaht(collected)}
        </li>
      </ul>

      <h2>{t("repossess_eligible")}</h2>
      <Rows items={flagged} />

      <h2>{t("overdue")}</h2>
      <Rows items={overdue} />

      <h2>{t("due_this_month")}</h2>
      <Rows items={dueThisMonth} />
    </>
  );
}
