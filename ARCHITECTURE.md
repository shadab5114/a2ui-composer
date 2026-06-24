# PDS → A2UI Composer — Architecture & Build Spec

> Drop this file at the repo root and point Claude Code at it. It is both the
> architecture document and the agent kickoff brief. Read it top to bottom
> before writing code. Build in the milestone order in §10.

---

## 1. What we are building

A visual, WYSIWYG authoring tool for **A2UI** UI flows, built on top of an existing
design system (`@pds/core`) and its A2UI catalog (`catalog.json`).

A designer/PM drags real, coded design-system components onto a canvas, arranges
and configures them, defines multiple screens and the navigation between them, and
**exports A2UI JSON**. The same JSON renders identically across web (now), mobile,
and chat/assisted surfaces (later), because every renderer maps the abstract A2UI
component tree to a native component set.

This MVP replaces hand-writing A2UI adjacency-list JSON, which is the current
bottleneck for the team.

### The core insight that drives the whole architecture

There is **one recursive interpreter** — a map from A2UI component `type` → real
React component (the "registry") — and it is reused in three places:

1. the composer's **live canvas preview**,
2. the standalone **validation sandbox**,
3. (later) the **production web renderer**.

Because all three import the *same* renderer package, "exported JSON renders
identically to the canvas" is true by construction, not by effort. Protect this
seam. Never fork the rendering logic.

---

## 2. MVP scope (build exactly this — no more)

**In scope**

- One design system catalog (`@pds/core`, provided as `catalog.json`).
- **Page canvas**: auto-layout (flex) composition of components within a screen,
  with pan/zoom, drag-and-drop from a palette, selection overlay, reordering,
  delete, and a layout-primitive container (`Frame` → A2UI `Column`/`Row`).
- **Schema-derived Inspector**: every editable control is generated from the
  catalog's JSON Schema — no hand-written forms.
- **Flow canvas**: multiple screens (surfaces) as nodes, navigation between them
  as edges. Double-clicking a screen opens it in the page canvas.
- **Export**: produce A2UI `surfaceUpdate` (flat adjacency list) + `dataModelUpdate`
  per screen, validated against the catalog schema with Ajv.
- **Validation sandbox**: a separate tiny app that takes exported JSON and renders
  it with the shared renderer, proving fidelity.
- Web only. Local state only (no backend, no auth, no DB).

**Out of scope for MVP** (design for them, do not build them)

- Mobile / chat renderers (the registry abstraction makes them additive later).
- Real-time multiplayer (the store design leaves room for Yjs later).
- Server-side persistence, versioning, design-token theming UI.
- Authentication.
- **Automated testing** (unit / e2e). No Vitest or Playwright for the MVP.
  Correctness is verified by the per-milestone acceptance checks and a small
  dev-time round-trip guard (§7.1). Add a test suite post-MVP — the pure `schema`
  package is written to be testable later without refactoring.

---

## 3. Tech stack (use these exact choices)

| Concern | Choice | Package | Notes |
|---|---|---|---|
| Language | TypeScript (strict) | — | `strict: true`, no `any` in committed code |
| Toolchain | Bun | `bun` | Install, run scripts, build, and run TS directly. Replaces pnpm/npm |
| App bundler | Vite | `vite`, `@vitejs/plugin-react` | Invoked via `bun run`; one app = composer, one = sandbox |
| UI runtime | React 18 | `react`, `react-dom` | Function components + hooks only |
| Monorepo | Bun workspaces | (built into `bun`) | `workspaces` in root `package.json`; `bun install` once; `bun run --filter` per package |
| State | Zustand + Immer | `zustand`, `immer` | One document store; Immer for tree edits |
| Undo / redo | zundo | `zundo` | Temporal middleware over the Zustand store |
| **Flow canvas** | **React Flow v12** | `@xyflow/react` | Screens-as-nodes graph. NOT the old `reactflow` pkg |
| Page canvas pan/zoom | react-zoom-pan-pinch | `react-zoom-pan-pinch` | Infinite-canvas viewport for the page editor |
| Drag & drop / reorder | dnd-kit | `@dnd-kit/core`, `@dnd-kit/sortable` | Palette→canvas drop + in-container reorder |
| Resize handles (optional) | react-moveable | `react-moveable` | Only for fixed-size frames; auto-layout sizing is token-based |
| Schema validation | Ajv | `ajv`, `ajv-formats` | Validate export against `catalog.json` |
| IDs | nanoid | `nanoid` | Short, collision-resistant node ids |
| Tool-chrome styling | Tailwind | `tailwindcss` | For the composer UI only — NOT for rendered DS components |
| Tool-chrome icons | lucide-react | `lucide-react` | Palette/inspector icons |
| Design system | `@pds/core` | (internal) | The real rendered components |
| Design tokens | CSS variables file | (internal) | Imported globally; DS components consume them |

