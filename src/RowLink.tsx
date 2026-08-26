import { useNavigate } from "react-router-dom";
import type { ReactNode } from "react";

/**
 * A table row that opens `to` when clicked anywhere. The row still holds a
 * real link, which is what keyboard users tab to; this only widens the target
 * for the mouse.
 */
export default function RowLink({ to, children }: { to: string; children: ReactNode }) {
  const navigate = useNavigate();
  return (
    <tr
      className="clickable"
      onClick={(event) => {
        // Buttons and links inside the row do their own job.
        if ((event.target as HTMLElement).closest("a, button")) return;
        navigate(to);
      }}
    >
      {children}
    </tr>
  );
}
