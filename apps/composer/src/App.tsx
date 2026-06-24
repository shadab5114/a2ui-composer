/**
 * Composer shell. Built out across milestones M3–M6.
 * For now (M0) this is the three-pane skeleton so `bun run dev` shows something.
 */
export function App() {
  return (
    <div className="flex h-full w-full flex-col">
      <header className="flex h-10 items-center gap-2 border-b border-chrome-border bg-chrome-panel px-3 text-sm">
        <span className="font-semibold">PDS → A2UI Composer</span>
        <span className="text-chrome-muted">scaffold</span>
      </header>
      <div className="flex min-h-0 flex-1">
        <aside className="w-56 border-r border-chrome-border bg-chrome-panel p-2 text-xs text-chrome-muted">
          Palette
        </aside>
        <main className="min-w-0 flex-1 bg-chrome-bg" />
        <aside className="w-72 border-l border-chrome-border bg-chrome-panel p-2 text-xs text-chrome-muted">
          Inspector
        </aside>
      </div>
    </div>
  );
}
