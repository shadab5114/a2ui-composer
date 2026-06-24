/**
 * Thin editor wrapper placed around each rendered node via the renderer's
 * `wrapNode` hook (ARCHITECTURE §7.3). It captures selection, hosts the per-node
 * toolbar (move up/down, delete), and — for slot containers — is the dnd-kit
 * droppable + sortable target. It NEVER modifies the rendered @pds/core component;
 * all chrome lives in sibling/parent elements, so the design system stays pristine.
 */
import { type ReactNode, useCallback } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { ChevronDown, ChevronUp, GripVertical, Trash2 } from "lucide-react";
import type { DocNode } from "@pds/a2ui-schema";
import { catalog, useComposer } from "../store";

function mergeRefs<T>(...refs: Array<(node: T | null) => void>) {
  return (node: T | null) => {
    for (const ref of refs) ref(node);
  };
}

export function EditorNode({ node, children }: { node: DocNode; children: ReactNode }) {
  const isSlot = catalog.components[node.type]?.isSlotContainer ?? false;
  const selected = useComposer((s) => s.selection?.nodeId === node.id);
  const isRoot = useComposer((s) => s.doc.surfaces[s.activeSurfaceId]?.root === node.id);
  const setSelection = useComposer((s) => s.setSelection);
  const activeSurfaceId = useComposer((s) => s.activeSurfaceId);
  const moveNode = useComposer((s) => s.moveNode);
  const removeNode = useComposer((s) => s.removeNode);

  const draggable = useDraggable({
    id: node.id,
    data: { source: "node", nodeId: node.id },
    disabled: isRoot,
  });
  const droppable = useDroppable({
    id: `slot:${node.id}`,
    data: { source: "slot", nodeId: node.id },
    disabled: !isSlot,
  });

  const onSelect = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setSelection({ surfaceId: activeSurfaceId, nodeId: node.id });
    },
    [setSelection, activeSurfaceId, node.id],
  );

  return (
    <div
      ref={mergeRefs(draggable.setNodeRef, droppable.setNodeRef)}
      onClick={onSelect}
      data-node-id={node.id}
      style={{
        position: "relative",
        outline: selected
          ? "2px solid var(--composer-accent, #5b8cff)"
          : droppable.isOver
            ? "2px dashed #5b8cff"
            : "1px solid transparent",
        outlineOffset: 1,
        borderRadius: 4,
        opacity: draggable.isDragging ? 0.5 : 1,
      }}
    >
      {selected && (
        <div
          style={{ position: "absolute", top: -26, right: 0, zIndex: 20 }}
          className="flex items-center gap-0.5 rounded bg-chrome-panel px-1 py-0.5 shadow"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="px-1 text-[10px] text-chrome-muted">{node.type}</span>
          {!isRoot && (
            <button
              ref={draggable.setActivatorNodeRef}
              {...draggable.listeners}
              {...draggable.attributes}
              className="cursor-grab rounded p-0.5 text-chrome-muted hover:bg-chrome-border"
              title="Drag to reorder"
            >
              <GripVertical size={12} />
            </button>
          )}
          <button
            onClick={() => moveNode(node.id, "up")}
            className="rounded p-0.5 text-chrome-text hover:bg-chrome-border"
            title="Move up"
          >
            <ChevronUp size={12} />
          </button>
          <button
            onClick={() => moveNode(node.id, "down")}
            className="rounded p-0.5 text-chrome-text hover:bg-chrome-border"
            title="Move down"
          >
            <ChevronDown size={12} />
          </button>
          {!isRoot && (
            <button
              onClick={() => removeNode(node.id)}
              className="rounded p-0.5 text-red-400 hover:bg-chrome-border"
              title="Delete"
            >
              <Trash2 size={12} />
            </button>
          )}
        </div>
      )}
      {children}
    </div>
  );
}
