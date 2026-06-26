# Code Import — Paste JSX/TSX → A2UI

> Feature: a developer pastes existing component code, it renders on the canvas as
> real, editable nodes, and exports A2UI JSON like any other surface.
>
> This is **net-new scope beyond the documented MVP** (ARCHITECTURE §2). It is
> additive and touches no existing render/export/validation behavior.

---

## 1. The core insight

The editor already stores nodes in **component-native prop shape** — the exact
shape JSX attributes are written in — with one transformation: content props are
wrapped as `{ literalString: "…" }`. And the catalog already exposes a normalized
**`PropDescriptor`** per prop that says whether each prop is `content` / `object` /
`array` / `enum` / `bool` / `string` / `number`.

So "paste code → node tree" is the **inverse of the existing exporter**
([transform.ts](../packages/schema/src/transform.ts)), driven by the same
descriptor map, plus a JSX parse front-end. Once the tree exists, the renderer,
inspector, validation, and export paths are **untouched** — they cannot tell a
pasted node from a dragged one.

```
 paste JSX ──▶ @babel/parser ──▶ AST walk ──▶ DocNode tree ──▶ Surface
                                    │
                          PropDescriptor (catalog) drives
                          content/object/array wrapping
```

---

## 2. Data flow end to end

1. User clicks **Import** in the toolbar → `ImportDialog` opens.
2. User pastes code and clicks **Parse & preview**.
3. `importCode(code, catalog)` (pure, in the schema package) returns
   `{ surface, warnings }` or throws `ImportError`.
4. The dialog renders `surface` with the **shared renderer** (`A2UISurface`) — the
   same path as the canvas — and lists warnings.
5. **Add as screen** calls `addSurfaceFromImport(surface)`, which inserts the
   surface + a flow node, makes it active, and selects its root.
6. The surface is now a normal screen: edit in the Inspector, export A2UI.

---

## 3. Changes made (what + where)

### New: `packages/schema/src/import-code.ts` (the whole feature core)

Pure, no React/DOM — lives in the schema package alongside the other tree
transforms (ARCHITECTURE invariant: all tree⇆adjacency logic lives here).

Public surface:

```ts
function importCode(code: string, catalog: CatalogModel): ImportResult
interface ImportResult { surface: Surface; warnings: ImportIssue[] }
interface ImportIssue  { level: "warning" | "error"; message: string; context?: string }
class ImportError extends Error          // thrown for unparseable / empty input
```

Internal structure (top to bottom of the file):

| Section | Responsibility |
|---|---|
| `TEXT_TAGS`, `TEXT_PRIMITIVES`, `HTML_TO_CATALOG` | tag → component mapping tables |
| `SPACE_SCALE`, `RADIUS_SCALE`, `JUSTIFY_CSS`, `ALIGN_CSS`, `parsePx`, `snap` | CSS → design-token helpers |
| `evalNode`, `evalObject` | statically evaluate a Babel expression to a JS value, or `UNSERIALIZABLE` |
| `coerceValue`, `coerceArrayItem` | **descriptor-driven** wrapping into DocNode prop shape |
| `jsxName`, `attrValue`, `textOf`, `collectText` | JSX AST helpers |
| `translateStyle` | inline `style={{…}}` → Box props (with token snapping + warnings) |
| `resolveTag`, `buildElement`, `appendChildren`, `makeBox`, `makeText` | node construction |
| `parseFragment`, `importCode` | entry point: wrap snippet in `<>…</>`, parse, build `Surface` |

### Changed: `packages/schema/src/index.ts`

Re-exports the new public API:

```ts
export { importCode, ImportError } from "./import-code";
export type { ImportResult, ImportIssue } from "./import-code";
```

### Changed: `packages/schema/package.json`

Adds two pure (no-React) deps: `@babel/parser`, `@babel/types`.

### Changed: `apps/composer/src/store/store.ts`

New undoable-store action:

```ts
addSurfaceFromImport: (surface: Surface) => SurfaceId
```

Injects the imported surface, gives it a fresh id on collision, adds a flow-graph
node, sets it active, and selects its root. Non-destructive (adds a screen; never
overwrites the current one).

### New: `apps/composer/src/import/ImportDialog.tsx`

Modal chrome around `importCode`: a source textarea, **Parse & preview** (renders
via `A2UISurface`), a warnings list, and **Add as screen**. Parse errors render
inline. Includes a "Use example" button.

### Changed: `apps/composer/src/App.tsx`

Adds the **Import** toolbar button and renders `<ImportDialog>` when open; on
import it switches to the page view.

### New (dev): `packages/schema/dev/try-import.ts`

Manual smoke check: imports the example snippet, prints the tree, exports A2UI, and
asserts `validate()` passes. Run with `bun run packages/schema/dev/try-import.ts`.

---

## 4. Mapping rules reference

### 4.1 Tag → component type (`resolveTag`)

