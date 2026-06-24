/**
 * Custom React Flow node for a Surface (ARCHITECTURE §7.4): screen name + a small
 * live, read-only thumbnail rendered with the SHARED renderer at scale. Handles on
 * left/right let edges (navigation) connect screens.
 */
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { A2UISurface } from "@pds/a2ui-react";
import { useComposer } from "../store";

const THUMB_W = 200;
const THUMB_SCALE = 0.42;

export function ScreenNode({ id, data, selected }: NodeProps) {
  const surface = useComposer((s) => s.doc.surfaces[id]);
  const isEntry = useComposer((s) => s.doc.entrySurfaceId === id);
  const isActive = useComposer((s) => s.activeSurfaceId === id);
  if (!surface) return null;

  return (
    <div
      style={{
        width: THUMB_W,
        borderRadius: 10,
        border: `2px solid ${selected || isActive ? "#5b8cff" : "#36363d"}`,
        background: "#26262b",
        overflow: "hidden",
        boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
      }}
    >
      <Handle type="target" position={Position.Left} style={{ background: "#5b8cff" }} />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "5px 8px",
          fontSize: 11,
          color: "#d6d6da",
          borderBottom: "1px solid #36363d",
        }}
      >
        <span style={{ fontWeight: 600 }}>{String((data as { name?: string }).name ?? surface.name)}</span>
        {isEntry && (
          <span style={{ fontSize: 9, color: "#5b8cff", border: "1px solid #5b8cff", borderRadius: 4, padding: "0 4px" }}>
            entry
          </span>
        )}
        <span style={{ marginLeft: "auto", fontSize: 9, color: "#8b8b93" }}>double-click to edit</span>
      </div>

      {/* Read-only thumbnail. pointer-events:none so it never steals node interactions. */}
      <div style={{ height: 150, overflow: "hidden", background: "#fff", pointerEvents: "none" }}>
        <div
          style={{
            width: THUMB_W / THUMB_SCALE,
            transform: `scale(${THUMB_SCALE})`,
            transformOrigin: "top left",
            padding: 12,
          }}
        >
          <A2UISurface surface={surface} />
        </div>
      </div>

      <Handle type="source" position={Position.Right} style={{ background: "#5b8cff" }} />
    </div>
  );
}
