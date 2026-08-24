import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";

import { useApp } from "../context";
import {
  addCarEvent,
  carContracts,
  carEvents,
  getCar,
  type Car,
  type CarEvent,
  type ContractRow,
} from "../db";
import { formatBaht, todayIso } from "../money";

export default function CarDetail() {
  const { db, t } = useApp();
  const carId = Number(useParams().id);
  // undefined while loading, null when there is no such car.
  const [car, setCar] = useState<Car | null | undefined>();
  const [busy, setBusy] = useState(false);
  const [events, setEvents] = useState<CarEvent[]>([]);
  const [contracts, setContracts] = useState<ContractRow[]>([]);

  const load = useCallback(async () => {
    setCar((await getCar(db, carId)) ?? null);
    setEvents(await carEvents(db, carId));
    setContracts(await carContracts(db, carId));
  }, [db, carId]);

  useEffect(() => {
    load();
  }, [load]);

  const addNote = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // React clears currentTarget once the handler returns, so hold on to the
    // form itself; reading it after the await would throw and skip load().
    const element = event.currentTarget;
    const form = new FormData(element);
    const note = ((form.get("note") as string) ?? "").trim();
    if (!note) return;
    setBusy(true);
    try {
      await addCarEvent(
        db,
        carId,
        (form.get("event_date") as string) || todayIso(),
        "note",
        null,
        note,
      );
      element.reset();
      await load();
    } finally {
      setBusy(false);
    }
  };

  if (car === undefined) return <p>{t("loading")}</p>;
  if (car === null) return <p>{t("not_found")}</p>;

  return (
    <>
      <h1>
        {car.brand} {car.series ?? ""} {car.model_year ?? ""}{" "}
        <span className={`tag ${car.status}`}>{t(car.status)}</span>{" "}
        <Link className="button" to={`/cars/${car.id}/edit`}>
          {t("edit")}
        </Link>
      </h1>
      <p>
        {t("plate_number")}: {car.plate_number ?? "-"} &middot; {t("color")}:{" "}
        {car.color ?? "-"} &middot; {t("mileage")}: {car.mileage ?? "-"}
      </p>
      <p>
        {t("cost_price")}: {car.cost_price != null ? formatBaht(car.cost_price) : "-"} &middot;{" "}
        {t("asking_price")}: {car.asking_price != null ? formatBaht(car.asking_price) : "-"}
      </p>

      <h2>{t("contracts")}</h2>
      <table>
        <thead>
          <tr>
            <th>{t("client")}</th>
            <th className="num">{t("installment_amount")}</th>
            <th>{t("status")}</th>
          </tr>
        </thead>
        <tbody>
          {contracts.map((c) => (
            <tr key={c.id}>
              <td>
                <Link to={`/contracts/${c.id}`}>
                  {c.first_name} {c.last_name}
                </Link>
              </td>
              <td className="num">{formatBaht(c.installment_amount)}</td>
              <td>
                <span className={`tag ${c.status}`}>{t(c.status)}</span>
              </td>
            </tr>
          ))}
          {contracts.length === 0 && (
            <tr>
              <td colSpan={3}>{t("none_yet")}</td>
            </tr>
          )}
        </tbody>
      </table>

      <h2>{t("timeline")}</h2>
      <ul className="timeline">
        {events.map((e) => (
          <li key={e.id}>
            {e.event_date} — {t(e.type)}
            {e.note ? `: ${e.note}` : ""}{" "}
            {e.contract_id && <Link to={`/contracts/${e.contract_id}`}>#{e.contract_id}</Link>}
          </li>
        ))}
      </ul>
      <form className="toolbar" onSubmit={addNote}>
        <input type="date" name="event_date" defaultValue={todayIso()} />
        <input name="note" placeholder={t("add_note")} required />
        <button type="submit" disabled={busy}>
          {t("add_note")}
        </button>
      </form>
    </>
  );
}
