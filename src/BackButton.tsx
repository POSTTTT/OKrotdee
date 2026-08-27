import { useNavigate } from "react-router-dom";

import { useApp } from "./context";

/** Returns to whatever page this one was opened from. Sits in a page head. */
export default function BackButton() {
  const { t } = useApp();
  const navigate = useNavigate();
  return (
    <span className="lead">
      <button className="ghost" onClick={() => navigate(-1)}>
        ← {t("back")}
      </button>
    </span>
  );
}
