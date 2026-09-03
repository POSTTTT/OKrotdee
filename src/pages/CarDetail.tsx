import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import BackButton from "../BackButton";
import RowLink from "../RowLink";
import { useChains } from "../chains";
import Timeline from "../Timeline";
import ConfirmButton from "../ConfirmButton";
import { useApp } from "../context";
import { formatDate } from "../dates";
import {
  addCarEvent,
  carContracts,
  carEvents,
  deleteCar,
  deleteCarEvent,
  getCar,
  setCarEvent,
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
  const [events, setEvents] = useState<CarEvent[]>([]);
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const { rows, toggle } = useChains(contracts);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setCar((await getCar(db, carId)) ?? null);
    setEvents(await carEvents(db, carId));
    setContracts(await carContracts(db, carId));
  }, [db, carId]);

  useEffect(() => {
    load();
  }, [load]);

  /** Who signed a contract, for a timeline that names people rather than ids. */
  const signer = (contractId: number) => {
    const row = contracts.find((c) => c.id === contractId);
    return row?.first_name ? `${row.first_name} ${row.last_name ?? ""}`.trim() : null;
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
          <ConfirmButton
            question={t("confirm_delete_car")}
            className="danger"
            onConfirm={async () => {
              try {
                await deleteCar(db, car.id);
                navigate("/cars");
              } catch (e) {
                setError(e instanceof Error && isErrorKey(e.message) ? t(e.message) : String(e));
              }
            }}
          >
            {t("delete")}
          </ConfirmButton>
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
          {rows.map(({ contract: c, times, index, ordinal, open, className }) => (
            <RowLink key={c.id} to={`/contracts/${c.id}`} className={className}>
              <td>
                {/* The rows under the newest one are what it replaced. */}
                {index > 0 && <span className="chained">&#8627; </span>}
                <Link to={`/contracts/${c.id}`}>
                  {c.first_name} {c.last_name}
                </Link>
                {/* Which of the deal's contracts this row is, counting from the
                    first one signed. */}
                {index > 0 && (
                  <small className="ordinal">
                    {t("contract_no")} {ordinal}
                  </small>
                )}
                {/* Refinanced deals read as one contract until asked to open. */}
                {times > 1 && index === 0 && (
                  <button type="button" className="chain-toggle" onClick={() => toggle(c.id)}>
                    {t("refinance")} &times;{times - 1} {open ? "\u25b4" : "\u25be"}
                  </button>
                )}
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
      <Timeline
        entries={events}
        contractLabel={signer}
        onAdd={async (date, note) => {
          await addCarEvent(db, carId, date, "note", null, note);
          await load();
        }}
        onSave={async (id, date, note) => {
          await setCarEvent(db, id, date, note);
          await load();
        }}
        onDelete={async (id) => {
          await deleteCarEvent(db, id);
          await load();
        }}
      />
    </>
  );
}
