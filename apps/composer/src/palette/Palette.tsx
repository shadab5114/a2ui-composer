/**
 * Component palette (ARCHITECTURE §7.3). Lists catalog components grouped by their
 * `group`. Each item is a dnd-kit draggable AND click-to-add (into the selected
 * slot, else the active surface root). A slot/cfg affordance shows the containment
 * kind (ARCHITECTURE §6).
 */
import { useDraggable } from "@dnd-kit/core";
import { Box, Square } from "lucide-react";
import { catalog, useComposer } from "../store";

function PaletteItem({ type }: { type: string }) {
  const model = catalog.components[type];
  const addNode = useComposer((s) => s.addNode);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette:${type}`,
    data: { source: "palette", type },
  });

  return (
    <button
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={() => addNode(type)}
      className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-chrome-border ${
        isDragging ? "opacity-40" : ""
      }`}
      title={model.description}
    >
      {model.isSlotContainer ? (
        <Box size={14} className="text-chrome-accent" />
      ) : (
        <Square size={14} className="text-chrome-muted" />
      )}
      <span className="flex-1 truncate">{type}</span>
      <span className="text-[10px] uppercase text-chrome-muted">
        {model.isSlotContainer ? "slot" : "cfg"}
      </span>
    </button>
  );
}

export function Palette() {
  const groups = catalog.groups;
  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="border-b border-chrome-border px-3 py-2 text-xs font-semibold uppercase tracking-wide text-chrome-muted">
        Palette
      </div>
      <div className="flex-1 space-y-3 p-2">
        {Object.entries(groups).map(([group, types]) => (
          <div key={group}>
            <div className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wide text-chrome-muted">
              {group}
            </div>
            <div className="space-y-0.5">
              {types.map((type) => (
                <PaletteItem key={type} type={type} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
