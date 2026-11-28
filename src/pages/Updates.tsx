import { useMemo, useRef } from "react";
import { Link, useParams } from "react-router-dom";

import BackButton from "../BackButton";
import RowLink from "../RowLink";
import { useApp } from "../context";
import type { LangCode } from "../lang";

// One HTML file per version and language in src/updates, named
// <version>.<th|en>.html. They are written by us and bundled with the app, so
// they are shown as they are.
const FILES = import.meta.glob<string>("../updates/*.html", {
  query: "?raw",
  import: "default",
  eager: true,
});

/** "0.10.0" after "0.9.0": compared part by part as numbers, not as text. */
function newestFirst(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pb[i] ?? 0) - (pa[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

const NOTES = new Map<string, Partial<Record<LangCode, string>>>();
for (const [path, html] of Object.entries(FILES)) {
  const [, version, code] = path.match(/([^/]+)\.(th|en)\.html$/) ?? [];
  if (version) NOTES.set(version, { ...NOTES.get(version), [code]: html });
}

/** Versions with notes, newest first. */
export const VERSIONS = [...NOTES.keys()].sort(newestFirst);

/** A version's notes in the reader's language, else whichever was written. */
function notesFor(version: string, lang: LangCode): string | undefined {
  const notes = NOTES.get(version);
  return notes?.[lang] ?? notes?.th ?? notes?.en;
}

interface Section {
  id: string;
  text: string;
  items: { id: string; text: string }[];
}

/**
 * The notes' own headings as an outline: each section (h2) with the changes
 * under it (h3). Read from the HTML, so a new note needs nothing extra, and
 * each heading is given an id to jump to.
 */
function outlined(html: string): { html: string; outline: Section[] } {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const outline: Section[] = [];
  doc.body.querySelectorAll("h2, h3").forEach((heading, index) => {
    // A change's screenshot sits above its heading: jump to the picture, so
    // it is not scrolled away.
    const before = heading.previousElementSibling;
    const target = heading.tagName === "H3" && before?.tagName === "IMG" ? before : heading;
    target.id = `note-${index}`;
    const entry = { id: target.id, text: heading.textContent?.trim() ?? "" };
    if (heading.tagName === "H2") outline.push({ ...entry, items: [] });
    else outline[outline.length - 1]?.items.push(entry);
  });
  return { html: doc.body.innerHTML, outline };
}

/** One version's log, as a sheet: on its own page, or in a dialog. */
export function UpdateNotes({ version, sidebar = false }: { version: string; sidebar?: boolean }) {
  const { lang, t } = useApp();
  const raw = notesFor(version, lang);
  const notes = useMemo(() => (raw ? outlined(raw) : null), [raw]);
  const sheet = useRef<HTMLDivElement>(null);
  if (!notes) return null;
  // Scrolled to in place: an anchor link would change the app's own route.
  const jump = (id: string) =>
    sheet.current?.querySelector(`#${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  const outline = notes.outline.length > 0 && (
        <nav className={sidebar ? "outline side" : "outline"} aria-label={t("outline")}>
          <p>{t("outline")}</p>
          <ol>
            {notes.outline.map((section) => (
              <li key={section.id}>
                <button type="button" className="ghost" onClick={() => jump(section.id)}>
                  {section.text}
                </button>
                {section.items.length > 0 && (
                  <ol>
                    {section.items.map((item) => (
                      <li key={item.id}>
                        <button type="button" className="ghost" onClick={() => jump(item.id)}>
                          {item.text}
                        </button>
                      </li>
                    ))}
                  </ol>
                )}
              </li>
            ))}
          </ol>
        </nav>
  );
  const article = (
    <article className="update">
      {/* Not a <header>: that is styled as the app's own bar. */}
      <div className="title">
        <h1>OKrotdee</h1>
        <p>Version {version} - update logs</p>
      </div>
      {!sidebar && outline}
      <div ref={sheet} dangerouslySetInnerHTML={{ __html: notes.html }} />
    </article>
  );
  // On its own page the outline stays in view beside the notes; in a dialog
  // there is no room beside them, so it leads instead.
  return sidebar ? (
    <div className="update-layout">
      {outline}
      {article}
    </div>
  ) : (
    article
  );
}

/** Every version with notes, newest first; each opens its own log. */
export default function Updates() {
  const { t } = useApp();
  const { version } = useParams();

  if (version) {
    if (!VERSIONS.includes(version)) return <p>{t("not_found")}</p>;
    return (
      <>
        <div className="pagehead">
          <BackButton />
          <h1>{t("updates")}</h1>
        </div>
        <UpdateNotes version={version} sidebar />
      </>
    );
  }

  return (
    <>
      <div className="pagehead">
        <BackButton />
        <h1>{t("updates")}</h1>
      </div>
      <table>
        <thead>
          <tr>
            <th>{t("version")}</th>
          </tr>
        </thead>
        <tbody>
          {VERSIONS.map((v, index) => (
            <RowLink key={v} to={`/updates/${v}`}>
              <td>
                <Link to={`/updates/${v}`}>{v}</Link>
                {index === 0 && (
                  <>
                    {" "}
                    <span className="tag active">{t("latest")}</span>
                  </>
                )}
              </td>
            </RowLink>
          ))}
        </tbody>
      </table>
    </>
  );
}