> Install the latest stable of each at scaffold time; the table fixes the
> *package identity*, not exact versions. Confirm `@xyflow/react` (v12+), not
> `reactflow` (legacy v11).
>
> **All tooling is Bun.** Use `bun install` (not npm/pnpm), `bun add <pkg>` to add
> deps, `bun run <script>` for scripts, `bunx <tool>` instead of `npx`, and
> `bun run --filter <pkg> <script>` to target a workspace. Bun runs TypeScript
> directly, so dev utilities (e.g. the round-trip guard) need no build step.

### Why two canvases

- **Flow canvas = React Flow.** A flow of screens is literally a node graph:
  nodes = screens, edges = navigation/transitions. React Flow gives pan/zoom,
  multi-select, custom nodes, minimap, and edge routing out of the box. Do not
  reinvent this.
- **Page canvas = DOM + flex auto-layout (not React Flow, not `<canvas>`).**
  Composition inside a screen is a *layout* problem (flex/grid), and the elements
  are real DOM React components we want to render live. React Flow's absolute
  node positioning is wrong for this; a 2D drawing `<canvas>` can't host React
  components. So: render the component tree as real DOM inside a
  `react-zoom-pan-pinch` viewport, drive structure with flexbox, handle drag with
  dnd-kit, and draw the selection overlay from measured DOM rects.

The two canvases share the document store; the flow canvas owns *which screens
exist and how they connect*, the page canvas owns *what is inside one screen*.

---

## 4. Repository layout (monorepo)

```
pds-a2ui-composer/
├─ package.json               root: { "workspaces": ["packages/*","apps/*"], scripts }
├─ bunfig.toml                Bun config (optional)
├─ bun.lock                   lockfile (committed)
├─ tsconfig.base.json
├─ ARCHITECTURE.md            ← this file
├─ CLAUDE.md                  ← agent working notes (see §12)
├─ packages/
│  ├─ schema/                 @pds/a2ui-schema  (pure, no React)
│  │  ├─ src/
│  │  │  ├─ a2ui.types.ts     A2UI wire types (surfaceUpdate, components, dataModel)
│  │  │  ├─ doc.types.ts      Editor document model (superset of A2UI)
│  │  │  ├─ catalog.ts        Load catalog.json, derive prop descriptors + slot info
│  │  │  ├─ transform.ts      tree(editor) ⇆ adjacency(A2UI): export() / import()
│  │  │  ├─ validate.ts       Ajv validators built from catalog.json
│  │  │  └─ index.ts
│  │  └─ dev/                 roundtrip-guard.ts (dev-time correctness check)
│  ├─ renderer/               @pds/a2ui-react   (the shared interpreter)
│  │  ├─ src/
│  │  │  ├─ registry.ts       type → React component map (the seam)
│  │  │  ├─ Renderer.tsx      recursive render(node) interpreter
│  │  │  ├─ standins/         placeholder components (until @pds/core is wired)
│  │  │  └─ index.ts
│  │  └─ ...
│  └─ catalog/                @pds/a2ui-catalog (the catalog.json + typing)
│     └─ catalog.json
├─ apps/
│  ├─ composer/              the authoring tool (Vite + React)
│  │  └─ src/
│  │     ├─ store/           Zustand store (document, selection, viewport)
│  │     ├─ palette/         component palette from catalog
│  │     ├─ page-canvas/     DOM auto-layout editor + overlay + dnd
│  │     ├─ flow-canvas/     React Flow screen graph
│  │     ├─ inspector/       schema-derived property panel
│  │     ├─ export/          JSON panel + Ajv validation surface
│  │     └─ App.tsx
│  └─ sandbox/               standalone host that renders exported JSON
└─ ...
```

