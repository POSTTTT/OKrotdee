import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { open } from "@tauri-apps/plugin-dialog";

import Modal from "./Modal";
import { backupTo, moveDataTo, showBackups } from "./backup";
import { dataDir } from "./datadir";
import { useApp } from "./context";

/**
 * Upkeep, not the day's work: language, where the data sits, how to copy it
 * out, and which version is running. It opens over whatever the staff were
 * doing, because none of it is a place you go to.
 */
export default function Settings({ onClose }: { onClose: () => void }) {
  const { db, t, lang, setLang } = useApp();
  const [version, setVersion] = useState("");
  const [folder, setFolder] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getVersion().then(setVersion, (e) => setError(String(e)));
    dataDir().then(setFolder, (e) => setError(String(e)));
  }, []);

  const run = async (work: () => Promise<string | null>) => {
    setDone(null);
    setError(null);
    setBusy(true);
    try {
      const message = await work();
      if (message) setDone(message);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose}>
      <div className="pagehead">
        <h1>{t("settings")}</h1>
      </div>
      {done && <p className="flash">{done}</p>}
      {error && <p className="flash alarm">{error}</p>}

      <h2>{t("language")}</h2>
      <div className="toolbar">
        <button className={lang === "th" ? undefined : "ghost"} onClick={() => setLang("th")}>
          ไทย
        </button>
        <button className={lang === "en" ? undefined : "ghost"} onClick={() => setLang("en")}>
          English
        </button>
      </div>

      <h2>{t("data")}</h2>
      <dl className="facts">
        <div>
          <dt>{t("data_folder")}</dt>
          <dd className="text">{folder || "…"}</dd>
        </div>
      </dl>
      <div className="toolbar">
        <button
          className="ghost"
          disabled={busy}
          onClick={() =>
            run(async () => {
              const target = await open({ directory: true, defaultPath: folder });
              if (typeof target !== "string") return null;
              await moveDataTo(db, target);
              // The database was opened when the program started, so the only
              // honest way to use the new one is to start over.
              window.location.reload();
              return null;
            })
          }
        >
          {t("change_data_folder")}
        </button>
        <button
          className="ghost"
          disabled={busy}
          onClick={() =>
            run(async () => {
              // Opened from Rust: the folder can be on any drive, and the
              // command scope is fixed when the program is built.
              await invoke("open_data_dir");
              return null;
            })
          }
        >
          {t("open_data_folder")}
        </button>
        <button
          disabled={busy}
          onClick={() =>
            run(async () => {
              const target = await backupTo(db);
              return target && `${t("backup_done")}: ${target}`;
            })
          }
        >
          {t("backup_now")}
        </button>
        <button
          className="ghost"
          disabled={busy}
          onClick={() =>
            run(async () => {
              await showBackups();
              return null;
            })
          }
        >
          {t("show_backups")}
        </button>
      </div>

      <h2>{t("about")}</h2>
      <dl className="facts">
        <div>
          <dt>{t("app_name")}</dt>
          <dd className="text">{version ? `${t("version")} ${version}` : "…"}</dd>
        </div>
      </dl>
    </Modal>
  );
}
