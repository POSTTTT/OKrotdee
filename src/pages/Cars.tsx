import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import RowLink from "../RowLink";
import { useApp } from "../context";
import { listCars, type Car } from "../db";

const STATUSES = ["available", "on_contract", "sold", "repossessed"] as const;

export default function Cars() {
  const { db, t } = useApp();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [cars, setCars] = useState<Car[]>([]);

  useEffect(() => {
    listCars(db, status || undefined, query || undefined).then(setCars);
  }, [db, status, query]);

  return (
    <>
      <div className="pagehead">
        <h1>{t("cars")}</h1>
        <span className="actions">
          <Link className="button" to="/cars/new">
            + {t("new")}
          </Link>
        </span>
      </div>
      <div className="toolbar">
        <input
          name="q"
          value={query}
          placeholder={t("search")}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">{t("status")}</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(s)}
            </option>
          ))}
        </select>
      </div>
      <table>
        <thead>
          <tr>
            <th>{t("brand")}</th>
            <th>{t("series")}</th>
            <th>{t("color")}</th>
            <th>{t("model_year")}</th>
            <th>{t("plate_number")}</th>
            <th>{t("status")}</th>
          </tr>
        </thead>
        <tbody>
          {cars.map((c) => (
            <RowLink key={c.id} to={`/cars/${c.id}`}>
              <td>
                <Link to={`/cars/${c.id}`}>{c.brand}</Link>
              </td>
              <td>{c.series ?? ""}</td>
              <td>{c.color ?? ""}</td>
              <td>{c.model_year ?? ""}</td>
              <td>{c.plate_number ?? ""}</td>
              <td>
                <span className={`tag ${c.status}`}>{t(c.status)}</span>
              </td>
            </RowLink>
          ))}
          {cars.length === 0 && (
            <tr>
              <td colSpan={6}>{t("none_yet")}</td>
            </tr>
          )}
        </tbody>
      </table>
    </>
  );
}