**Dependency rule:** `apps/*` may depend on `packages/*`; `packages/*` never
depend on `apps/*`. `schema` has zero React imports (it is pure and unit-tested).
`renderer` depends on `schema` types and `@pds/core`. The composer and sandbox
both depend on `renderer` — that shared dependency is what guarantees fidelity.

---

## 5. Data model

### 5.1 Editor document (the working state — a superset of A2UI)

Store nodes **flat** (keyed by id), matching A2UI's adjacency-list shape, so export
is nearly free and undo/redo is cheap. The tree is *derived* for rendering.

```ts
// doc.types.ts
export type NodeId = string;
export type SurfaceId = string;

export interface DocNode {
  id: NodeId;
  type: string;                 // catalog component name, e.g. "Button"
  props: Record<string, unknown>;
  children?: NodeId[];          // present only for slot containers
  editorMeta?: {                // stripped on export
    locked?: boolean;
    collapsed?: boolean;
  };
}

export interface Surface {
  id: SurfaceId;
  name: string;                 // shown in the flow canvas node
  root: NodeId;                 // the screen's root Frame
  nodes: Record<NodeId, DocNode>;
}

export interface FlowGraph {
  // screen-to-screen navigation (app-level routing; see §8)
  nodes: Array<{ id: SurfaceId; position: { x: number; y: number } }>;
  edges: Array<{ id: string; source: SurfaceId; target: SurfaceId; trigger?: string }>;
}

export interface EditorDocument {
  surfaces: Record<SurfaceId, Surface>;
  flow: FlowGraph;
  entrySurfaceId: SurfaceId;
}
```

### 5.2 A2UI wire types (the export target — your catalog's shape)

Your catalog models each component as a flat object with a `component`
discriminator and sibling props, so serialize to that shape (an adjacency list of
flat components referenced by id):

```ts
// a2ui.types.ts
export type DynamicString = { literalString: string } | { path: string };

export interface A2UIComponent {
  id: string;
  component: string;            // "Button"
  children?: string[] | DynamicString; // id refs (slot) OR content (DynamicString)
  [prop: string]: unknown;
}

export interface SurfaceUpdate {
  surfaceId: string;
  catalogId: string;
  root: string;
  components: A2UIComponent[];
}

export interface DataModelUpdate {
  surfaceId: string;
  contents: Record<string, unknown>; // JSON-Pointer keyed bound values
}

export interface A2UIExport {
  surfaceUpdate: SurfaceUpdate;
  dataModelUpdate?: DataModelUpdate;
}
```

### 5.3 The `children` overload — resolve it explicitly

The catalog types `children` as `DynamicString` for both *content* (`Button`,
`Text`) and *child component references* (`TileContainer`). The tool must not
guess. Add a vendor extension keyword in the catalog per property and read it:

```jsonc
// in catalog.json, on a slot property:
"children": { "$ref": ".../DynamicString", "x-a2ui-slot": true }
```

`catalog.ts` reads `x-a2ui-slot`. A node is a **drop target iff it has a slot
property**. Everything else is content/config and is edited in the Inspector.
If the extension is absent, fall back to a hardcoded allowlist
(`Frame`, `TileContainer`) and log a warning so the catalog gets fixed.

---

## 6. The three containment kinds (this shapes canvas + inspector UX)

Read straight from the catalog schema; each maps to a different gesture:

1. **Slot containers** — expose an `x-a2ui-slot` property (`Frame`,
   `TileContainer`). These are the **only** droppable nodes on the page canvas.
