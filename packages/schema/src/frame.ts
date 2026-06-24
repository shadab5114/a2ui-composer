/**
 * The `Frame` layout primitive. The catalog ships no layout components
 * (ARCHITECTURE §13.1), so the MVP adds a synthetic `Frame` that serializes to the
 * standard A2UI `Column` / `Row` based on its `direction`. It is the only
 * always-available slot container besides `TileContainer`.
 *
 * Auto-layout only — children size via the catalog `weight` prop (A2UI's
 * flex-grow analog). No absolute x/y (ARCHITECTURE §7.3).
 */
import type { ComponentModel, PropDescriptor } from "./catalog.types";

export const FRAME_TYPE = "Frame";

/** A2UI component names a Frame serializes to. */
export const A2UI_COLUMN = "Column";
export const A2UI_ROW = "Row";

export const SPACE_TOKENS = ["0", "1X", "2X", "3X", "4X", "6X", "8X"] as const;

const frameProps: PropDescriptor[] = [
  {
    name: "direction",
    kind: "enum",
    options: ["column", "row"],
    default: "column",
    description: "Layout axis. Serializes to A2UI Column or Row.",
  },
  {
    name: "gap",
    kind: "enum",
    options: [...SPACE_TOKENS],
    default: "4X",
    description: "Space between children (design-token step).",
  },
  {
    name: "padding",
    kind: "enum",
    options: [...SPACE_TOKENS],
    default: "0",
    description: "Inner padding (design-token step).",
  },
  {
    name: "align",
    kind: "enum",
    options: ["start", "center", "end", "stretch"],
    default: "stretch",
    description: "Cross-axis alignment of children.",
  },
  {
    name: "justify",
    kind: "enum",
    options: ["start", "center", "end", "spaceBetween"],
    default: "start",
    description: "Main-axis distribution of children.",
  },
];

/** Synthetic catalog entry so palette + inspector treat Frame uniformly. */
export const frameComponentModel: ComponentModel = {
  name: FRAME_TYPE,
  group: "Layout",
  description: "Auto-layout container (flex). Serializes to A2UI Column/Row.",
  props: frameProps,
  slotProp: "children",
  isSlotContainer: true,
  synthetic: true,
};

export function frameDefaultProps(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const p of frameProps) out[p.name] = p.default;
  return out;
}

/** The A2UI `component` name a Frame exports to, given its `direction` prop. */
export function frameToA2UIComponent(direction: unknown): string {
  return direction === "row" ? A2UI_ROW : A2UI_COLUMN;
}

/** True if an A2UI component name is a layout primitive that imports back to Frame. */
export function isA2UILayout(component: string): boolean {
  return component === A2UI_COLUMN || component === A2UI_ROW;
}
