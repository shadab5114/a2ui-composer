/** Visible fallback for an unknown component `type`. The renderer never throws. */
import type { ReactNode } from "react";

export function Fallback({ type, children }: { type: string; children?: ReactNode }) {
  return (
    <div
      data-a2ui-fallback={type}
      style={{
        border: "1px dashed #c0392b",
        borderRadius: 6,
        padding: "6px 10px",
        background: "rgba(192,57,43,0.06)",
        color: "#c0392b",
        font: "12px ui-monospace, monospace",
      }}
    >
      Unknown component: <strong>{type}</strong>
      {children}
    </div>
  );
}
