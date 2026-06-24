/**
 * A2UI wire types — the export target. Mirrors the catalog's flat, adjacency-list
 * shape: every component is an object with a `component` discriminator and sibling
 * props, referenced by id.
 */

/** A bindable string: either a literal or a JSON-Pointer path into the data model. */
export type DynamicString = { literalString: string } | { path: string };

export function isDynamicString(v: unknown): v is DynamicString {
  return (
    typeof v === "object" &&
    v !== null &&
    ("literalString" in v || "path" in v)
  );
}

export interface A2UIComponent {
  id: string;
  component: string; // "Button", "Column", "Row", ...
  /** id refs (slot children) OR content (DynamicString). Resolved per catalog. */
  children?: string[] | DynamicString;
  [prop: string]: unknown;
}

export interface SurfaceUpdate {
  surfaceId: string;
  catalogId: string;
  root: string;
  components: A2UIComponent[];
}

export interface DataModelUpdate {
  surfaceId: string;
  /** JSON-Pointer keyed bound values collected from `{ path }` props. */
  contents: Record<string, unknown>;
}

export interface A2UIExport {
  surfaceUpdate: SurfaceUpdate;
  dataModelUpdate?: DataModelUpdate;
}
