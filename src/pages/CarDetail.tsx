import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import BackButton from "../BackButton";
import RowLink from "../RowLink";
import { useApp } from "../context";
import { formatDate } from "../dates";
import DateInput from "../DateInput";
import {
  addCarEvent,
  carContracts,
  carEvents,
  deleteCar,
  getCar,
  setCarEventDate,
  type Car,
  type CarEvent,
  type ContractRow,
} from "../db";
import { isErrorKey } from "../lang";
import { formatBaht, todayIso } from "../money";

export default function CarDetail() {
  const { db, t } = useApp();
  const navigate = useNavigate();
  const carId = Number(useParams().id);
  // undefined while loading, null when there is no such car.
  const [car, setCar] = useState<Car | null | undefined>();
  const [busy, setBusy] = useState(false);
  const [events, setEvents] = useState<CarEvent[]>([]);
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  // The timeline entry whose date is open for correction, and the date chosen.
  const [editing, setEditing] = useState<number | null>(null);
  const [editDate, setEditDate] = useState("");

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
      <div className="pagehead record">
        <BackButton />
        <h1>
          {car.brand} {car.series ?? ""} {car.model_year ?? ""}
        </h1>
        <span className="actions">
          <Link className="button" to={`/cars/${car.id}/edit`}>
            {t("edit")}
          </Link>
          <button
            className="danger"
            onClick={async () => {
              if (!confirm(t("confirm_delete_car"))) return;
              try {
                await deleteCar(db, car.id);
                navigate("/cars");
              } catch (e) {
                setError(e instanceof Error && isErrorKey(e.message) ? t(e.message) : String(e));
              }
            }}
          >
            {t("delete")}
          </button>
        </span>
      </div>
      <div className="subhead">
        <span className={`tag ${car.status}`}>{t(car.status)}</span>
      </div>
      {error && <p className="flash">{error}</p>}
      <dl className="facts">
        <div>
          <dt>{t("plate_number")}</dt>
          <dd>{car.plate_number ?? "-"}</dd>
        </div>
        <div>
          <dt>{t("color")}</dt>
          <dd className="text">{car.color ?? "-"}</dd>
        </div>
        {/* An insurance that has run out is worth seeing at a glance. */}
        <div className={car.insurance_expires_on && car.insurance_expires_on < todayIso() ? "owing" : ""}>
          <dt>{t("insurance_expires_on")}</dt>
          <dd>{car.insurance_expires_on ? formatDate(car.insurance_expires_on) : "-"}</dd>
        </div>
      </dl>

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
            <RowLink key={c.id} to={`/contracts/${c.id}`}>
              <td>
                <Link to={`/contracts/${c.id}`}>
                  {c.first_name} {c.last_name}
                </Link>
              </td>
              <td className="num">{formatBaht(c.installment_amount)}</td>
              <td>
                <span className={`tag ${c.status}`}>{t(c.status)}</span>
              </td>
            </RowLink>
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
            {editing === e.id ? (
              <>
                <DateInput
                  name="event_date_edit"
                  defaultValue={e.event_date}
                  required
                  onChange={setEditDate}
                />
                <button
                  type="button"
                  disabled={busy || !editDate}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await setCarEventDate(db, e.id, editDate);
                      setEditing(null);
                      await load();
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {t("save")}
                </button>
                <button type="button" className="ghost" onClick={() => setEditing(null)}>
                  {t("cancel")}
                </button>{" "}
                {t(e.type)}
                {e.note ? `: ${e.note}` : ""}
              </>
            ) : (
              <>
                {formatDate(e.event_date)} — {t(e.type)}
                {e.note ? `: ${e.note}` : ""}{" "}
                {e.contract_id && <Link to={`/contracts/${e.contract_id}`}>#{e.contract_id}</Link>}{" "}
                <button
                  type="button"
                  className="ghost"
                  onClick={() => {
                    setEditing(e.id);
                    setEditDate(e.event_date);
                  }}
                >
                  {t("edit")}
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
      <form className="toolbar" onSubmit={addNote}>
        <DateInput name="event_date" defaultValue={todayIso()} required />
        <input name="note" placeholder={t("add_note")} required />
        <button type="submit" disabled={busy}>
          {t("add_note")}
        </button>
      </form>
    </>
  );
}
