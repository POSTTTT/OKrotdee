import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";

import App from "./App";
import { AppProvider } from "./context";
import "./app.css";
import { applyTheme, savedTheme } from "./theme";

// Before the first paint, so a dark Mac never flashes a light page.
applyTheme(savedTheme());

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <HashRouter>
      <AppProvider>
        <App />
      </AppProvider>
    </HashRouter>
  </React.StrictMode>,
);
