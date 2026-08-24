import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import { openDatabase, type Db } from "./db";
import { DEFAULT_LANG, t as translate, type LangCode } from "./lang";

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
  const [lang, setLangState] = useState<LangCode>(
    (localStorage.getItem("lang") as LangCode) || DEFAULT_LANG,
  );

  useEffect(() => {
    openDatabase().then(setDb, (e) => setError(String(e)));
  }, []);

  const setLang = (code: LangCode) => {
    localStorage.setItem("lang", code);
    setLangState(code);
  };

  if (error) return <p className="flash">{error}</p>;
  if (!db) return <p>{translate("loading", lang)}</p>;

  return (
    <AppContext.Provider
      value={{ db, lang, setLang, t: (key: string) => translate(key, lang) }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp(): AppValue {
  const value = useContext(AppContext);
  if (!value) throw new Error("useApp called outside AppProvider");
  return value;
}
