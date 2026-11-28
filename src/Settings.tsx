import { useEffect, useState } from "react";
import { errorMessage } from "./errors";
import { invoke } from "@tauri-apps/api/core";
import { appConfigDir, appLogDir, join } from "@tauri-apps/api/path";
import { getVersion } from "@tauri-apps/api/app";
import { open } from "@tauri-apps/plugin-dialog";
import { Link } from "react-router-dom";

import Modal from "./Modal";
import { backupTo, moveDataTo, showBackups } from "./backup";
import { dataDir } from "./datadir";
import { useApp } from "./context";

const TABS = ["general", "visual", "data"] as const;

/**
 * Upkeep, not the day's work: language, where the data sits, how to copy it
 * out, and which version is running. It opens over whatever the staff were
 * doing, because none of it is a place you go to.
 */
export default function Settings({ onClose }: { onClose: () => void }) {
  const { db, t, lang, setLang, newestFirst, setNewestFirst, theme, setTheme } = useApp();
  const [version, setVersion] = useState("");
  const [folder, setFolder] = useState("");
  const [backups, setBackups] = useState("");
  const [logs, setLogs] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState<(typeof TABS)[number]>("general");

  useEffect(() => {
    getVersion().then(setVersion, (e) => setError(errorMessage(e, t)));
    dataDir().then(setFolder, (e) => setError(errorMessage(e, t)));
    appConfigDir()
      .then((dir) => join(dir, "backups"))
      .then(setBackups, (e) => setError(errorMessage(e, t)));
    appLogDir().then(setLogs, (e) => setError(errorMessage(e, t)));
  }, []);

  const run = async (work: () => Promise<string | null>) => {
    setDone(null);
    setError(null);
    setBusy(true);
    try {
      const message = await work();
      if (message) setDone(message);
    } catch (e) {
      setError(errorMessage(e, t));
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

      {/* Upkeep in three kinds: how the app reads, how it looks, and where
          the shop's records live. One at a time, so none is a long scroll. */}
      <span className="views settings-tabs">
        {TABS.map((tab) => (
          <button
            key={tab}
            className={`ghost${tab === shown ? " on" : ""}`}
            onClick={() => setShown(tab)}
          >
            {t(`settings_${tab}`)}
          </button>
        ))}
      </span>

      {shown === "general" && (
        <>
          <h2>{t("language")}</h2>
          <div className="toolbar">
            <button className={lang === "th" ? undefined : "ghost"} onClick={() => setLang("th")}>
              ไทย
            </button>
            <button className={lang === "en" ? undefined : "ghost"} onClick={() => setLang("en")}>
              English
            </button>
          </div>

          <h2>{t("log_order")}</h2>
          <div className="toolbar">
            <button
              className={newestFirst ? "ghost" : undefined}
              onClick={() => setNewestFirst(false)}
            >
              {t("log_oldest_first")}
            </button>
            <button
              className={newestFirst ? undefined : "ghost"}
              onClick={() => setNewestFirst(true)}
            >
              {t("log_newest_first")}
            </button>
          </div>

          <h2>{t("about")}</h2>
          <dl className="facts">
            <div>
              <dt>{t("app_name")}</dt>
              <dd className="text">{version ? `${t("version")} ${version}` : "…"}</dd>
            </div>
            <div>
              <dt>{t("updates")}</dt>
              <dd className="text">
                <Link to="/updates" onClick={onClose}>
                  {t("view_updates")}
                </Link>
              </dd>
            </div>
          </dl>
        </>
      )}
      {shown === "visual" && (
        <>
          <h2>{t("theme")}</h2>
          <div className="toolbar">
            {(["light", "dark", "system"] as const).map((choice) => (
              <button
                key={choice}
                className={theme === choice ? undefined : "ghost"}
                onClick={() => setTheme(choice)}
              >
                {t(`theme_${choice}`)}
              </button>
            ))}
          </div>
        </>
      )}
      {shown === "data" && (
        <>
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
          </div>

          <h2>{t("backups")}</h2>
          <dl className="facts">
            <div>
              <dt>{t("backup_folder")}</dt>
              <dd className="text">{backups || "…"}</dd>
            </div>
          </dl>
          <div className="toolbar">
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

          {/* The program's log, for sending along when reporting a problem. */}
          <h2>{t("log")}</h2>
          <dl className="facts">
            <div>
              <dt>{t("log_folder")}</dt>
              <dd className="text">{logs || "…"}</dd>
            </div>
          </dl>
          <div className="toolbar">
            <button
              className="ghost"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  await invoke("open_log_dir");
                  return null;
                })
              }
            >
              {t("open_log_folder")}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
