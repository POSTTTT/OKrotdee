import type { ReactNode } from "react";

/**
 * A round "!" whose explanation shows on hover or keyboard focus, so help
 * text stays out of the way until someone wants it.
 */
export default function Info({ children }: { children: ReactNode }) {
  return (
    <button type="button" className="info">
      <span aria-hidden="true">!</span>
      <span className="tip">{children}</span>
    </button>
  );
}
