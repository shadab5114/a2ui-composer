/**
 * Pure factories for editor nodes and surfaces. Lives in `schema` (no React) so the
 * store and dev fixtures share one source of truth for default props.
 */
import { nanoid } from "nanoid";
import type { CatalogModel, ComponentModel } from "./catalog.types";
import type { DocNode, Surface } from "./doc.types";
import { FRAME_TYPE } from "./frame";

export const newId = (): string => nanoid(8);

/** Default props for a fresh node: explicit schema defaults + required content. */
export function defaultPropsFor(model: ComponentModel): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  for (const p of model.props) {
    if (p.kind === "content" && p.required) {
      props[p.name] = { literalString: model.name };
    } else if (p.default !== undefined) {
      props[p.name] = p.default;
    }
  }
  return props;
}

export function createNode(
  catalog: CatalogModel,
  type: string,
  id: string = newId(),
): DocNode {
  const model = catalog.components[type];
  if (!model) throw new Error(`Unknown component type: ${type}`);
  const node: DocNode = { id, type, props: defaultPropsFor(model) };
  if (model.isSlotContainer) node.children = [];
  return node;
}

export function createSurface(
  catalog: CatalogModel,
  opts: { id?: string; name?: string } = {},
): Surface {
  const id = opts.id ?? newId();
  const root = createNode(catalog, FRAME_TYPE);
  return {
    id,
    name: opts.name ?? "Screen",
    root: root.id,
    nodes: { [root.id]: root },
  };
}
