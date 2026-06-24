/**
 * The single document store (ARCHITECTURE §7.3). Zustand + Immer for tree edits,
 * wrapped by zundo's temporal middleware for undo/redo. Every document mutation
 * goes through an action here — components never mutate state directly.
 *
 * Only `doc` is tracked for undo/redo (selection/viewport changes are not undoable).
 */
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { temporal } from "zundo";
import {
  createNode,
  createSurface,
  getCatalog,
  newId,
  type EditorDocument,
  type NodeId,
  type Surface,
  type SurfaceId,
} from "@pds/a2ui-schema";

export interface Selection {
  surfaceId: SurfaceId;
  nodeId: NodeId;
}

export interface ComposerState {
  doc: EditorDocument;
  selection: Selection | null;
  activeSurfaceId: SurfaceId;

  // selection / navigation (not undoable)
  setSelection: (sel: Selection | null) => void;
  setActiveSurface: (id: SurfaceId) => void;

  // document mutations (undoable)
  addNode: (type: string, parentId?: NodeId, index?: number) => NodeId | null;
  updateProp: (nodeId: NodeId, path: string, value: unknown) => void;
  moveNode: (nodeId: NodeId, dir: "up" | "down") => void;
  moveNodeToParent: (nodeId: NodeId, newParentId: NodeId, index?: number) => void;
  reorderChild: (parentId: NodeId, fromIndex: number, toIndex: number) => void;
  removeNode: (nodeId: NodeId) => void;
  addSurface: () => SurfaceId;
  renameSurface: (id: SurfaceId, name: string) => void;
  setSurfacePosition: (id: SurfaceId, position: { x: number; y: number }) => void;
  connectSurfaces: (source: SurfaceId, target: SurfaceId, trigger?: string) => void;
  removeEdge: (edgeId: string) => void;
}

const catalog = getCatalog();

function initialDocument(): EditorDocument {
  const surface = createSurface(catalog, { name: "Home" });
  return {
    surfaces: { [surface.id]: surface },
    flow: {
      nodes: [{ id: surface.id, position: { x: 80, y: 80 } }],
      edges: [],
    },
    entrySurfaceId: surface.id,
  };
}

function findParentId(surface: Surface, childId: NodeId): NodeId | null {
  for (const node of Object.values(surface.nodes)) {
    if (node.children?.includes(childId)) return node.id;
  }
  return null;
}

function isSlotContainer(type: string): boolean {
  return catalog.components[type]?.isSlotContainer ?? false;
}

/** Recursively gather a node and all of its slot descendants. */
function collectSubtree(surface: Surface, id: NodeId, into: Set<NodeId>): void {
  into.add(id);
  const node = surface.nodes[id];
  if (node?.children) for (const c of node.children) collectSubtree(surface, c, into);
}

/** Set a value at a dotted path within a props object, creating containers as needed. */
function setByPath(props: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split(".");
  let cursor: Record<string, unknown> = props;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    const next = cursor[key];
    if (typeof next !== "object" || next === null) {
      cursor[key] = /^\d+$/.test(keys[i + 1]) ? [] : {};
    }
    cursor = cursor[key] as Record<string, unknown>;
  }
  const last = keys[keys.length - 1];
  if (value === undefined) {
    if (Array.isArray(cursor)) cursor.splice(Number(last), 1);
    else delete cursor[last];
  } else {
    cursor[last] = value;
  }
}

