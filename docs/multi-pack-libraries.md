# Multi-Pack Component Libraries — Implementation Guide

> **Status:** design approved, not yet implemented.
> **Audience:** any engineer or coding agent (e.g. Claude Sonnet) picking this up
> cold. Read [ARCHITECTURE.md](../ARCHITECTURE.md) and [CLAUDE.md](../CLAUDE.md)
> first — this document extends them; it does not replace them.
> **Scope:** add **expansion-pack** component libraries on top of `@pds/core`,
> author with components from any pack on one canvas, and export A2UI JSON that
> **namespaces** non-core component names.

---

## 1. Goal

Today the composer renders exactly one design system: `@shadab5114/pds-core`
("core"). We want to add **expansion-pack** libraries that ship the same way core
does — real React components, a `catalog.json`, and per-component Zod schemas:

- `@pds-pack/plans` — pack id **`plans`**
- `@pds-pack/chat` — pack id **`chat`**

Each pack may add brand-new components *or* re-define a component that already
exists in core with extended behaviour (e.g. its own `Button`). The two are
independent components that happen to share a local name.

### Required outcomes

1. **Palette** shows components from core + plans + chat, grouped and labelled by
   pack so the author can tell them apart.
2. **Cross-pick**: drag any component from any pack onto the same canvas and
   compose freely.
3. **Scoped export**: the A2UI `component` field is namespaced by pack —
   - core → `Button`
   - plans → `plans.Button`
   - chat → `chat.Button`
4. **Scales to N packs** — adding a 4th pack later is a dependency + one config
   entry, nothing more.

### Approved decisions (do not re-litigate)

| # | Decision |
|---|---|
| D1 | **Surface `catalogId` becomes an array** (`catalogIds: string[]`) listing the catalogs the surface actually uses. See §6. |
| D2 | **`$defs` are isolated per pack** during descriptor derivation — never merged into one global pool. See §4.2. |
| D3 | **Pack `catalog.json` carries no category/group metadata.** Grouping comes from a **curated per-pack `GROUPS` map in our code.** See §4.3. |
| D4 | **Packs do NOT mark slot containers with `x-a2ui-slot`.** We extend the **per-pack slot allowlist fallback.** See §4.4. |

---

## 2. The central idea: a qualified component id as the single key

The entire pipeline today treats a component as **one string key**, `DocNode.type`
(e.g. `"Button"`), and never parses it for a bare name:

- [`catalog.ts`](../packages/schema/src/catalog.ts) → `components: Record<string, ComponentModel>`
- [`registry.ts`](../packages/renderer/src/registry.ts) → `Record<string, AnyComponent>`
- [`validate.ts`](../packages/schema/src/validate.ts) → `validators.byName[comp.component]`
- [`transform.ts`](../packages/schema/src/transform.ts) → emits `component: node.type` **verbatim**

**Decision: make that single key a _qualified_ name.**

| Pack | `DocNode.type` (internal key) | A2UI `component` (exported) |
|---|---|---|
| core | `Button` | `Button` |
| plans | `plans.Button` | `plans.Button` |
| chat | `chat.Button` | `chat.Button` |
| (synthetic) | `Box` | `Column` / `Row` |

- Separator is `.`. Core has an **empty prefix** (no dot).
- Qualified name = `prefix + localName`, where `prefix` is `""`, `"plans."`, or `"chat."`.
- `Box` (the synthetic layout primitive, [`frame.ts`](../packages/schema/src/frame.ts))
  is pack-less and stays unprefixed.

**Why this approach.** Because `transform.ts` copies `node.type` straight into the
wire `component`, storing the qualified name means **export scoping is free and
import is symmetric** — `transform.ts` and `validate.ts` need *no logic change*.
Pack-awareness is confined to three *source* points: catalog loading, registry
building, and palette grouping. A structured `{ pack, name }` field on `DocNode`
was rejected: it would push pack logic into every consumer (transform, validate,
store, registry, inspector) and break the "one string key" invariant the codebase
is built on.

**Invariant to preserve:** `export(import(x))` is deep-equal to `x`
(`bun run check:roundtrip`). Qualified names round-trip trivially because they are
copied verbatim in both directions.

---

## 3. The pack registry (the scalability seam)

Adding a pack must be declarative. Because the `schema` package is React-free and
the `renderer` package owns components, the pack list exists in **two parallel
halves keyed by the same pack ids**.

