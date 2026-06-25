/**
 * Thin droppable strip rendered between sibling nodes inside a Box while a drag
 * is in progress. Expands and highlights when the dragged item hovers over it,
 * giving the user a clear insertion-point indicator.
 */
import { useDroppable } from "@dnd-kit/core";
import type { NodeId } from "@pds/a2ui-schema";

export function InsertZone({
  parentId,
  index,
  direction,
}: {
  parentId: NodeId;
  index: number;
  direction: string;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: `insert:${parentId}:${index}`,
    data: { source: "insert", nodeId: parentId, index },
  });

  const isHorizontal = direction === "horizontal";

  return (
    <div
      ref={setNodeRef}
      style={{
        flexShrink: 0,
        borderRadius: 3,
        transition: "all 0.12s ease",
        ...(isHorizontal
          ? {
              // vertical bar between left/right siblings
              width: isOver ? 36 : 6,
              minWidth: isOver ? 36 : 6,
              alignSelf: "stretch",
              background: isOver ? "rgba(91,140,255,0.25)" : "transparent",
              border: isOver ? "2px dashed #5b8cff" : "2px solid transparent",
            }
          : {
              // horizontal bar between top/bottom siblings
              height: isOver ? 36 : 6,
              minHeight: isOver ? 36 : 6,
              width: "100%",
              background: isOver ? "rgba(91,140,255,0.25)" : "transparent",
              border: isOver ? "2px dashed #5b8cff" : "2px solid transparent",
            }),
      }}
    />
  );
}
