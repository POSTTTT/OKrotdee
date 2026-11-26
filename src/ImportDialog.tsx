import { useMemo, useState } from "react";

import Info from "./Info";
import Modal from "./Modal";
import Select from "./Select";
import { useApp } from "./context";
import { formatDate } from "./dates";
import { LABELS, isErrorKey } from "./lang";
import {
  FIELDS,
  guessMapping,
  importRows,
  prepare,
  readSheet,
  type ImportKind,
  type Mapping,
  type RowError,
} from "./importing";
import { formatBaht } from "./money";
import { listClients, similarClients, type Client, type ClientFields } from "./db";

/**
 * Clients or cars from a spreadsheet. The staff match columns to fields, see
 * how many rows will go in and why the others will not, and only then import.
 */
export default function ImportDialog({
  kind,
  onClose,
  onImported,
}: {
  kind: ImportKind;
  onClose: () => void;
  onImported: () => void;
}) {
  const { db, t } = useApp();
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Mapping>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<number | null>(null);
  const [refused, setRefused] = useState<RowError[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Rows staff untick to leave out, by line: a file imported again after a
  // fix need only bring in the rows that were fixed.
  const [left, setLeft] = useState<Set<number>>(new Set());
  // Clients already saved, to warn of rows that may be one of them.
  const [saved, setSaved] = useState<Client[]>([]);

  const headers = rows[0] ?? [];
  const prepared = useMemo(() => prepare(kind, rows, mapping), [kind, rows, mapping]);
  const chosen = prepared.ready.filter((r) => !left.has(r.line));
  const toggle = (line: number) => {
    const next = new Set(left);
    if (next.has(line)) next.delete(line);
    else next.add(line);
    setLeft(next);
  };
  const twins = (fields: unknown) =>
    kind === "clients" ? similarClients(saved, fields as ClientFields) : [];
  const maybeSaved = chosen.filter((r) => twins(r.fields).length > 0).length;
  const message = (key: string) => (isErrorKey(key) ? t(key) : key);
  // The columns staff matched, in the form order, shown as they will be saved.
  const shown = FIELDS[kind].filter((f) => f in mapping);
  const show = (field: string, value: unknown) =>
    value === null || value === undefined
      ? ""
      : field === "cost_price" || field === "asking_price"
        ? formatBaht(value as number)
        : field === "insurance_expires_on"
          ? formatDate(value as string)
          : String(value);

  const onFile = async (file: File | undefined) => {
    setDone(null);
    setRefused([]);
    setError(null);
    if (!file) return;
    try {
      const sheet = readSheet(new Uint8Array(await file.arrayBuffer()), file.name);
      const guessed = guessMapping(sheet[0] ?? [], kind, Object.values(LABELS));
      const existing = kind === "clients" ? await listClients(db) : [];
      setSaved(existing);
      setRows(sheet);
      setMapping(guessed);
      // Rows that look like a client already saved start unticked: importing
      // the same list twice should not double every client.
      setLeft(
        new Set(
          prepare(kind, sheet, guessed)
            .ready.filter(
              (r) =>
                kind === "clients" && similarClients(existing, r.fields as ClientFields).length,
            )
            .map((r) => r.line),
        ),
      );
    } catch (e) {
      setRows([]);
      setError(String(e));
    }
  };

  const onImport = async () => {
    setBusy(true);
    try {
      const result = await importRows(db, kind, chosen);
      setDone(result.imported);
      setRefused(result.errors);
      setRows([]);
      onImported();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const errorList = (errors: RowError[]) =>
    errors.length > 0 && (
      <table>
        <tbody>
          {errors.map((e) => (
            <tr key={e.line}>
              <td>
                {t("import_row")} {e.line}
              </td>
              <td>{message(e.error)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );

  return (
    <Modal onClose={onClose}>
      <div className="pagehead">
        <h1>
          {t("import")} {t(kind)}
        </h1>
      </div>
      {done !== null && (
        <p className="flash">
          {done} {t("import_done")}
        </p>
      )}
      {error && <p className="flash alarm">{error}</p>}
      {errorList(refused)}

      <form className="stack" onSubmit={(e) => e.preventDefault()}>
        <label className="wide">
          <span className="with-info">
            {t("import_file")}
            <Info>{t("import_hint")}</Info>
          </span>
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={(e) => onFile(e.target.files?.[0])}
          />
        </label>
      </form>

      {/* One row of columns to match, scrolling sideways, so the matching
          reads as one step rather than a page of fields. */}
      {headers.length > 0 && (
        <div className="mapping">
          {FIELDS[kind].map((field) => (
            <label key={field}>
              {t(field)}
              <Select
                aria-label={t(field)}
                value={String(mapping[field] ?? "")}
                onChange={(v) => {
                  const next = { ...mapping };
                  if (v === "") delete next[field];
                  else next[field] = Number(v);
                  setMapping(next);
                }}
                options={[
                  { value: "", label: t("import_not_used") },
                  ...headers.map((h, i) => ({
                    value: String(i),
                    label: h || `${t("import_column")} ${i + 1}`,
                  })),
                ]}
              />
            </label>
          ))}
        </div>
      )}

      {headers.length > 0 && (
        <>
          <p className="import-summary">
            {chosen.length < prepared.ready.length
              ? `${chosen.length} / ${prepared.ready.length}`
              : prepared.ready.length}{" "}
            {t("import_ready")}
            {prepared.errors.length > 0 && ` · ${prepared.errors.length} ${t("import_skipped")}`}
            {maybeSaved > 0 && ` · ${maybeSaved} ${t("import_maybe_dup")}`}
          </p>
          {prepared.ready.length > 0 && shown.length > 0 && (
            <>
              <h2>{t("import_preview")}</h2>
              <div className="scroll preview">
                <table>
                  <thead>
                    <tr>
                      <th>
                        <input
                          type="checkbox"
                          aria-label={t("import_all")}
                          checked={left.size === 0}
                          onChange={() =>
                            setLeft(
                              left.size === 0
                                ? new Set(prepared.ready.map((r) => r.line))
                                : new Set(),
                            )
                          }
                        />
                      </th>
                      <th>{t("import_row")}</th>
                      {shown.map((f) => (
                        <th key={f}>{t(f)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {prepared.ready.map(({ line, fields }) => (
                      <tr key={line} className={left.has(line) ? "left-out" : undefined}>
                        <td>
                          <input
                            type="checkbox"
                            aria-label={`${t("import_row")} ${line}`}
                            checked={!left.has(line)}
                            onChange={() => toggle(line)}
                          />
                        </td>
                        <td>
                          {line}
                          {twins(fields).length > 0 && (
                            <span
                              className="tag warn"
                              title={twins(fields)
                                .map((c) => `${c.first_name} ${c.last_name}`)
                                .join(", ")}
                            >
                              {t("maybe_dup")}
                            </span>
                          )}
                        </td>
                        {shown.map((f) => (
                          <td key={f}>{show(f, (fields as Record<string, unknown>)[f])}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {errorList(prepared.errors)}
          <div className="toolbar">
            <button disabled={busy || chosen.length === 0} onClick={onImport}>
              {t("import")}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
