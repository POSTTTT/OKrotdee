import { useRef, useState } from "react";

import Select from "./Select";
import { useApp } from "./context";
import { daysInMonth, parts, toIso } from "./dates";

/**
 * A date field staff can read: Thai month names and Buddhist Era years. The
 * chosen date is written to a field of its own as an ISO string, so forms
 * keep reading it out of FormData like any other field.
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
  const { t, lang } = useApp();
  // Months by name, so 1/2 reads as a date and not two numbers.
  const monthName = new Intl.DateTimeFormat(lang === "th" ? "th-TH" : "en-GB", {
    month: "short",
    timeZone: "UTC",
  });
  const [iso, set] = useState(defaultValue ?? "");
  const setIso = (next: string) => {
    set(next);
    onChange?.(next);
  };
  const chosen = parts(iso);
  const field = useRef<HTMLSpanElement>(null);

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
    <span className="date-input" ref={field}>
      {/* What the form reads. Invisible but not hidden, so `required` is
          still checked; the browser's prompt then points at the day. */}
      <input
        className="select-field"
        tabIndex={-1}
        aria-hidden="true"
        name={name}
        value={iso}
        required={required}
        onChange={() => {}}
        onFocus={() => field.current?.querySelector("button")?.focus()}
      />
      <Select
        aria-label={t("day")}
        value={String(chosen?.day ?? "")}
        onChange={(v) => change({ day: Number(v) || undefined })}
        options={[
          { value: "", label: t("day") },
          ...Array.from({ length: daysInMonth(year, month) }, (_, i) => ({
            value: String(i + 1),
            label: String(i + 1),
          })),
        ]}
      />
      <Select
        aria-label={t("month")}
        value={String(month)}
        onChange={(v) => change({ month: Number(v) })}
        options={Array.from({ length: 12 }, (_, i) => ({
          value: String(i + 1),
          label: monthName.format(Date.UTC(2000, i, 1)),
        }))}
      />
      <Select
        aria-label={t("year")}
        value={String(year)}
        onChange={(v) => change({ year: Number(v) })}
        options={years.map((y) => ({ value: String(y), label: String(y) }))}
      />
      {!required && iso && (
        <button type="button" className="ghost" onClick={() => setIso("")}>
          {t("clear")}
        </button>
      )}
    </span>
  );
}
