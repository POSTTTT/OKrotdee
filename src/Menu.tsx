import { useEffect, useRef, type ReactNode } from "react";

/**
 * A button that opens a short list of actions under it. A native details
 * element, so the list stays mounted while closed: an action that asks first
 * keeps its question open after the list is dismissed. It closes on a click
 * anywhere outside it, and on Escape.
 */
export default function Menu({ label, children }: { label: ReactNode; children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const close = (event: Event) => {
      const menu = ref.current;
      if (!menu?.open) return;
      // A question dialog opened from an item sits inside the menu in the
      // page, though it shows above everything: clicks there are not outside.
      if (
        event instanceof KeyboardEvent
          ? event.key === "Escape"
          : !menu.contains(event.target as Node)
      ) {
        menu.open = false;
      }
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, []);

  return (
    <details className="menu" ref={ref}>
      <summary className="button">{label}</summary>
      <div className="menu-items">{children}</div>
    </details>
  );
}
