/** Inspector placeholder — schema-derived controls land in M4. */
import { catalog, useSelectedNode } from "../store";

export function Inspector() {
  const node = useSelectedNode();
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-chrome-border px-3 py-2 text-xs font-semibold uppercase tracking-wide text-chrome-muted">
        Inspector
      </div>
      <div className="flex-1 overflow-y-auto p-3 text-xs">
        {!node ? (
          <p className="text-chrome-muted">Select a node on the canvas.</p>
        ) : (
          <div className="space-y-2">
            <div className="font-semibold">{node.type}</div>
            <div className="text-chrome-muted">{catalog.components[node.type]?.description}</div>
            <pre className="overflow-x-auto rounded bg-black/30 p-2 text-[10px] leading-relaxed">
              {JSON.stringify(node.props, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
