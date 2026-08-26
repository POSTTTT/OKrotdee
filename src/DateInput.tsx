import { useState } from "react";

import { useApp } from "./context";
import { daysInMonth, parts, toIso } from "./dates";

/**
 * A date field staff can read: Thai month names and Buddhist Era years. The
 * chosen date is written to a hidden input as an ISO string, so forms keep
 * reading it out of FormData like any other field.
 */
export default function DateInput({
  name,
  defaultValue = "",
  required = false,
  onChange,
}: {
  name: string;
  defaultValue?: string | null;
  required?: boolean;
  onChange?: (iso: string) => void;
}) {
  const { t } = useApp();
  const [iso, set] = useState(defaultValue ?? "");
  const setIso = (next: string) => {
    set(next);
    onChange?.(next);
  };
  const chosen = parts(iso);

  // A window wide enough for a 72-month contract and for looking back at old ones.
  const thisYear = new Date().getFullYear();
  const years: number[] = [];
  for (let y = thisYear - 10; y <= thisYear + 15; y++) years.push(y);

  const year = chosen?.year ?? thisYear;
  const month = chosen?.month ?? 1;

  const change = (next: { year?: number; month?: number; day?: number }) => {
    const y = next.year ?? year;
    const m = next.month ?? month;
    const d = next.day ?? chosen?.day;
    setIso(d ? toIso(y, m, d) : "");
  };

  return (
    <span className="date-input">
      <input type="hidden" name={name} value={iso} required={required} />
      <select
        aria-label={t("day")}
        value={chosen?.day ?? ""}
        onChange={(e) => change({ day: Number(e.target.value) || undefined })}
        required={required}
      >
        <option value="">--</option>
        {Array.from({ length: daysInMonth(year, month) }, (_, i) => i + 1).map((d) => (
          <option key={d} value={d}>
            {d}
          </option>
        ))}
      </select>
      <select
        aria-label={t("month")}
        value={month}
        onChange={(e) => change({ month: Number(e.target.value) })}
      >
        {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
      <select
        aria-label={t("year")}
        value={year}
        onChange={(e) => change({ year: Number(e.target.value) })}
      >
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
      {!required && iso && (
        <button type="button" className="ghost" onClick={() => setIso("")}>
          {t("clear")}
        </button>
      )}
    </span>
  );
}
