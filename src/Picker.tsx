import { useState } from "react";

import Modal from "./Modal";
import { useApp } from "./context";

export interface PickerItem {
  id: number;
  /** What the row reads as, and what a search is matched against. */
  text: string;
  sub?: string | null;
}

/**
 * Choosing one record out of many. The field itself is a card that stays blank
 * until something is picked; clicking it opens a list with a search box, so a
 * shop with hundreds of clients does not scroll a dropdown to find one.
 */
export default function Picker({
  name,
  label,
  items,
  value,
  onPick,
}: {
  /** Set to carry the choice in a plain form; omit when state is enough. */
  name?: string;
  label: string;
  items: PickerItem[];
  value: number | null;
  onPick: (id: number) => void;
}) {
  const { t } = useApp();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const chosen = items.find((i) => i.id === value);

  const needle = q.trim().toLowerCase();
  const shown = needle
    ? items.filter((i) => `${i.text} ${i.sub ?? ""}`.toLowerCase().includes(needle))
    : items;

  return (
    <>
      <button type="button" className="party pick" onClick={() => setOpen(true)}>
        <span className="role">{label}</span>
        {chosen ? (
          <>
            <span className="name">{chosen.text}</span>
            {chosen.sub && <span className="sub">{chosen.sub}</span>}
          </>
        ) : (
          <span className="name empty">{t("choose")}</span>
        )}
      </button>
      {name && <input type="hidden" name={name} value={value ?? ""} />}

      {open && (
        <Modal
          onClose={() => {
            setOpen(false);
            setQ("");
          }}
        >
          <h2>{label}</h2>
          <input
            className="search"
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("search")}
            aria-label={t("search")}
          />
          <ul className="picklist">
            {shown.map((i) => (
              <li key={i.id}>
                <button
                  type="button"
                  className={i.id === value ? "chosen" : undefined}
                  onClick={() => {
                    onPick(i.id);
                    setOpen(false);
                    setQ("");
                  }}
                >
                  <span className="name">{i.text}</span>
                  {i.sub && <span className="sub">{i.sub}</span>}
                </button>
              </li>
            ))}
            {shown.length === 0 && <li className="none">{t("no_results")}</li>}
          </ul>
        </Modal>
      )}
    </>
  );
}
