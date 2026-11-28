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

/** Every version with notes, newest first; each opens its own log. */
export default function Updates() {
  const { t, lang } = useApp();
  const { version } = useParams();

  if (version) {
    const html = notesFor(version, lang);
    if (!html) return <p>{t("not_found")}</p>;
    return (
      <>
        <div className="pagehead">
          <BackButton />
          <h1>{t("updates")}</h1>
        </div>
        <article className="update">
          {/* Not a <header>: that is styled as the app's own bar. */}
          <div className="title">
            <h1>OKrotdee</h1>
            <p>Version {version} - update logs</p>
          </div>
          <div dangerouslySetInnerHTML={{ __html: html }} />
        </article>
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
