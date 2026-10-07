import { useMemo, useState } from "react";

import Modal from "./Modal";
import { useApp } from "./context";
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

  const headers = rows[0] ?? [];
  const prepared = useMemo(() => prepare(kind, rows, mapping), [kind, rows, mapping]);
  const message = (key: string) => (isErrorKey(key) ? t(key) : key);

  const onFile = async (file: File | undefined) => {
    setDone(null);
    setRefused([]);
    setError(null);
    if (!file) return;
    try {
      const sheet = readSheet(new Uint8Array(await file.arrayBuffer()), file.name);
      setRows(sheet);
      setMapping(guessMapping(sheet[0] ?? [], kind, Object.values(LABELS)));
    } catch (e) {
      setRows([]);
      setError(String(e));
    }
  };

  const onImport = async () => {
    setBusy(true);
    try {
      const result = await importRows(db, kind, prepared.ready);
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
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={(e) => onFile(e.target.files?.[0])}
          />
        </label>
        <p className="hint">{t("import_hint")}</p>

        {headers.length > 0 &&
          FIELDS[kind].map((field) => (
            <label key={field}>
              {t(field)}
              <select
                value={mapping[field] ?? ""}
                onChange={(e) => {
                  const next = { ...mapping };
                  if (e.target.value === "") delete next[field];
                  else next[field] = Number(e.target.value);
                  setMapping(next);
                }}
              >
                <option value="">{t("import_not_used")}</option>
                {headers.map((h, i) => (
                  <option key={i} value={i}>
                    {h || `${t("import_column")} ${i + 1}`}
                  </option>
                ))}
              </select>
            </label>
          ))}
      </form>

      {headers.length > 0 && (
        <>
          <p>
            {prepared.ready.length} {t("import_ready")}
            {prepared.errors.length > 0 && ` · ${prepared.errors.length} ${t("import_skipped")}`}
          </p>
          {errorList(prepared.errors)}
          <div className="toolbar">
            <button disabled={busy || prepared.ready.length === 0} onClick={onImport}>
              {t("import")}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
