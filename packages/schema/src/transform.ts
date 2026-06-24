/**
 * tree(editor) ⇆ adjacency(A2UI). The ONLY home for this conversion.
 *
 * Round-trip invariant (ARCHITECTURE §7.1): `export(import(x))` is deep-equal to
 * `x`. To guarantee it:
 *  - components[] is emitted in DFS pre-order from `root` (the canonical order);
 *    fixtures are authored in that order.
 *  - the Frame primitive ⇆ A2UI Column/Row, with `direction` encoded purely by the
 *    component name (never emitted as a prop).
 *  - bound `{ path }` values are preserved via `Surface.dataModel`.
 */
import type {
  A2UIComponent,
  A2UIExport,
  DataModelUpdate,
  DynamicString,
} from "./a2ui.types";
import { isDynamicString } from "./a2ui.types";
import type { DocNode, NodeId, Surface } from "./doc.types";
import { frameToA2UIComponent, isA2UILayout, FRAME_TYPE } from "./frame";

/** Recursively collect every bound JSON-Pointer path used by a prop value. */
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

export function exportSurface(surface: Surface, catalogId: string): A2UIExport {
  const components: A2UIComponent[] = [];
  const boundPaths = new Set<string>();
  const visited = new Set<NodeId>();

  const visit = (id: NodeId): void => {
    if (visited.has(id)) return; // guard against malformed cycles
    visited.add(id);
    const node = surface.nodes[id];
    if (!node) return;

    const isFrame = node.type === FRAME_TYPE;
    const component = isFrame
      ? frameToA2UIComponent(node.props.direction)
      : node.type;

    const out: A2UIComponent = { id: node.id, component };

    for (const [key, val] of Object.entries(node.props)) {
      // Frame.direction is encoded by component name; never emit it as a prop.
      if (isFrame && key === "direction") continue;
      out[key] = val;
      collectPaths(val, boundPaths);
    }

    if (node.children) {
      out.children = node.children.slice(); // slot: id refs
    }

    components.push(out);
    if (node.children) for (const childId of node.children) visit(childId);
  };

  visit(surface.root);

  const result: A2UIExport = {
    surfaceUpdate: {
      surfaceId: surface.id,
      catalogId,
      root: surface.root,
      components,
    },
  };

  if (boundPaths.size > 0) {
    const contents: Record<string, unknown> = {};
    const model = surface.dataModel ?? {};
    for (const path of boundPaths) contents[path] = model[path] ?? null;
    const dataModelUpdate: DataModelUpdate = {
      surfaceId: surface.id,
      contents,
    };
    result.dataModelUpdate = dataModelUpdate;
  }

  return result;
}

export function importSurface(a2ui: A2UIExport): Surface {
  const { surfaceUpdate, dataModelUpdate } = a2ui;
  const nodes: Record<NodeId, DocNode> = {};

  for (const comp of surfaceUpdate.components) {
    const { id, component, children, ...rest } = comp;
    const isLayout = isA2UILayout(component);

    const props: Record<string, unknown> = { ...rest };
    let childIds: NodeId[] | undefined;

    if (Array.isArray(children)) {
      childIds = children.slice(); // slot children (id refs)
    } else if (children !== undefined) {
      props.children = children as DynamicString; // content stays in props
    }

    if (isLayout) {
      props.direction = component === "Row" ? "row" : "column";
    }

    nodes[id] = {
      id,
      type: isLayout ? FRAME_TYPE : component,
      props,
      ...(childIds ? { children: childIds } : {}),
    };
  }

  const surface: Surface = {
    id: surfaceUpdate.surfaceId,
    name: surfaceUpdate.surfaceId,
    root: surfaceUpdate.root,
    nodes,
  };

  if (dataModelUpdate) surface.dataModel = { ...dataModelUpdate.contents };
  return surface;
}
