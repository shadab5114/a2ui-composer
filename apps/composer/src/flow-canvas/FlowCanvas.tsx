/**
 * Flow canvas (ARCHITECTURE §7.4) — screens as nodes, navigation as edges, with
 * React Flow v12 (@xyflow/react). The store is the source of truth: positions and
 * edges persist back through store actions. Double-click a screen to edit it in the
 * page canvas. Screen drags are excluded from undo history via the temporal store.
 */
import { useCallback, useMemo } from "react";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
  type EdgeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Plus } from "lucide-react";
import { useComposer } from "../store";
import { ScreenNode } from "./ScreenNode";

const nodeTypes = { screen: ScreenNode };

export function FlowCanvas({ onEditScreen }: { onEditScreen: () => void }) {
  const flowNodes = useComposer((s) => s.doc.flow.nodes);
  const flowEdges = useComposer((s) => s.doc.flow.edges);
  const surfaces = useComposer((s) => s.doc.surfaces);
  const addSurface = useComposer((s) => s.addSurface);
  const connectSurfaces = useComposer((s) => s.connectSurfaces);
  const removeEdge = useComposer((s) => s.removeEdge);
  const setSurfacePosition = useComposer((s) => s.setSurfacePosition);
  const setActiveSurface = useComposer((s) => s.setActiveSurface);

  const nodes: Node[] = useMemo(
    () =>
      flowNodes.map((n) => ({
        id: n.id,
        type: "screen",
        position: n.position,
        data: { name: surfaces[n.id]?.name },
      })),
    [flowNodes, surfaces],
  );

  const edges: Edge[] = useMemo(
    () =>
      flowEdges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        label: e.trigger,
        animated: true,
      })),
    [flowEdges],
  );

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      for (const c of changes) {
        if (c.type === "position" && c.position) setSurfacePosition(c.id, c.position);
      }
    },
    [setSurfacePosition],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      for (const c of changes) if (c.type === "remove") removeEdge(c.id);
    },
    [removeEdge],
  );

  const onConnect = useCallback(
    (c: Connection) => {
      if (c.source && c.target) connectSurfaces(c.source, c.target);
    },
    [connectSurfaces],
  );

  const pauseUndo = () => useComposer.temporal.getState().pause();
  const resumeUndo = () => useComposer.temporal.getState().resume();

  return (
    <div className="relative h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeDragStart={pauseUndo}
        onNodeDragStop={resumeUndo}
        onNodeDoubleClick={(_, node) => {
          setActiveSurface(node.id);
          onEditScreen();
        }}
        fitView
        colorMode="dark"
        proOptions={{ hideAttribution: true }}
      >
        <Background />
        <Controls />
        <MiniMap pannable zoomable />
      </ReactFlow>

      <button
        onClick={() => addSurface()}
        className="absolute left-3 top-3 z-10 flex items-center gap-1 rounded bg-chrome-accent px-3 py-1.5 text-xs font-medium text-white shadow hover:brightness-110"
      >
        <Plus size={14} /> Add screen
      </button>
    </div>
  );
}
