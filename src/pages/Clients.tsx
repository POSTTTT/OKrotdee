import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { useApp } from "../context";
import { listClients, type Client } from "../db";

export default function Clients() {
  const { db, t } = useApp();
  const [query, setQuery] = useState("");
  const [clients, setClients] = useState<Client[]>([]);

  useEffect(() => {
    listClients(db, query).then(setClients);
  }, [db, query]);

  return (
    <>
      <h1>{t("clients")}</h1>
      <div className="toolbar">
        <input
          value={query}
          placeholder={t("search")}
          onChange={(e) => setQuery(e.target.value)}
        />
        <Link className="button" to="/clients/new">
          + {t("new")}
        </Link>
      </div>
      <table>
        <thead>
          <tr>
            <th>{t("first_name")}</th>
            <th>{t("last_name")}</th>
            <th>{t("phone")}</th>
            <th>{t("thai_id")}</th>
          </tr>
        </thead>
        <tbody>
          {clients.map((c) => (
            <tr key={c.id}>
              <td>
                <Link to={`/clients/${c.id}`}>{c.first_name}</Link>
              </td>
              <td>{c.last_name}</td>
              <td>{c.phone ?? ""}</td>
              <td>{c.thai_id ?? ""}</td>
            </tr>
          ))}
          {clients.length === 0 && (
            <tr>
              <td colSpan={4}>{t("none_yet")}</td>
            </tr>
          )}
        </tbody>
      </table>
    </>
  );
}
