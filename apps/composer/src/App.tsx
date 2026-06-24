/**
 * Composer shell. Hosts the single DndContext shared by the palette and page
 * canvas, the top toolbar (undo/redo), and the three-pane layout.
 * Inspector arrives in M4; flow canvas + export in M5/M6.
 */
import { useEffect, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { Code2, Redo2, Undo2 } from "lucide-react";
import { Palette } from "./palette/Palette";
import { PageCanvas } from "./page-canvas/PageCanvas";
import { Inspector } from "./inspector/Inspector";
import { ExportPanel } from "./export/ExportPanel";
import { useComposer, useUndoRedo } from "./store";

export function App() {
  const addNode = useComposer((s) => s.addNode);
  const moveNodeToParent = useComposer((s) => s.moveNodeToParent);
  const { undo, redo, canUndo, canRedo } = useUndoRedo();
  const [dragLabel, setDragLabel] = useState<string | null>(null);
  const [showExport, setShowExport] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  const onDragStart = (e: DragStartEvent) => {
    const data = e.active.data.current as { source?: string; type?: string } | undefined;
    setDragLabel(data?.source === "palette" ? (data.type ?? null) : "Move");
  };

  const onDragEnd = (e: DragEndEvent) => {
    setDragLabel(null);
    const { active, over } = e;
    if (!over) return;
    const a = active.data.current as { source?: string; type?: string; nodeId?: string } | undefined;
    const o = over.data.current as { source?: string; nodeId?: string } | undefined;
    if (!o || o.source !== "slot" || !o.nodeId) return;
    if (a?.source === "palette" && a.type) addNode(a.type, o.nodeId);
    else if (a?.source === "node" && a.nodeId) moveNodeToParent(a.nodeId, o.nodeId);
  };

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="flex h-full w-full flex-col">
        <header className="flex h-10 shrink-0 items-center gap-3 border-b border-chrome-border bg-chrome-panel px-3 text-sm">
          <span className="font-semibold">PDS → A2UI Composer</span>
          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={() => setShowExport((v) => !v)}
              className={`flex items-center gap-1 rounded px-2 py-1 text-xs hover:bg-chrome-border ${
                showExport ? "bg-chrome-border" : ""
              }`}
              title="Toggle A2UI export"
            >
              <Code2 size={14} /> Export
            </button>
            <span className="mx-1 h-4 w-px bg-chrome-border" />
            <button
              onClick={undo}
              disabled={!canUndo}
              className="flex items-center gap-1 rounded px-2 py-1 text-xs hover:bg-chrome-border disabled:opacity-30"
              title="Undo (Ctrl/Cmd+Z)"
            >
              <Undo2 size={14} /> Undo
            </button>
            <button
              onClick={redo}
              disabled={!canRedo}
              className="flex items-center gap-1 rounded px-2 py-1 text-xs hover:bg-chrome-border disabled:opacity-30"
              title="Redo (Shift+Ctrl/Cmd+Z)"
            >
              <Redo2 size={14} /> Redo
            </button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          <aside className="w-56 shrink-0 border-r border-chrome-border bg-chrome-panel">
            <Palette />
          </aside>
          <main className="flex min-w-0 flex-1 flex-col">
            <div className="min-h-0 flex-1">
              <PageCanvas />
            </div>
            {showExport && (
              <div className="h-72 shrink-0">
                <ExportPanel onClose={() => setShowExport(false)} />
              </div>
            )}
          </main>
          <aside className="w-80 shrink-0 border-l border-chrome-border bg-chrome-panel">
            <Inspector />
          </aside>
        </div>
      </div>

      <DragOverlay dropAnimation={null}>
        {dragLabel ? (
          <div className="rounded bg-chrome-accent px-2 py-1 text-xs font-medium text-white shadow-lg">
            {dragLabel}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
