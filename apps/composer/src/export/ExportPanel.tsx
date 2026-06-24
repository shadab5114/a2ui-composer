/**
 * Export panel (ARCHITECTURE §7.3). Live A2UI JSON for the active surface, a Copy
 * and Download button, and a validation strip driven by the design system's Zod
 * schemas (green/red + error list).
 */
import { useMemo } from "react";
import { Check, ClipboardCopy, Download, X } from "lucide-react";
import { buildValidators, exportSurface, getCatalog, validate } from "@pds/a2ui-schema";
import { useActiveSurface } from "../store";

const catalogId = getCatalog().catalogId;
const validators = buildValidators();

export function ExportPanel({ onClose }: { onClose: () => void }) {
  const surface = useActiveSurface();

  const { json, result } = useMemo(() => {
    if (!surface) return { json: "", result: null };
    const a2ui = exportSurface(surface, catalogId);
    return { json: JSON.stringify(a2ui, null, 2), result: validate(a2ui, validators) };
  }, [surface]);

  const download = () => {
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `surface-${surface?.id ?? "export"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex h-full flex-col border-t border-chrome-border bg-chrome-panel">
      <div className="flex items-center gap-2 border-b border-chrome-border px-3 py-1.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-chrome-muted">
          A2UI Export · {surface?.name}
        </span>

        {result && (
          <span
            className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
              result.ok ? "bg-green-500/15 text-green-400" : "bg-red-500/15 text-red-400"
            }`}
          >
            {result.ok ? <Check size={11} /> : <X size={11} />}
            {result.ok ? "Valid" : `${result.errors.length} error(s)`}
          </span>
        )}

        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => navigator.clipboard?.writeText(json)}
            className="flex items-center gap-1 rounded px-2 py-1 text-xs hover:bg-chrome-border"
          >
            <ClipboardCopy size={13} /> Copy
          </button>
          <button
            onClick={download}
            className="flex items-center gap-1 rounded px-2 py-1 text-xs hover:bg-chrome-border"
          >
            <Download size={13} /> Download
          </button>
          <button onClick={onClose} className="rounded p-1 hover:bg-chrome-border" title="Close">
            <X size={14} />
          </button>
        </div>
      </div>

      {result && !result.ok && (
        <ul className="max-h-24 overflow-y-auto border-b border-chrome-border bg-red-500/5 px-3 py-1.5 text-[11px] text-red-300">
          {result.errors.map((e, i) => (
            <li key={i}>
              <span className="text-red-400">{e.component}</span>
              <span className="text-chrome-muted"> #{e.componentId}</span> — {e.message}
            </li>
          ))}
        </ul>
      )}

      <pre className="flex-1 overflow-auto p-3 text-[11px] leading-relaxed text-chrome-text">
        {json}
      </pre>
    </div>
  );
}
