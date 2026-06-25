/**
 * tree(editor) ⇆ adjacency(A2UI). The ONLY home for this conversion.
 *
 * Round-trip invariant (ARCHITECTURE §7.1): `export(import(x))` is deep-equal to
 * `x`. To guarantee it:
 *  - updateComponents.components is emitted in DFS pre-order (root first).
 *  - Box nodes export as { "component": "Box", "direction": "vertical"|"horizontal", ...props }.
 *  - The data model is converted between flat JSON-Pointer paths (internal store)
 *    and a nested object at path "/" (wire format).
 */
import type {
  A2UIComponent,
  A2UIExport,
  A2UIInstruction,
  DynamicString,
  UpdateComponentsInstruction,
  UpdateDataModelInstruction,
} from "./a2ui.types";
import { isDynamicString } from "./a2ui.types";
import type { DocNode, NodeId, Surface } from "./doc.types";
import { isA2UILayout, FRAME_TYPE } from "./frame";

// ── Data-model helpers ────────────────────────────────────────────────────────

/**
 * Convert flat JSON-Pointer keyed paths to a nested object.
 * e.g. { "/user/name": "Ada" } → { user: { name: "Ada" } }
 * Arrays are kept as-is at their path; only plain objects are recursed.
 */
function pathsToObject(paths: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [pointer, value] of Object.entries(paths)) {
    const keys = pointer.split("/").filter(Boolean);
    if (keys.length === 0) continue;
    let cursor = result;
    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i];
      if (typeof cursor[k] !== "object" || cursor[k] === null || Array.isArray(cursor[k])) {
        cursor[k] = {};
      }
      cursor = cursor[k] as Record<string, unknown>;
    }
    cursor[keys[keys.length - 1]] = value;
  }
  return result;
}

/**
 * Inverse of pathsToObject. Recurses into plain objects only; arrays stay whole.
 * e.g. { user: { name: "Ada" } } → { "/user/name": "Ada" }
 */
function objectToPaths(
  obj: Record<string, unknown>,
  prefix = "",
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const path = `${prefix}/${key}`;
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      Object.assign(result, objectToPaths(value as Record<string, unknown>, path));
    } else {
      result[path] = value;
    }
  }
  return result;
}

// ── Prop helpers ──────────────────────────────────────────────────────────────

function collectPaths(value: unknown, into: Set<string>): void {
  if (value == null || typeof value !== "object") return;
  if (isDynamicString(value)) {
    if ("path" in value) into.add(value.path);
    return;
  }
  if (Array.isArray(value)) {
    for (const v of value) collectPaths(v, into);
    return;
  }
  for (const v of Object.values(value as Record<string, unknown>)) {
    collectPaths(v, into);
  }
}

// ── Export ────────────────────────────────────────────────────────────────────

export function exportSurface(surface: Surface, catalogId: string): A2UIExport {
  const components: A2UIComponent[] = [];
  const boundPaths = new Set<string>();
  const visited = new Set<NodeId>();

  const visit = (id: NodeId): void => {
    if (visited.has(id)) return;
    visited.add(id);
    const node = surface.nodes[id];
    if (!node) return;

    // Box always exports as "Box" with an explicit direction prop.
    const component = node.type === FRAME_TYPE ? FRAME_TYPE : node.type;
    const out: A2UIComponent = { id: node.id, component };

    for (const [key, val] of Object.entries(node.props)) {
      out[key] = val;
      collectPaths(val, boundPaths);
    }

    if (node.children) out.children = node.children.slice();

    components.push(out);
    if (node.children) for (const childId of node.children) visit(childId);
  };

  visit(surface.root);

  const instructions: A2UIInstruction[] = [
    {
      version: "v0.9",
      createSurface: { surfaceId: surface.id, catalogId },
    },
  ];

  // Emit updateDataModel only when there are bound paths.
  if (boundPaths.size > 0 && surface.dataModel) {
    // Only export paths that are actually referenced by components.
    const referencedModel: Record<string, unknown> = {};
    for (const path of boundPaths) {
      if (path in surface.dataModel) referencedModel[path] = surface.dataModel[path];
    }
    const updateDM: UpdateDataModelInstruction = {
      version: "v0.9",
      updateDataModel: {
        surfaceId: surface.id,
        path: "/",
        value: pathsToObject(referencedModel),
      },
    };
    instructions.push(updateDM);
  }

  const updateComps: UpdateComponentsInstruction = {
    version: "v0.9",
    updateComponents: { surfaceId: surface.id, components },
  };
  instructions.push(updateComps);

  return { a2ui: instructions };
}

// ── Import ────────────────────────────────────────────────────────────────────

export function importSurface(a2ui: A2UIExport): Surface {
  let surfaceId = "";
  let components: A2UIComponent[] = [];
  let dataModelValue: Record<string, unknown> | undefined;

  for (const op of a2ui.a2ui) {
    if ("createSurface" in op) {
      surfaceId = op.createSurface.surfaceId;
    } else if ("updateDataModel" in op) {
      dataModelValue = op.updateDataModel.value;
    } else if ("updateComponents" in op) {
      components = op.updateComponents.components;
    }
  }

  const nodes: Record<NodeId, DocNode> = {};

  for (const comp of components) {
    const { id, component, children, ...rest } = comp;
    const isLayout = isA2UILayout(component);

    const props: Record<string, unknown> = { ...rest };
    let childIds: NodeId[] | undefined;

    if (Array.isArray(children)) {
      childIds = children.slice();
    } else if (children !== undefined) {
      props.children = children as DynamicString;
    }

    if (isLayout) {
      // Normalise legacy "Column"/"Row" names — "Box" already carries direction.
      if (component === "Row") props.direction = "horizontal";
      else if (component === "Column") props.direction = "vertical";
    }

    nodes[id] = {
      id,
      type: isLayout ? FRAME_TYPE : component,
      props,
      ...(childIds !== undefined ? { children: childIds } : {}),
    };
  }

  // Root is always the first component (DFS pre-order export guarantee).
  const root = components[0]?.id ?? "";

  const surface: Surface = {
    id: surfaceId,
    name: surfaceId,
    root,
    nodes,
  };

  if (dataModelValue) {
    surface.dataModel = objectToPaths(dataModelValue);
  }

  return surface;
}
