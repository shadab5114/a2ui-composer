/**
 * Persistent "drop content here" affordance rendered at the end of every slot
 * container's body (ARCHITECTURE §7.3). Unlike InsertZone (which only appears mid-
 * drag for precise positioning), this is always visible so a container advertises
 * that it accepts children. It reuses the `source: "insert"` drop contract, so the
 * shared onDragEnd handler appends the dropped/new node at `index` — no new wiring.
 */
import { useDndContext, useDroppable } from "@dnd-kit/core";
import { Plus } from "lucide-react";
import type { NodeId } from "@pds/a2ui-schema";

export function BodyDropZone({
  parentId,
  index,
  direction,
}: {
  parentId: NodeId;
  index: number;
  direction: string;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: `body:${parentId}`,
    data: { source: "insert", nodeId: parentId, index },
  });
  const { active } = useDndContext();
  const dragging = !!active;
  const isHorizontal = direction === "horizontal";

  return (
    <div
      ref={setNodeRef}
      onClick={(e) => e.stopPropagation()}
      style={{
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 4,
        fontSize: 10,
        lineHeight: 1,
        cursor: "default",
        borderRadius: 4,
        border: `1px dashed ${isOver ? "#5b8cff" : "#c8c8d0"}`,
        color: isOver ? "#5b8cff" : "#9a9aa3",
        background: isOver ? "rgba(91,140,255,0.08)" : "transparent",
        // More prominent while dragging; a slim, unobtrusive hint otherwise.
        opacity: isOver ? 1 : dragging ? 0.9 : 0.55,
        transition: "all 0.12s ease",
        ...(isHorizontal
          ? { alignSelf: "stretch", width: dragging ? 40 : 22, minWidth: dragging ? 40 : 22, writingMode: "vertical-rl" }
          : { width: "100%", minHeight: dragging ? 32 : 22, marginTop: 4 }),
      }}
    >
      <Plus size={11} />
      {!isHorizontal && <span>drop here</span>}
    </div>
  );
}
