import { useStore } from "zustand";
import type { DocNode, Surface } from "@pds/a2ui-schema";
import { useComposer, catalog } from "./store";

export { useComposer, catalog };
export type { ComposerState, Selection } from "./store";

/** The surface currently open in the page canvas. */
export function useActiveSurface(): Surface | undefined {
  return useComposer((s) => s.doc.surfaces[s.activeSurfaceId]);
}

/** The currently selected node (if any), within the active surface. */
export function useSelectedNode(): DocNode | undefined {
  return useComposer((s) =>
    s.selection ? s.doc.surfaces[s.activeSurfaceId]?.nodes[s.selection.nodeId] : undefined,
  );
}

export interface UndoRedo {
  undo: () => void;
  redo: () => void;
  clear: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

/** Undo/redo bound to zundo's temporal store (tracks `doc` only). */
export function useUndoRedo(): UndoRedo {
  return useStore(useComposer.temporal, (t) => ({
    undo: t.undo,
    redo: t.redo,
    clear: t.clear,
    canUndo: t.pastStates.length > 0,
    canRedo: t.futureStates.length > 0,
  }));
}
