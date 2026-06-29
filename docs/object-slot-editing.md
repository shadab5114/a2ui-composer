# Object-slot editing (named slot zones on the canvas)

> Feature design + implementation notes. Companion to `ARCHITECTURE.md` §13 (catalog
> gaps). Captures *why* the editor grew a synthetic `Slot` node and how the import →
> canvas → export pipeline handles components like `ComposableTileContainer`.

## 1. The problem

Some design-system components accept structured content through **object-valued
props**, not just their default `children`. The canonical example is
`ComposableTileContainer`:

```jsx
<ComposableTileContainer
  surface="lightPrimary"
  header={{
    padding: 'var(--vds-space-4x)',
    backgroundColor: 'var(--vds-color-white)',
    children: (                                   // ← a JSX subtree, not a string
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <Text kind="body" size="small" bold>Best value</Text>
        <PriceLookup price="89.99" term="month" />
      </div>
    ),
  }}
  cap={{ backgroundColor: 'red', children: <Text>Best value!</Text> }}
>
  <Accordion>…</Accordion>                        {/* ← the default `children` (body) */}
</ComposableTileContainer>
```

`header`, `cap`, and `footer` each carry **scalar fields** (`padding`,
`backgroundColor`, …) **plus a `children` field that is a whole subtree of nodes**.

The original importer (`import-code.ts`) modelled object props as statically
evaluable JS only: `evalNode` → `evalObject`. A JSX value inside `children` is
`UNSERIALIZABLE`, so the *entire* `header`/`cap` object was dropped on import. Even
if it hadn't been, the inspector had no control for a node subtree, and the renderer
had no way to turn a stored subtree back into a React `children` for the real
component.

**Goal:** map these object slots to real nodes so they (a) render on the canvas,
(b) are editable — add / remove / reorder children intuitively, and (c) export to
valid A2UI JSON.

## 2. Why the schema already gets us halfway

Dumping the Zod → JSON-Schema view of `ComposableTileContainer.header` showed it is a
well-formed object: `eyebrow, title, subtitle, children, ariaLabel, backgroundColor,
height, padding`. That matters because:

- The catalog loader (`catalog.ts`) already turns an object prop into a
  `PropDescriptor { kind: "object", fields: [...] }`.
- The inspector (`fields.tsx`) is already **fully recursive** — `ObjectControl`
  renders nested `fields` and recurses `PropField`.

So the *scalar* half of `header` (padding, backgroundColor, …) was always one step
from being editable. The only genuinely missing piece was the `children` field — the
**content-vs-slot overload** (ARCHITECTURE §13.2), now nested one level inside a prop.
An unconstrained `children` is classified `kind: "content"` (a `DynamicString`),
which is right for `"2 special gifts"` and wrong for a `<div>` of components.

## 3. Two models considered

**Model A — keep it a prop, add an in-prop slot.** Store `header.children` as a
`{ $slot: NodeId[] }` marker inside the prop. Faithful to the component API, but the
canvas dnd, selection, and a new `SlotControl` would all have to learn to target
nodes that hang off a *prop* rather than off `node.children`. Net-new interaction
surface; the slot would feel second-class next to the real canvas.

**Model B — explode the object slot into a synthetic child node.** On import, lift
`header`/`cap` into first-class child nodes of a synthetic `Slot` type; collapse them
back on export. The slot becomes *just a node*, so the **entire existing
canvas/tree/dnd/inspector stack applies unchanged**.

**Chosen: Model B.** The deciding question was "which makes add/remove/reorder
intuitive?" Model B reuses `PageCanvas`, `TreePanel`, `InsertZone`, palette dnd, and
selection with zero new editing UI. Its only real cost is a contained explode ↔
collapse transform that must keep `bun run check:roundtrip` green.

## 4. The data model

A synthetic **`Slot`** node (sibling concept to the synthetic `Box`/`Frame`):

```ts
{
  id,
  type: "Slot",                         // SLOT_TYPE
  props: { padding, backgroundColor },  // the object prop's scalar fields
  children: [nodeId, …],                // the editable subtree
  editorMeta: { slotOf: "header" },     // which object prop this fills on the parent
}
```

It lives in its parent's `children` array, alongside ordinary (body) children. The
link to the parent prop is carried entirely by `editorMeta.slotOf`, so nothing else
in the pipeline needs catalog access to route it.

A parent then looks like:

```ts
{ type: "ComposableTileContainer",
  props: { surface, padding },                    // NO header/cap in props
  children: [headerSlotId, capSlotId, footerSlotId, ...bodyChildIds] }
```

Slot wrappers are **editor-only** — they are never emitted as A2UI components.

## 5. Pipeline