2. **Closed composites** — `TitleLockup`, `Tilelet`. They take structured object
   props (`title`, `subtitle`, `badge`, `image`) as `$ref`s to `*Props` defs.
   You do **not** drag children into them; you fill their config in the Inspector
   (a nested sub-editor, one level deep).
3. **Config arrays** — `ButtonGroup.items`, `Accordion.items` (discriminated-union
   arrays). The Inspector renders a repeatable add/remove list.

Enforce: a palette item is droppable into a node only if the target has a slot
property AND the catalog permits the child type (use slot child-type rules if
present; otherwise allow any).

---

## 7. Subsystem specifications

### 7.1 `schema` package (pure, no React)

- `loadCatalog(json)` → a normalized `CatalogModel`: for each component, a list of
  `PropDescriptor { name, kind, options?, default?, fields?, itemFields?, slot? }`
  where `kind ∈ enum | bool | string | number | content | object | array`.
  Derive `kind` from JSON Schema: `enum` → `enum`; `type: boolean` → `bool`;
  `type: number` → `number`; `$ref` to `DynamicString` → `content`; `$ref` to a
  `*Props` object → `object` (resolve its fields); `type: array` → `array`
  (resolve `items` / `oneOf` discriminated union into `itemFields`); else `string`.
- `export(surface) → A2UIExport`: walk the tree from `root`, emit a flat
  `components[]`. Content props → `{ literalString }` or `{ path }`; slot children
  → `string[]` of ids; object/array props → nested objects with content fields
  resolved the same way. Collect bound `path`s into `dataModelUpdate.contents`.
  Strip `editorMeta`. Set `catalogId` from the catalog.
- `import(a2ui) → Surface`: inverse — rebuild `nodes` map + `children` arrays from
  the adjacency list and `root`. **Round-trip invariant:** `export(import(x))` must
  be deep-equal to `x`. Enforce it with a tiny dev-time guard
  (`dev/roundtrip-guard.ts`) run via `bun run check:roundtrip` (Bun executes the TS
  directly): it runs export∘import over a few fixtures and logs any diff. This is the
  correctness guarantee that formal tests would otherwise provide — keep it, even
  without a test runner.
- `buildValidators(json)` → Ajv validate functions per component; `validate(export)`
  returns `{ ok, errors }`.

### 7.2 `renderer` package (`@pds/a2ui-react`) — the shared seam

- `registry.ts`: `Record<string, React.ComponentType<any>>`. MVP points entries at
  `standins/`; production swaps to `@pds/core` imports. **This single map is the
  only place that changes when going live.**
- `Renderer.tsx`: `render(node, nodesMap)` recursive interpreter. Looks up
  `registry[node.type]`, spreads resolved props, resolves `children`:
  slot → render child nodes; content → resolve `DynamicString` against an optional
  data model. Unknown type → a visible fallback box (never throw).
- Accepts an optional `dataModel` so bound `{ path }` values resolve. In the
  composer, bound fields show their path as placeholder text.
- Exports `<A2UISurface surface={...} dataModel={...} />` used by BOTH the composer
  preview and the sandbox.

### 7.3 `composer` app

**Store (`store/`)** — single Zustand store with Immer + zundo:
- state: `EditorDocument`, `selection: { surfaceId, nodeId } | null`,
  `activeSurfaceId`, `viewport`.
- actions (all pure tree ops via Immer): `addNode(type, parentId)`,
  `updateProp(nodeId, path, value)`, `moveNode(nodeId, dir)`, `removeNode(nodeId)`,
  `addSurface()`, `connectSurfaces(a, b)`, `setSelection(...)`.
- zundo wraps for `undo()`/`redo()` (Cmd/Ctrl+Z, Shift+Cmd/Ctrl+Z).

**Palette (`palette/`)** — list catalog components grouped by `group`. Each item is
a dnd-kit draggable AND click-to-add (adds into selected slot, else into active
surface root). Show a `slot` / `cfg` affordance per the containment kind.

**Page canvas (`page-canvas/`)**
- `react-zoom-pan-pinch` viewport; the active surface's tree renders inside via
  the shared `renderer`, with a thin editor wrapper around each node that:
  captures click → `setSelection`, and (for slot nodes) acts as a dnd-kit
  droppable + sortable context for its children.
