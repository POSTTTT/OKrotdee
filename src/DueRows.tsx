import { Link } from "react-router-dom";

import RowLink from "./RowLink";
import { useApp } from "./context";
import { formatDate } from "./dates";
import type { DashboardRow } from "./db";
import { formatBaht, installmentState, outstanding, todayIso } from "./money";

/**
 * A list of installments, read as money owed: when, by whom, on what, how
 * much, and where it stands. The dashboard and the calendar both end in one.
 */
export default function DueRows({ items }: { items: DashboardRow[] }) {
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
          <RowLink key={i.id} to={`/contracts/${i.contract_id}`}>
            <td>{formatDate(i.due_date)}</td>
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
          </RowLink>
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