```
 paste JSX ──importCode──▶  ┌────────────┐  ──exportSurface──▶  A2UI JSON
                            │  Slot node │
 A2UI JSON ─importSurface─▶ │ (editor)   │  ──renderNode────▶   canvas / sandbox
                            └────────────┘
```

### 5.1 Catalog (`catalog.ts`, `zod-source.ts`, `catalog.types.ts`)

- `OBJECT_SLOT_PROPS = { ComposableTileContainer: {cap, header, footer} }` — an
  allowlist (same precedent as `SLOT_ALLOWLIST`, because the marker can't be put on
  the upstream Zod schema cleanly). The slot field within each is `children`.
- `deriveComponent` tags such object descriptors `objectSlot: true`,
  `slotField: "children"`, and drops the `children` field from the inspector `fields`
  (it's edited on the canvas, not as a text box).
- `ComposableTileContainer` is added to `SLOT_ALLOWLIST` (so its *body* `children` is
  a slot) and to the `Containers` palette group.
- The synthetic `Slot` model (`slotComponentModel`) is injected into the catalog as a
  slot container, but **excluded from `order`/`groups`** so it never shows in the
  palette — `Slot`s are only created by import/transform/store, never by hand.

### 5.2 Import from code (`import-code.ts`)

- `buildObjectSlot` explodes `header={{ padding, children: <JSX/> }}` into a `Slot`
  node: scalar fields → `props` (coerced via the descriptor `fields`), `children` JSX
  → child subtree via the existing `buildChildExpression`.
- In the attribute loop, a prop whose descriptor has `objectSlot` is routed here
  instead of `coerceValue` (which would drop the JSX).
- After building a node, any **declared object-slot absent from the source** is
  materialised as an empty `Slot` (so an imported tile that only set `header` still
  shows `cap`/`footer` drop zones).

### 5.3 Render (`Renderer.tsx`, `registry.ts`, `standins/SlotBox.tsx`)

- `renderNode` partitions a node's children into **slot wrappers** (have
  `editorMeta.slotOf`) and **body children**, keeping each body child's *real* index
  in `node.children` so insert zones address the same array the store splices into.
- For each slot wrapper it reconstitutes the object prop:
  `resolved[slotOf] = { ...scalarProps, children: <rendered subtree> }`, then renders
  only the body children as the component's JSX children.
- `Slot` → `SlotBox` (a transparent vertical passthrough; scalar styling is applied
  by the real parent component, not by `SlotBox`).
- `ComposableTileContainer` + `Slot` added to the registry.

Because the slot subtree is rendered through `renderNode`, it is wrapped by the
editor's `EditorNode` chrome → selectable, droppable, with insert zones — for free.

### 5.4 Export / A2UI import (`transform.ts`)

- **Export (collapse):** a `Slot` child is folded back into the parent's object prop
  as `header = { ...scalars, children: ["id", …] }` (id-ref array, parallel to a
  normal `children`); the slot's subtree is still emitted as components. The `Slot`
  node itself is never emitted. **Empty, prop-less slots are skipped** — scaffolding
  must not pollute the output.
- **A2UI import (expand):** a prop whose value is `{ …, children: [strings] }`
  (`isObjectSlotValue`) is expanded back into a `Slot` node prepended to the parent's
  children. The id-ref-array shape is the exact, unambiguous inverse of export (and is
  distinguishable from a content object, whose `children` is a `DynamicString`).

### 5.5 Editor surfaces

- **Inspector** (`Inspector.tsx`): a selected `Slot` derives its editable fields from
  the parent component's object-slot descriptor (`useSlotFields`). Object-slot props
  are hidden from the parent's own inspector list — they're canvas zones now.
- **Tree** (`TreePanel.tsx`): `Slot` rows are labelled by `slotOf` (`header`/`cap`/
  `footer`) with a distinct icon and a `slot` tag, so the hierarchy shows where
  content lives.
- **Canvas chrome** (`EditorNode.tsx`): `Slot` wrappers are droppable slot containers
  but are guarded from being dragged out or deleted (they are bound to the parent
  prop); the empty-zone placeholder reads `header slot · drop here`.
- **Store** (`store.ts`): `addNode` materialises a component's empty slot zones via
  `emptySlotNodesFor`, so palette-dropping a tile immediately shows `cap`/`header`/
  `footer` targets.

## 6. Named slot zones + body drop zone (the UX layer)

The first cut worked but read poorly: the tree said "Slot" and the inspector showed
confusing nested object panels with no way to add children. The fix made slots
**visible, named drop targets on the canvas**:

- Empty slot zones are always present (materialised on add/import) and render where
  the real component places them — WYSIWYG `cap` / `header` / `footer` regions.
