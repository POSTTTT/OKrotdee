import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { useApp } from "../context";
import {
  addPayment,
  completeContractIfPaid,
  getContract,
  getInstallment,
  setLateFee,
  type ContractRow,
  type InstallmentRow,
} from "../db";
import { isErrorKey } from "../lang";
import { daysLate, formatBaht, outstanding, toSatang, todayIso } from "../money";
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

  useEffect(() => {
    getInstallment(db, installmentId).then(async (row) => {
      setInstallment(row ?? null);
      setContract(row ? ((await getContract(db, row.contract_id)) ?? null) : null);
    });
  }, [db, installmentId]);

  if (installment === undefined || contract === undefined) return <p>{t("loading")}</p>;
  if (!installment || !contract) return <p>{t("not_found")}</p>;

  const balance = outstanding(
    installment.amount_due,
    installment.late_fee,
    installment.paid_total,
  );
  const late = daysLate(installment.due_date, paidOn);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = (key: string) => ((form.get(key) as string) ?? "").trim();
    setError(null);
    setBusy(true);
    try {
      const amount = toSatang(text("amount"));
      const lateFee = toSatang(text("late_fee") || "0");
      validatePayment(amount, paidOn, todayIso());

      if (lateFee !== installment.late_fee) await setLateFee(db, installment.id, lateFee);
      await addPayment(db, installment.id, paidOn, amount, text("method") || null,
        text("note") || null);
      await completeContractIfPaid(db, installment.contract_id);
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
      <h1>
        {t("record_payment")} — {t("seq")} {installment.seq}
      </h1>
      <p>
        {t("client")}: {contract.first_name} {contract.last_name} &middot; {t("due_date")}:{" "}
        {installment.due_date} &middot; {t("balance")}: {formatBaht(balance)}
      </p>
      {late > 0 && (
        <p className="flash">
          {late} {t("days_late")}
        </p>
      )}
      {error && <p className="flash">{error}</p>}
      <form className="stack" onSubmit={onSubmit}>
        <label>
          {t("payment_date")}
          <input
            type="date"
            name="paid_on"
            value={paidOn}
            onChange={(e) => setPaidOn(e.target.value)}
            required
          />
        </label>
        <label>
          {t("amount")}
          <input name="amount" defaultValue={formatBaht(balance)} required />
        </label>
        <label>
          {t("late_fee")}
          <input name="late_fee" defaultValue={formatBaht(installment.late_fee)} />
        </label>
        <label>
          {t("method")}
          <select name="method" defaultValue="cash">
            <option value="cash">{t("cash")}</option>
            <option value="transfer">{t("transfer")}</option>
          </select>
        </label>
        <label>
          {t("note")}
          <input name="note" />
        </label>
        <div className="toolbar">
          <button type="submit" disabled={busy}>
            {t("save")}
          </button>
        </div>
      </form>
    </>
  );
}
