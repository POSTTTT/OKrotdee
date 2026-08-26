import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import RowLink from "../RowLink";
import { useApp } from "../context";
import { listContracts, type ContractRow } from "../db";
import { formatBaht } from "../money";

const STATUSES = ["active", "completed", "repossessed", "cancelled"] as const;

export default function Contracts() {
  const { db, t } = useApp();
  const [status, setStatus] = useState("");
  const [contracts, setContracts] = useState<ContractRow[]>([]);

  useEffect(() => {
    listContracts(db, status || undefined).then(setContracts);
  }, [db, status]);

  return (
    <>
      <h1>{t("contracts")}</h1>
      <div className="toolbar">
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">{t("status")}</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(s)}
            </option>
          ))}
        </select>
        <Link className="button" to="/contracts/new">
          + {t("new")}
        </Link>
      </div>
      <table>
        <thead>
          <tr>
            <th>{t("client")}</th>
            <th>{t("car")}</th>
            <th>{t("plate_number")}</th>
            <th className="num">{t("installment_amount")}</th>
            <th className="num">{t("installment_count")}</th>
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
              <td>
                {c.brand} {c.series ?? ""}
              </td>
              <td>{c.plate_number ?? ""}</td>
              <td className="num">{formatBaht(c.installment_amount)}</td>
              <td className="num">{c.installment_count}</td>
              <td>
                <span className={`tag ${c.status}`}>{t(c.status)}</span>
              </td>
            </RowLink>
          ))}
          {contracts.length === 0 && (
            <tr>
              <td colSpan={6}>{t("none_yet")}</td>
            </tr>
          )}
        </tbody>
      </table>
    </>
  );
}