- **Selection overlay**: a separate absolutely-positioned layer that measures each
  node's DOM rect (`ResizeObserver` + `getBoundingClientRect`, transformed into
  viewport space) and draws the selection outline + a small toolbar
  (move up/down, delete). The overlay never modifies the rendered components —
  this keeps `@pds/core` pristine.
- Auto-layout: the `Frame` primitive exposes `direction` (row/column), `gap`,
  `padding`, `align`; children get a sizing intent `fill | hug | fixed` that maps
  to flex (`flex:1` / `flex:0 0 auto` / fixed width). Avoid absolute x/y — it does
  not survive to mobile/chat.

**Inspector (`inspector/`)** — render controls from the selected node's
`PropDescriptor[]`: `enum`→select, `bool`→toggle, `number`→number, `string`→text,
`content`→text input with a **literal/bind toggle** (`{ literalString }` ⇄
`{ path }`), `object`→nested sub-panel (one level), `array`→repeatable list with
add/remove. No `<form>` elements (controlled inputs only).

**Export (`export/`)** — live JSON panel from `export(activeSurface)`, a Copy
button, a Download button, and an Ajv validation strip (green/red + error list).

### 7.4 `flow-canvas` (`@xyflow/react`)

- Each `Surface` is a custom React Flow node showing the screen name + a small live
  thumbnail (render the surface at scale, read-only).
- Edges = navigation. `onConnect` adds a `FlowGraph.edge`; an edge may carry a
  `trigger` label (e.g. the action name that causes the transition).
- Double-click a screen node → set `activeSurfaceId` and switch to the page canvas.
- "Add screen" creates a new `Surface` with an empty root `Frame`.
- A view toggle (or split view) switches between flow canvas and page canvas.

### 7.5 `sandbox` app (fidelity proof)

A minimal Vite app: paste/load an `A2UIExport`, `import()` it to a `Surface`, render
with `<A2UISurface>` from the shared `renderer`. Because it uses the same renderer,
output must match the composer preview pixel-for-pixel. This is the acceptance gate
for "export is correct."

---

## 8. Flow / navigation note

A2UI's surface model covers a single surface; cross-surface navigation is an
application concern, not part of the `surfaceUpdate` payload. For the MVP, keep the
flow graph as **app-level routing metadata** (`FlowGraph`) exported alongside the
per-surface A2UI JSON (e.g. `flow.json` + one `surface-*.json` each). Wire
navigation by mapping a component's server/client `action` name to a target
`surfaceId` via the flow edges' `trigger`. Document this; do not try to encode
routing inside A2UI.

---

## 9. Styling & tokens

- The composer chrome (palette, inspector, panels) uses Tailwind. Keep chrome
  visually quiet; the canvas content is the focus.
- Rendered design-system components must use **`@pds/core` + the design tokens CSS
  variables**, never Tailwind. Import the tokens stylesheet once at app root.
- Inspector style controls for primitives must offer **token values** (surface
  enums, space tokens like `4X`, radius presets) — not a raw color picker. This
  matches A2UI's "client controls styling" model and keeps output on-brand.

---

## 10. Build milestones (do them in this order)

Each milestone ends with the stated acceptance check before moving on.

**M0 — Scaffold.** Bun workspaces (`workspaces` in root `package.json`) + base
tsconfig; create the five packages/apps as empty but wired; Tailwind in `composer`;
ESLint/Prettier. Root scripts: `dev`, `build` (`bun run --filter '*' build`),
`check:roundtrip`.
*Accept:* `bun install` resolves all workspaces; `bun run dev` runs the composer
shell; `bun run build` succeeds across packages.

**M1 — schema (pure).** Implement types, `loadCatalog`, `export`, `import`,
`validate`, and the `roundtrip-guard` dev script. Provide 2–3 A2UI fixtures.
*Accept:* `bun run check:roundtrip` reports no diff on the fixtures; Ajv passes on
valid fixtures and fails with useful errors on a broken one.

