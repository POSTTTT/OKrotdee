import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { useApp } from "../context";
import { listCars, type Car } from "../db";
import { formatBaht } from "../money";

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
      <h1>{t("cars")}</h1>
      <div className="toolbar">
        <input
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
        <Link className="button" to="/cars/new">
          + {t("new")}
        </Link>
      </div>
      <table>
        <thead>
          <tr>
            <th>{t("brand")}</th>
            <th>{t("series")}</th>
            <th>{t("model_year")}</th>
            <th>{t("plate_number")}</th>
            <th className="num">{t("asking_price")}</th>
            <th>{t("status")}</th>
          </tr>
        </thead>
        <tbody>
          {cars.map((c) => (
            <tr key={c.id}>
              <td>
                <Link to={`/cars/${c.id}`}>{c.brand}</Link>
              </td>
              <td>{c.series ?? ""}</td>
              <td>{c.model_year ?? ""}</td>
              <td>{c.plate_number ?? ""}</td>
              <td className="num">{c.asking_price ? formatBaht(c.asking_price) : ""}</td>
              <td>
                <span className={`tag ${c.status}`}>{t(c.status)}</span>
              </td>
            </tr>
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
