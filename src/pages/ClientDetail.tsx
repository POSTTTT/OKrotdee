import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import BackButton from "../BackButton";
import RowLink from "../RowLink";
import { useApp } from "../context";
import { phoneList } from "../phone";
import { clientContracts, deleteClient, getClient, type Client, type ContractRow } from "../db";
import { isErrorKey } from "../lang";
import { formatBaht } from "../money";

export default function ClientDetail() {
  const { db, t } = useApp();
  const navigate = useNavigate();
  const clientId = Number(useParams().id);
  // undefined while loading, null when there is no such client.
  const [client, setClient] = useState<Client | null | undefined>();
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getClient(db, clientId).then((c) => setClient(c ?? null));
    clientContracts(db, clientId).then(setContracts);
  }, [db, clientId]);

  if (client === undefined) return <p>{t("loading")}</p>;
  if (client === null) return <p>{t("not_found")}</p>;

  return (
    <>
      <div className="pagehead record">
        <BackButton />
        <h1>
          {client.first_name} {client.last_name}
          {client.nickname ? ` (${client.nickname})` : ""}
        </h1>
        <span className="actions">
          <Link className="button" to={`/clients/${client.id}/edit`}>
            {t("edit")}
          </Link>
          <button
            className="danger"
            onClick={async () => {
              if (!confirm(t("confirm_delete_client"))) return;
              try {
                await deleteClient(db, client.id);
                navigate("/clients");
              } catch (e) {
                setError(e instanceof Error && isErrorKey(e.message) ? t(e.message) : String(e));
              }
            }}
          >
            {t("delete")}
          </button>
        </span>
      </div>
      {error && <p className="flash">{error}</p>}
      <dl className="facts">
        <div>
          <dt>{t("phone")}</dt>
          <dd>
            {phoneList(client.phone).map((phone) => (
              <div key={phone}>{phone}</div>
            ))}
            {!client.phone && "-"}
          </dd>
        </div>
        <div>
          <dt>{t("address")}</dt>
          <dd className="text">{client.address ?? "-"}</dd>
        </div>
        <div>
          <dt>{t("lo_work")}</dt>
          <dd className="text">{client.lo_work ?? "-"}</dd>
        </div>
        {client.note && (
          <div>
            <dt>{t("note")}</dt>
            <dd className="text">{client.note}</dd>
          </div>
        )}
      </dl>

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
            <RowLink key={c.id} to={`/contracts/${c.id}`}>
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
            </RowLink>
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
