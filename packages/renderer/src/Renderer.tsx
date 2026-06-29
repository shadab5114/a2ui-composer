/**
 * Renderer.tsx — the one recursive A2UI interpreter (ARCHITECTURE §1, §7.2).
 * Shared by the composer's live canvas AND the sandbox, so "export renders
 * identically to the canvas" is true by construction. Never fork this.
 *
 *  - Looks up `registry[node.type]`; unknown types render a visible Fallback
 *    (never throws).
 *  - Resolves content props (DynamicString) against an optional data model.
 *  - Slot children (id refs) render recursively; Box applies direction-aware sizing.
 *  - `wrapNode` lets the composer inject per-node editor chrome (selection, dnd)
 *    without forking the render path.
 *  - `insertZone` (editor-only) injects droppable gaps between siblings so items
 *    can be dragged to a specific position. Only active while a drag is in progress.
 */
import React, { type CSSProperties, type ReactNode } from "react";
import type { DocNode, NodeId, Surface } from "@pds/a2ui-schema";
import { FRAME_TYPE, SLOT_TYPE } from "@pds/a2ui-schema";
import { getComponent } from "./registry";
import { resolveProps, type DataModel } from "./dynamic";
import { Fallback } from "./standins/Fallback";

export interface RenderOptions {
  dataModel?: DataModel;
  /** Wrap each rendered node — used by the composer for selection/dnd chrome. */
  wrapNode?: (node: DocNode, element: ReactNode) => ReactNode;
  /**
   * Editor-only: return a droppable insert-zone element to be placed between
   * children at position `index` inside Box node `parentId`.
   * When undefined (sandbox), no zones are rendered.
   */
  insertZone?: (parentId: NodeId, index: number, direction: string) => ReactNode;
  /**
   * Editor-only: return a persistent "drop content here" affordance appended to the
   * end of a slot container's body, so it always advertises that it takes children.
   * When undefined (sandbox), nothing is rendered.
   */
  bodyZone?: (node: DocNode, index: number, direction: string) => ReactNode;
}

/**
 * Compute the flex-wrapper style for a child node inside a Box.
 *
 * Rules (in priority order):
 *  1. Explicit `width` / `height` on the child  → pin to that size (flex: 0 0 auto).
 *  2. Explicit `weight` prop (A2UI flex-grow)    → flex: <weight> 1 0%.
 *  3. Child is a Box in a HORIZONTAL parent      → flex: 1 1 0% (share width equally).
 *  4. Everything else                            → flex: 0 0 auto (shrink to content).
 *
 * Rationale for rule 3: in a vertical stack, children should wrap their content
 * and stack naturally; forcing flex:1 on them causes the big-empty-space bug.
 * In a horizontal row, Boxes should divide the width equally — that is the main
 * layout-building primitive.
 */
function childWrapperStyle(
  child: DocNode | undefined,
  isChildBox: boolean,
  parentDirection: string,
): CSSProperties {
  if (!child) return { flex: "0 0 auto", minWidth: 0, minHeight: 0 };
  const p = child.props as Record<string, unknown>;
  const hasExplicit = p.width !== undefined || p.height !== undefined;

  const flex = hasExplicit
    ? "0 0 auto"
    : typeof p.weight === "number" && p.weight > 0
      ? `${p.weight} 1 0%`
      : isChildBox && parentDirection === "horizontal"
        ? "1 1 0%"   // horizontal Box → children share width equally
        : "0 0 auto"; // vertical Box / DS components → shrink to content

  return {
    flex,
    ...(p.width  !== undefined ? { width:  p.width  as string } : {}),
    ...(p.height !== undefined ? { height: p.height as string } : {}),
    minWidth: 0,
    minHeight: 0,
  };
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
    // A Box or a Slot lays out its own children (insert zones, per-child flex).
    const isBox = node.type === FRAME_TYPE || node.type === SLOT_TYPE;
    const parentDir = (node.props.direction as string | undefined) ?? "vertical";

    // Split children into object-slot wrappers (header/cap/…) and ordinary body
    // children, keeping each body child's real index in `node.children` so insert
    // zones address the same array the store splices into. Slot wrappers are
    // reconstituted into object props on `resolved`; only body children render as
    // this component's JSX children.
    const bodyEntries: Array<{ id: NodeId; idx: number }> = [];
    for (let i = 0; i < node.children.length; i++) {
      const childId: NodeId = node.children[i];
      const slotOf = nodes[childId]?.editorMeta?.slotOf;
      if (slotOf) {
        const slotNode = nodes[childId];
        const { resolved: scalars } = resolveProps(slotNode.props, options.dataModel);
        resolved[slotOf] = { ...scalars, children: renderNode(childId, nodes, options) };
      } else {
        bodyEntries.push({ id: childId, idx: i });
      }
    }

    const wrappedChild = (childId: NodeId) => {
      const childEl = renderNode(childId, nodes, options);
      if (!isBox) return childEl;
      const childNode = nodes[childId];
      return (
        <div key={childId} style={childWrapperStyle(childNode, childNode?.type === FRAME_TYPE, parentDir)}>
          {childEl}
        </div>
      );
    };

    let kids: ReactNode[];
    if (isBox && options.insertZone) {
      // Interleave insert zones so the user can drag-to-position between siblings.
      // Indices are in full-`children` space (past any leading slot wrappers).
      const iz = options.insertZone;
      kids = [];
      for (const { id, idx } of bodyEntries) {
        kids.push(iz(node.id, idx, parentDir));
        kids.push(wrappedChild(id));
      }
    } else {
      kids = bodyEntries.map((e) => wrappedChild(e.id));
    }

    // Persistent body drop zone: every container that already has children keeps an
    // always-visible "drop here" target at the end of its body. (Empty containers
    // get the full-size empty-slot placeholder from the editor wrapper instead.)
    if (options.bodyZone && node.children.length > 0) {
      kids.push(options.bodyZone(node, node.children.length, parentDir));
    }

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
  insertZone?: RenderOptions["insertZone"];
  bodyZone?: RenderOptions["bodyZone"];
}

/** Render a whole surface. Used by BOTH the composer preview and the sandbox. */
export function A2UISurface({ surface, dataModel, wrapNode, insertZone, bodyZone }: A2UISurfaceProps) {
  return (
    <>
      {renderNode(surface.root, surface.nodes, {
        dataModel: dataModel ?? surface.dataModel,
        wrapNode,
        insertZone,
        bodyZone,
      })}
    </>
  );
}
