/** Normalized, render-agnostic view of the catalog. Derived from catalog.json. */

export type PropKind =
  | "enum"
  | "bool"
  | "string"
  | "number"
  | "content" // DynamicString: literal or bound path
  | "object" // nested *Props object (one level)
  | "array"; // repeatable list / discriminated union

export interface PropDescriptor {
  name: string;
  kind: PropKind;
  description?: string;
  required?: boolean;
  default?: unknown;
  /** enum kind */
  options?: string[];
  /** object kind: resolved sub-fields */
  fields?: PropDescriptor[];
  /** array kind: fields for a homogeneous object item */
  itemFields?: PropDescriptor[];
  /** array kind: variants for a `oneOf` discriminated union (e.g. ButtonGroupItem) */
  itemVariants?: ItemVariant[];
  /** the discriminator key name for an `itemVariants` array (usually "kind") */
  itemDiscriminator?: string;
  /** true for the slot children property (the only droppable prop) */
  slot?: boolean;
  /**
   * object kind: this object prop carries a nested slot (a child subtree) in one of
   * its fields, e.g. `ComposableTileContainer.header.children`. On import such a
   * prop is "exploded" into a synthetic `Slot` node so its content is editable on
   * the canvas; on export it is collapsed back into the object prop.
   */
  objectSlot?: boolean;
  /** object kind: name of the slot-bearing field inside the object (usually "children"). */
  slotField?: string;
  /** when true, the inspector renders an icon picker modal instead of a plain dropdown */
  isIconPicker?: boolean;
}

export interface ItemVariant {
  /** discriminator value, e.g. "primary" | "textLink" */
  value: string;
  fields: PropDescriptor[];
}

export interface ComponentModel {
  name: string;
  group: string;
  description?: string;
  props: PropDescriptor[];
  /** name of the slot children prop, if this is a drop target */
  slotProp?: string;
  isSlotContainer: boolean;
  /** true for the editor-only Frame primitive (not in catalog.json) */
  synthetic?: boolean;
}

export interface CatalogModel {
  catalogId: string;
  components: Record<string, ComponentModel>;
  /** display order for the palette */
  order: string[];
  /** group → component names, for palette grouping */
  groups: Record<string, string[]>;
  /** props that could not be serialized (e.g. render-prop functions) — surfaced */
  warnings: string[];
}
