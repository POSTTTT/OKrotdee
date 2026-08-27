import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";

import BackButton from "../BackButton";
import { useApp } from "../context";
import { createClient, getClient, updateClient, type Client } from "../db";
import { ValidationError } from "../validate";

export default function ClientForm() {
  const { db, t } = useApp();
  const navigate = useNavigate();
  const { id } = useParams();
  const clientId = id ? Number(id) : null;

  const [client, setClient] = useState<Client | null>(null);
  // A client often answers on two or three numbers. They are kept one per
  // line in the same column, so search still matches any of them.
  const [phones, setPhones] = useState<string[]>([""]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (clientId)
      getClient(db, clientId).then((c) => {
        setClient(c ?? null);
        setPhones(c?.phone ? c.phone.split("\n") : [""]);
      });
  }, [db, clientId]);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const value = (key: string) => ((form.get(key) as string) ?? "").trim() || null;

    setBusy(true);
    try {
      const first_name = value("first_name");
      const last_name = value("last_name");
      if (!first_name || !last_name) {
        throw new ValidationError("err_name_required");
      }
      const fields = {
        first_name,
        last_name,
        nickname: value("nickname"),
        phone:
          form
            .getAll("phone")
            .map((p) => String(p).trim())
            .filter(Boolean)
            .join("\n") || null,
        address: value("address"),
        lo_work: value("lo_work"),
        // Not on the form; carried through so an edit does not erase what an
        // older version of the form recorded.
        thai_id: client?.thai_id ?? null,
        note: client?.note ?? null,
      };
      if (clientId) {
        await updateClient(db, clientId, fields);
        navigate(`/clients/${clientId}`);
      } else {
        const newId = await createClient(db, fields);
        navigate(`/clients/${newId}`);
      }
    } catch (e) {
      setError(e instanceof ValidationError ? t(e.message) : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="pagehead">
        <BackButton />
        <h1>{t("clients")}</h1>
      </div>
      {error && <p className="flash">{error}</p>}
      <form className="stack" key={client?.id ?? "new"} onSubmit={onSubmit}>
        <label>
          {t("first_name")}
          <input name="first_name" defaultValue={client?.first_name ?? ""} required />
        </label>
        <label>
          {t("last_name")}
          <input name="last_name" defaultValue={client?.last_name ?? ""} required />
        </label>
        <label>
          {t("nickname")}
          <input name="nickname" defaultValue={client?.nickname ?? ""} />
        </label>
        <label>
          {t("phone")}
          {phones.map((phone, index) => (
            <span className="repeat" key={index}>
              <input
                name="phone"
                value={phone}
                onChange={(e) =>
                  setPhones(phones.map((p, i) => (i === index ? e.target.value : p)))
                }
              />
              {phones.length > 1 && (
                <button
                  type="button"
                  className="ghost"
                  onClick={() => setPhones(phones.filter((_, i) => i !== index))}
                  aria-label={t("delete")}
                >
                  ×
                </button>
              )}
            </span>
          ))}
          <span>
            <button type="button" className="ghost" onClick={() => setPhones([...phones, ""])}>
              + {t("phone")}
            </button>
          </span>
        </label>
        <label>
          {t("address")}
          <textarea name="address" rows={3} defaultValue={client?.address ?? ""} />
        </label>
        <label>
          {t("lo_work")}
          <textarea name="lo_work" rows={3} defaultValue={client?.lo_work ?? ""} />
        </label>
        <div>
          <button type="submit" disabled={busy}>
            {t("save")}
          </button>
        </div>
      </form>
    </>
  );
}