### 3.1 `packs.ts` in the schema package (metadata + schemas) — NEW FILE

`packages/schema/src/packs.ts`

```ts
import type { ZodType } from "zod";

export interface PackSource {
  /** "" for core, "plans", "chat". Stable id; used as the wire prefix root. */
  id: string;
  /** "" for core, "plans.", "chat.". = id === "" ? "" : id + ".". */
  prefix: string;
  /** Palette section title, e.g. "Core", "Plans", "Chat". */
  label: string;
  /** Raw per-component Zod schemas exported by the pack (name → schema). */
  schemas: Record<string, ZodType>;
  /** The pack's catalog.json (for catalogId + the component-name list + $defs). */
  catalogJson: RawCatalogJson;
  /** Component local-names whose `children` is a slot, not content (D4). */
  slotContainers: string[];
  /** Curated category map for THIS pack: localName → group label (D3). */
  groups: Record<string, string>;
  /** Optional curated example props, keyed by LOCAL name (see §4.5). */
  richDefaults?: Record<string, Record<string, unknown>>;
}

export interface RawCatalogJson {
  catalogId: string;
  components: Record<string, unknown>;
  $defs?: Record<string, unknown>;
}

// Import each pack's schema + catalog entrypoints here.
import { schemas as coreSchemas } from "@shadab5114/pds-core/schemas";
import coreCatalog from "@shadab5114/pds-core/catalog.json";
import { schemas as plansSchemas } from "@pds-pack/plans/schemas";
import plansCatalog from "@pds-pack/plans/catalog.json";
import { schemas as chatSchemas } from "@pds-pack/chat/schemas";
import chatCatalog from "@pds-pack/chat/catalog.json";

import { CORE_GROUPS } from "./groups/core";
import { PLANS_GROUPS } from "./groups/plans";
import { CHAT_GROUPS } from "./groups/chat";

export const PACKS: PackSource[] = [
  {
    id: "", prefix: "", label: "Core",
    schemas: coreSchemas as Record<string, ZodType>,
    catalogJson: coreCatalog as RawCatalogJson,
    slotContainers: ["TileContainer"],
    groups: CORE_GROUPS,
  },
  {
    id: "plans", prefix: "plans.", label: "Plans",
    schemas: plansSchemas as Record<string, ZodType>,
    catalogJson: plansCatalog as RawCatalogJson,
    slotContainers: [/* e.g. "PlanGroup", "PricingTable" */],
    groups: PLANS_GROUPS,
  },
  {
    id: "chat", prefix: "chat.", label: "Chat",
    schemas: chatSchemas as Record<string, ZodType>,
    catalogJson: chatCatalog as RawCatalogJson,
    slotContainers: [/* e.g. "MessageList", "Composer" */],
    groups: CHAT_GROUPS,
  },
];

export const PACK_META = PACKS.map((p) => ({ id: p.id, label: p.label }));

/** prefix + local name → qualified key. Core stays bare. */
export const qualify = (prefix: string, localName: string): string => prefix + localName;
```

> The exact pack subpath specifiers (`/schemas`, `/catalog.json`) are
> hypothetical — confirm them against the real published packages and adjust the
> imports. The *shape* of `PackSource` is what matters.

### 3.2 `packs.ts` in the renderer package (components) — NEW FILE

The renderer is the rendering seam ([ARCHITECTURE §7.2](../ARCHITECTURE.md)). It
owns the actual React components per pack id.

`packages/renderer/src/packs.ts`

```ts
import type { ComponentType } from "react";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyComponent = ComponentType<any>;

import * as Core from "@shadab5114/pds-core";
import * as Plans from "@pds-pack/plans";
import * as Chat from "@pds-pack/chat";

/** packId → (localName → component). Local names; the registry adds the prefix. */
export const PACK_COMPONENTS: Record<string, Record<string, AnyComponent>> = {
  "":     { Button: Core.Button, Text: Core.Text, /* …all core comps… */ },
  plans:  { Button: Plans.Button, /* … */ },
  chat:   { Button: Chat.Button, /* … */ },
};
```

> Keep the pack ids identical to `schema/packs.ts`. The two files are the only
> places that change when a pack is added.

---

## 4. Schema package changes

All paths are under `packages/schema/src/`.

### 4.1 `catalog.types.ts` — add pack metadata

Extend `ComponentModel` and `CatalogModel`:

