import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";

import BackButton from "../BackButton";
import { useApp } from "../context";
import { formatDate } from "../dates";
import DateInput from "../DateInput";
import {
  addFeePayment,
  addFeeSchedulePart,
  contractFees,
  deleteFeePayment,
  deleteFeeSchedulePart,
  feePayments,
  feeSchedule,
  getContract,
  getFee,
  saveFee,
  type ContractRow,
  type Fee,
  type FeePayment,
  type FeeSchedulePart,
  type FeeType,
} from "../db";
import { isErrorKey } from "../lang";
import { formatBaht, lateFee, scheduleStrikes, toSatang, todayIso } from "../money";
import { payment as validatePayment } from "../validate";

export default function FeeForm() {
  const { db, t } = useApp();
  const navigate = useNavigate();
  const params = useParams();
  const contractId = Number(params.id);
  const type = params.type as FeeType;
  // Present when correcting a fee already recorded.
  const editingId = Number(useSearchParams()[0].get("fee")) || null;

  // undefined while loading, null when there is no such contract.
  const [contract, setContract] = useState<ContractRow | null | undefined>();
  const [fee, setFee] = useState<Fee | null>(null);
  // The down payment often arrives in parts, and is late until the last part.
  const [parts, setParts] = useState<FeePayment[]>([]);
  // What the client promised to pay and when. Empty means the whole sum on
  // the fee's own due date.
  const [promised, setPromised] = useState<FeeSchedulePart[]>([]);
  const [error, setError] = useState<string | null>(null);
  // One write per click: a second click while the first is in flight would
  // record the money twice.
  const [busy, setBusy] = useState(false);

  const loadParts = useCallback(
    async (feeId: number | null) => {
      setParts(feeId ? await feePayments(db, feeId) : []);
      setPromised(feeId ? await feeSchedule(db, feeId) : []);
    },
    [db],
  );

  useEffect(() => {
    getContract(db, contractId).then((c) => setContract(c ?? null));
    if (editingId) {
      getFee(db, editingId).then((f) => {
        setFee(f ?? null);
        loadParts(f?.id ?? null);
      });
    } else if (type === "down") {
      // A contract has one down payment, so this page always corrects it
      // rather than adding a second one. Insurance is paid again every year
      // and starts blank.
      contractFees(db, contractId).then((rows) => {
        const down = rows.find((f) => f.type === "down") ?? null;
        setFee(down);
        loadParts(down?.id ?? null);
      });
    }
  }, [db, contractId, type, editingId, loadParts]);

  if (type !== "down" && type !== "insurance") return <p>{t("not_found")}</p>;
  if (contract === undefined) return <p>{t("loading")}</p>;
  if (contract === null) return <p>{t("not_found")}</p>;

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = (key: string) => ((form.get(key) as string) ?? "").trim();
    setError(null);
    setBusy(true);
    try {
      const today = todayIso();
      const amount = toSatang(text("amount"));
      // Blank means the client has not paid this fee yet.
      // A down payment records its dates on the payments below instead.
      const paidOn = type === "insurance" ? text("paid_on") || null : null;
      validatePayment(amount, paidOn ?? today, today);
      // Only an insurance fee carries the police fine, and it may be blank.
      // The client often settles it on a different day, so it has its own date.
      const officerAmount =
        type === "insurance" && text("officer_amount") ? toSatang(text("officer_amount")) : null;
      const officerPaidOn = officerAmount ? text("officer_paid_on") || null : null;
      if (officerAmount) validatePayment(officerAmount, officerPaidOn ?? today, today);
      await saveFee(
        db,
        contractId,
        {
          type,
          due_on: text("due_on"),
          paid_on: paidOn,
          amount,
          officer_amount: officerAmount,
          officer_paid_on: officerPaidOn,
          note: text("note") || null,
        },
        fee?.id ?? null,
      );
      navigate(`/contracts/${contractId}`);
    } catch (e) {
      setError(e instanceof Error && isErrorKey(e.message) ? t(e.message) : String(e));
    } finally {
      setBusy(false);
    }
  };

  const paid = parts.reduce((sum, p) => sum + p.amount, 0);
  const remaining = fee ? fee.amount - paid : 0;
  // Each promised part is judged against its own date, so an arrangement kept
  // to costs nothing. With no arrangement the whole sum is due at once.
  const fine = fee
    ? lateFee(
        fee.amount,
        scheduleStrikes(
          promised.length > 0 ? promised : [{ due_on: fee.due_on, amount: fee.amount }],
          parts,
          todayIso(),
        ),
      )
    : 0;

  const addPromised = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!fee) return;
    const element = event.currentTarget;
    const form = new FormData(element);
    const text = (key: string) => ((form.get(key) as string) ?? "").trim();
    setError(null);
    setBusy(true);
    try {
      const amount = toSatang(text("promise_amount"));
      if (amount <= 0) throw new Error("err_payment_amount_positive");
      await addFeeSchedulePart(db, fee.id, text("promise_due_on"), amount);
      element.reset();
      await loadParts(fee.id);
    } catch (e) {
      setError(e instanceof Error && isErrorKey(e.message) ? t(e.message) : String(e));
    } finally {
      setBusy(false);
    }
  };

  const addPart = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!fee) return;
    const element = event.currentTarget;
    const form = new FormData(element);
    const text = (key: string) => ((form.get(key) as string) ?? "").trim();
    setError(null);
    setBusy(true);
    try {
      const amount = toSatang(text("part_amount"));
      const paidOn = text("part_paid_on");
      validatePayment(amount, paidOn, todayIso());
      await addFeePayment(db, fee.id, paidOn, amount, text("part_note") || null);
      element.reset();
      await loadParts(fee.id);
    } catch (e) {
      setError(e instanceof Error && isErrorKey(e.message) ? t(e.message) : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <BackButton />
      <h1>
        {t(type === "down" ? "down_fee" : "insurance_fee")}
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
      {error && <p className="flash">{error}</p>}
      <form className="stack" key={fee?.id ?? "new"} onSubmit={onSubmit}>
        <label>
          {t("due_date")}
          <DateInput name="due_on" defaultValue={fee?.due_on ?? todayIso()} required />
        </label>
        {type === "insurance" && (
          <>
            <label>
              {t("payment_date")}
              <DateInput name="paid_on" defaultValue={fee?.paid_on ?? ""} />
            </label>
            <p className="hint">{t("unpaid_hint")}</p>
          </>
        )}
        <label>
          {t("amount")}
          <input
            name="amount"
            defaultValue={
              fee
                ? formatBaht(fee.amount)
                : type === "down"
                  ? formatBaht(contract.down_payment)
                  : ""
            }
            required
          />
        </label>
        {type === "insurance" && (
          <>
            <label>
              {t("officer_fee")}
              <input
                name="officer_amount"
                defaultValue={fee?.officer_amount != null ? formatBaht(fee.officer_amount) : ""}
              />
            </label>
            <label>
              {t("officer_paid_on")}
              <DateInput name="officer_paid_on" defaultValue={fee?.officer_paid_on ?? ""} />
            </label>
          </>
        )}
        <label>
          {t("note")}
          <input name="note" defaultValue={fee?.note ?? ""} />
        </label>
        <div className="toolbar">
          <button type="submit" disabled={busy}>
            {t("save")}
          </button>
          <button type="button" onClick={() => navigate(`/contracts/${contractId}`)}>
            {t("cancel")}
          </button>
        </div>
      </form>

      {type === "down" && fee && (
        <>
          <h2>{t("promised_schedule")}</h2>
          <p className="hint">{t("promised_hint")}</p>
          {promised.length > 0 && (
            <table>
              <thead>
                <tr>
                  <th>{t("due_date")}</th>
                  <th className="num">{t("amount")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {promised.map((p) => (
                  <tr key={p.id}>
                    <td>{formatDate(p.due_on)}</td>
                    <td className="num">{formatBaht(p.amount)}</td>
                    <td className="num">
                      <button
                        className="danger"
                        disabled={busy}
                        onClick={async () => {
                          await deleteFeeSchedulePart(db, p.id);
                          await loadParts(fee.id);
                        }}
                      >
                        {t("delete")}
                      </button>
                    </td>
                  </tr>
                ))}
                <tr>
                  <td>{t("amount")}</td>
                  <td className="num">
                    {formatBaht(promised.reduce((sum, p) => sum + p.amount, 0))}
                  </td>
                  <td />
                </tr>
              </tbody>
            </table>
          )}
          <form className="toolbar" onSubmit={addPromised}>
            <DateInput name="promise_due_on" defaultValue={todayIso()} required />
            <input name="promise_amount" placeholder={t("amount")} required />
            <button type="submit" disabled={busy}>
              {t("add_promise")}
            </button>
          </form>

          <h2>{t("payments")}</h2>
          <dl className="facts">
            <div>
              <dt>{t("amount")}</dt>
              <dd>{formatBaht(fee.amount)}</dd>
            </div>
            <div>
              <dt>{t("paid")}</dt>
              <dd>{formatBaht(paid)}</dd>
            </div>
            <div>
              <dt>{t("balance")}</dt>
              <dd>{formatBaht(remaining)}</dd>
            </div>
            <div>
              <dt>{t("late_fee_down")}</dt>
              <dd>{formatBaht(fine)}</dd>
            </div>
          </dl>

          {parts.length > 0 && (
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
                {parts.map((p) => (
                  <tr key={p.id}>
                    <td>{formatDate(p.paid_on)}</td>
                    <td className="num">{formatBaht(p.amount)}</td>
                    <td>{p.note ?? ""}</td>
                    <td className="num">
                      <button
                        className="danger"
                        disabled={busy}
                        onClick={async () => {
                          if (!confirm(t("confirm_delete_payment"))) return;
                          setBusy(true);
                          try {
                            await deleteFeePayment(db, p.id);
                            await loadParts(fee.id);
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        {t("delete")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <form className="toolbar" key={`part-${remaining}`} onSubmit={addPart}>
            <DateInput name="part_paid_on" defaultValue={todayIso()} required />
            <input
              name="part_amount"
              placeholder={t("amount")}
              defaultValue={remaining > 0 ? formatBaht(remaining) : ""}
              required
            />
            <input name="part_note" placeholder={t("note")} />
            <button type="submit" disabled={busy}>
              {t("record_payment")}
            </button>
          </form>
        </>
      )}
    </>
  );
}
