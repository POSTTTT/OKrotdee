import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";

import BackButton from "../BackButton";
import { useApp } from "../context";
import { formatDate } from "../dates";
import DateInput from "../DateInput";
import {
  availableCars,
  createContract,
  listClients,
  type Car,
  type Client,
  type ContractFields,
} from "../db";
import { isErrorKey } from "../lang";
import { formatBaht, generateSchedule, toSatang } from "../money";

export default function ContractForm() {
  const { db, t } = useApp();
  const navigate = useNavigate();
  const [clients, setClients] = useState<Client[]>([]);
  const [cars, setCars] = useState<Car[]>([]);
  const [preview, setPreview] = useState<{ dates: string[]; amount: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  // One contract per click: a second click while the write is in flight would
  // insert a second contract and charge the client twice.
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listClients(db).then(setClients);
    availableCars(db).then(setCars);
  }, [db]);

  const readFields = (form: FormData): ContractFields => {
    const text = (key: string) => ((form.get(key) as string) ?? "").trim();
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
      navigate(`/contracts/${await createContract(db, fields)}`);
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
      <h1>{t("create_contract")}</h1>
      {error && <p className="flash">{error}</p>}
      <form className="stack" onSubmit={onSubmit}>
        <label>
          {t("client")}
          <select name="client_id" required>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.first_name} {c.last_name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("car")}
          <select name="car_id" required>
            {cars.map((c) => (
              <option key={c.id} value={c.id}>
                {c.brand} {c.series ?? ""} {c.plate_number ?? ""}
              </option>
            ))}
          </select>
        </label>
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
