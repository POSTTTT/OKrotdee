import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import BackButton from "../BackButton";
import RowLink from "../RowLink";
import { useChains } from "../chains";
import Timeline from "../Timeline";
import ConfirmButton from "../ConfirmButton";
import { useApp } from "../context";
import { phoneList } from "../phone";
import {
  addClientEvent,
  clientContracts,
  clientEvents,
  deleteClient,
  deleteClientEvent,
  getClient,
  setClientEvent,
  type Client,
  type ClientEvent,
  type ContractRow,
} from "../db";
import { isErrorKey } from "../lang";
import { formatBaht } from "../money";

export default function ClientDetail() {
  const { db, t } = useApp();
  const navigate = useNavigate();
  const clientId = Number(useParams().id);
  // undefined while loading, null when there is no such client.
  const [client, setClient] = useState<Client | null | undefined>();
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const { rows, toggle } = useChains(contracts);
  const [events, setEvents] = useState<ClientEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setClient((await getClient(db, clientId)) ?? null);
    setContracts(await clientContracts(db, clientId));
    setEvents(await clientEvents(db, clientId));
  }, [db, clientId]);

  useEffect(() => {
    load();
  }, [load]);

  /** Which car a contract is for, so the log names it rather than an id. */
  const subject = (contractId: number) => {
    const row = contracts.find((c) => c.id === contractId);
    return row?.brand ? `${row.brand} ${row.plate_number ?? ""}`.trim() : null;
  };

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
          <ConfirmButton
            question={t("confirm_delete_client")}
            className="danger"
            onConfirm={async () => {
              try {
                await deleteClient(db, client.id);
                navigate("/clients");
              } catch (e) {
                setError(e instanceof Error && isErrorKey(e.message) ? t(e.message) : String(e));
              }
            }}
          >
            {t("delete")}
          </ConfirmButton>
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
          {rows.map(({ contract: c, times, index, ordinal, open, className }) => (
            <RowLink key={c.id} to={`/contracts/${c.id}`} className={className}>
              <td>
                {/* The rows under the newest one are what it replaced. */}
                {index > 0 && <span className="chained">&#8627; </span>}
                <Link to={`/contracts/${c.id}`}>
                  {c.brand} {c.series ?? ""}
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

      <h2>{t("history")}</h2>
      <Timeline
        entries={events}
        contractLabel={subject}
        onAdd={async (date, note) => {
          await addClientEvent(db, clientId, date, "note", null, note);
          await load();
        }}
        onSave={async (id, date, note) => {
          await setClientEvent(db, id, date, note);
          await load();
        }}
        onDelete={async (id) => {
          await deleteClientEvent(db, id);
          await load();
        }}
      />
    </>
  );
}
