import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

import ConfirmButton from "./ConfirmButton";
import DateInput from "./DateInput";
import { useApp } from "./context";
import { monthYear, parts } from "./dates";
import { todayIso } from "./money";

/** What a history log needs of an entry, whether a car's or a client's. */
export interface LogEntry {
  id: number;
  event_date: string;
  type: string;
  contract_id: number | null;
  note: string | null;
}

/**
 * A history log: the day down the left, a rail of dots, and a card for what
 * happened. Cars and clients keep the same kind of history, so they read it
 * through the same component.
 */
export default function Timeline({
  entries,
  contractLabel,
  onAdd,
  onSave,
  onDelete,
}: {
  entries: LogEntry[];
  /** What to call the contract an entry belongs to — the client, or the car. */
  contractLabel: (contractId: number) => string | null;
  onAdd: (eventDate: string, note: string) => Promise<void>;
  onSave: (id: number, eventDate: string, note: string | null) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}) {
  const { lang, t } = useApp();
  const [busy, setBusy] = useState(false);
  // The entry open for correction, and what it is being changed to.
  const [editing, setEditing] = useState<number | null>(null);
  const [editDate, setEditDate] = useState("");
  const [editNote, setEditNote] = useState("");

  const run = async (job: () => Promise<void>) => {
    setBusy(true);
    try {
      await job();
    } finally {
      setBusy(false);
    }
  };

  const add = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // React clears currentTarget once the handler returns, so hold on to the
    // form itself; reading it after the await would throw.
    const element = event.currentTarget;
    const form = new FormData(element);
    const note = ((form.get("note") as string) ?? "").trim();
    if (!note) return;
    await run(async () => {
      await onAdd((form.get("event_date") as string) || todayIso(), note);
      element.reset();
    });
  };

  return (
    <>
      <div className="scroll log">
        <ul className="timeline">
          {entries.map((e) => (
            <li key={e.id}>
              <span className="when">
                <strong>{parts(e.event_date)?.day ?? ""}</strong>
                <small>{monthYear(e.event_date, lang)}</small>
              </span>
              <span className="rail">
                <span className={`dot ${e.type}`} />
              </span>
              <div className="card">
                {editing === e.id ? (
                  <>
                    <div className="meta">
                      <DateInput
                        name="event_date_edit"
                        defaultValue={e.event_date}
                        required
                        onChange={setEditDate}
                      />
                      <span className="row-end">
                        <button
                          type="button"
                          disabled={busy || !editDate}
                          onClick={() =>
                            run(async () => {
                              await onSave(e.id, editDate, editNote.trim() || null);
                              setEditing(null);
                            })
                          }
                        >
                          {t("save")}
                        </button>
                        <button type="button" className="ghost" onClick={() => setEditing(null)}>
                          {t("cancel")}
                        </button>
                      </span>
                    </div>
                    <input
                      value={editNote}
                      placeholder={t("note")}
                      onChange={(event) => setEditNote(event.target.value)}
                    />
                  </>
                ) : (
                  <>
                    <div className="meta">
                      <span className={`tag ${e.type}`}>{t(e.type)}</span>
                      {e.contract_id && (
                        <Link to={`/contracts/${e.contract_id}`}>
                          {contractLabel(e.contract_id) ?? `#${e.contract_id}`}
                        </Link>
                      )}
                      <span className="row-end">
                        <button
                          type="button"
                          className="ghost"
                          onClick={() => {
                            setEditing(e.id);
                            setEditDate(e.event_date);
                            setEditNote(e.note ?? "");
                          }}
                        >
                          {t("edit")}
                        </button>
                        <ConfirmButton
                          question={t("confirm_delete_event")}
                          disabled={busy}
                          onConfirm={() => run(() => onDelete(e.id))}
                        >
                          {t("delete")}
                        </ConfirmButton>
                      </span>
                    </div>
                    {e.note && <p className="what">{e.note}</p>}
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
        {entries.length === 0 && <p className="empty">{t("none_yet")}</p>}
      </div>
      <form className="toolbar" onSubmit={add}>
        <DateInput name="event_date" defaultValue={todayIso()} required />
        <input name="note" placeholder={t("add_note")} required />
        <button type="submit" disabled={busy}>
          {t("add_note")}
        </button>
      </form>
    </>
  );
}
