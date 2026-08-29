import { useState, type ReactNode } from "react";

import Modal from "./Modal";
import { useApp } from "./context";

/**
 * A button that asks before it acts. The webview's own confirm() does not
 * stop anything inside the app window, so the question is put in a dialog of
 * ours: the same one used elsewhere, so Escape and the backdrop still work.
 */
export default function ConfirmButton({
  question,
  onConfirm,
  children,
  className = "danger",
  disabled = false,
}: {
  question: string;
  onConfirm: () => void | Promise<void>;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  const { t } = useApp();
  const [asking, setAsking] = useState(false);

  return (
    <>
      <button
        type="button"
        className={className}
        disabled={disabled}
        // Rows that open on click should not also open while being asked.
        onClick={(event) => {
          event.stopPropagation();
          setAsking(true);
        }}
      >
        {children}
      </button>
      {asking && (
        <Modal onClose={() => setAsking(false)}>
          <p className="ask">{question}</p>
          <div className="toolbar">
            <button
              type="button"
              className="danger"
              onClick={async (event) => {
                event.stopPropagation();
                setAsking(false);
                await onConfirm();
              }}
            >
              {children}
            </button>
            <button
              type="button"
              className="ghost"
              onClick={(event) => {
                event.stopPropagation();
                setAsking(false);
              }}
            >
              {t("cancel")}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
