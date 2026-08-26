import { useNavigate } from "react-router-dom";

import { useApp } from "./context";

/** Returns to whatever page this one was opened from. */
export default function BackButton() {
  const { t } = useApp();
  const navigate = useNavigate();
  return (
    <p className="toolbar">
      <button className="ghost" onClick={() => navigate(-1)}>
        ← {t("back")}
      </button>
    </p>
  );
}
