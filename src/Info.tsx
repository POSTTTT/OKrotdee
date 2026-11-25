import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

/**
 * A round "!" whose explanation shows on hover or focus, so help text stays
 * out of the way until someone wants it. The tip is placed against the
 * window, not its parent: a dialog scrolls its content and would cut off
 * anything that ran past its edge.
 */
export default function Info({ children }: { children: ReactNode }) {
  const button = useRef<HTMLButtonElement>(null);
  const tip = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);

  // Measured before paint: under the "!" when it fits, above when it does
  // not, and never past either side of the window.
  useLayoutEffect(() => {
    if (!open || !button.current || !tip.current) return;
    const at = button.current.getBoundingClientRect();
    const size = tip.current.getBoundingClientRect();
    const gap = 8;
    const left = Math.min(Math.max(gap, at.left - gap), innerWidth - size.width - gap);
    const below = at.bottom + gap;
    const top = below + size.height + gap > innerHeight ? at.top - gap - size.height : below;
    tip.current.style.left = `${Math.max(gap, left)}px`;
    tip.current.style.top = `${Math.max(gap, top)}px`;
  }, [open]);

  const show = () => setOpen(true);
  const hide = () => setOpen(false);
  return (
    <button
      type="button"
      className="info"
      ref={button}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      <span aria-hidden="true">!</span>
      <span className="tip" ref={tip} data-open={open || undefined}>
        {children}
      </span>
    </button>
  );
}