| Source tag | Maps to | Notes |
|---|---|---|
| A catalog name (`Badge`, `TitleLockup`, …) | that component | 1:1 passthrough |
| `button` / `img` / `a` | `Button` / `Image` / `TextLink` | `HTML_TO_CATALOG` |
| `h1`–`h6`, `p`, `span`, `label`, `small`, `strong`, `b`, `em`, `i` | `Text` | seeds `kind`/`size`/`bold`/`primitive` |
| any other lowercase HTML (`div`, `section`, …) | `Box` | layout primitive; `style` translated |
| an unknown Capitalized name | kept as-is | **warned**; renders as a Fallback box; will fail export validation |

### 4.2 Attribute value → prop (`coerceValue`, keyed by descriptor `kind`)

| Descriptor kind | JSX value | Stored as |
|---|---|---|
| `content` | `"New"` / text child | `{ literalString: "New" }` |
| `object` | `{ children: 'x' }` | recurse `fields` (wraps nested content) |
| `array` | `items={[…]}` | recurse each item via `itemVariants` (matched on `kind`) or `itemFields` |
| `enum` / `string` / `number` | `"4X"` / `3` | passthrough |
| `bool` (shorthand) | `showBorder` | `true` |
| unknown prop | anything | passthrough **+ warning** |

Values that aren't statically analyzable (function props like `onClick`, variables,
calls, spreads) evaluate to `UNSERIALIZABLE`, are **dropped, and warned**.

### 4.3 Inline `style` → Box props (`translateStyle`)

| CSS | Box prop | Token handling |
|---|---|---|
| `display:flex` + `flexDirection` | `direction` | `row`→`horizontal`, else `vertical`; flex w/o direction → `horizontal` |
| `gap` / `rowGap` / `columnGap` | `gap` | px → nearest space token (`16px`→`4X`), warn if not exact |
| `padding` | `padding` | px → nearest space token |
| `justifyContent` | `justify` | mapped; unknown → warn + drop |
| `alignItems` | `align` | mapped; unknown → warn + drop |
| `width` / `height` | raw passthrough | — |
| `background` / `backgroundColor` | `background` | raw |
| `overflow*` | `overflow` | raw |
| `borderRadius` | `borderRadius` | px → nearest radius token |
| `border` | `borderWidth` + `borderColor` | parsed from `"1px solid #ccc"` |
| anything else (`margin`, `boxShadow`, `color`, …) | — | **warn + drop** |

`className`/`class` cannot be resolved (no external stylesheet in scope) → **warn +
drop**.

### 4.4 Children resolution (mirrors the §5.3 children overload)

- **Slot containers** (`isSlotContainer`: `Box`, `TileContainer`): element children
  become child nodes; loose text runs become `Text` child nodes; fragments inline.
- **Content components** (a `children` of kind `content`, e.g. `Text`, `Badge`):
  text children fold into `children: { literalString }`. Nested elements → warn.

### 4.5 Static evaluation & list unrolling (deterministic, no AI)

The snippet is parsed as a **module**, so top-level `const` declarations with
statically-evaluable values (array / object / primitive literals) are collected
into a **scope**. That scope powers three things, all deterministic:

- **Identifier & member resolution** — `ariaLabel={tile.ariaLabel}`,
  `title={{ children: tile.title }}`, and `` `${label} 16` `` resolve against the
  scope instead of being dropped as non-serializable.
- **`.map` unrolling** — `{arr.map((item, i) => <JSX/>)}` over a statically-known
  array expands to one concrete node per element, with `item`/`i` bound per
  iteration. The classic "data array + `.map` grid of cards" snippet imports fully.
- **Conditional children** — `{cond && <X/>}` and `{cond ? <A/> : <B/>}` pick a
  branch when the condition resolves from scope.

When the list data **isn't** statically present (`props.tiles.map(...)`, a hook,
or an imported array), there is nothing to unroll — the list is dropped with a
warning pointing the user to paste the data array alongside the markup (this is the
case the optional AI-align layer is meant to cover). Two more deterministic aids:

- **Component-name aliasing** — an unknown capitalized tag is retried with a
  `Component`/`Widget`/`View`/`Cmp` suffix stripped (`TileletComponent` →
  `Tilelet`), warned when it matches.
- **CSS grid → wrapping row Box** — `display:grid` maps to a horizontal Box with
  `wrap: true`, so a card grid reflows onto multiple lines instead of jamming into
  one row. The exact column count isn't pinned (flex-wrap, not fixed tracks), which
  is warned.

### 4.6 Box change required for grid support

Grid import depends on a `wrap` prop on the synthetic `Box`. It was added in three
places that must stay in sync (the standard `registry.ts` swap seam):

