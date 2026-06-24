/**
 * Inspector (ARCHITECTURE §7.3). Renders controls from the selected node's
 * PropDescriptor[] — fully schema-derived. Edits flow through `updateProp`, so the
 * canvas updates live. Slot children are managed on the canvas, not here.
 */
import { catalog, useComposer, useSelectedNode } from "../store";
import { PropField } from "./fields";

export function Inspector() {
  const node = useSelectedNode();
  const updateProp = useComposer((s) => s.updateProp);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-chrome-border px-3 py-2 text-xs font-semibold uppercase tracking-wide text-chrome-muted">
        Inspector
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {!node ? (
          <p className="text-xs text-chrome-muted">Select a node on the canvas.</p>
        ) : (
          <div className="space-y-3">
            <div>
              <div className="text-sm font-semibold text-chrome-text">{node.type}</div>
              <div className="text-[11px] text-chrome-muted">
                {catalog.components[node.type]?.description}
              </div>
              {catalog.components[node.type]?.isSlotContainer && (
                <div className="mt-1 text-[10px] text-chrome-accent">
                  Slot container — add children from the palette on the canvas.
                </div>
              )}
            </div>

            <div className="space-y-3">
              {(catalog.components[node.type]?.props ?? []).map((descriptor) => (
                <PropField
                  key={descriptor.name}
                  descriptor={descriptor}
                  value={node.props[descriptor.name]}
                  onChange={(value) => updateProp(node.id, descriptor.name, value)}
                />
              ))}
              {catalog.components[node.type]?.props.length === 0 && (
                <p className="text-xs text-chrome-muted">No editable props.</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
