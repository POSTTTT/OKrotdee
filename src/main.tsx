import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";

import App from "./App";
import ErrorBoundary from "./ErrorBoundary";
import { DEFAULT_LANG, t, type LangCode } from "./lang";
import { AppProvider } from "./context";
import "./app.css";
import { applyTheme, savedTheme } from "./theme";

// Before the first paint, so a dark Mac never flashes a light page.
applyTheme(savedTheme());

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {/* Last line of defence, outside the app's own state: the language is
        read straight from where the app keeps it. */}
    <ErrorBoundary t={(key) => t(key, (localStorage.getItem("lang") as LangCode) || DEFAULT_LANG)}>
      <HashRouter>
        <AppProvider>
          <App />
        </AppProvider>
      </HashRouter>
    </ErrorBoundary>
  </React.StrictMode>,
);