- A **persistent body drop zone** (`BodyDropZone.tsx`) is appended to the end of every
  container that already has children, so the default `children` (body) also visibly
  accepts content. It is editor-only (a new `bodyZone` render option, undefined in the
  sandbox) and reuses the `source: "insert"` drop contract, so `App.tsx`'s
  `onDragEnd` handles it with no new wiring.

Affordance split:

| Container state | What the user sees |
|---|---|
| Empty (0 children) | Full-size empty-slot placeholder — the whole region is the target |
| Has children | Children render + a slim persistent "drop here" at the body's end |
| Box/Slot mid-drag | Inter-child insert zones (positioning) + the body zone at the end |
| `ComposableTileContainer` | `cap`/`header`/`footer` zones + a body zone for the main content |

## 7. Invariants preserved

- **Single render path** — the composer canvas and the sandbox both go through
  `renderNode`; slot reconstruction is in that one function. The sandbox passes no
  `wrapNode`/`insertZone`/`bodyZone`, so it renders the real component cleanly.
- **Schema package stays pure** (no React) and remains the only home for the
  tree ⇆ adjacency transform, now including slot collapse/expand.
- **Round-trip** — `export(import(x))` is deep-equal for every fixture; a new
  `04-slots.json` fixture exercises a `header` object slot. Export emission order
  (parent → slot subtree → body) matches import-time prepend order.
- **`Frame` precedent** — `Slot` mirrors how the synthetic `Box`/`Frame` primitive is
  modelled, registered, and excluded from serialisation.

## 8. Files touched

**`packages/schema`**
- `catalog.types.ts` — `objectSlot` / `slotField` on `PropDescriptor`.
- `frame.ts` — `SLOT_TYPE`, `slotComponentModel`.
- `catalog.ts` — `OBJECT_SLOT_PROPS`, object-slot tagging, `ComposableTileContainer`
  in `SLOT_ALLOWLIST` + groups, inject `Slot` model + exclude from palette.
- `doc.types.ts` — `editorMeta.slotOf`.
- `import-code.ts` — `buildObjectSlot`, explode in attr loop, materialise missing
  slots, slot-aware children assembly.
- `transform.ts` — export collapse (skip empty) + A2UI import expand
  (`isObjectSlotValue`).
- `factory.ts` — `emptySlotNodesFor`.
- `index.ts` — export `SLOT_TYPE` / `slotComponentModel`.
- `dev/fixtures/04-slots.json` + `dev/roundtrip-guard.ts` — new slot fixture.

**`packages/renderer`**
- `Renderer.tsx` — slot partition + object-prop reconstruction; `bodyZone` option;
  real-index insert zones.
- `registry.ts` — `ComposableTileContainer`, `Slot` → `SlotBox`.
- `standins/SlotBox.tsx` — new transparent slot container.

**`apps/composer`**
- `store/store.ts` — materialise slot zones in `addNode`.
- `inspector/Inspector.tsx` — `useSlotFields`; hide object-slot props.
- `tree/TreePanel.tsx` — slot label + icon + tag.
- `page-canvas/EditorNode.tsx` — slot label, drag/delete guards, slot-aware
  `boxHasChildren`, compact empty-zone height.
- `page-canvas/BodyDropZone.tsx` — new persistent body affordance.
- `page-canvas/PageCanvas.tsx` — wire `bodyZone`.

## 9. Known gaps / next steps

- `PriceLookup` and `IconList` are **not in the catalog** (alpha.4 = 22 components),
  so they currently render as fallback boxes. Wiring them needs catalog/registry
  entries (or synthetic descriptors).
- `renderIcon={(p) => <Gift/>}` render-prop functions still drop with a warning
  (ARCHITECTURE §13.3). The fix is the icon-enum bridge already used for
  `IconButton`, generalised to `Badge`/`IconList`/standalone icons + a larger
  `ICON_NAMES`.
- Object-slot `header` also exposes structured `eyebrow`/`title`/`subtitle` content;
  today the slot model uses the freeform `children` path. Reconciling the two
  (structured lockup vs freeform slot) is a later refinement.
- A2UI-imported (not paste-imported) tiles only show slots that had content;
  auto-materialising empty zones in `importSurface` would need catalog access in the
  pure transform.

## 10. Verification

- `bun run check:roundtrip` — all fixtures incl. `04-slots` round-trip + validate.
- `bun run --filter @pds/a2ui-react typecheck` and `--filter @pds/composer typecheck`
  — clean. (Pre-existing, unrelated errors remain in `dev/dump-catalog.ts` and the
  sandbox `App.tsx`.)
- Manual: a pasted `ComposableTileContainer` with `header`+`cap` exploded into `Slot`
  nodes, exported **VALID** A2UI, and round-tripped equal; a fresh palette-added tile
  materialised `cap`/`header`/`footer`; empty zones stayed out of the export.
