import { useEffect, useState } from "react";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";

import Modal from "./Modal";
import { useApp } from "./context";

/**
 * Asks once at startup whether to install a newer release. Offline, or with
 * no release yet, the check fails and the shop is not told: nothing is wrong
 * with the copy they have.
 */
export default function UpdatePrompt() {
  const { t } = useApp();
  const [update, setUpdate] = useState<Update | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    check().then(setUpdate, () => {});
  }, []);

  if (!update) return null;

  const install = async () => {
    setBusy(true);
    try {
      await update.downloadAndInstall();
      await relaunch();
    } catch (e) {
      setBusy(false);
      setError(String(e));
    }
  };

  return (
    <Modal onClose={() => setUpdate(null)}>
      <p className="ask">
        {busy
          ? t("updating")
          : error
            ? `${t("err_update_failed")}: ${error}`
            : `${t("update_available")} ${update.version}`}
      </p>
      <div className="toolbar">
        <button type="button" disabled={busy} onClick={install}>
          {t("update_now")}
        </button>
        <button type="button" className="ghost" disabled={busy} onClick={() => setUpdate(null)}>
          {t("later")}
        </button>
      </div>
    </Modal>
  );
}
