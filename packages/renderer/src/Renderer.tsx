/**
 * Renderer.tsx — the one recursive A2UI interpreter (ARCHITECTURE §1, §7.2).
 * Shared by the composer's live canvas AND the sandbox, so "export renders
 * identically to the canvas" is true by construction. Never fork this.
 *
 *  - Looks up `registry[node.type]`; unknown types render a visible Fallback
 *    (never throws).
 *  - Resolves content props (DynamicString) against an optional data model.
 *  - Slot children (id refs) render recursively; Frame applies weight→flex sizing.
 *  - `wrapNode` lets the composer inject per-node editor chrome (selection, dnd)
 *    without forking the render path.
 */
import React, { type ReactNode } from "react";
import type { DocNode, NodeId, Surface } from "@pds/a2ui-schema";
import { FRAME_TYPE } from "@pds/a2ui-schema";
import { getComponent } from "./registry";
import { resolveProps, type DataModel } from "./dynamic";
import { Fallback } from "./standins/Fallback";

export interface RenderOptions {
  dataModel?: DataModel;
  /** Wrap each rendered node — used by the composer for selection/dnd chrome. */
  wrapNode?: (node: DocNode, element: ReactNode) => ReactNode;
}

function flexFor(weight: unknown): string {
  return typeof weight === "number" && weight > 0 ? `${weight} 1 0%` : "0 0 auto";
}

export function renderNode(
  id: NodeId,
  nodes: Record<NodeId, DocNode>,
  options: RenderOptions = {},
): ReactNode {
  const node = nodes[id];
  if (!node) return <Fallback key={id} type={`missing:${id}`} />;

  const Comp = getComponent(node.type);
  const { resolved } = resolveProps(node.props, options.dataModel);

  let element: ReactNode;
  if (!Comp) {
    element = <Fallback type={node.type} />;
  } else if (node.children) {
    const isFrame = node.type === FRAME_TYPE;
    const kids = node.children.map((childId) => {
      const childEl = renderNode(childId, nodes, options);
      if (!isFrame) return childEl;
      const flex = flexFor(nodes[childId]?.props.weight);
      return (
        <div key={childId} style={{ flex, minWidth: 0, minHeight: 0 }}>
          {childEl}
        </div>
      );
    });
    element = <Comp {...resolved}>{kids}</Comp>;
  } else {
    element = <Comp {...resolved} />;
  }

  if (options.wrapNode) element = options.wrapNode(node, element);
  return React.isValidElement(element)
    ? React.cloneElement(element, { key: id })
    : element;
}

export interface A2UISurfaceProps {
  surface: Surface;
  dataModel?: DataModel;
  wrapNode?: RenderOptions["wrapNode"];
}

/** Render a whole surface. Used by BOTH the composer preview and the sandbox. */
export function A2UISurface({ surface, dataModel, wrapNode }: A2UISurfaceProps) {
  return (
    <>
      {renderNode(surface.root, surface.nodes, {
        dataModel: dataModel ?? surface.dataModel,
        wrapNode,
      })}
    </>
  );
}