| File | Change |
|---|---|
| [frame.ts](../packages/schema/src/frame.ts) | `wrap` bool `PropDescriptor` on `boxProps` → Inspector toggle + serializes like any Box prop |
| [Box.tsx](../packages/renderer/src/standins/Box.tsx) | `flexWrap: wrap ? "wrap" : undefined` in the stand-in style |
| [import-code.ts](../packages/schema/src/import-code.ts) | `translateStyle` sets `wrap: true` when `display:grid` |

`wrap` has **no default**, so it only appears in export when set (no noise on
ordinary Boxes). Like the rest of `Box`, it's part of the synthetic-primitive
contract: when a real A2UI `Row` replaces the stand-in via `registry.ts`, that
component must honor a wrap field (ARCHITECTURE §13.1).

---

## 5. Warning / error model

- **`ImportError` (thrown)**: empty input, unparseable JSX, or no renderable
  elements. Shown as a red inline message in the dialog; nothing is committed.
- **`ImportIssue` (collected, non-fatal)**: lossy-but-recoverable mappings —
  off-token snaps, dropped CSS, dropped `className`, unknown components/props,
  non-serializable values, mixed text+element content. Listed in the dialog; the
  surface still imports.

Design principle (matches ARCHITECTURE §13 "surface, don't silently work around"):
nothing is dropped quietly. An unknown component is **kept** so structure survives,
and the honest export-validation failure points the user at it.

---

## 6. How to extend

### Add a new HTML element mapping
Edit the tables at the top of `import-code.ts`:
- Text-like element → add to `TEXT_TAGS` (with `kind`/`size`/`bold`).
- Direct catalog alias → add to `HTML_TO_CATALOG`.
- Everything else already falls through to `Box`.

### Support a new CSS property → Box
Add a `case` in `translateStyle`. If Box gains a matching prop, map it; if it's a
token prop, reuse `snap(parsePx(raw), SPACE_SCALE|RADIUS_SCALE)`; otherwise warn.

### Map CSS to a *new* Box capability
If you want, say, `margin` support: first add the prop to the Box model
([frame.ts](../packages/schema/src/frame.ts)) and the Box stand-in
([Box.tsx](../packages/renderer/src/standins/Box.tsx)), then add the `translateStyle`
case. Keep the model/stand-in/translation in sync.

### Tighten value coercion for a new prop kind
`coerceValue` switches on `PropDescriptor.kind`. New kinds added to the catalog
model are handled in one place here (and they fall through to passthrough until you
add a case).

### Accept richer expressions (e.g. simple arithmetic, enum identifiers)
Extend `evalNode`. It currently handles literals, templates without
interpolation, unary minus, arrays, and objects. Add cases conservatively —
anything that can't be made fully static must still return `UNSERIALIZABLE`.

### Resolve `className` against a known stylesheet/theme
Today it's dropped. To support it, pass a class→style map into `importCode` (new
optional arg) and translate matched classes through `translateStyle`.

### Change where imports land
`addSurfaceFromImport` adds a new screen. To instead replace the active surface,
add a sibling store action that swaps `doc.surfaces[activeSurfaceId]` (preserving
the id) — but keep the additive one as the default (non-destructive).

### Map data bindings
Content currently imports as literals. To import a binding, detect a chosen syntax
in `evalNode`/`coerceValue` (e.g. a `{ $path: "/user/name" }` object or a tagged
template) and emit `{ path }` instead of `{ literalString }`; the exporter already
collects `path`s into the data model.

---

## 7. Known limitations (current version)

1. **Non-static props are dropped** (function props, variables/data not present in
   the snippet, runtime calls). Values that *can* be resolved from a top-level
   `const` are kept (see §4.5). All drops are warned.
2. **Dynamic lists with off-snippet data** can't be unrolled — `props.x.map(...)`,
   hooks, or imported arrays have no static value. A literal array in the same
   paste unrolls fully (§4.5).
3. **Mixed text + elements** inside a content component (e.g. `<p>a <span/> b</p>`)
   drops the nested element. Warned.
4. **Off-token CSS** is snapped to the nearest design token (lossy but on-brand);
   non-token CSS props are dropped. Both warned.
5. **CSS grid column count isn't pinned** — `display:grid` maps to a wrapping
   horizontal Box (`wrap: true`, see §4.6), so cards reflow across lines, but the
   exact `repeat(N, …)` column count is not enforced. Warned.
6. **`className`** is ignored (no stylesheet resolution). Warned.
7. **Unknown components** are preserved but fail export validation until renamed to
   a catalog component (suffix aliases like `XComponent`→`X` are resolved
   automatically).

---

## 8. Verification done

- `importCode` on the example snippet → expected tree; `exportSurface` → valid
  A2UI; `validate()` passes (see `dev/try-import.ts`).
- Broad HTML/CSS snippet exercises headings, arbitrary CSS, unknown component,
  `className`, function props, dynamic children — each surfaces the right warning.
- `bun run check:roundtrip` still green (existing transforms unaffected).
- Composer typechecks (`tsc --noEmit`) and builds (`vite build`) — confirms
  `@babel/parser` bundles for the browser.
