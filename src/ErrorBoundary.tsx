import { Component, type ReactNode } from "react";

import { ERROR_CODES, logError, RENDER_CRASH } from "./errors";

/**
 * A screen that throws while drawing shows what went wrong and a way to try
 * again, instead of leaving the window blank. The rest of the app around it
 * (the menu, other screens) keeps working.
 */
export default class ErrorBoundary extends Component<
  { t: (key: string) => string; children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    logError(RENDER_CRASH, Object.assign(error, { stack: `${error.stack}\n${info.componentStack ?? ""}` }));
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const { t } = this.props;
    return (
      <div className="flash crash">
        <p>
          <strong>{t("err_unexpected")}</strong> ({ERROR_CODES[error.message] ?? RENDER_CRASH})
        </p>
        <p>{error.message.startsWith("err_") ? t(error.message) : error.message}</p>
        <button type="button" onClick={() => this.setState({ error: null })}>
          {t("try_again")}
        </button>
      </div>
    );
  }
}
