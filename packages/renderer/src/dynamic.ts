/**
 * Resolving A2UI `DynamicString` content against a data model. Used by the renderer
 * to turn `{ literalString }` / `{ path }` content props into real strings before
 * handing them to design-system components.
 */
import { isDynamicString } from "@pds/a2ui-schema";

export type DataModel = Record<string, unknown> | undefined;

/** Resolve a DynamicString to a string. Unbound paths show the path as a placeholder. */
export function resolveDynamicString(value: unknown, dataModel: DataModel): string {
  if (!isDynamicString(value)) return "";
  if ("literalString" in value) return value.literalString;
  const bound = dataModel?.[value.path];
  return bound != null ? String(bound) : value.path; // path shown when unbound
}

/** Recursively replace any DynamicString within a prop value with its resolved string. */
export function deepResolve(value: unknown, dataModel: DataModel): unknown {
  if (value == null || typeof value !== "object") return value;
  if (isDynamicString(value)) return resolveDynamicString(value, dataModel);
  if (Array.isArray(value)) return value.map((v) => deepResolve(v, dataModel));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = deepResolve(v, dataModel);
  }
  return out;
}

/** Resolve a node's props for rendering, pulling out the layout-only `weight`. */
export function resolveProps(
  props: Record<string, unknown>,
  dataModel: DataModel,
): { resolved: Record<string, unknown>; weight: number | undefined } {
  const resolved: Record<string, unknown> = {};
  let weight: number | undefined;
  for (const [k, v] of Object.entries(props)) {
    if (k === "weight") {
      weight = typeof v === "number" ? v : undefined;
      continue; // consumed by the parent Frame for flex sizing, not a component prop
    }
    resolved[k] = deepResolve(v, dataModel);
  }
  return { resolved, weight };
}
