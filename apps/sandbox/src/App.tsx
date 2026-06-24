/**
 * Sandbox (ARCHITECTURE §7.5) — the fidelity proof. Paste/load an A2UIExport,
 * import() it to a Surface, and render with <A2UISurface> from the SHARED renderer.
 * Because it uses the same renderer as the composer preview, output matches.
 */
import { useMemo, useState } from "react";
import { importSurface, type A2UIExport, type Surface } from "@pds/a2ui-schema";
import { A2UISurface } from "@pds/a2ui-react";

const EXAMPLE: A2UIExport = {
  surfaceUpdate: {
    surfaceId: "screen-home",
    catalogId: "https://pdesign.dev/catalog/v1/catalog.json",
    root: "root",
    components: [
      { id: "root", component: "Column", children: ["lockup", "btn"], gap: "4X", padding: "4X" },
      {
        id: "lockup",
        component: "TitleLockup",
        title: { children: { literalString: "Welcome back" }, size: "titleLarge" },
        subtitle: { children: { literalString: "Pick up where you left off." } },
      },
      { id: "btn", component: "Button", children: { literalString: "Continue" }, kind: "primary", size: "large" },
    ],
  },
};

export function App() {
  const [text, setText] = useState(JSON.stringify(EXAMPLE, null, 2));
  const [loaded, setLoaded] = useState<A2UIExport>(EXAMPLE);
  const [error, setError] = useState<string | null>(null);

  const surface: Surface | null = useMemo(() => {
    try {
      return importSurface(loaded);
    } catch {
      return null;
    }
  }, [loaded]);

  const render = () => {
    try {
      const parsed = JSON.parse(text) as A2UIExport;
      if (!parsed.surfaceUpdate?.root) throw new Error("missing surfaceUpdate.root");
      setLoaded(parsed);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const onFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => setText(String(reader.result));
    reader.readAsText(file);
  };

  return (
    <div style={{ display: "flex", height: "100%", fontFamily: "system-ui" }}>
      <div
        style={{
          width: 420,
          display: "flex",
          flexDirection: "column",
          borderRight: "1px solid #ddd",
          background: "#fafafa",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderBottom: "1px solid #eee" }}>
          <strong style={{ fontSize: 13 }}>A2UI Sandbox</strong>
          <button onClick={render} style={btn}>Render</button>
          <label style={{ ...btn, cursor: "pointer" }}>
            Load file
            <input
              type="file"
              accept="application/json,.json"
              style={{ display: "none" }}
              onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
            />
          </label>
        </div>
        {error && <div style={{ color: "#c0392b", fontSize: 12, padding: "6px 12px" }}>Error: {error}</div>}
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
          style={{
            flex: 1,
            border: "none",
            outline: "none",
            resize: "none",
            padding: 12,
            font: "12px ui-monospace, monospace",
            background: "#fff",
          }}
        />
      </div>

      <div style={{ flex: 1, overflow: "auto", display: "flex", justifyContent: "center", padding: 48, background: "#eef0f3" }}>
        <div style={{ width: 420, height: "fit-content", background: "#fff", borderRadius: 16, boxShadow: "0 8px 40px rgba(0,0,0,0.15)", padding: 16 }}>
          {surface ? (
            <A2UISurface surface={surface} />
          ) : (
            <p style={{ color: "#888" }}>Could not import the surface.</p>
          )}
        </div>
      </div>
    </div>
  );
}

const btn: React.CSSProperties = {
  fontSize: 12,
  padding: "4px 10px",
  borderRadius: 6,
  border: "1px solid #ccc",
  background: "#fff",
};
