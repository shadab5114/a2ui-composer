/**
 * A2UI wire types — the export target.
 *
 * The document is a versioned instruction array (`{ "a2ui": [...] }`). Each
 * instruction carries a `"version"` discriminator and exactly one named operation
 * key. The three operations used by the composer are:
 *
 *   createSurface      — declares the surface and pins the catalog.
 *   updateDataModel    — sets the data at a JSON-Pointer path (/ = root).
 *   updateComponents   — replaces the full component tree (DFS pre-order; first
 *                        component is the root).
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
  component: string; // "Box", "Button", "TitleLockup", ...
  /** id refs (slot children) OR content (DynamicString). Resolved per catalog. */
  children?: string[] | DynamicString;
  [prop: string]: unknown;
}

// ── Instruction shapes ────────────────────────────────────────────────────────

export interface CreateSurfaceInstruction {
  version: "v0.9";
  createSurface: {
    surfaceId: string;
    catalogId: string;
  };
}

export interface UpdateDataModelInstruction {
  version: "v0.9";
  updateDataModel: {
    surfaceId: string;
    /** JSON-Pointer to set. Use "/" for the root data object. */
    path: string;
    value: Record<string, unknown>;
  };
}

export interface UpdateComponentsInstruction {
  version: "v0.9";
  updateComponents: {
    surfaceId: string;
    /** DFS pre-order; the first entry is always the root component. */
    components: A2UIComponent[];
  };
}

export type A2UIInstruction =
  | CreateSurfaceInstruction
  | UpdateDataModelInstruction
  | UpdateComponentsInstruction;

export interface A2UIExport {
  a2ui: A2UIInstruction[];
}
