/**
 * Inspector (ARCHITECTURE §7.3). Renders controls from the selected node's
 * PropDescriptor[] — fully schema-derived. Edits flow through `updateProp`, so the
 * canvas updates live. Slot children are managed on the canvas, not here.
 */
import type { PropDescriptor } from "@pds/a2ui-schema";
import { SLOT_TYPE } from "@pds/a2ui-schema";
import { catalog, useActiveSurface, useComposer, useSelectedNode } from "../store";
import { PropField } from "./fields";

/**
 * A Slot node has no static descriptor list — its editable fields are the scalar
 * fields of the parent component's object-slot prop (e.g. header's padding /
 * backgroundColor). Resolve them from the parent so the inspector stays accurate.
 */
function useSlotFields(nodeId: string | undefined, slotOf: string | undefined): {
  fields: PropDescriptor[];
  label: string;
} {
  const surface = useActiveSurface();
  if (!surface || !nodeId || !slotOf) return { fields: [], label: "slot" };
  const parent = Object.values(surface.nodes).find((n) => n.children?.includes(nodeId));
  const desc = parent
    ? catalog.components[parent.type]?.props.find((p) => p.name === slotOf)
    : undefined;
  return { fields: desc?.fields ?? [], label: `${slotOf} slot` };
}

export function Inspector() {
  const node = useSelectedNode();
  const updateProp = useComposer((s) => s.updateProp);

  const isSlot = node?.type === SLOT_TYPE;
  const slot = useSlotFields(node?.id, node?.editorMeta?.slotOf);
  // Object-slot props (cap/header/footer) are edited as named slot zones on the
  // canvas, not as nested inspector panels — hide them from the component's props.
  const descriptors = isSlot
    ? slot.fields
    : (catalog.components[node?.type ?? ""]?.props ?? []).filter((p) => !p.objectSlot);

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
              <div className="text-sm font-semibold text-chrome-text">
                {isSlot ? slot.label : node.type}
              </div>
              <div className="text-[11px] text-chrome-muted">
                {isSlot
                  ? "Slot content — add, remove, or reorder its children on the canvas."
                  : catalog.components[node.type]?.description}
              </div>
              {!isSlot && catalog.components[node.type]?.isSlotContainer && (
                <div className="mt-1 text-[10px] text-chrome-accent">
                  Slot container — add children from the palette on the canvas.
                </div>
              )}
            </div>

            <div className="space-y-3">
              {descriptors.map((descriptor) => (
                <PropField
                  key={descriptor.name}
                  descriptor={descriptor}
                  value={node.props[descriptor.name]}
                  onChange={(value) => updateProp(node.id, descriptor.name, value)}
                />
              ))}
              {descriptors.length === 0 && (
                <p className="text-xs text-chrome-muted">No editable props.</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
