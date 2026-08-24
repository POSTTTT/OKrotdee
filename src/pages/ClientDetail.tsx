import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { useApp } from "../context";
import { clientContracts, getClient, type Client, type ContractRow } from "../db";
import { formatBaht } from "../money";

export default function ClientDetail() {
  const { db, t } = useApp();
  const clientId = Number(useParams().id);
  const [client, setClient] = useState<Client | null>(null);
  const [contracts, setContracts] = useState<ContractRow[]>([]);

  useEffect(() => {
    getClient(db, clientId).then((c) => setClient(c ?? null));
    clientContracts(db, clientId).then(setContracts);
  }, [db, clientId]);

  if (!client) return <p>{t("loading")}</p>;

  return (
    <>
      <h1>
        {client.first_name} {client.last_name}{" "}
        <Link className="button" to={`/clients/${client.id}/edit`}>
          {t("edit")}
        </Link>
      </h1>
      <p>
        {t("phone")}: {client.phone ?? "-"} &middot; {t("thai_id")}: {client.thai_id ?? "-"}
      </p>
      <p>
        {t("address")}: {client.address ?? "-"}
      </p>
      {client.note && (
        <p>
          {t("note")}: {client.note}
        </p>
      )}

      <h2>{t("contracts")}</h2>
      <table>
        <thead>
          <tr>
            <th>{t("car")}</th>
            <th>{t("plate_number")}</th>
            <th className="num">{t("installment_amount")}</th>
            <th>{t("status")}</th>
          </tr>
        </thead>
        <tbody>
          {contracts.map((c) => (
            <tr key={c.id}>
              <td>
                <Link to={`/contracts/${c.id}`}>
                  {c.brand} {c.series ?? ""}
                </Link>
              </td>
              <td>{c.plate_number ?? ""}</td>
              <td className="num">{formatBaht(c.installment_amount)}</td>
              <td>
                <span className={`tag ${c.status}`}>{t(c.status)}</span>
              </td>
            </tr>
          ))}
          {contracts.length === 0 && (
            <tr>
              <td colSpan={4}>{t("none_yet")}</td>
            </tr>
          )}
        </tbody>
      </table>
    </>
  );
}
