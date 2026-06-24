/**
 * Editor document model — the working state. A superset of A2UI, stored FLAT
 * (nodes keyed by id) so it matches A2UI's adjacency-list shape: export is nearly
 * free and undo/redo is cheap. The render tree is derived from `root` + children.
 */

export type NodeId = string;
export type SurfaceId = string;

export interface DocNode {
  id: NodeId;
  type: string; // catalog component name, e.g. "Button", or the "Frame" primitive
  props: Record<string, unknown>;
  /** present only for slot containers (Frame, TileContainer) */
  children?: NodeId[];
  editorMeta?: {
    locked?: boolean;
    collapsed?: boolean;
  };
}

export interface Surface {
  id: SurfaceId;
  name: string; // shown on the flow-canvas node
  root: NodeId; // the screen's root Frame
  nodes: Record<NodeId, DocNode>;
  /**
   * Bound data-model values keyed by JSON-Pointer path. Carries the values
   * referenced by `{ path }` content props so export∘import round-trips exactly.
   */
  dataModel?: Record<string, unknown>;
}

export interface FlowGraph {
  // screen-to-screen navigation (app-level routing; see ARCHITECTURE §8)
  nodes: Array<{ id: SurfaceId; position: { x: number; y: number } }>;
  edges: Array<{
    id: string;
    source: SurfaceId;
    target: SurfaceId;
    trigger?: string;
  }>;
}

export interface EditorDocument {
  surfaces: Record<SurfaceId, Surface>;
  flow: FlowGraph;
  entrySurfaceId: SurfaceId;
}
