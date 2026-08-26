import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";

import BackButton from "../BackButton";
import RowLink from "../RowLink";
import { useApp } from "../context";
import { formatDate } from "../dates";
import DateInput from "../DateInput";
import {
  addPayment,
  deletePayment,
  getContract,
  getInstallment,
  getPayment,
  paymentsFor,
  syncContractStatus,
  updatePayment,
  type Payment,
  type ContractRow,
  type InstallmentRow,
} from "../db";
import { isErrorKey } from "../lang";
import { formatBaht, outstanding, toSatang, todayIso } from "../money";
import { payment as validatePayment } from "../validate";

export default function PaymentForm() {
  const { db, t } = useApp();
  const navigate = useNavigate();
  const installmentId = Number(useParams().id);
  // undefined while loading, null when there is no such installment.
  const [installment, setInstallment] = useState<InstallmentRow | null | undefined>();
  const [contract, setContract] = useState<ContractRow | null | undefined>();
  const [error, setError] = useState<string | null>(null);
  // One payment per click: a second click while the write is in flight would
  // record the money twice.
  const [busy, setBusy] = useState(false);
  const [paidOn, setPaidOn] = useState(todayIso());
  const [payments, setPayments] = useState<Payment[]>([]);
  // Set when correcting a payment already recorded, from ?payment=<id>.
  const editingId = Number(useSearchParams()[0].get("payment")) || null;
  const [editing, setEditing] = useState<Payment | null>(null);

  useEffect(() => {
    getInstallment(db, installmentId).then(async (row) => {
      setInstallment(row ?? null);
      setContract(row ? ((await getContract(db, row.contract_id)) ?? null) : null);
    });
    paymentsFor(db, installmentId).then(setPayments);
    if (editingId) {
      getPayment(db, editingId).then((p) => {
        setEditing(p ?? null);
        if (p) setPaidOn(p.paid_on);
      });
    } else {
      setEditing(null);
    }
  }, [db, installmentId, editingId]);

  if (installment === undefined || contract === undefined) return <p>{t("loading")}</p>;
  if (!installment || !contract) return <p>{t("not_found")}</p>;

  const balance = outstanding(
    installment.amount_due,
    installment.late_fee,
    installment.paid_total,
  );

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = (key: string) => ((form.get(key) as string) ?? "").trim();
    setError(null);
    setBusy(true);
    try {
      const amount = toSatang(text("amount"));
      validatePayment(amount, paidOn, todayIso());

      const note = text("note") || null;
      if (editing) {
        await updatePayment(db, editing.id, paidOn, amount, null, note);
      } else {
        await addPayment(db, installment.id, paidOn, amount, null, note);
      }
      await syncContractStatus(db, installment.contract_id);
      navigate(`/contracts/${installment.contract_id}`);
    } catch (e) {
      setError(
        e instanceof Error
          ? isErrorKey(e.message)
            ? t(e.message)
            : e.message
          : String(e),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <BackButton />
      <h1>
        {t("record_payment")} — {t("seq")} {installment.seq}
        <span className="pair inline">
          <span className="party">
            <span className="role">{t("client")}</span>
            {contract.first_name} {contract.last_name}
          </span>
          <span className="party">
            <span className="role">{t("due_date")}</span>
            {formatDate(installment.due_date)}
          </span>
          <span className="party">
            <span className="role">{t("balance")}</span>
            {formatBaht(balance)}
          </span>
        </span>
      </h1>
      {error && <p className="flash">{error}</p>}

      {payments.length > 0 && (
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
              {payments.map((p) => (
                <RowLink key={p.id} to={`/installments/${installment.id}/pay?payment=${p.id}`}>
                  <td>{formatDate(p.paid_on)}</td>
                  <td className="num">{formatBaht(p.amount)}</td>
                  <td>{p.note ?? ""}</td>
                  <td className="num">
                    <Link className="button" to={`/installments/${installment.id}/pay?payment=${p.id}`}>
                      {t("edit")}
                    </Link>{" "}
                    <button
                      className="danger"
                      disabled={busy}
                      onClick={async () => {
                        if (!confirm(t("confirm_delete_payment"))) return;
                        setBusy(true);
                        try {
                          await deletePayment(db, p.id);
                          await syncContractStatus(db, installment.contract_id);
                          navigate(`/contracts/${installment.contract_id}`);
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
              <tr>
                <td>{t("paid")}</td>
                <td className="num">{formatBaht(installment.paid_total)}</td>
                <td colSpan={2} />
              </tr>
            </tbody>
          </table>
        </>
      )}

      <h2>{editing ? t("edit") : t("record_payment")}</h2>
      <form className="stack" key={editing?.id ?? "new"} onSubmit={onSubmit}>
        <label>
          {t("payment_date")}
          <DateInput name="paid_on" defaultValue={paidOn} onChange={setPaidOn} required />
        </label>
        <label>
          {t("amount")}
          <input
            name="amount"
            defaultValue={formatBaht(editing ? editing.amount : balance)}
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
              onClick={() => navigate(`/installments/${installment.id}/pay`)}
            >
              {t("cancel")}
            </button>
          )}
        </div>
      </form>
    </>
  );
}
