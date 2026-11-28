import { useEffect, useRef, useState, type FormEvent } from "react";
import { errorMessage } from "../errors";
import { Link, useNavigate, useParams } from "react-router-dom";

import BackButton from "../BackButton";
import Modal from "../Modal";
import { useApp } from "../context";
import {
  createClient,
  getClient,
  listClients,
  similarClients,
  updateClient,
  type Client,
} from "../db";
import { thaiId, ValidationError } from "../validate";

/**
 * Given onClose, renders as a dialog: adding over the list, or editing over
 * the client's page (onSaved then reloads it). Without, edits on its own page.
 */
export default function ClientForm({
  onClose,
  onSaved,
}: {
  onClose?: () => void;
  onSaved?: () => void;
}) {
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
  // Clients this one may duplicate, shown until staff save anyway.
  const [similar, setSimilar] = useState<Client[]>([]);
  const saveAnyway = useRef(false);

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
      const idText = value("thai_id");
      const fields = {
        first_name,
        last_name,
        nickname: value("nickname"),
        thai_id: idText ? thaiId(idText) : null,
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
        note: client?.note ?? null,
      };
      if (!saveAnyway.current) {
        const found = similarClients(await listClients(db), fields, clientId);
        setSimilar(found);
        if (found.length > 0) return;
      }
      saveAnyway.current = false;
      if (clientId) {
        await updateClient(db, clientId, fields);
        if (onClose) {
          onSaved?.();
          onClose();
        } else navigate(`/clients/${clientId}`);
      } else {
        const newId = await createClient(db, fields);
        navigate(`/clients/${newId}`);
      }
    } catch (e) {
      setError(errorMessage(String(e).includes("UNIQUE") ? "err_thai_id_taken" : e, t));
    } finally {
      setBusy(false);
    }
  };

  const body = (
    <>
      <div className="pagehead">
        {!onClose && <BackButton />}
        <h1>{onClose && !clientId ? t("add_client") : onClose ? t("edit") : t("clients")}</h1>
      </div>
      {error && <p className="flash">{error}</p>}
      <form className="stack paired" key={client?.id ?? "new"} onSubmit={onSubmit}>
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
          {t("thai_id")}
          <input name="thai_id" inputMode="numeric" defaultValue={client?.thai_id ?? ""} />
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
            <button
              type="button"
              className="ghost add-more"
              onClick={() => setPhones([...phones, ""])}
            >
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
        {similar.length > 0 && (
          <div className="flash duplicate">
            <p>{t("dup_client")}</p>
            <ul>
              {similar.map((c) => (
                <li key={c.id}>
                  <Link to={`/clients/${c.id}`}>
                    {c.first_name} {c.last_name}
                    {c.nickname && ` (${c.nickname})`}
                  </Link>
                  {c.phone && <small>{c.phone.split("\n").join(", ")}</small>}
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="form-end">
          {onClose && (
            <button type="button" className="ghost" onClick={onClose}>
              {t("cancel")}
            </button>
          )}
          {similar.length > 0 ? (
            <button type="submit" disabled={busy} onClick={() => (saveAnyway.current = true)}>
              {t("save_anyway")}
            </button>
          ) : (
            <button type="submit" disabled={busy}>
              {t("save")}
            </button>
          )}
        </div>
      </form>
    </>
  );
  return onClose ? <Modal onClose={onClose}>{body}</Modal> : body;
}
