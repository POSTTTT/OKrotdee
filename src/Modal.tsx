import { useEffect, useRef, type ReactNode } from "react";

/**
 * A native dialog, so Escape, focus trapping and the backdrop come from the
 * browser rather than from code we would have to keep right. Used where a
 * short task — recording a payment — should not cost the staff their place on
 * the contract.
 */
export default function Modal({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    // showModal, not the open attribute: only showModal gives the top layer,
    // the backdrop, and Escape.
    ref.current?.showModal();
  }, []);

  return (
    <dialog ref={ref} className="modal" onCancel={onClose} onClose={onClose}>
      {children}
      {/* Last in the DOM so opening the dialog puts the caret in the first
          field, not on the way out. Placed in the corner by the stylesheet. */}
      <button className="ghost close" onClick={onClose} aria-label="close">
        ×
      </button>
    </dialog>
  );
}
