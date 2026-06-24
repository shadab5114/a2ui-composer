/**
 * Page canvas (ARCHITECTURE §7.3). The active surface renders inside a
 * react-zoom-pan-pinch viewport via the SHARED renderer (`A2UISurface`), with an
 * `EditorNode` wrapper around every node for selection + dnd. Composition is flex
 * auto-layout (the Frame primitive) — never absolute x/y.
 */
import { type ReactNode } from "react";
import { TransformComponent, TransformWrapper } from "react-zoom-pan-pinch";
import { A2UISurface } from "@pds/a2ui-react";
import type { DocNode } from "@pds/a2ui-schema";
import { useActiveSurface, useComposer } from "../store";
import { EditorNode } from "./EditorNode";

const wrapNode = (node: DocNode, element: ReactNode): ReactNode => (
  <EditorNode node={node}>{element}</EditorNode>
);

export function PageCanvas() {
  const surface = useActiveSurface();
  const setSelection = useComposer((s) => s.setSelection);
  if (!surface) return null;

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#15151a]">
      <TransformWrapper
        minScale={0.25}
        maxScale={2.5}
        initialScale={1}
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
            className="flex min-h-full w-full items-start justify-center p-16"
            onClick={() => setSelection(null)}
          >
            {/* The screen frame: a light surface the DS components render onto. */}
            <div
              data-screen-frame
              style={{
                width: 420,
                minHeight: 600,
                background: "#ffffff",
                borderRadius: 16,
                boxShadow: "0 8px 40px rgba(0,0,0,0.4)",
                padding: 16,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <A2UISurface surface={surface} wrapNode={wrapNode} />
            </div>
          </div>
        </TransformComponent>
      </TransformWrapper>

      <div className="pointer-events-none absolute bottom-2 left-2 rounded bg-black/40 px-2 py-1 text-[10px] text-chrome-muted">
        {surface.name} · scroll to zoom · drag empty space to pan
      </div>
    </div>
  );
}
