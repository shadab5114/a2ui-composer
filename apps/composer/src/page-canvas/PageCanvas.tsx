/**
 * Page canvas (ARCHITECTURE §7.3). The active surface renders inside a
 * react-zoom-pan-pinch viewport via the SHARED renderer (`A2UISurface`), with an
 * `EditorNode` wrapper around every node for selection + dnd. Composition is flex
 * auto-layout (the Frame primitive) — never absolute x/y.
 */
import { type ReactNode, useState } from "react";
import { useDndContext } from "@dnd-kit/core";
import { TransformComponent, TransformWrapper } from "react-zoom-pan-pinch";
import { A2UISurface } from "@pds/a2ui-react";
import type { DocNode, NodeId } from "@pds/a2ui-schema";
import { useActiveSurface, useComposer } from "../store";
import { EditorNode } from "./EditorNode";
import { InsertZone } from "./InsertZone";

const PRESETS = [
  { label: "Mobile", w: 390, h: 844 },
  { label: "Tablet", w: 768, h: 1024 },
  { label: "Desktop", w: 1280, h: 800 },
] as const;

type Preset = (typeof PRESETS)[number]["label"] | "Custom";

const wrapNode = (node: DocNode, element: ReactNode): ReactNode => (
  <EditorNode node={node}>{element}</EditorNode>
);

export function PageCanvas() {
  const surface = useActiveSurface();
  const setSelection = useComposer((s) => s.setSelection);
  // Insert zones only render while a drag is active — zero layout impact otherwise.
  const { active: dndActive } = useDndContext();
  const insertZone = dndActive
    ? (parentId: NodeId, index: number, direction: string): ReactNode => (
        <InsertZone key={`iz:${parentId}:${index}`} parentId={parentId} index={index} direction={direction} />
      )
    : undefined;

  const [preset, setPreset] = useState<Preset>("Mobile");
  const [frameW, setFrameW] = useState(390);
  const [frameH, setFrameH] = useState(844);
  const [customW, setCustomW] = useState("390");
  const [customH, setCustomH] = useState("844");

  if (!surface) return null;

  const applyPreset = (p: (typeof PRESETS)[number]) => {
    setPreset(p.label);
    setFrameW(p.w);
    setFrameH(p.h);
    setCustomW(String(p.w));
    setCustomH(String(p.h));
  };

  const applyCustom = () => {
    const w = Math.max(200, Math.min(3840, parseInt(customW, 10) || frameW));
    const h = Math.max(200, Math.min(2160, parseInt(customH, 10) || frameH));
    setFrameW(w);
    setFrameH(h);
    setCustomW(String(w));
    setCustomH(String(h));
    setPreset("Custom");
  };

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#15151a]">
      {/* Frame size toolbar */}
      <div className="absolute left-1/2 top-2 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-lg border border-chrome-border bg-chrome-panel px-2 py-1 shadow-lg">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            onClick={() => applyPreset(p)}
            className={`rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
              preset === p.label
                ? "bg-chrome-accent text-white"
                : "text-chrome-muted hover:bg-chrome-border hover:text-chrome-text"
            }`}
          >
            {p.label}
          </button>
        ))}

        <span className="mx-1 h-3.5 w-px bg-chrome-border" />

        {/* Custom size inputs */}
        <div className="flex items-center gap-1 text-[11px] text-chrome-muted">
          <input
            type="number"
            value={customW}
            onChange={(e) => { setCustomW(e.target.value); setPreset("Custom"); }}
            onBlur={applyCustom}
            onKeyDown={(e) => e.key === "Enter" && applyCustom()}
            className="w-14 rounded border border-chrome-border bg-chrome-bg px-1 py-0.5 text-center text-[11px] text-chrome-text focus:outline-none focus:ring-1 focus:ring-chrome-accent"
            min={200}
            max={3840}
          />
          <span>×</span>
          <input
            type="number"
            value={customH}
            onChange={(e) => { setCustomH(e.target.value); setPreset("Custom"); }}
            onBlur={applyCustom}
            onKeyDown={(e) => e.key === "Enter" && applyCustom()}
            className="w-14 rounded border border-chrome-border bg-chrome-bg px-1 py-0.5 text-center text-[11px] text-chrome-text focus:outline-none focus:ring-1 focus:ring-chrome-accent"
            min={200}
            max={2160}
          />
        </div>
      </div>

      <TransformWrapper
        minScale={0.1}
        maxScale={3}
        initialScale={preset === "Desktop" ? 0.55 : 1}
        key={`${frameW}x${frameH}`}
        centerOnInit
        limitToBounds={false}
        doubleClick={{ disabled: true }}
        panning={{ excluded: ["button", "input", "textarea", "select"] }}
        wheel={{ step: 0.08 }}
      >
        <TransformComponent
          wrapperStyle={{ width: "100%", height: "100%" }}
          contentStyle={{ width: "100%", height: "100%" }}
        >
          <div
            className="flex min-h-full w-full items-start justify-center p-20 pt-16"
            onClick={() => setSelection(null)}
          >
            {/* The screen frame: a light surface the DS components render onto.
                No padding — Box provides its own. Flex-column so the root Box
                can stretch to fill the full frame height via flex:1. */}
            <div
              data-screen-frame
              style={{
                width: frameW,
                height: frameH,
                background: "#ffffff",
                borderRadius: preset === "Desktop" ? 8 : 16,
                boxShadow: "0 8px 40px rgba(0,0,0,0.4)",
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
                flexShrink: 0,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* flex:1 wrapper lets the root EditorNode (also flex:1) fill the frame */}
              <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "auto" }}>
                <A2UISurface surface={surface} wrapNode={wrapNode} insertZone={insertZone} />
              </div>
            </div>
          </div>
        </TransformComponent>
      </TransformWrapper>

      <div className="pointer-events-none absolute bottom-2 left-2 rounded bg-black/40 px-2 py-1 text-[10px] text-chrome-muted">
        {surface.name} · {frameW} × {frameH}px · scroll to zoom · drag to pan
      </div>
    </div>
  );
}
