import { Fragment, useState } from "react";
import { Link } from "react-router-dom";

import RowLink from "./RowLink";
import { useApp } from "./context";
import { formatDate } from "./dates";
import type { DashboardRow } from "./db";
import {
  formatBaht,
  installmentState,
  outstanding,
  todayIso,
  type InstallmentState,
} from "./money";

// The state a group shows is its worst one: one overdue month makes the
// contract overdue, however many are paid.
const WORST_FIRST: InstallmentState[] = ["OVERDUE", "PARTIAL", "UPCOMING", "PAID"];

/** What a fee row is for, beside its date. */
const FEE_LABEL = { down: "down_payment", insurance: "insurance_fee", officer: "officer_fee" };

/**
 * A list of installments, read as money owed: when, by whom, on what, how
 * much, and where it stands. The dashboard and the calendar both end in one.
 * A contract with several installments in the list is one row, opened to
 * show them, so a year of one client's months does not bury everyone else.
 */
export default function DueRows({ items }: { items: DashboardRow[] }) {
  const { t } = useApp();
  const today = todayIso();
  const [open, setOpen] = useState<Set<number>>(new Set());
  const state = (i: DashboardRow) =>
    installmentState(i.amount_due, i.late_fee, i.paid_total, i.due_date, today);
  const owed = (i: DashboardRow) => outstanding(i.amount_due, i.late_fee, i.paid_total);

  // Grouped by contract, each group where its first installment fell.
  const groups = new Map<number, DashboardRow[]>();
  for (const i of items) groups.set(i.contract_id, [...(groups.get(i.contract_id) ?? []), i]);

  const toggle = (id: number) => {
    const next = new Set(open);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setOpen(next);
  };

  const row = (i: DashboardRow, inGroup: boolean) => (
    <RowLink
      key={i.id}
      to={`/contracts/${i.contract_id}`}
      className={inGroup ? "in-group" : undefined}
    >
      <td>
        {formatDate(i.due_date)}
        {i.kind && <small> · {t(FEE_LABEL[i.kind])}</small>}
      </td>
      <td>
        {!inGroup && (
          <Link to={`/contracts/${i.contract_id}`}>
            {i.first_name} {i.last_name}
          </Link>
        )}
      </td>
      <td>{!inGroup && `${i.brand} ${i.plate_number ?? ""}`}</td>
      <td className="num">{formatBaht(owed(i))}</td>
      <td>
        <span className={`tag ${state(i)}`}>{t(state(i))}</span>
      </td>
    </RowLink>
  );

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
        {[...groups].map(([contractId, list]) => {
          if (list.length === 1) return row(list[0], false);
          const [first] = list;
          const isOpen = open.has(contractId);
          const worst = WORST_FIRST.find((s) => list.some((i) => state(i) === s))!;
          return (
            <Fragment key={`c${contractId}`}>
              <tr
                className="group clickable"
                onClick={(event) => {
                  if ((event.target as HTMLElement).closest("a")) return;
                  toggle(contractId);
                }}
              >
                <td>
                  <button
                    type="button"
                    className="ghost disclose"
                    aria-expanded={isOpen}
                    onClick={(event) => {
                      event.stopPropagation();
                      toggle(contractId);
                    }}
                  >
                    <span aria-hidden="true">{isOpen ? "▾" : "▸"}</span> {list.length}{" "}
                    {t("installments")}
                  </button>
                </td>
                <td>
                  <Link to={`/contracts/${contractId}`}>
                    {first.first_name} {first.last_name}
                  </Link>
                </td>
                <td>
                  {first.brand} {first.plate_number ?? ""}
                </td>
                <td className="num">{formatBaht(list.reduce((sum, i) => sum + owed(i), 0))}</td>
                <td>
                  <span className={`tag ${worst}`}>{t(worst)}</span>
                </td>
              </tr>
              {isOpen && list.map((i) => row(i, true))}
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
