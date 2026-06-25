/**
 * Import dialog — paste real JSX/TSX, preview it with the shared renderer, then
 * commit it as a new screen. Parsing/mapping lives entirely in the pure
 * `importCode` transform ([packages/schema/src/import-code.ts]); this component is
 * just chrome around it, so the preview is the exact same render path as the canvas.
 */
import { useMemo, useState } from "react";
import { AlertTriangle, ClipboardPaste, FileCode2, X } from "lucide-react";
import {
  ImportError,
  importCode,
  type ImportResult,
} from "@pds/a2ui-schema";
import { A2UISurface } from "@pds/a2ui-react";
import { catalog, useComposer } from "../store";

const EXAMPLE = `<TileContainer surface="lightPrimary" padding="4X" borderRadius="standard" showBorder>
  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
    <Badge backgroundColor="red">New</Badge>
    <TitleLockup
      eyebrow={{ children: 'Today only' }}
      title={{ bold: true, children: 'iPhone 16, now in black.', size: 'title2XSmall' }}
      subtitle={{ children: 'Just $10/mo with select plans.' }}
    />
    <ButtonGroup
      alignment="left"
      items={[
        { children: 'Shop now', kind: 'primary' },
        { children: 'Learn more', kind: 'secondary' },
      ]}
    />
  </div>
</TileContainer>`;

interface Parsed {
  result?: ImportResult;
  error?: string;
}

export function ImportDialog({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const [code, setCode] = useState("");
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const addSurfaceFromImport = useComposer((s) => s.addSurfaceFromImport);

  const parse = () => {
    try {
      setParsed({ result: importCode(code, catalog) });
    } catch (err) {
      setParsed({ error: err instanceof ImportError ? err.message : String(err) });
    }
  };

  const commit = () => {
    if (!parsed?.result) return;
    addSurfaceFromImport(parsed.result.surface);
    onImported();
    onClose();
  };

  const warnings = parsed?.result?.warnings ?? [];
  const nodeCount = useMemo(
    () => (parsed?.result ? Object.keys(parsed.result.surface.nodes).length : 0),
    [parsed],
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6">
      <div className="flex h-full max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-chrome-border bg-chrome-panel shadow-2xl">
        {/* Header */}
        <div className="flex items-center gap-2 border-b border-chrome-border px-4 py-2.5">
          <FileCode2 size={16} className="text-chrome-accent" />
          <span className="text-sm font-semibold">Import code → A2UI</span>
          <span className="text-xs text-chrome-muted">Paste JSX/TSX using design-system components.</span>
          <button onClick={onClose} className="ml-auto rounded p-1 hover:bg-chrome-border" title="Close">
            <X size={16} />
          </button>
        </div>

        {/* Body: editor + preview */}
        <div className="grid min-h-0 flex-1 grid-cols-2 divide-x divide-chrome-border">
          {/* Editor */}
          <div className="flex min-h-0 flex-col">
            <div className="flex items-center gap-2 px-3 py-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-chrome-muted">Source</span>
              <button
                onClick={() => setCode(EXAMPLE)}
                className="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-chrome-muted hover:bg-chrome-border"
              >
                <ClipboardPaste size={12} /> Use example
              </button>
            </div>
            <textarea
              value={code}
              onChange={(e) => setCode(e.target.value)}
              spellCheck={false}
              placeholder="Paste your component code here…"
              className="min-h-0 flex-1 resize-none bg-chrome-bg px-3 py-2 font-mono text-[12px] leading-relaxed text-chrome-text outline-none"
            />
          </div>

          {/* Preview / warnings */}
          <div className="flex min-h-0 flex-col">
            <div className="flex items-center gap-2 px-3 py-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-chrome-muted">Preview</span>
              {parsed?.result && (
                <span className="text-[11px] text-chrome-muted">
                  {nodeCount} component(s){warnings.length ? ` · ${warnings.length} warning(s)` : ""}
                </span>
              )}
            </div>

            {parsed?.error ? (
              <div className="m-3 rounded border border-red-500/30 bg-red-500/10 p-3 text-[12px] text-red-300">
                {parsed.error}
              </div>
            ) : parsed?.result ? (
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="min-h-0 flex-1 overflow-auto bg-white p-4">
                  <A2UISurface surface={parsed.result.surface} />
                </div>
                {warnings.length > 0 && (
                  <ul className="max-h-40 shrink-0 overflow-y-auto border-t border-chrome-border bg-amber-500/5 px-3 py-2 text-[11px]">
                    {warnings.map((w, i) => (
                      <li key={i} className="flex gap-1.5 py-0.5 text-amber-300/90">
                        <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                        <span>
                          {w.context && <span className="font-mono text-amber-200">{w.context}</span>}{" "}
                          {w.message}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <div className="flex flex-1 items-center justify-center p-6 text-center text-[12px] text-chrome-muted">
                Paste code and run “Parse &amp; preview” to see it rendered here.
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 border-t border-chrome-border px-4 py-2.5">
          <button
            onClick={parse}
            disabled={!code.trim()}
            className="rounded bg-chrome-border px-3 py-1.5 text-xs font-medium hover:bg-chrome-accent/40 disabled:opacity-40"
          >
            Parse &amp; preview
          </button>
          <button
            onClick={commit}
            disabled={!parsed?.result}
            className="ml-auto rounded bg-chrome-accent px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-40"
          >
            Add as screen
          </button>
          <button onClick={onClose} className="rounded px-3 py-1.5 text-xs hover:bg-chrome-border">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