**M2 — renderer.** `registry` + recursive `Renderer` + stand-in components + tokens.
*Accept:* given a fixture surface, `<A2UISurface>` renders without errors and
unknown types show the fallback box.

**M3 — composer core.** Store (zustand/immer/zundo), palette from catalog, page
canvas with pan/zoom + dnd-kit drop/reorder + auto-layout `Frame`, selection
overlay with node toolbar, undo/redo.
*Accept:* drag a `Frame`, drop `TitleLockup` + `ButtonGroup` inside, reorder,
delete, undo — all reflected in the store.

**M4 — inspector.** Schema-derived controls incl. content literal/bind toggle,
object sub-panels, array lists.
*Accept:* editing any control updates the canvas live; binding a content field
records a data-model path.

**M5 — export + sandbox.** Live JSON panel, Copy/Download, Ajv strip; sandbox app
renders the exported JSON.
*Accept:* a surface built in the composer, exported, and loaded in the sandbox
renders identically to the composer preview. **This is the MVP definition of done.**

**M6 — flow canvas.** React Flow screen graph, add screen, connect screens,
double-click to edit a screen, per-surface + flow.json export.
*Accept:* author two screens, connect them, export both surfaces + flow metadata;
re-import each surface round-trips.

---

## 11. Conventions for the agent

- TypeScript strict; no `any` in committed code; prefer discriminated unions.
- `schema` package is **pure** — no React, no DOM. All tree↔adjacency logic lives
  here, nowhere else, so it stays testable when a suite is added post-MVP.
- All document mutations go through store actions using Immer; never mutate state
  directly in components.
- Components are function components with hooks; lift no logic into the renderer
  that belongs in `schema`.
- Do not duplicate the rendering path — composer preview and sandbox both import
  `@pds/a2ui-react`.
- Keep `registry.ts` as the single swap point between stand-ins and `@pds/core`.
- No test framework in the MVP. Keep the `bun run check:roundtrip` dev guard green;
  verify each milestone's acceptance check manually before committing.

---

## 12. Suggested `CLAUDE.md` seed (separate file)

```md
# Working notes for Claude Code

This repo is specified in ARCHITECTURE.md — read it first and follow the milestone
order in §10. Do not expand MVP scope (§2).

Tooling is Bun: `bun install`, `bun add`, `bun run <script>`, `bunx <tool>`,
`bun run --filter <pkg> <script>`. Never use npm/pnpm/npx.

Invariants you must preserve:
- The renderer package (@pds/a2ui-react) is the single rendering path, shared by
  the composer preview and the sandbox. Never fork it.
- The schema package is pure (no React) and is the only home for tree⇆adjacency
  transforms. Keep the dev round-trip guard (bun run check:roundtrip) green.
- A node is droppable only if it has an x-a2ui-slot property (§5.3, §6).
- Page layout is flex auto-layout, never absolute x/y.

No automated test framework in the MVP (§2). Verify each milestone's acceptance
check manually before committing; keep bun run check:roundtrip green.

Before each milestone: restate its acceptance check. After each: confirm the check
and the round-trip guard, then commit.

Open questions to surface to the human rather than guess:
- exact @pds/core import names / peer versions
- whether catalog.json will get x-a2ui-slot added (else we use the allowlist fallback)
- icon handling for IconButton.renderIcon (needs a serializable icon-name field)
```

---

## 13. Known catalog gaps to flag while building

Surface these to the human; they block clean production use but not the MVP:

1. **No layout primitives** in `catalog.json` (no `Frame`/`Row`/`Column`). MVP adds
   a `Frame` that serializes to A2UI `Column`/`Row`. `CatalogComponentCommon.weight`
   already references Row/Column, so adopt the standard A2UI layout components.
2. **`children` overload** (content vs slot) — needs `x-a2ui-slot` (§5.3).
3. **Function props** — `IconButton.renderIcon` is `type: object` (a React render
   prop) and cannot serialize. Production needs a serializable `icon` enum of names
   the renderer resolves.
4. **`AccordionItem.header`** is typed `string` but described as object-or-ReactNode;
   normalize to a config object.
