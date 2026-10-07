import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import ImportDialog from "../ImportDialog";
import RowLink from "../RowLink";
import { useApp } from "../context";
import { phoneList } from "../phone";
import { listClients, type Client } from "../db";

export default function Clients() {
  const { db, t } = useApp();
  const [query, setQuery] = useState("");
  const [importing, setImporting] = useState(false);
  const [reload, setReload] = useState(0);
  const [clients, setClients] = useState<Client[]>([]);

  useEffect(() => {
    listClients(db, query).then(setClients);
  }, [db, query, reload]);

  return (
    <>
      <div className="pagehead">
        <h1>{t("clients")}</h1>
        <span className="actions">
          <button className="ghost" onClick={() => setImporting(true)}>
            {t("import")}
          </button>
          <Link className="button" to="/clients/new">
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
      </div>
      <div className="scroll page">
        <table>
          <thead>
            <tr>
              <th>{t("first_name")}</th>
              <th>{t("last_name")}</th>
              <th>{t("phone")}</th>
              <th>{t("nickname")}</th>
            </tr>
          </thead>
          <tbody>
            {clients.map((c) => (
              <RowLink key={c.id} to={`/clients/${c.id}`}>
                <td>
                  <Link to={`/clients/${c.id}`}>{c.first_name}</Link>
                </td>
                <td>{c.last_name}</td>
                <td>{phoneList(c.phone).join(", ")}</td>
                <td>{c.nickname ?? ""}</td>
              </RowLink>
            ))}
            {clients.length === 0 && (
              <tr>
                <td colSpan={4}>{t("none_yet")}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {importing && (
        <ImportDialog
          kind="clients"
          onClose={() => setImporting(false)}
          onImported={() => setReload(reload + 1)}
        />
      )}
    </>
  );
}
