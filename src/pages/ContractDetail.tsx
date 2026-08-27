import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import BackButton from "../BackButton";
import Modal from "../Modal";
import PaymentForm from "./PaymentForm";
import RowLink from "../RowLink";
import { useApp } from "../context";
import { formatDate } from "../dates";
import {
  cancelContract,
  contractFees,
  deleteFee,
  downFeeFine,
  feePayments,
  getContract,
  installmentsFor,
  lateFeePayments,
  overdueRow,
  repossessContract,
  type Fee,
  type ContractRow,
  type InstallmentRow,
} from "../db";
import {
  contractFlag,
  formatBaht,
  installmentState,
  lateCount,
  lateFee,
  outstanding,
  overdueCount,
  todayIso,
} from "../money";

export default function ContractDetail() {
  // The installment whose payments are open in the dialog, if any. Recording
  // money should not cost the staff their place in a 72-row schedule.
  const [paying, setPaying] = useState<number | null>(null);
  const { db, t } = useApp();
  const contractId = Number(useParams().id);
  // undefined while loading, null when there is no such contract.
  const [contract, setContract] = useState<ContractRow | null | undefined>();
  const [installments, setInstallments] = useState<InstallmentRow[]>([]);
  const [fees, setFees] = useState<Fee[]>([]);
  // The two late fees are owed on different amounts and paid off separately.
  const [lateFeePaid, setLateFeePaid] = useState(0);
  const [downFinePaid, setDownFinePaid] = useState(0);
  const [downFine, setDownFine] = useState(0);
  const [downPaid, setDownPaid] = useState(0);

  const load = useCallback(async () => {
    setContract((await getContract(db, contractId)) ?? null);
    setInstallments(await installmentsFor(db, contractId));
    const feeRows = await contractFees(db, contractId);
    setFees(feeRows);
    const down = feeRows.find((f) => f.type === "down");
    setDownPaid(
      down ? (await feePayments(db, down.id)).reduce((sum, p) => sum + p.amount, 0) : 0,
    );
    const total = (rows: { amount: number }[]) => rows.reduce((sum, r) => sum + r.amount, 0);
    setLateFeePaid(total(await lateFeePayments(db, contractId, "installment")));
    setDownFinePaid(total(await lateFeePayments(db, contractId, "down")));
    setDownFine(await downFeeFine(db, contractId, todayIso()));
  }, [db, contractId]);

  useEffect(() => {
    load();
  }, [load]);

  if (contract === undefined) return <p>{t("loading")}</p>;
  if (contract === null) return <p>{t("not_found")}</p>;

  const today = todayIso();
  const flag = contractFlag(overdueCount(installments.map(overdueRow), today));
  // The down payment has its own block on this row, so it is not listed with
  // the other fees below.
  const downFee = fees.find((f) => f.type === "down");
  const downCharged = downFee?.amount ?? contract.down_payment;
  const downOwing = downCharged - downPaid;

  const insuranceFees = fees.filter((f) => f.type !== "down");


  // A settled installment is judged by the day it was paid; one still owing
  // keeps counting against today, so the number climbs until it is paid.
  const lateTimes = (i: InstallmentRow) =>
    lateCount(
      i.due_date,
      outstanding(i.amount_due, i.late_fee, i.paid_total) > 0 ? today : (i.last_paid_on ?? today),
    );
  const lateTotal = installments.reduce((sum, i) => sum + lateTimes(i), 0);
  const lateFeeTotal = installments.reduce(
    (sum, i) => sum + lateFee(i.amount_due, lateTimes(i)),
    0,
  );

  return (
    <>
      <div className="pagehead record">
        <BackButton />
        {/* A contract is one client tied to one car: show the tie, and let each
            side be the way through to its own record. */}
        <h1 className="pair">
          <Link className="party" to={`/clients/${contract.client_id}`}>
            <span className="role">{t("client")}</span>
            {contract.first_name} {contract.last_name}
          </Link>
          <span className="arrow" aria-hidden="true">
            →
          </span>
          <Link className="party" to={`/cars/${contract.car_id}`}>
            <span className="role">{t("car")}</span>
            {contract.brand} {contract.series ?? ""}
            {contract.plate_number && <span className="sub">{contract.plate_number}</span>}
          </Link>
        </h1>
        {contract.status === "active" && (
          <span className="actions">
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
            {/* Cancelling is the rarer, quieter of the two endings. */}
            <button
              className="ghost"
              onClick={async () => {
                if (!confirm(t("confirm_cancel"))) return;
                await cancelContract(db, contract.id);
                await load();
              }}
            >
              {t("cancel_contract")}
            </button>
          </span>
        )}
      </div>
      <div className="subhead">
        <span className={`tag ${contract.status}`}>{t(contract.status)}</span>
        <span className={`tag ${flag}`}>{t(flag)}</span>
      </div>
      <dl className="facts">
        <div>
          <dt>{t("car_price")}</dt>
          <dd>{formatBaht(contract.car_price)}</dd>
        </div>
        <div className={downOwing <= 0 ? "settled" : "owing"}>
          <dt>{t("down_payment")}</dt>
          <dd>
            <Link to={`/contracts/${contract.id}/fees/down`}>{formatBaht(downCharged)}</Link>
          </dd>
          <dd className="sub">
            {downOwing > 0 ? `${t("balance")} ${formatBaht(downOwing)}` : t("PAID")}
            {downFine > 0 && (
              <>
                {" · "}
                <Link to={`/contracts/${contract.id}/late-fees/down`}>
                  {t("late_fee")} {formatBaht(downFine - downFinePaid)}
                </Link>
              </>
            )}
          </dd>
        </div>
        <div>
          <dt>{t("installment_amount")}</dt>
          <dd>
            {formatBaht(contract.installment_amount)} <small>&times; {contract.installment_count}</small>
          </dd>
        </div>
        <div>
          <dt>{t("late_total")}</dt>
          <dd>{lateTotal}</dd>
        </div>
        {/* The fine on the down payment sits in its own block above. */}
        <div>
          <dt>{t("late_fee_installments")}</dt>
          <dd>
            <Link to={`/contracts/${contract.id}/late-fees/installment`}>
              {formatBaht(lateFeeTotal - lateFeePaid)}
            </Link>{" "}
            {lateFeePaid > 0 && (
              <small>
                {t("paid")} {formatBaht(lateFeePaid)}
              </small>
            )}
          </dd>
        </div>
        {contract.note && (
          <div>
            <dt>{t("note")}</dt>
            <dd className="text">{contract.note}</dd>
          </div>
        )}
      </dl>

      <h2 className="with-action">
        {t("insurance_and_officer")}
        <Link
          className="button add"
          to={`/contracts/${contract.id}/fees/insurance`}
          aria-label={t("insurance_fee")}
        >
          +
        </Link>
      </h2>
      {insuranceFees.length > 0 && (
        <>
          <table>
            <thead>
              <tr>
                <th>{t("due_date")}</th>
                <th className="num">{t("insurance_fee")}</th>
                <th className="num">{t("officer_fee")}</th>
                <th>{t("note")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {insuranceFees.map((f) => (
                <RowLink key={f.id} to={`/contracts/${contract.id}/fees/${f.type}?fee=${f.id}`}>
                  <td>{formatDate(f.due_on)}</td>
                  {/* The date the money came in sits under the sum it paid,
                      the way the officer fee already reads. */}
                  <td className="num">
                    {formatBaht(f.amount)}
                    <br />
                    {f.paid_on ? (
                      <small>{formatDate(f.paid_on)}</small>
                    ) : (
                      <span className="tag unpaid">{t("unpaid")}</span>
                    )}
                  </td>
                  <td className="num">
                    {f.officer_amount != null && (
                      <>
                        {formatBaht(f.officer_amount)}
                        <br />
                        {f.officer_paid_on ? (
                          <small>{formatDate(f.officer_paid_on)}</small>
                        ) : (
                          <span className="tag unpaid">{t("unpaid")}</span>
                        )}
                      </>
                    )}
                  </td>
                  <td>{f.note ?? ""}</td>
                  <td className="row-actions">
                    <Link className="button" to={`/contracts/${contract.id}/fees/${f.type}?fee=${f.id}`}>
                      {t("edit")}
                    </Link>
                    <button
                      className="danger"
                      onClick={async () => {
                        if (!confirm(t("confirm_delete_fee"))) return;
                        await deleteFee(db, f.id);
                        await load();
                      }}
                    >
                      {t("delete")}
                    </button>
                  </td>
                </RowLink>
              ))}
            </tbody>
          </table>
        </>
      )}

      <h2>{t("schedule")}</h2>
      <table>
        <thead>
          <tr>
            <th>{t("seq")}</th>
            <th>{t("due_date")}</th>
            <th className="num">{t("amount_due")}</th>
            <th>{t("payment_date")}</th>
            <th className="num">{t("balance")}</th>
            <th>{t("status")}</th>
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
              <tr key={i.id} className="clickable" onClick={() => setPaying(i.id)}>
                <td>{i.seq}</td>
                <td>{formatDate(i.due_date)}</td>
                <td className="num">{formatBaht(i.amount_due)}</td>
                <td>{i.last_paid_on ? formatDate(i.last_paid_on) : ""}</td>
                <td className="num">{formatBaht(balance)}</td>
                <td>
                  <span className="tags">
                    <span className={`tag ${state}`}>{t(state)}</span>
                    {lateTimes(i) > 0 && (
                      <span className="tag OVERDUE">
                        {t("overdue")} &times;{lateTimes(i)}
                      </span>
                    )}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {paying !== null && (
        <Modal
          onClose={() => {
            setPaying(null);
            load();
          }}
        >
          <PaymentForm
            installmentId={paying}
            onDone={() => {
              setPaying(null);
              load();
            }}
          />
        </Modal>
      )}
    </>
  );
}