```ts
export interface ComponentModel {
  // existing fields…
  name: string;            // NOW the QUALIFIED name, e.g. "plans.Button"
  group: string;
  description?: string;
  props: PropDescriptor[];
  slotProp?: string;
  isSlotContainer: boolean;
  synthetic?: boolean;
  // NEW:
  pack: string;            // pack id: "" | "plans" | "chat"
  localName: string;       // unqualified, e.g. "Button"
  qualifiedName: string;   // === name; explicit for clarity
}

export interface CatalogModel {
  // existing:
  components: Record<string, ComponentModel>; // keyed by QUALIFIED name
  order: string[];                            // qualified names
  warnings: string[];
  // CHANGED — catalogId is now plural:
  catalogIds: string[];                       // one per pack that loaded (D1)
  // CHANGED — grouping is now pack-aware:
  packs: Array<{ id: string; label: string }>;
  /** packId → (group label → qualified names), for the palette (§5). */
  packGroups: Record<string, Record<string, string[]>>;
}
```

> `name` becoming qualified is deliberate so `factory.ts`'s `createNode` and the
> store keep using `catalog.components[type]` unchanged.

### 4.2 `catalog.ts` — multi-pack `loadCatalog` with isolated `$defs` (D2)

Change `loadCatalog` from "one raw catalog" to "a list of packs", and resolve each
pack's `$refs` **only against that pack's own `$defs`**.

```ts
export interface PackInput {
  id: string;
  prefix: string;
  label: string;
  rawCatalog: { catalogId: string; components: Record<string, RawSchema>; $defs?: Record<string, RawSchema> };
  /** local names that are slot containers (D4). */
  slotContainers: Set<string>;
  /** localName → group label (D3). */
  groups: Record<string, string>;
}

export function loadCatalog(packs: PackInput[]): CatalogModel { /* … */ }
```

Inside, for each pack:

1. `const defs = pack.rawCatalog.$defs ?? {}` — **local to this pack**. Do *not*
   merge into a shared `mergedDefs`. Two packs each defining `BadgeProps` must
   resolve to their own definitions (D2). All existing helpers
   (`collectProperties`, `resolveFields`, `deriveArray`, `derivePropDescriptor`,
   `localDefName`) already take `defs` as a parameter — just pass the pack's defs.
2. For each component local-name, call the existing `deriveComponent`, then set:
   - `model.localName = name`
   - `model.pack = pack.id`
   - `model.qualifiedName = pack.prefix + name`
   - `model.name = model.qualifiedName`
   - `model.group = pack.groups[name] ?? "Other"` (D3 — replaces the module-level
     `GROUPS` constant, which moves into each pack; see §4.3)
3. Store under `components[model.qualifiedName]`.

**Slot detection (D4).** In `deriveComponent`, the current allowlist is a single
module-level `SLOT_ALLOWLIST = new Set([FRAME_TYPE, "TileContainer"])`. Make it
**per pack**: a node's `children` is a slot if
`pack.slotContainers.has(localName)` (plus the always-on `Box`). Keep the
`x-a2ui-slot` marker check too (harmless if absent), but the packs rely on the
allowlist. Because packs add their own slot containers, **remove or downgrade the
"no `x-a2ui-slot` keyword" warning** so it does not fire for every pack (D4) — the
allowlist is now the intended primary path, not a fallback to apologise for.

**Frame injection.** Still inject the synthetic `Box`
(`components[FRAME_TYPE] = frameComponentModel`) exactly once, after all packs.
Give it `pack: ""`, `localName: "Box"`, `qualifiedName: "Box"`.

**Build `packGroups`.** After deriving all components, group qualified names by
`pack.id` then by `model.group`:

```ts
const packGroups: Record<string, Record<string, string[]>> = {};
for (const m of Object.values(components)) {
  (packGroups[m.pack] ??= {});
  (packGroups[m.pack][m.group] ??= []).push(m.qualifiedName);
}
```

Put `Box` under pack `""`, group `"Layout"`.

**Build `catalogIds`.** `catalogIds = packs.map(p => p.rawCatalog.catalogId)`
(deduplicated). This is the full set available; the per-surface subset is computed
at export time (§6).

### 4.3 Per-pack `GROUPS` maps (D3)

The catalog has no category metadata, so curate it in code. Move the existing
`GROUPS` constant out of `catalog.ts` into a per-pack module and add new ones:

