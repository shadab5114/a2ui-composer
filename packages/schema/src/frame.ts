/**
 * The `Box` layout primitive. The catalog ships no layout components
 * (ARCHITECTURE §13.1), so the MVP adds a synthetic `Box` that serializes to the
 * standard A2UI `Column` / `Row` based on its `direction`. It is the only
 * always-available slot container besides `TileContainer`.
 *
 * Auto-layout only — children size via the catalog `weight` prop (A2UI's
 * flex-grow analog). No absolute x/y (ARCHITECTURE §7.3).
 */
import type { ComponentModel, PropDescriptor } from "./catalog.types";

export const FRAME_TYPE = "Box";

/**
 * Synthetic editor-only node that holds the content of an object-valued slot prop
 * (e.g. `ComposableTileContainer.header.children`). It lives in its parent's
 * `children` array, tagged via `editorMeta.slotOf` with the prop it fills, so the
 * canvas/inspector/dnd treat it like any other slot container. It is never emitted
 * to A2UI — the exporter collapses it back into the parent's object prop.
 */
export const SLOT_TYPE = "Slot";

/** A2UI component names a Box serializes to. */
export const A2UI_COLUMN = "Column";
export const A2UI_ROW = "Row";

export const SPACE_TOKENS = ["0", "1X", "2X", "3X", "4X", "6X", "8X"] as const;

const RADIUS_TOKENS = ["0", "small", "medium", "large", "standard", "hero"] as const;
const OVERFLOW_OPTIONS = ["visible", "hidden", "auto", "scroll"] as const;
const JUSTIFY_OPTIONS = ["start", "center", "end", "between", "around"] as const;
const ALIGN_OPTIONS = ["start", "center", "end", "stretch"] as const;
const DIRECTION_OPTIONS = ["vertical", "horizontal"] as const;

const boxProps: PropDescriptor[] = [
  // ── Layout ───────────────────────────────────────────────────────────────
  {
    name: "direction",
    kind: "enum",
    options: [...DIRECTION_OPTIONS],
    default: "vertical",
    description: "Flex axis. vertical = column, horizontal = row. Serializes to A2UI Column / Row.",
  },
  {
    name: "gap",
    kind: "enum",
    options: [...SPACE_TOKENS],
    default: "4X",
    description: "Space between children (VDS token).",
  },
  {
    name: "padding",
    kind: "enum",
    options: [...SPACE_TOKENS],
    default: "0",
    description: "Inner padding (VDS token).",
  },
  {
    name: "align",
    kind: "enum",
    options: [...ALIGN_OPTIONS],
    default: "stretch",
    description: "Cross-axis alignment of children.",
  },
  {
    name: "justify",
    kind: "enum",
    options: [...JUSTIFY_OPTIONS],
    default: "start",
    description: "Main-axis distribution of children.",
  },
  {
    name: "wrap",
    kind: "bool",
    description:
      "Allow children to wrap onto multiple lines (flex-wrap). The auto-layout way to build a reflowing card grid.",
  },

  // ── Size ─────────────────────────────────────────────────────────────────
  {
    name: "width",
    kind: "string",
    description: "Explicit width. Pins the box to this size instead of flex-filling. CSS value: 30%, 200px, etc.",
  },
  {
    name: "height",
    kind: "string",
    description: "Explicit height. Pins the box to this size instead of flex-filling. CSS value: 200px, 50%, etc.",
  },

  // ── Visual ───────────────────────────────────────────────────────────────
  {
    name: "background",
    kind: "string",
    description: "CSS background-color (e.g. #ffffff, rgba(0,0,0,0.1)).",
  },
  {
    name: "overflow",
    kind: "enum",
    options: [...OVERFLOW_OPTIONS],
    description: "CSS overflow.",
  },

  // ── Border ───────────────────────────────────────────────────────────────
  {
    name: "borderWidth",
    kind: "string",
    description: "Border thickness, e.g. '1px'. Leave blank for no border.",
  },
  {
    name: "borderColor",
    kind: "string",
    description: "Border color (CSS value). Defaults to #e8e8e8 when borderWidth is set.",
  },
  {
    name: "borderRadius",
    kind: "enum",
    options: [...RADIUS_TOKENS],
    description: "Corner radius — token or raw value. Shorthand for all corners.",
  },
  {
    name: "borderTopLeftRadius",
    kind: "enum",
    options: [...RADIUS_TOKENS],
    description: "Top-left corner override.",
  },
  {
    name: "borderTopRightRadius",
    kind: "enum",
    options: [...RADIUS_TOKENS],
    description: "Top-right corner override.",
  },
  {
    name: "borderBottomLeftRadius",
    kind: "enum",
    options: [...RADIUS_TOKENS],
    description: "Bottom-left corner override.",
  },
  {
    name: "borderBottomRightRadius",
    kind: "enum",
    options: [...RADIUS_TOKENS],
    description: "Bottom-right corner override.",
  },
];

/** Synthetic catalog entry so palette + inspector treat Box uniformly. */
export const frameComponentModel: ComponentModel = {
  name: FRAME_TYPE,
  group: "Layout",
  description: "Flex container. Serializes to A2UI Column / Row.",
  props: boxProps,
  slotProp: "children",
  isSlotContainer: true,
  synthetic: true,
};

export function frameDefaultProps(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const p of boxProps) if (p.default !== undefined) out[p.name] = p.default;
  return out;
}

/**
 * Synthetic catalog entry for the `Slot` wrapper. Marked a slot container so the
 * canvas, dnd, and store treat its children as droppable/editable. Its own editable
 * props (padding, backgroundColor, …) are derived per-instance from the parent
 * component's object-prop descriptor, so the static `props` list is empty.
 */
export const slotComponentModel: ComponentModel = {
  name: SLOT_TYPE,
  group: "Layout",
  description: "Editable content of an object-valued slot prop (e.g. header, cap).",
  props: [],
  slotProp: "children",
  isSlotContainer: true,
  synthetic: true,
};

/**
 * True if an A2UI component name is a layout primitive that imports back to Box.
 * Accepts both the current "Box" format and the legacy "Column"/"Row" format so
 * that old exports can still be imported.
 */
export function isA2UILayout(component: string): boolean {
  return component === FRAME_TYPE || component === A2UI_COLUMN || component === A2UI_ROW;
}
