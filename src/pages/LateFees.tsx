import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";

import BackButton from "../BackButton";
import { useApp } from "../context";
import DateInput from "../DateInput";
import { formatDate } from "../dates";
import RowLink from "../RowLink";
import {
  deleteLateFeePayment,
  downFeeFine,
  getContract,
  installmentsFor,
  lateFeePayments,
  saveLateFeePayment,
  type ContractRow,
  type InstallmentRow,
  type LateFeeKind,
  type LateFeePayment,
} from "../db";
import { isErrorKey } from "../lang";
import { formatBaht, lateCount, lateFee, outstanding, toSatang, todayIso } from "../money";
import { payment as validatePayment } from "../validate";

/** The late fee owed on a contract, and what has been paid against it. */
export default function LateFees() {
  const { db, t } = useApp();
  const navigate = useNavigate();
  const params = useParams();
  const contractId = Number(params.id);
  // Two late fees, owed on different amounts and paid off separately.
  const kind = params.kind as LateFeeKind;
  // Set when correcting an entry already recorded, from ?payment=<id>.
  const editingId = Number(useSearchParams()[0].get("payment")) || null;

  // undefined while loading, null when there is no such contract.
  const [contract, setContract] = useState<ContractRow | null | undefined>();
  const [installments, setInstallments] = useState<InstallmentRow[]>([]);
  const [received, setReceived] = useState<LateFeePayment[]>([]);
  const [downFine, setDownFine] = useState(0);
  const [editing, setEditing] = useState<LateFeePayment | null>(null);
  const [error, setError] = useState<string | null>(null);
  // One write per click: a second click while the first is in flight would
  // record the money twice.
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setContract((await getContract(db, contractId)) ?? null);
    setInstallments(await installmentsFor(db, contractId));
    setDownFine(await downFeeFine(db, contractId, todayIso()));
    const rows = await lateFeePayments(db, contractId, kind);
    setReceived(rows);
    setEditing(editingId ? (rows.find((r) => r.id === editingId) ?? null) : null);
  }, [db, contractId, kind, editingId]);

  useEffect(() => {
    load();
  }, [load]);

  if (kind !== "installment" && kind !== "down") return <p>{t("not_found")}</p>;
  if (contract === undefined) return <p>{t("loading")}</p>;
  if (contract === null) return <p>{t("not_found")}</p>;

  const today = todayIso();
  // The same rule the contract page shows: a settled installment is judged by
  // the day it was paid, one still owing counts against today.
  const charged =
    kind === "down"
      ? downFine
      : installments.reduce((sum, i) => {
          const asOf =
            outstanding(i.amount_due, i.late_fee, i.paid_total) > 0
              ? today
              : (i.last_paid_on ?? today);
          return sum + lateFee(i.amount_due, lateCount(i.due_date, asOf));
        }, 0);
  const paid = received.reduce((sum, r) => sum + r.amount, 0);
  const remaining = charged - paid;

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = (key: string) => ((form.get(key) as string) ?? "").trim();
    setError(null);
    setBusy(true);
    try {
      const amount = toSatang(text("amount"));
      const paidOn = text("paid_on");
      validatePayment(amount, paidOn, today);
      await saveLateFeePayment(
        db,
        contractId,
        kind,
        { paid_on: paidOn, amount, note: text("note") || null },
        editing?.id ?? null,
      );
      navigate(`/contracts/${contractId}/late-fees/${kind}`);
      await load();
    } catch (e) {
      setError(e instanceof Error && isErrorKey(e.message) ? t(e.message) : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="pagehead">
        <BackButton />
        <h1>
          {t(kind === "down" ? "late_fee_down" : "late_fee_installments")}
          <span className="pair inline">
            <span className="party">
              <span className="role">{t("client")}</span>
              {contract.first_name} {contract.last_name}
            </span>
            <span className="arrow" aria-hidden="true">
              →
            </span>
            <span className="party">
              <span className="role">{t("car")}</span>
              {contract.brand} {contract.series ?? ""}
              {contract.plate_number && <span className="sub">{contract.plate_number}</span>}
            </span>
          </span>
        </h1>
      </div>
      <dl className="facts">
        {kind === "installment" && (
          <div>
            <dt>{t("late_total")}</dt>
            <dd>
              {installments.reduce(
                (sum, i) =>
                  sum +
                  lateCount(
                    i.due_date,
                    outstanding(i.amount_due, i.late_fee, i.paid_total) > 0
                      ? today
                      : (i.last_paid_on ?? today),
                  ),
                0,
              )}
            </dd>
          </div>
        )}
        <div>
          <dt>{t("late_fee_charged")}</dt>
          <dd>{formatBaht(charged)}</dd>
        </div>
        <div>
          <dt>{t("paid")}</dt>
          <dd>{formatBaht(paid)}</dd>
        </div>
        <div>
          <dt>{t("balance")}</dt>
          <dd>{formatBaht(remaining)}</dd>
        </div>
      </dl>

      {error && <p className="flash">{error}</p>}

      {received.length > 0 && (
        <>
          <h2>{t("payments")}</h2>
          <table>
            <thead>
              <tr>
                <th>{t("payment_date")}</th>
                <th className="num">{t("amount")}</th>
                <th>{t("note")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {received.map((r) => (
                <RowLink key={r.id} to={`/contracts/${contractId}/late-fees/${kind}?payment=${r.id}`}>
                  <td>{formatDate(r.paid_on)}</td>
                  <td className="num">{formatBaht(r.amount)}</td>
                  <td>{r.note ?? ""}</td>
                  <td className="num">
                    <Link
                      className="button"
                      to={`/contracts/${contractId}/late-fees/${kind}?payment=${r.id}`}
                    >
                      {t("edit")}
                    </Link>{" "}
                    <button
                      className="danger"
                      disabled={busy}
                      onClick={async () => {
                        if (!confirm(t("confirm_delete_payment"))) return;
                        setBusy(true);
                        try {
                          await deleteLateFeePayment(db, r.id);
                          navigate(`/contracts/${contractId}/late-fees/${kind}`);
                          await load();
                        } finally {
                          setBusy(false);
                        }
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

      <h2>{editing ? t("edit") : t("record_payment")}</h2>
      <form className="stack" key={editing?.id ?? "new"} onSubmit={onSubmit}>
        <label>
          {t("payment_date")}
          <DateInput name="paid_on" defaultValue={editing?.paid_on ?? today} required />
        </label>
        <label>
          {t("amount")}
          <input
            name="amount"
            defaultValue={formatBaht(editing ? editing.amount : Math.max(0, remaining))}
            required
          />
        </label>
        <label>
          {t("note")}
          <input name="note" defaultValue={editing?.note ?? ""} />
        </label>
        <div className="toolbar">
          <button type="submit" disabled={busy}>
            {t("save")}
          </button>
          {editing && (
            <button
              type="button"
              onClick={() => navigate(`/contracts/${contractId}/late-fees/${kind}`)}
            >
              {t("cancel")}
            </button>
          )}
        </div>
      </form>
    </>
  );
}
