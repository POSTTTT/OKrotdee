import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import BackButton from "../BackButton";
import { useApp } from "../context";
import { formatDate } from "../dates";
import DateInput from "../DateInput";
import Picker from "../Picker";
import { phoneList } from "../phone";
import {
  addContractCoClient,
  availableCars,
  createContract,
  getContract,
  undoRefinance,
  installmentsFor,
  listClients,
  type Car,
  type Client,
  type ContractFields,
  type ContractRow,
} from "../db";
import { isErrorKey } from "../lang";
import { formatBaht, generateSchedule, outstanding, toSatang } from "../money";

export default function ContractForm() {
  const { db, t } = useApp();
  const navigate = useNavigate();
  // Refinancing arrives here from the contract it replaces: the same client
  // keeps the same car, and only the terms are written again.
  const previousId = Number(useSearchParams()[0].get("from")) || null;
  const [previous, setPrevious] = useState<ContractRow | null>(null);
  const [previousBalance, setPreviousBalance] = useState(0);
  const [clients, setClients] = useState<Client[]>([]);
  const [cars, setCars] = useState<Car[]>([]);
  const [preview, setPreview] = useState<{ dates: string[]; amount: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Nothing is chosen until the staff choose it: a contract written against
  // whoever happened to be first in the list is worse than an empty field.
  const [clientId, setClientId] = useState<number | null>(null);
  const [carId, setCarId] = useState<number | null>(null);
  // One entry per co-signer on the paperwork, each picked the same way.
  const [coIds, setCoIds] = useState<(number | null)[]>([]);
  // One contract per click: a second click while the write is in flight would
  // insert a second contract and charge the client twice.
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listClients(db).then(setClients);
    availableCars(db).then(setCars);
  }, [db]);

  useEffect(() => {
    if (!previousId) return;
    getContract(db, previousId).then((row) => {
      if (!row) return;
      setPrevious(row);
      setClientId(row.client_id);
      setCarId(row.car_id);
    });
    installmentsFor(db, previousId).then((rows) =>
      setPreviousBalance(
        rows.reduce((sum, i) => sum + outstanding(i.amount_due, i.late_fee, i.paid_total), 0),
      ),
    );
  }, [db, previousId]);

  const readFields = (form: FormData): ContractFields => {
    const text = (key: string) => ((form.get(key) as string) ?? "").trim();
    if (!text("client_id") || !text("car_id")) throw new Error("err_choose_client_car");
    const firstDue = text("first_due_date");
    if (!firstDue) throw new Error("err_choose_first_due_date");
    const fields: ContractFields = {
      client_id: Number(text("client_id")),
      car_id: Number(text("car_id")),
      car_price: toSatang(text("car_price") || "0"),
      installment_amount: toSatang(text("installment_amount")),
      installment_count: Number(text("installment_count")),
      first_due_date: firstDue,
      // The client pays on the same day of the month as the first payment.
      due_day: Number(firstDue.slice(8, 10)),
      down_payment: toSatang(text("down_payment") || "0"),
      note: null,
      // What ties the new contract to the one it replaces, so the list can
      // show the two together.
      refinanced_from: previousId,
    };
    if (!fields.client_id || !fields.car_id) throw new Error("err_choose_client_car");
    if (fields.installment_count < 1) {
      throw new Error("err_installment_min_one");
    }
    if (fields.installment_amount <= 0) {
      throw new Error("err_installment_amount_positive");
    }
    return fields;
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement;
    const form = new FormData(event.currentTarget);
    setError(null);
    setBusy(true);
    try {
      const fields = readFields(form);
      const dates = generateSchedule(
        fields.first_due_date,
        fields.installment_count,
        fields.due_day,
      );
      if (submitter?.value === "preview") {
        setPreview({ dates, amount: fields.installment_amount });
        return;
      }
      const id = await createContract(db, fields);
      for (const co of coIds) {
        if (co) await addContractCoClient(db, id, co);
      }
      navigate(`/contracts/${id}`);
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
      <div className="pagehead">
        <BackButton />
        <h1>{t("create_contract")}</h1>
      </div>
      {error && <p className="flash">{error}</p>}
      {/* What the client was on until now, to write the new terms against. */}
      {previous && (
        <>
          <h2>
            <Link to={`/contracts/${previous.id}`}>{t("previous_contract")}</Link>
          </h2>
          <dl className="facts">
            <div>
              <dt>{t("car_price")}</dt>
              <dd>{formatBaht(previous.car_price)}</dd>
            </div>
            <div>
              <dt>{t("down_payment")}</dt>
              <dd>{formatBaht(previous.down_payment)}</dd>
            </div>
            <div>
              <dt>{t("installment_amount")}</dt>
              <dd>
                {formatBaht(previous.installment_amount)}{" "}
                <small>&times; {previous.installment_count}</small>
              </dd>
            </div>
            <div>
              <dt>{t("first_due_date")}</dt>
              <dd>{formatDate(previous.first_due_date)}</dd>
            </div>
            <div className={previousBalance > 0 ? "owing" : "settled"}>
              <dt>{t("balance")}</dt>
              <dd>{formatBaht(previousBalance)}</dd>
            </div>
          </dl>
        </>
      )}
      <form className="stack" onSubmit={onSubmit}>
        {/* Who and what the contract ties together, kept apart from the money
            terms below: the client on the left, the car on the right, and
            anyone signing alongside them in a card of the same size beneath. */}
        <div className="pair picker parties">
          <Picker
            name="client_id"
            label={t("client")}
            value={clientId}
            onPick={setClientId}
            locked={previous !== null}
            items={clients.map((c) => ({
              id: c.id,
              text: `${c.first_name} ${c.last_name}`,
              sub: [c.nickname, ...phoneList(c.phone)].filter(Boolean).join(" · ") || null,
            }))}
          />
          <span className="arrow" aria-hidden="true">
            &rarr;
          </span>
          <Picker
            name="car_id"
            label={t("car")}
            value={carId}
            onPick={setCarId}
            locked={previous !== null}
            items={cars.map((c) => ({
              id: c.id,
              text: `${c.brand} ${c.series ?? ""}`.trim(),
              sub:
                [c.plate_number, c.color, c.model_year].filter(Boolean).join(" · ") || null,
            }))}
          />
          {coIds.map((id, index) => (
            <span className="slot" key={index}>
              <Picker
                label={t("co_signers")}
                value={id}
                onPick={(picked) =>
                  setCoIds(coIds.map((old, i) => (i === index ? picked : old)))
                }
                items={clients
                  // Nobody signs twice: not the main client, not another row.
                  .filter((c) => c.id === id || (c.id !== clientId && !coIds.includes(c.id)))
                  .map((c) => ({
                    id: c.id,
                    text: `${c.first_name} ${c.last_name}`,
                    sub: [c.nickname, ...phoneList(c.phone)].filter(Boolean).join(" · ") || null,
                  }))}
              />
              <button
                type="button"
                className="drop"
                aria-label={t("delete")}
                onClick={() => setCoIds(coIds.filter((_, i) => i !== index))}
              >
                &times;
              </button>
            </span>
          ))}
          <button type="button" className="ghost" onClick={() => setCoIds([...coIds, null])}>
            + {t("add_co_signer")}
          </button>
        </div>
        <label>
          {t("car_price")}
          <input name="car_price" />
        </label>
        <label>
          {t("down_payment")}
          <input name="down_payment" />
        </label>
        <label>
          {t("installment_amount")}
          <input name="installment_amount" required />
        </label>
        <label>
          {t("installment_count")}
          <input name="installment_count" type="number" required />
        </label>
        <label>
          {t("first_due_date")}
          <DateInput name="first_due_date" required />
        </label>
        <div className="toolbar">
          <button type="submit" name="action" value="preview" disabled={busy}>
            {t("preview_schedule")}
          </button>
          <button type="submit" name="action" value="create" disabled={busy}>
            {t("create_contract")}
          </button>
          {/* Changed their mind: the old contract goes back to running, and
              the car with it, as though it had never been flagged. */}
          {previous && (
            <button
              type="button"
              className="ghost"
              disabled={busy}
              onClick={async () => {
                await undoRefinance(db, previous.id);
                navigate(`/contracts/${previous.id}`);
              }}
            >
              {t("cancel_refinance")}
            </button>
          )}
        </div>
      </form>

      {preview && (
        <>
          <h2>{t("schedule")}</h2>
          <table>
            <thead>
              <tr>
                <th>{t("seq")}</th>
                <th>{t("due_date")}</th>
                <th className="num">{t("amount_due")}</th>
              </tr>
            </thead>
            <tbody>
              {preview.dates.map((due, index) => (
                <tr key={due + index}>
                  <td>{index + 1}</td>
                  <td>{formatDate(due)}</td>
                  <td className="num">{formatBaht(preview.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </>
  );
}