- `packages/schema/src/groups/core.ts` → `export const CORE_GROUPS` (the current
  map from [`catalog.ts:49-71`](../packages/schema/src/catalog.ts#L49-L71))
- `packages/schema/src/groups/plans.ts` → `export const PLANS_GROUPS`
- `packages/schema/src/groups/chat.ts` → `export const CHAT_GROUPS`

Each maps **local** name → group label. Unmapped components fall through to
`"Other"`.

### 4.4 `zod-source.ts` — multi-pack validators + catalog feed

Today this file imports one pack and builds one `zodSchemas` map. Generalize it to
loop `PACKS`.

```ts
import { PACKS, qualify } from "./packs";

// name → augmented Zod schema, keyed by QUALIFIED name.
const zodSchemas: Record<string, ZodType> = (() => {
  const map: Record<string, ZodType> = {};
  for (const pack of PACKS) {
    const componentNames = Object.keys(pack.catalogJson.components);
    for (const localName of componentNames) {
      const schema = (pack.schemas as Record<string, ZodType>)[`${localName}Schema`];
      if (!schema) continue;
      map[qualify(pack.prefix, localName)] = augment(pack, localName, schema);
    }
  }
  return map;
})();
```

- `augment(pack, localName, schema)` keeps the per-component quirks that exist
  today (the `IconButton` icon-enum bridge, optional slot `.meta`) but becomes
  **pack-aware** — use `pack.slotContainers` instead of the old module-level
  `SLOT_CONTAINERS`. A pack that has no `IconButton` simply won't hit that branch.
- `getCatalog()` calls `loadCatalog(PACKS.map(toPackInput))` where `toPackInput`
  builds the per-pack JSON-Schema views with `z.toJSONSchema(...)` exactly as
  today, but keeps each pack's `$defs` separate (D2) and carries `id/prefix/label/
  slotContainers/groups` through.
- `buildValidators()` returns `{ catalogIds: string[]; byName: zodSchemas }` —
  note **`catalogIds` plural** (D1). Update the `Validators` interface in both
  `zod-source.ts` and `validate.ts`.

> The existing per-pack JSON-view build loop (`buildRawCatalogFromZod`) becomes a
> per-pack function that returns `{ catalogId, components, $defs }` for one pack;
> `getCatalog` maps it over `PACKS`.

### 4.5 `factory.ts` — defaults keyed by qualified name

`RICH_DEFAULTS` is currently keyed by bare name, so `plans.Button` would wrongly
inherit core's `Button` defaults. Fix:

- Move each pack's curated examples into its `PackSource.richDefaults` (keyed by
  **local** name).
- In `defaultPropsFor(model)`, look up
  `pack.richDefaults?.[model.localName]` for `model.pack`. Simplest concrete form:
  build a qualified-keyed map once
  (`RICH_DEFAULTS_BY_QUALIFIED[model.qualifiedName]`) from all packs at module
  load, and keep core's existing entries under their bare keys.
- `createNode(catalog, type)` and `createSurface` are unchanged — they already key
  by the `type` string, which is now qualified.

### 4.6 `transform.ts` — NO logic change

`export` already emits `component: node.type` (qualified) at
[`transform.ts:99`](../packages/schema/src/transform.ts#L99); `import` sets
`type = isLayout ? FRAME_TYPE : component` at
[`transform.ts:189`](../packages/schema/src/transform.ts#L189). Both round-trip
qualified names verbatim. **Only changes:**

- The `createSurface` instruction now carries `catalogIds: string[]` (D1, §6).
- Add a one-line comment that `node.type` / `component` is the **qualified**
  component id.

Update `exportSurface(surface, catalogId)` signature → `exportSurface(surface,
catalogIds)` (or compute the used subset internally — see §6).

### 4.7 `validate.ts` — NO logic change

`validators.byName[comp.component]` already resolves by the wire `component`
string, which is now qualified. An unknown pack prefix surfaces naturally as the
existing `no catalog schema for component "X"` error. Only update the `Validators`
interface to `catalogIds: string[]`.

### 4.8 `index.ts` — exports

Export `PACK_META` / pack types and the new `packGroups`/`catalogIds` surface as
needed by the composer.

---

## 5. Renderer package changes

`packages/renderer/src/`

### 5.1 `registry.ts` — flatten `PACK_COMPONENTS` into qualified keys

Replace the hand-written flat map with a build step over `PACK_COMPONENTS`:

```ts
import { PACK_COMPONENTS, type AnyComponent } from "./packs";
import { FRAME_TYPE } from "@pds/a2ui-schema";
import { Box } from "./standins/Box";

export const registry: Record<string, AnyComponent> = (() => {
  const map: Record<string, AnyComponent> = { [FRAME_TYPE]: Box };
  for (const [packId, comps] of Object.entries(PACK_COMPONENTS)) {
    const prefix = packId === "" ? "" : packId + ".";
    for (const [localName, Comp] of Object.entries(comps)) {
      map[prefix + localName] = Comp;
    }
  }
  return map;
})();

export function getComponent(type: string): AnyComponent | undefined {
  return registry[type];
}
```

- Keep the `IconButtonAdapter` bridge for any pack that exposes a render-prop icon
  component; wire it in `PACK_COMPONENTS` per pack (e.g.
  `{ IconButton: makeIconButtonAdapter(Plans.IconButton, Plans.icons) }`).
- `getComponent` and the `AnyComponent` type are unchanged.

### 5.2 `Renderer.tsx` — NO change

It looks up `getComponent(node.type)` and renders the fallback box on miss. A
component from an uninstalled/unknown pack degrades to the visible fallback, never
throws.

---

## 6. Export contract: `catalogIds` array (D1)

The surface declares **the set of catalogs it uses**, not a single one.

### Wire shape change

`packages/schema/src/a2ui.types.ts` — `CreateSurfaceInstruction`:

```ts
export interface CreateSurfaceInstruction {
  version: "v0.9";
  createSurface: {
    surfaceId: string;
    catalogIds: string[];   // was: catalogId: string
  };
}
```

### Which ids to emit

Emit the catalogIds of the packs **actually referenced** by the surface's
components, **always including core**. In `exportSurface`:

1. While walking components, collect the set of pack ids used: for each node, take
   the prefix of `node.type` (substring before the first `.`, or `""` for core /
   `Box`).
2. Map each used pack id → its `catalogId` (carry a `packId → catalogId` lookup in
   the catalog model / validators).
3. `catalogIds = dedupe([coreCatalogId, ...usedPackCatalogIds])`.

This keeps the payload honest (a chat-only surface won't advertise the plans
catalog) while guaranteeing the base catalog is always present.

### Import

`importSurface` reads `catalogIds` but the editor doc model doesn't need to store
it (the catalog is global in the composer). Accept both the new `catalogIds` array
and the legacy singular `catalogId` for backward compatibility:

```ts
const catalogIds = op.createSurface.catalogIds
  ?? (op.createSurface.catalogId ? [op.createSurface.catalogId] : []);
```

### Round-trip note

`export(import(x))` must stay deep-equal. If you compute the used subset on export,
ensure import → export reproduces the **same** ordered, deduped array. Simplest:
sort `catalogIds` deterministically (core first, then packs in `PACKS` order) in
both the fixture and the exporter, and update the `dev/roundtrip-guard.ts` fixtures
to the array shape.

---

## 7. Composer app changes

`apps/composer/src/`

### 7.1 `palette/Palette.tsx` — pack sections + cross-pick

This is where "well-organised and categorised" and "cross-pick from any library"
land. Render **Pack → Category group → items**:

```
Core
  Actions      Button  TextLink  ButtonGroup  IconButton
  Content      Text  Image  Badge …
  Layout       Box
Plans
  Plans        plans.Button  plans.PricingTable …
Chat
  Chat         chat.Button  chat.MessageList …
```

- Drive it from `catalog.packGroups` (packId → group → qualified names) and
  `catalog.packs` (for section titles/order).
- `PaletteItem` keeps `type` = the **qualified** name. `catalog.components[type]`,
  the draggable id `palette:${type}`, and `addNode(type)` all work unchanged.
- Add a small **pack badge** (e.g. `plans`) on non-core items and keep the existing
  `slot` / `cfg` affordance. Show `model.localName` as the visible label, with the
  qualified name in the `title` tooltip, so `Button` and `plans.Button` are
  distinguishable but not noisy.
- Optional polish: a pack filter (tabs/chips) above the list. Not required for the
  feature.

### 7.2 `store/store.ts` — NO logic change

`addNode(type)`, `isSlotContainer(type)` (`catalog.components[type]?.isSlotContainer`),
and `createNode(catalog, type)` all operate on the qualified string key. They work
as-is. (Sanity-check `findParentId` / `collectSubtree` — they only touch ids, not
types.)

### 7.3 `inspector/Inspector.tsx`, `inspector/fields.tsx` — minimal

If the inspector resolves the model via `catalog.components[node.type]` (qualified
key), it works unchanged. Optional: show the pack label in the inspector header so
the author sees they are editing a `plans.Button`, not a core `Button`.

### 7.4 `export/ExportPanel.tsx` — catalogIds plumbing

`buildValidators()` now returns `catalogIds: string[]`. Pass the **used subset**
(or all) into `exportSurface`. The validation strip is otherwise unchanged; it will
now also catch components whose pack isn't installed (`no catalog schema for "X"`).

### 7.5 `import/ImportDialog.tsx` + `packages/schema/src/import-code.ts` — follow-up

Code-import maps JSX element names → catalog types. With packs it must resolve
**which pack** a JSX element came from, via its import source:

```tsx
import { Button } from "@pds-pack/plans";   // <Button/> → plans.Button
import { Button } from "@shadab5114/pds-core"; // <Button/> → Button
```

Build an import-specifier → pack-prefix map while parsing, then qualify each
element's resolved type. **Treat this as a separate sub-task** after the core
feature works; until then, code-import resolves to core names only.

---

## 8. Repo / packaging changes

- **`.npmrc`** — add a scope mapping for `@pds-pack` pointing at GitHub Packages,
  mirroring the existing `@shadab5114` entry and reusing `NODE_AUTH_TOKEN`:
  ```ini
  @pds-pack:registry=https://npm.pkg.github.com
  ```
  (Confirm the packs are published under the `@pds-pack` org on GitHub Packages and
  that the PAT has `read:packages` for it.)
- **`package.json`** (root + `packages/schema` + `packages/renderer`) — add
  `@pds-pack/plans` and `@pds-pack/chat`. Schema needs `/schemas` + `/catalog.json`;
  renderer needs the component entrypoint. Run `bun install`.
- **`CLAUDE.md`** — record two new invariants:
  1. `DocNode.type` is the **qualified** component id (`prefix + localName`); the
     two `packs.ts` files (schema = metadata/schemas, renderer = components) are the
     only swap points when adding a pack.
  2. The surface wire field is `catalogIds: string[]` (array), and packs use the
     **slot allowlist** (no `x-a2ui-slot`).

---

## 9. File-by-file change summary

| File | Change | Risk |
|---|---|---|
| `packages/schema/src/packs.ts` | **NEW** — `PACKS` metadata + schemas + per-pack slot/group config | low |
| `packages/schema/src/groups/{core,plans,chat}.ts` | **NEW** — curated `GROUPS` per pack (D3) | low |
| `packages/schema/src/catalog.ts` | Multi-pack `loadCatalog`; per-pack `$defs` (D2); per-pack slot allowlist (D4); qualified keys; `packGroups`; drop the "no x-a2ui-slot" warning | **med** |
| `packages/schema/src/catalog.types.ts` | `ComponentModel.{pack,localName,qualifiedName}`; `CatalogModel.{catalogIds,packs,packGroups}` | low |
| `packages/schema/src/zod-source.ts` | Loop `PACKS`; qualified `zodSchemas`; pack-aware `augment`; `buildValidators` → `catalogIds[]` | **med** |
| `packages/schema/src/factory.ts` | `RICH_DEFAULTS` keyed by qualified/local-per-pack | low |
| `packages/schema/src/a2ui.types.ts` | `createSurface.catalogIds: string[]` (D1) | low |
| `packages/schema/src/transform.ts` | `catalogIds` array on export; used-pack subset; comment only (no name logic) | low |
| `packages/schema/src/validate.ts` | `Validators.catalogIds: string[]` (interface only) | low |
| `packages/schema/src/index.ts` | Export pack metadata | trivial |
| `packages/schema/dev/roundtrip-guard.ts` | Update fixtures to `catalogIds` array + a multi-pack fixture | low |
| `packages/renderer/src/packs.ts` | **NEW** — `PACK_COMPONENTS` (packId → components) | low |
| `packages/renderer/src/registry.ts` | Build registry by flattening `PACK_COMPONENTS` to qualified keys | low |
| `packages/renderer/src/Renderer.tsx` | none | — |
| `apps/composer/src/palette/Palette.tsx` | Pack → group → item layout; pack badge; local-name label | **med** |
| `apps/composer/src/store/store.ts` | none (verify) | — |
| `apps/composer/src/inspector/*` | optional pack label | low |
| `apps/composer/src/export/ExportPanel.tsx` | pass `catalogIds` | low |
| `apps/composer/src/import/ImportDialog.tsx`, `packages/schema/src/import-code.ts` | pack resolution from import source (**follow-up**) | **med** |
| `.npmrc`, `package.json` (×3), `CLAUDE.md` | scope + deps + invariants | low |

---

## 10. Build order & acceptance checks

Do these in order; verify each before moving on (no test framework — manual +
`bun run check:roundtrip`, per [ARCHITECTURE §10](../ARCHITECTURE.md)).

1. **Schema: pack registry + multi-pack catalog.**
   Add `packs.ts`, per-pack `GROUPS`, multi-pack `loadCatalog` (isolated `$defs`,
   per-pack slot allowlist), qualified `buildValidators`, `catalogIds[]`.
   *Accept:* `getCatalog().components` contains `Button`, `plans.Button`,
   `chat.Button` with correct `pack`/`group`; `getCatalog().catalogIds` lists all
   three; `bun run check:roundtrip` green with an updated multi-pack fixture.

2. **Renderer: pack components + registry.**
   Add renderer `packs.ts`, flatten the registry.
   *Accept:* a fixture surface containing a `plans.Button` renders the plans
   component (not core's, not the fallback); an unknown `forms.Widget` shows the
   fallback box.

3. **Composer: palette + cross-pick.**
   Pack-sectioned palette, pack badges.
   *Accept:* drag `Button`, `plans.Button`, `chat.Button` into one `Box`; the
   export panel shows `component: "Button"`, `"plans.Button"`, `"chat.Button"`;
   validation is green.

4. **Export/import: catalogIds array.**
   Used-pack subset on export; tolerant import.
   *Accept:* a mixed-pack surface exports `catalogIds` containing exactly the used
   packs (core always present); re-import round-trips deep-equal.

5. **Factory defaults + inspector polish.**
   Per-pack rich defaults; optional inspector pack label.
   *Accept:* a fresh `plans.Button` seeds plans' defaults, not core's.

6. **(Follow-up) Code-import pack resolution.**
   *Accept:* pasting JSX that imports `Button` from `@pds-pack/plans` produces a
   `plans.Button` node.

---

## 11. Invariants & pitfalls (read before coding)

- **`node.type` is the qualified key everywhere.** Never strip the prefix except
  (a) to look up the pack id from the substring before the first `.`, and (b) when
  resolving a pack's local schema/component. `Box` has no prefix.
- **Do not merge `$defs` across packs (D2).** Two packs can legitimately define
  `BadgeProps` differently. Resolve `$ref` only within the owning pack's `$defs`.
- **Slot containers come from the per-pack allowlist (D4),** not `x-a2ui-slot`.
  Keep the marker check as a harmless bonus, but do not warn when it's absent.
- **Grouping is curated in code (D3).** The pack `catalog.json` has no categories;
  unmapped components fall to `"Other"`.
- **`catalogIds` is an array (D1).** Update every `Validators`/`createSurface`
  reference; keep the legacy singular `catalogId` readable on import.
- **Keep the rendering path single.** All packs render through the one
  `renderer`/`registry`; composer preview and sandbox stay identical by
  construction. Never fork.
- **Round-trip guard must stay green.** Add at least one mixed-pack fixture and
  ensure the `catalogIds` array ordering is deterministic so `export∘import` is
  stable.
- **Name collisions are expected and fine.** `Button` (core) and `plans.Button`
  are different keys, different schemas, different registry entries, different
  validators. The qualified key disambiguates them at every layer.

---

## 12. Hypothetical pack shapes (for fixtures / local dev)

If the real packs aren't available yet, stub them so the pipeline is exercisable:

- `@pds-pack/plans` — e.g. `PricingTable` (slot container), `PlanCard`,
  `PriceTag`, and an extended `Button` (adds a `plan` enum prop). Slot containers:
  `["PricingTable", "PlanGroup"]`.
- `@pds-pack/chat` — e.g. `MessageList` (slot container), `MessageBubble`,
  `Composer` (slot container), `Avatar`, and an extended `Button` (adds a `tone`
  prop). Slot containers: `["MessageList", "Composer"]`.

Each stub must export the same trio core does: real React components, a
`catalog.json` (`{ catalogId, components, $defs }`), and `*Schema` Zod exports —
so no special-casing is needed anywhere in the loader.
```
