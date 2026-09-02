import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import { startupBackup } from "./backup";
import { clearDataDir } from "./datadir";
import { openDatabase, type Db } from "./db";
import { DEFAULT_LANG, isErrorKey, t as translate, type LangCode } from "./lang";

interface AppValue {
  db: Db;
  lang: LangCode;
  setLang: (code: LangCode) => void;
  t: (key: string) => string;
}

const AppContext = createContext<AppValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<Db | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);
  const [lang, setLangState] = useState<LangCode>(
    (localStorage.getItem("lang") as LangCode) || DEFAULT_LANG,
  );

  useEffect(() => {
    // Open first: opening only applies the idempotent schema, so the copy still
    // predates anything this session writes, and a checkpoint needs a
    // connection. A failed backup must not keep the shop from working, but it
    // must never pass unnoticed either.
    openDatabase().then(async (opened) => {
      await startupBackup(opened).catch((e) => setBackupError(String(e)));
      setDb(opened);
    }, (e) => setError(String(e)));
  }, []);

  const setLang = (code: LangCode) => {
    localStorage.setItem("lang", code);
    setLangState(code);
  };

  if (error) {
    // Usually the drive holding the data is simply not plugged in. The way
    // back on has to be here: this screen is all there is until it opens.
    return (
      <>
        <p className="flash alarm">{isErrorKey(error) ? translate(error, lang) : error}</p>
        <div className="toolbar">
          <button
            onClick={() => clearDataDir().then(() => window.location.reload())}
          >
            {translate("use_local_data", lang)}
          </button>
        </div>
      </>
    );
  }
  if (!db) return <p>{translate("loading", lang)}</p>;

  return (
    <AppContext.Provider
      value={{ db, lang, setLang, t: (key: string) => translate(key, lang) }}
    >
      {backupError && (
        <p className="flash alarm">
          {translate("err_backup_failed", lang)}: {backupError}
        </p>
      )}
      {children}
    </AppContext.Provider>
  );
}

export function useApp(): AppValue {
  const value = useContext(AppContext);
  if (!value) throw new Error("useApp called outside AppProvider");
  return value;
}
