/**
 * Layer tree panel (Figma-style). Shows the full node hierarchy of the active
 * surface. Click any row to select that node and open its props in the Inspector.
 */
import { useEffect, useRef, useState } from "react";
import {
  AlignLeft,
  Box,
  ChevronDown,
  ChevronRight,
  Grid2X2,
  Image,
  LayoutList,
  Layers,
  Link,
  List,
  MessageCircle,
  MousePointerClick,
  PanelTop,
  Square,
  Tag,
  Type,
} from "lucide-react";
import type { NodeId } from "@pds/a2ui-schema";
import { SLOT_TYPE } from "@pds/a2ui-schema";
import { useActiveSurface, useComposer } from "../store";

// ── icon map ────────────────────────────────────────────────────────────────

function iconFor(type: string) {
  switch (type) {
    case SLOT_TYPE:            return PanelTop;
    case "Frame":              return Layers;
    case "Button":             return MousePointerClick;
    case "ButtonGroup":        return LayoutList;
    case "IconButton":         return Square;
    case "Text":               return Type;
    case "TextLink":
    case "TextLinkCaret":      return Link;
    case "TitleLockup":
    case "TitleLockupTitle":
    case "TitleLockupSubtitle":
    case "TitleLockupEyebrow": return AlignLeft;
    case "Accordion":
    case "AccordionItem":      return List;
    case "Tilelet":            return Grid2X2;
    case "TileContainer":      return Square;
    case "Image":              return Image;
    case "Badge":
    case "BadgeIndicator":     return Tag;
    case "Tooltip":            return MessageCircle;
    default:                   return Box;
  }
}

// ── single tree row ──────────────────────────────────────────────────────────

interface RowProps {
  nodeId: NodeId;
  depth: number;
  isSelected: boolean;
  hasChildren: boolean;
  expanded: boolean;
  type: string;
  label: string;
  isSlot: boolean;
  onSelect: () => void;
  onToggle: () => void;
}

function TreeRow({ nodeId, depth, isSelected, hasChildren, expanded, type, label, isSlot, onSelect, onToggle }: RowProps) {
  const Icon = iconFor(type);
  const ref = useRef<HTMLDivElement>(null);

  // Scroll into view when this row becomes selected.
  useEffect(() => {
    if (isSelected) ref.current?.scrollIntoView({ block: "nearest" });
  }, [isSelected]);

  return (
    <div
      ref={ref}
      className={`group flex cursor-pointer items-center gap-1 py-0.5 pr-2 text-[11px] ${
        isSelected ? "bg-chrome-accent/20 text-chrome-text" : "text-chrome-muted hover:bg-chrome-border hover:text-chrome-text"
      }`}
      style={{ paddingLeft: depth * 14 + 6 }}
      onClick={onSelect}
    >
      {/* expand/collapse chevron */}
      <span
        className="flex h-4 w-4 shrink-0 items-center justify-center"
        onClick={(e) => { e.stopPropagation(); if (hasChildren) onToggle(); }}
      >
        {hasChildren ? (
          expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />
        ) : (
          <span className="w-2 border-t border-chrome-border" />
        )}
      </span>

      {/* type icon */}
      <Icon
        size={12}
        className={`shrink-0 ${isSelected ? "text-chrome-accent" : "text-chrome-muted group-hover:text-chrome-text"}`}
      />

      {/* node label (slot name for slot wrappers, else the component type) */}
      <span className="truncate font-medium">{label}</span>
      {isSlot && (
        <span className="shrink-0 rounded bg-chrome-accent/15 px-1 text-[8px] uppercase tracking-wide text-chrome-accent">
          slot
        </span>
      )}

      {/* faint id */}
      <span className="ml-auto shrink-0 font-mono text-[9px] opacity-40">{nodeId.slice(0, 6)}</span>
    </div>
  );
}

// ── recursive tree ────────────────────────────────────────────────────────────

function TreeNodes({
  nodeId,
  depth,
  nodes,
  selectedId,
  expanded,
  onSelect,
  onToggle,
}: {
  nodeId: NodeId;
  depth: number;
  nodes: Record<NodeId, { type: string; children?: NodeId[]; editorMeta?: { slotOf?: string } }>;
  selectedId: NodeId | undefined;
  expanded: Set<NodeId>;
  onSelect: (id: NodeId) => void;
  onToggle: (id: NodeId) => void;
}) {
  const node = nodes[nodeId];
  if (!node) return null;
  const hasChildren = !!(node.children?.length);
  const isExpanded = expanded.has(nodeId);
  const slotOf = node.editorMeta?.slotOf;
  const isSlot = node.type === SLOT_TYPE;

  return (
    <>
      <TreeRow
        nodeId={nodeId}
        depth={depth}
        isSelected={selectedId === nodeId}
        hasChildren={hasChildren}
        expanded={isExpanded}
        type={node.type}
        label={slotOf ?? node.type}
        isSlot={isSlot}
        onSelect={() => onSelect(nodeId)}
        onToggle={() => onToggle(nodeId)}
      />
      {hasChildren && isExpanded &&
        node.children!.map((childId) => (
          <TreeNodes
            key={childId}
            nodeId={childId}
            depth={depth + 1}
            nodes={nodes}
            selectedId={selectedId}
            expanded={expanded}
            onSelect={onSelect}
            onToggle={onToggle}
          />
        ))}
    </>
  );
}

// ── panel ─────────────────────────────────────────────────────────────────────

export function TreePanel() {
  const surface = useActiveSurface();
  const selection = useComposer((s) => s.selection);
  const setSelection = useComposer((s) => s.setSelection);
  const activeSurfaceId = useComposer((s) => s.activeSurfaceId);

  // All nodes start expanded.
  const [expanded, setExpanded] = useState<Set<NodeId>>(new Set());
  const prevSurfaceId = useRef<string | null>(null);

  // Re-expand everything when the surface changes.
  useEffect(() => {
    if (!surface || surface.id === prevSurfaceId.current) return;
    prevSurfaceId.current = surface.id;
    setExpanded(new Set(Object.keys(surface.nodes) as NodeId[]));
  }, [surface]);

  // Also expand any node that gets added.
  useEffect(() => {
    if (!surface) return;
    setExpanded((prev) => {
      const next = new Set(prev);
      for (const id of Object.keys(surface.nodes) as NodeId[]) next.add(id);
      return next;
    });
  }, [surface?.nodes]);

  if (!surface) return null;

  const onSelect = (nodeId: NodeId) =>
    setSelection({ surfaceId: activeSurfaceId, nodeId });

  const onToggle = (nodeId: NodeId) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId); else next.add(nodeId);
      return next;
    });

  return (
    <div className="flex h-full flex-col border-t border-chrome-border bg-chrome-panel">
      {/* header */}
      <div className="flex items-center gap-2 border-b border-chrome-border px-3 py-1.5">
        <Layers size={13} className="text-chrome-muted" />
        <span className="text-xs font-semibold uppercase tracking-wide text-chrome-muted">
          Layers · {surface.name}
        </span>
        <button
          onClick={() => setExpanded(new Set(Object.keys(surface.nodes) as NodeId[]))}
          className="ml-auto text-[10px] text-chrome-muted hover:text-chrome-text"
          title="Expand all"
        >
          Expand all
        </button>
      </div>

      {/* tree */}
      <div className="flex-1 overflow-y-auto py-1 select-none">
        <TreeNodes
          nodeId={surface.root}
          depth={0}
          nodes={surface.nodes}
          selectedId={selection?.nodeId}
          expanded={expanded}
          onSelect={onSelect}
          onToggle={onToggle}
        />
      </div>
    </div>
  );
}
