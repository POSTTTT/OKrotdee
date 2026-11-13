import { useState, type FormEvent } from "react";

import { useApp } from "./context";
import DateInput from "./DateInput";
import { isErrorKey } from "./lang";
import type { Rules } from "./money";

/**
 * The three late-fee rules, for the shop defaults and for one contract alike.
 * Keyed by the caller on what it edits, so loaded values replace the blanks.
 * Given `startsOn`, it also asks from which due date a contract's change applies.
 */
export default function RulesForm({
  rules,
  startsOn,
  intro,
  notice,
  onSave,
}: {
  rules: Rules;
  startsOn?: string;
  intro?: string;
  /** Shown above the fields after a save, until the next one. */
  notice?: string;
  onSave: (rules: Rules, startsOn?: string) => Promise<void>;
}) {
  const { t } = useApp();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const num = (key: string) => Number(form.get(key));
    setBusy(true);
    setError(null);
    try {
      await onSave({
        graceDays: num("grace_days"),
        feePercent: num("late_fee_percent"),
        repossessAfter: num("repossess_after"),
      }, startsOn === undefined ? undefined : String(form.get("starts_on") ?? ""));
    } catch (e) {
      setError(e instanceof Error && isErrorKey(e.message) ? t(e.message) : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="stack" onSubmit={onSubmit}>
      {intro && <p className="intro">{intro}</p>}
      {error ? <p className="flash">{error}</p> : notice && <p className="flash">{notice}</p>}
      <label>
        {t("grace_days")}
        <input
          name="grace_days"
          type="number"
          min={0}
          step={1}
          defaultValue={rules.graceDays}
          required
        />
      </label>
      <label>
        {t("late_fee_percent")}
        <input
          name="late_fee_percent"
          type="number"
          min={0}
          max={100}
          step="any"
          defaultValue={rules.feePercent}
          required
        />
      </label>
      <label>
        {t("repossess_after")}
        <input
          name="repossess_after"
          type="number"
          min={1}
          step={1}
          defaultValue={rules.repossessAfter}
          required
        />
      </label>
      {startsOn !== undefined && (
        <label>
          {t("rules_starts_on")}
          <DateInput name="starts_on" defaultValue={startsOn} required />
        </label>
      )}
      <p className="hint">{t("rules_hint")}</p>
      {startsOn !== undefined && <p className="hint">{t("rules_starts_on_hint")}</p>}
      <div>
        <button type="submit" disabled={busy}>
          {t("save")}
        </button>
      </div>
    </form>
  );
}
