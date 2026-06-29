/**
 * SlotBox — renders the content of a synthetic `Slot` node (the editable subtree of
 * an object-valued slot prop such as `ComposableTileContainer.header`). It is a
 * transparent vertical passthrough: the slot's *scalar* fields (padding,
 * backgroundColor, …) are applied by the real parent component to the slot region,
 * so SlotBox itself adds no styling — it only stacks its children and lets the
 * editor chrome (selection, insert zones) attach. Stand-in per ARCHITECTURE §7.2.
 */
import type { ReactNode } from "react";

export function SlotBox({ children }: { children?: ReactNode }) {
  return (
    <div data-a2ui-slot="" style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
      {children}
    </div>
  );
}