export const useComposer = create<ComposerState>()(
  temporal(
    immer<ComposerState>((set, get) => ({
      doc: initialDocument(),
      selection: null,
      activeSurfaceId: "",

      setSelection: (sel) =>
        set((s) => {
          s.selection = sel;
        }),

      setActiveSurface: (id) =>
        set((s) => {
          s.activeSurfaceId = id;
          s.selection = null;
        }),

      addNode: (type, parentId, index) => {
        const state = get();
        const surface = state.doc.surfaces[state.activeSurfaceId];
        if (!surface) return null;

        // Resolve the drop parent: explicit arg → selected slot → surface root.
        let target = parentId;
        if (!target) {
          const sel = state.selection?.nodeId;
          target = sel && isSlotContainer(surface.nodes[sel]?.type) ? sel : surface.root;
        }
        if (!isSlotContainer(surface.nodes[target]?.type)) target = surface.root;

        const node = createNode(catalog, type);
        set((s) => {
          const surf = s.doc.surfaces[s.activeSurfaceId];
          surf.nodes[node.id] = node;
          const parent = surf.nodes[target!];
          parent.children ??= [];
          const at = index ?? parent.children.length;
          parent.children.splice(at, 0, node.id);
          s.selection = { surfaceId: surf.id, nodeId: node.id };
        });
        return node.id;
      },

      updateProp: (nodeId, path, value) =>
        set((s) => {
          const node = s.doc.surfaces[s.activeSurfaceId]?.nodes[nodeId];
          if (node) setByPath(node.props, path, value);
        }),

      moveNode: (nodeId, dir) =>
        set((s) => {
          const surf = s.doc.surfaces[s.activeSurfaceId];
          const parentId = findParentId(surf, nodeId);
          if (!parentId) return;
          const children = surf.nodes[parentId].children!;
          const i = children.indexOf(nodeId);
          const j = dir === "up" ? i - 1 : i + 1;
          if (j < 0 || j >= children.length) return;
          [children[i], children[j]] = [children[j], children[i]];
        }),

      moveNodeToParent: (nodeId, newParentId, index) =>
        set((s) => {
          const surf = s.doc.surfaces[s.activeSurfaceId];
          if (nodeId === surf.root) return;
          if (nodeId === newParentId) return;
          if (!isSlotContainer(surf.nodes[newParentId]?.type)) return;
          // Disallow moving a node into its own subtree (would create a cycle).
          const subtree = new Set<NodeId>();
          collectSubtree(surf, nodeId, subtree);
          if (subtree.has(newParentId)) return;

          const oldParentId = findParentId(surf, nodeId);
          if (oldParentId) {
            const sib = surf.nodes[oldParentId].children!;
            sib.splice(sib.indexOf(nodeId), 1);
          }
          const dest = surf.nodes[newParentId];
          dest.children ??= [];
          const at = index ?? dest.children.length;
          dest.children.splice(at, 0, nodeId);
          s.selection = { surfaceId: surf.id, nodeId };
        }),

      reorderChild: (parentId, fromIndex, toIndex) =>
        set((s) => {
          const children = s.doc.surfaces[s.activeSurfaceId]?.nodes[parentId]?.children;
          if (!children) return;
          const [moved] = children.splice(fromIndex, 1);
          children.splice(toIndex, 0, moved);
        }),

      removeNode: (nodeId) =>
        set((s) => {
          const surf = s.doc.surfaces[s.activeSurfaceId];
          if (nodeId === surf.root) return; // never delete the root frame
          const parentId = findParentId(surf, nodeId);
          if (parentId) {
            const children = surf.nodes[parentId].children!;
            children.splice(children.indexOf(nodeId), 1);
          }
          const doomed = new Set<NodeId>();
          collectSubtree(surf, nodeId, doomed);
          for (const id of doomed) delete surf.nodes[id];
          if (s.selection?.nodeId && doomed.has(s.selection.nodeId)) s.selection = null;
        }),

      addSurface: () => {
        const surface = createSurface(catalog, { name: "Screen" });
        set((s) => {
          s.doc.surfaces[surface.id] = surface;
          const count = s.doc.flow.nodes.length;
          s.doc.flow.nodes.push({
            id: surface.id,
            position: { x: 80 + (count % 4) * 240, y: 80 + Math.floor(count / 4) * 200 },
          });
        });
        return surface.id;
      },

      renameSurface: (id, name) =>
        set((s) => {
          if (s.doc.surfaces[id]) s.doc.surfaces[id].name = name;
        }),

      setSurfacePosition: (id, position) =>
        set((s) => {
          const fn = s.doc.flow.nodes.find((n) => n.id === id);
          if (fn) fn.position = position;
        }),

      connectSurfaces: (source, target, trigger) =>
        set((s) => {
          const exists = s.doc.flow.edges.some(
            (e) => e.source === source && e.target === target,
          );
          if (!exists) {
            s.doc.flow.edges.push({ id: newId(), source, target, trigger });
          }
        }),

      removeEdge: (edgeId) =>
        set((s) => {
          s.doc.flow.edges = s.doc.flow.edges.filter((e) => e.id !== edgeId);
        }),
    })),
    {
      limit: 100,
      partialize: (state) => ({ doc: state.doc }),
      equality: (a, b) => a.doc === b.doc,
    },
  ),
);

// Initialize activeSurfaceId to the entry surface.
useComposer.setState({ activeSurfaceId: useComposer.getState().doc.entrySurfaceId });

export { catalog };
