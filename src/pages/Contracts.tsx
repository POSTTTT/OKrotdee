import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import RowLink from "../RowLink";
import { useChains } from "../chains";
import ConfirmButton from "../ConfirmButton";
import { useApp } from "../context";
import { deleteContract, listContracts, type ContractRow } from "../db";
import { formatBaht } from "../money";

const STATUSES = ["active", "completed", "repossessed", "cancelled", "refinanced"] as const;

export default function Contracts() {
  const { db, t } = useApp();
  const [status, setStatus] = useState("");
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  // A delete that quietly does nothing is worse than one that says why.
  const [error, setError] = useState<string | null>(null);
  const { rows, toggle } = useChains(contracts);

  useEffect(() => {
    listContracts(db, status || undefined).then(setContracts);
  }, [db, status]);

  return (
    <>
      <div className="pagehead">
        <h1>{t("contracts")}</h1>
        <span className="actions">
          <Link className="button" to="/contracts/new">
            + {t("new")}
          </Link>
        </span>
      </div>
      {error && <p className="flash alarm">{error}</p>}
      <div className="toolbar">
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">{t("status")}</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(s)}
            </option>
          ))}
        </select>
      </div>
      <div className="scroll page">
        <table>
          <thead>
            <tr>
              <th>{t("client")}</th>
              <th>{t("car")}</th>
              <th>{t("plate_number")}</th>
              <th className="num">{t("installment_amount")}</th>
              <th className="num">{t("installment_count")}</th>
              <th>{t("status")}</th>
              <th />
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
                <td>
                  {c.brand} {c.series ?? ""}
                </td>
                <td>{c.plate_number ?? ""}</td>
                <td className="num">{formatBaht(c.installment_amount)}</td>
                <td className="num">{c.installment_count}</td>
                <td>
                  <span className={`tag ${c.status}`}>{t(c.status)}</span>
                </td>
                <td className="row-actions">
                  <ConfirmButton
                    question={t("confirm_delete_contract")}
                    className="danger"
                    onConfirm={async () => {
                      setError(null);
                      try {
                        await deleteContract(db, c.id);
                      } catch (e) {
                        setError(String(e));
                      }
                      setContracts(await listContracts(db, status || undefined));
                    }}
                  >
                    {t("delete")}
                  </ConfirmButton>
                </td>
              </RowLink>
            ))}
            {contracts.length === 0 && (
              <tr>
                <td colSpan={7}>{t("none_yet")}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
