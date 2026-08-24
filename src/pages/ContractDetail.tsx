import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { useApp } from "../context";
import {
  cancelContract,
  getContract,
  installmentsFor,
  overdueRow,
  repossessContract,
  type ContractRow,
  type InstallmentRow,
} from "../db";
import {
  contractFlag,
  formatBaht,
  installmentState,
  outstanding,
  overdueCount,
  todayIso,
} from "../money";

export default function ContractDetail() {
  const { db, t } = useApp();
  const contractId = Number(useParams().id);
  // undefined while loading, null when there is no such contract.
  const [contract, setContract] = useState<ContractRow | null | undefined>();
  const [installments, setInstallments] = useState<InstallmentRow[]>([]);

  const load = useCallback(async () => {
    setContract((await getContract(db, contractId)) ?? null);
    setInstallments(await installmentsFor(db, contractId));
  }, [db, contractId]);

  useEffect(() => {
    load();
  }, [load]);

  if (contract === undefined) return <p>{t("loading")}</p>;
  if (contract === null) return <p>{t("not_found")}</p>;

  const today = todayIso();
  const flag = contractFlag(overdueCount(installments.map(overdueRow), today));

  return (
    <>
      <h1>
        {contract.first_name} {contract.last_name} — {contract.brand} {contract.series ?? ""}{" "}
        {contract.plate_number ?? ""}
      </h1>
      <p>
        <span className={`tag ${contract.status}`}>{t(contract.status)}</span>{" "}
        <span className={`tag ${flag}`}>{t(flag)}</span> {t("car_price")}:{" "}
        {formatBaht(contract.car_price)} &middot; {t("down_payment")}:{" "}
        {formatBaht(contract.down_payment)} &middot; {t("installment_amount")}:{" "}
        {formatBaht(contract.installment_amount)} &times; {contract.installment_count}
      </p>
      {contract.note && (
        <p>
          {t("note")}: {contract.note}
        </p>
      )}

      {contract.status === "active" && (
        <p className="toolbar">
          <button
            className="danger"
            onClick={async () => {
              if (!confirm(t("confirm_repossess"))) return;
              await repossessContract(db, contract.id);
              await load();
            }}
          >
            {t("mark_repossessed")}
          </button>
          <button
            onClick={async () => {
              if (!confirm(t("confirm_cancel"))) return;
              await cancelContract(db, contract.id);
              await load();
            }}
          >
            {t("cancel_contract")}
          </button>
        </p>
      )}

      <h2>{t("schedule")}</h2>
      <table>
        <thead>
          <tr>
            <th>{t("seq")}</th>
            <th>{t("due_date")}</th>
            <th className="num">{t("amount_due")}</th>
            <th className="num">{t("late_fee")}</th>
            <th className="num">{t("paid")}</th>
            <th className="num">{t("balance")}</th>
            <th>{t("status")}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {installments.map((i) => {
            const balance = outstanding(i.amount_due, i.late_fee, i.paid_total);
            const state = installmentState(
              i.amount_due,
              i.late_fee,
              i.paid_total,
              i.due_date,
              today,
            );
            return (
              <tr key={i.id}>
                <td>{i.seq}</td>
                <td>{i.due_date}</td>
                <td className="num">{formatBaht(i.amount_due)}</td>
                <td className="num">{formatBaht(i.late_fee)}</td>
                <td className="num">{formatBaht(i.paid_total)}</td>
                <td className="num">{formatBaht(balance)}</td>
                <td>
                  <span className={`tag ${state}`}>{t(state)}</span>
                </td>
                <td>
                  {contract.status === "active" && balance > 0 && (
                    <Link className="button" to={`/installments/${i.id}/pay`}>
                      {t("record_payment")}
                    </Link>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}
