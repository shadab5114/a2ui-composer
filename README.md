# A2UI Composer

A visual, WYSIWYG authoring tool for [A2UI](https://a2ui.org) UI flows. Drag real design-system components onto a canvas, configure them, connect multiple screens, and export A2UI JSON that renders identically on web, mobile, and chat surfaces.

---

## Table of contents

- [What it does](#what-it-does)
- [Getting started](#getting-started)
- [Project structure](#project-structure)
- [Key scripts](#key-scripts)
- [How to contribute](#how-to-contribute)
- [Swapping the design system](#swapping-the-design-system)

---

## What it does

| Feature | Description |
|---|---|
| **Page canvas** | Drag components from the palette onto a phone/tablet/desktop frame. Auto-layout (flex), never absolute x/y. |
| **Box layout primitive** | A synthetic `Box` component that serialises to A2UI `Box` with `direction: vertical\|horizontal`. Used to build any flex layout. |
| **Inspector** | Schema-derived property panel — controls are generated from the design system's own Zod schemas, no hand-written forms. |
| **Layer tree** | Figma-style hierarchy panel. Click any node to select it. |
| **Flow canvas** | Multi-screen graph (React Flow). Add screens, draw navigation edges, double-click to edit a screen. |
| **Export** | Produces A2UI JSON (`{ "a2ui": [...] }` instruction array) validated against the DS Zod schemas. Copy or download. |
| **Sandbox** | A separate app that loads exported JSON and renders it with the same renderer — proof that export = canvas. |

---

## Getting started

### Prerequisites

| Tool | Version |
|---|---|
| [Bun](https://bun.sh) | ≥ 1.1 |
| Node | ≥ 18 (only needed by some Bun internals) |
| GitHub PAT | `read:packages` scope (for `@shadab5114/*` packages) |

> **Toolchain is Bun.** Never use `npm`, `pnpm`, or `npx` in this repo. Use `bun install`, `bun add`, `bun run`, and `bunx` instead.

### 1 — Set up the auth token

The design system lives on GitHub Packages and requires a token:

```bash
export NODE_AUTH_TOKEN=ghp_your_personal_access_token
```

Add this to your shell profile (`~/.zshrc`, `~/.bashrc`, or equivalent) so it persists between sessions.

The `.npmrc` at the repo root already points the `@shadab5114` scope at `https://npm.pkg.github.com` and reads from `NODE_AUTH_TOKEN`.

### 2 — Install and run

```bash
git clone <repo-url>
cd a2ui-composer

bun install          # install all workspace deps

bun run dev          # start the composer at http://localhost:5173
bun run dev:sandbox  # start the sandbox at http://localhost:5174 (separate terminal)
```

### 3 — Verify correctness

```bash
bun run check:roundtrip   # export(import(fixture)) === fixture for all fixtures
bun run typecheck         # TypeScript strict across all packages
```

Both must pass before committing.

---

## Project structure

```
a2ui-composer/
├─ packages/
│  ├─ schema/        @pds/a2ui-schema   — pure TypeScript, no React
│  │  ├─ src/
│  │  │  ├─ a2ui.types.ts    A2UI wire types (instruction array format)
│  │  │  ├─ doc.types.ts     Editor document model (superset of A2UI)
│  │  │  ├─ catalog.ts       Zod schemas → prop descriptors
│  │  │  ├─ catalog.types.ts CatalogModel, ComponentModel, PropDescriptor
│  │  │  ├─ frame.ts         Synthetic Box primitive + isA2UILayout
│  │  │  ├─ factory.ts       createNode, createSurface, default props
│  │  │  ├─ transform.ts     exportSurface / importSurface (the round-trip)
│  │  │  ├─ validate.ts      Zod prop validation + structural check
│  │  │  └─ zod-source.ts    Imports DS Zod schemas; builds validators + catalog
│  │  └─ dev/fixtures/       JSON round-trip fixtures (01-basic, 02-composite, 03-bound)
│  │
│  └─ renderer/      @pds/a2ui-react    — the shared render path
│     └─ src/
│        ├─ registry.ts      ← THE SEAM: type → React component map
│        ├─ Renderer.tsx     Recursive interpreter (never fork this)
│        ├─ dynamic.ts       DynamicString resolver (literal / path)
│        └─ standins/        Box layout primitive stand-in
│
└─ apps/
   ├─ composer/      The authoring tool (Vite + React)
   │  └─ src/
   │     ├─ store/           Zustand + Immer + zundo document store
   │     ├─ palette/         Component palette (from catalog)
   │     ├─ page-canvas/     Canvas, EditorNode chrome, InsertZones
   │     ├─ flow-canvas/     React Flow multi-screen graph
   │     ├─ inspector/       Schema-derived property panel
   │     ├─ export/          JSON panel + validation
   │     └─ tree/            Layer tree panel
   │
   └─ sandbox/       Fidelity proof — renders exported JSON with the same renderer
```

### Dependency rule

```
apps/* → packages/*          (one direction only)
packages/renderer → packages/schema
packages/schema   → (nothing internal)
```

`schema` is intentionally pure (no React) so it can be unit-tested without a browser.

---

## Key scripts

| Script | What it does |
|---|---|
| `bun run dev` | Start composer dev server |
| `bun run dev:sandbox` | Start sandbox dev server |
| `bun run build` | Build all packages and apps |
| `bun run check:roundtrip` | Round-trip correctness guard (must stay green) |
| `bun run typecheck` | TypeScript strict across all workspaces |
| `bun run lint` | ESLint |
| `bun run format` | Prettier |
| `bun run --filter @pds/a2ui-schema build` | Build one package |

---

## How to contribute

### Core invariants — never break these

1. **The renderer is the single render path.** `packages/renderer/src/Renderer.tsx` is used by both the composer preview and the sandbox. Never duplicate or fork it. If you add rendering logic, add it here.

2. **`registry.ts` is the only swap point.** The map `{ "Button": ButtonComponent, ... }` is the only place DS component bindings live. Adding a new component = one line in `registry.ts`.

3. **`schema` is pure.** No React, no DOM. All tree ↔ adjacency transforms live in `packages/schema/src/transform.ts` and nowhere else. This keeps the package testable.

4. **Keep `bun run check:roundtrip` green.** The round-trip guard (`export(import(fixture)) === fixture`) is the correctness guarantee that substitutes for a formal test suite in the MVP. If you touch `transform.ts`, run it.

5. **No absolute x/y on the canvas.** Layout is always flex auto-layout (`Box` with `direction`, `gap`, `padding`). This is what makes output portable to mobile and chat surfaces.

### Adding a new DS component

1. **Schema source** — the component's Zod schema must exist in `@shadab5114/pds-core/schemas`. If it doesn't, add a hand-written schema in `zod-source.ts`.

2. **Register it** — add an entry to `registry.ts`:
   ```ts
   import { MyComponent } from "@shadab5114/pds-core";
   // ...
   export const registry = {
     // ...
     MyComponent,
   };
   ```

3. **Default props** — add rich example data to the `RICH_DEFAULTS` map in `packages/schema/src/factory.ts` so the component renders with content when first dragged onto the canvas.

4. **Verify** — drag the component in the composer, check the Inspector shows correct controls, export JSON and verify it round-trips (`bun run check:roundtrip`).

### Adding a Box layout feature

Box props live in `packages/schema/src/frame.ts` (the `boxProps` array). The renderer reads them in `packages/renderer/src/standins/Box.tsx`. Changes to Box props must be reflected in both places.

### Changing the export format

The A2UI wire format is defined in `packages/schema/src/a2ui.types.ts`. The serialisation logic is entirely in `packages/schema/src/transform.ts`. After any format change:

1. Update the fixtures in `packages/schema/dev/fixtures/` to match the new format.
2. Run `bun run check:roundtrip` — all fixtures must pass.

### Project-specific conventions

- **Bun only.** `bun install`, `bun add`, `bun run`, `bunx`. No npm/pnpm/npx.
- TypeScript strict; no `any` in committed code (discriminated unions preferred).
- Store mutations go through Zustand actions with Immer; never mutate state in components.
- Tailwind for composer chrome only — never on rendered DS components.
- Inspector controls are generated from Zod schemas; don't write hand-coded property editors.

---

## Swapping the design system

The composer is intentionally built so the design system is a **plug-in**, not a hard dependency. The integration points are small and clearly labelled.

### What to change

**Five files cover the entire swap:**

| File | What to do |
|---|---|
| `packages/renderer/src/registry.ts` | Replace `@shadab5114/pds-core` imports with your DS package. Map each A2UI component name to your React component. |
| `packages/schema/src/zod-source.ts` | Replace the per-component Zod schema imports with those from your DS. If your DS doesn't export Zod schemas, write them here — one schema per component. |
| `packages/schema/src/factory.ts` → `RICH_DEFAULTS` | Update the example prop data to match your DS's component API. |
| `.npmrc` | Update the scope and registry URL if your DS is on a different registry. |
| `packages/renderer/src/standins/Box.tsx` | This is your layout primitive renderer. It has no DS dependency — only keep it if your DS also lacks a flex container component; otherwise map `Box` to your DS container in `registry.ts`. |

### Step-by-step

#### 1. Catalog and schemas

Your design system needs to expose:
- A **catalog** object or JSON describing each component: its name, group, and which props it accepts.
- **Zod schemas** (one per component) so the Inspector can derive controls and the export validator can check props.

If your DS doesn't ship Zod schemas, write them in `zod-source.ts`. The schema shape is straightforward:

```ts
// zod-source.ts — add your component schema here
import { z } from "zod";

const MyButtonSchema = z.object({
  kind: z.enum(["primary", "secondary"]),
  children: z.any(),  // content prop
  // ...
});

// Add to the schemas map passed to getCatalog():
const schemas: Record<string, z.ZodObject<any>> = {
  // ...
  MyButton: MyButtonSchema,
};
```

Slot containers (components that can hold child components) must have their slot prop marked with `.meta({ "x-a2ui-slot": true })`:

```ts
const MyContainerSchema = z.object({
  children: z.array(z.string()).meta({ "x-a2ui-slot": true }),
  // ...
});
```

#### 2. Registry

Open `packages/renderer/src/registry.ts` and swap the imports:

```ts
// Before
import { Button, TitleLockup, ... } from "@shadab5114/pds-core";

// After
import { MyButton, MyTitleLockup, ... } from "your-ds-package";

export const registry: Record<string, AnyComponent> = {
  [FRAME_TYPE]: Box,          // keep the synthetic Box layout primitive
  Button: MyButton,
  TitleLockup: MyTitleLockup,
  // ... map each A2UI component name to your React component
};
```

The keys in `registry` are the values that appear in the exported A2UI JSON (`"component": "Button"`). Keep them stable — they are the public API of your exported files.

#### 3. Auth / install

Update `.npmrc` if your DS is on a private registry:

```
@your-scope:registry=https://your.registry.url
//your.registry.url/:_authToken=${YOUR_TOKEN_ENV_VAR}
```

Then update `packages/renderer/package.json` to depend on your DS package.

#### 4. Design tokens

The composer imports `@shadab5114/pdesign-tokens` for CSS-variable design tokens. If your DS uses a different token system:

1. Remove the import in `apps/composer/src/main.tsx` (or wherever the token CSS is imported).
2. Import your own tokens stylesheet instead.
3. Update `Box.tsx` — its `px()` and `br()` helper functions translate token names like `"2X"` and `"medium"` to pixel values. Replace the token vocabulary with your own.

#### 5. Verify

```bash
bun run check:roundtrip   # schema round-trip must pass
bun run typecheck         # must compile
bun run dev               # drag your components in the composer
```

Then export a surface and load it in the sandbox (`bun run dev:sandbox`) — the sandbox uses the same renderer, so if the canvas matches the sandbox, the integration is correct.

### What you do NOT need to change

- `packages/schema/src/transform.ts` — the export/import logic is DS-agnostic.
- `packages/schema/src/a2ui.types.ts` — the wire format is fixed.
- All of `apps/composer/src/` except the parts that reference the DS token helpers.
- The `Box` stand-in (unless your DS has its own flex container to use instead).

---

## A2UI export format

The composer exports a versioned instruction array:

```json
{
  "a2ui": [
    { "version": "v0.9", "createSurface": { "surfaceId": "home", "catalogId": "pds" } },
    { "version": "v0.9", "updateDataModel": { "surfaceId": "home", "path": "/", "value": { ... } } },
    { "version": "v0.9", "updateComponents": {
        "surfaceId": "home",
        "components": [
          { "id": "root", "component": "Box", "direction": "vertical", "children": ["c1"] },
          { "id": "c1",   "component": "Button", "kind": "primary", "children": { "literalString": "Get started" } }
        ]
    }}
  ]
}
```

- **`createSurface`** — declares the surface and locks the catalog version.
- **`updateDataModel`** — sets bound data. `path: "/"` replaces the whole model. Omitted when no bindings exist.
- **`updateComponents`** — full component tree in DFS pre-order; the first entry is always the root.
- **`Box`** — the layout primitive. `direction: "vertical"` = column stack, `direction: "horizontal"` = row. Accepts `gap`, `padding`, `align`, `justify`, `width`, `height`, `background`, `borderRadius`, etc.

See [`packages/schema/dev/fixtures/`](packages/schema/dev/fixtures/) for complete examples.
