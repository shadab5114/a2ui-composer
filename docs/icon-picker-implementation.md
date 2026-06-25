# Icon Picker — Implementation Notes

This document explains how the icon picker for `IconButton` was implemented, the
architectural constraint that drove the design, and how to apply the same pattern
to any other render-prop component in the future.

---

## The problem: function props cannot serialize

`IconButton.renderIcon` is typed as a **React render prop** — a function that
receives `{ size, color }` and returns a `ReactNode`. The design system needs it
to paint an icon on the button. Because it is a function, it:

- cannot be stored in JSON (the doc node's `props` object)
- cannot be round-tripped through `export → import → re-render`
- is classified as `type: object` with no `properties` in the Zod-to-JSON-Schema
  conversion, which the catalog loader interprets as "opaque render function" and
  **skips** (see `catalog.ts → derivePropDescriptor`, `ARCHITECTURE.md §13.3`)

The Inspector therefore never showed `renderIcon` — the prop did not exist in the
descriptor model.

---

## The solution: serializable proxy prop

The architecture document (§13.3) prescribes the fix:

> Production needs a serializable `icon` **enum of names** the renderer resolves.

We implemented exactly this as a two-step bridge:

```
Author picks "Gear"
       │
       ▼
node.props = { icon: "Gear", ... }   ← stored in the doc, survives JSON round-trip
       │
       ▼
IconButtonAdapter (registry.ts)
  looks up PdsIcons["Gear"]
  creates:  renderIcon = (p) => <GearIcon {...p} />
       │
       ▼
real <IconButton renderIcon={...} />  ← receives the function at render time
```

The icon name is the **serializable representation**. The function is
**reconstructed at render time** by the adapter. The design-system component never
sees the string — it only ever receives its expected render prop.

---

## Files changed

### 1. `packages/schema/src/zod-source.ts`

**What changed:** added `ICON_NAMES` constant and augmented the `IconButton` Zod
schema with two new optional enum fields.

**Why:** The Zod schema is the single source of truth for both validation and the
inspector descriptor model. Extending the schema here automatically makes the
catalog loader classify the new fields and the inspector render the right control
— no other wiring needed.

The `augment()` function already existed for `TileContainer` (to mark its
`children` as a slot). The same pattern was extended for `IconButton`:

```ts
if (name === "IconButton" && typeof obj.extend === "function") {
  const iconEnum = z.enum(ICON_NAMES);
  return obj.extend({
    icon: iconEnum.optional().meta({ description: "Icon to display", "x-a2ui-icon-picker": true }),
    selectedIcon: iconEnum.optional().meta({ description: "Icon when selected", "x-a2ui-icon-picker": true }),
  });
}
```

The `.meta({ "x-a2ui-icon-picker": true })` key is emitted into the JSON-Schema
view by `z.toJSONSchema()` — the same mechanism that `x-a2ui-slot` uses for slot
containers (ARCHITECTURE §5.3).

`ICON_NAMES` is exported so both the catalog layer and the inspector UI can import
it from `@pds/a2ui-schema` without depending on the icons package directly.

---

### 2. `packages/schema/src/catalog.types.ts`

**What changed:** added `isIconPicker?: boolean` to `PropDescriptor`.

**Why:** the descriptor model carries all the information the inspector needs to
decide which control widget to render. Adding a flag here means the inspector
makes the decision locally, with no knowledge of icon internals.

```ts
export interface PropDescriptor {
  // ...existing fields...
  isIconPicker?: boolean;  // render icon picker modal instead of plain dropdown
}
```

---

### 3. `packages/schema/src/catalog.ts`

**What changed:** two small additions to `RawSchema` and `derivePropDescriptor`.

Added `"x-a2ui-icon-picker"?: boolean` to `RawSchema` for type safety (alongside
the existing `"x-a2ui-slot"?: boolean`).

In `derivePropDescriptor`, the `enum` branch now propagates the flag:

```ts
if (schema.enum && schema.enum.length > 0) {
  return {
    ...base,
    kind: "enum",
    options: schema.enum.slice(),
    default: schema.default,
    ...(schema["x-a2ui-icon-picker"] ? { isIconPicker: true } : {}),  // ← new
  };
}
```

---

### 4. `packages/schema/src/index.ts`

**What changed:** `ICON_NAMES` added to the public export surface.

```ts
export { getCatalog, buildValidators, rawCatalog, ICON_NAMES } from "./zod-source";
```

This lets `apps/composer` import the icon names from `@pds/a2ui-schema` — the
schema package is already a dependency of the composer, so no new dependency is
introduced.

---

### 5. `packages/renderer/src/registry.ts`

**What changed:** `IconButtonAdapter` replaces `IconButton` in the registry.

The adapter is the render-time half of the bridge. It:

1. intercepts the serializable `icon` / `selectedIcon` string props
2. looks them up in an icon map built from `import * as PdsIcons from
   "@shadab5114/pds-core/icons"`
3. creates `renderIcon` / `renderSelectedIcon` render-prop functions
4. passes everything through to the real `IconButton`

```ts
import * as PdsIcons from "@shadab5114/pds-core/icons";
const iconMap = PdsIcons as unknown as Record<string, IconFC>;

function IconButtonAdapter(props: Record<string, unknown>) {
  const { icon, selectedIcon, ...rest } = props as { icon?: string; selectedIcon?: string; [k: string]: unknown };
  const IconComp   = icon         ? iconMap[icon]         : undefined;
  const SelectedComp = selectedIcon ? iconMap[selectedIcon] : undefined;
  return React.createElement(IconButton, {
    ...rest,
    ...(IconComp   ? { renderIcon:         (p) => React.createElement(IconComp, p)   } : {}),
    ...(SelectedComp ? { renderSelectedIcon: (p) => React.createElement(SelectedComp, p) } : {}),
  });
}

// In registry:
IconButton: IconButtonAdapter,   // was: IconButton
```

`React.createElement` is used instead of JSX so the file stays `.ts` (not
`.tsx`). `registry.ts` is documented as "the seam" (ARCHITECTURE §7.2) — the
single place that swaps stand-ins for production components — so an adapter
function here is architecturally correct.

---

### 6. `apps/composer/src/inspector/fields.tsx`

**What changed:** added `IconPickerControl` component and routed `isIconPicker`
descriptors to it instead of the plain `EnumControl` dropdown.

The picker renders:

- a **browse button** showing the current icon (or "Browse icons…" if none)
- a **modal** (via `createPortal` into `document.body`) containing:
  - search input that filters all 70 icons in real time
  - 5-column grid rendering each icon via the actual component + its name
  - current selection highlighted with a ring
  - "clear icon" button when an icon is already set
  - dismissable via backdrop click, close button, or Escape key

The routing change in `PropField`:

```tsx
{descriptor.kind === "enum" && (
  descriptor.isIconPicker
    ? <IconPickerControl descriptor={descriptor} value={value} onChange={onChange} />
    : <EnumControl       descriptor={descriptor} value={value} onChange={onChange} />
)}
```

---

## Data flow end-to-end

```
1. Catalog build (once at startup)
   zod-source.ts  →  buildRawCatalogFromZod()
     IconButton schema is extended with { icon, selectedIcon } enum fields
     z.toJSONSchema emits "x-a2ui-icon-picker": true on each
   catalog.ts  →  loadCatalog()
     derivePropDescriptor sees x-a2ui-icon-picker → sets isIconPicker: true
   Result: IconButton.props includes { name:"icon", kind:"enum", isIconPicker:true, options:[...70 names] }

2. Author interaction
   Inspector.tsx renders PropField for each prop
   PropField sees isIconPicker → mounts IconPickerControl
   Author opens modal, searches "gear", clicks "Gear"
   onChange("Gear") → store.setProp(nodeId, "icon", "Gear")
   node.props = { ..., icon: "Gear" }

3. Canvas render (continuous)
   Renderer.tsx → renderNode(id, nodes)
   resolveProps passes icon:"Gear" through unchanged
   getComponent("IconButton") returns IconButtonAdapter
   IconButtonAdapter pulls icon → iconMap["Gear"] → GearIcon component
   Creates renderIcon = (p) => React.createElement(GearIcon, p)
   Renders <IconButton renderIcon={...} />  ← canvas shows the gear icon

4. Export
   exportSurface() serializes node.props → { icon: "Gear", ... }
   The A2UI JSON contains the string name, not a function — valid JSON
```

---

## How to apply this pattern to other render-prop components

The roundtrip guard (`bun run check:roundtrip`) currently warns about several
other opaque props:

```
- IconButton.iconOffset           (layout prop, different pattern needed)
- TitleLockup.viewportOverride    (complex — skip for now)
- Accordion.items[].trigger       (render prop — same pattern applies)
- AccordionItem.trigger           (render prop — same pattern applies)
```

To apply the same pattern to `AccordionItem.trigger`:

**Step 1 — decide the serializable representation.** What choices does an author
actually need? For a trigger it might be `{ label: string; icon?: string }` — a
plain object, not a function name enum.

**Step 2 — augment the Zod schema in `zod-source.ts`.**

```ts
if (name === "AccordionItem" && typeof obj.extend === "function") {
  return obj.extend({
    triggerLabel: z.string().optional().describe("Trigger label text"),
    triggerIcon:  z.enum(ICON_NAMES).optional().meta({ "x-a2ui-icon-picker": true, description: "Trigger icon" }),
  });
}
```

**Step 3 — add an adapter in `registry.ts`.**

```ts
function AccordionItemAdapter(props: Record<string, unknown>) {
  const { triggerLabel, triggerIcon, ...rest } = props as { ... };
  const IconComp = triggerIcon ? iconMap[triggerIcon] : undefined;
  return React.createElement(AccordionItem, {
    ...rest,
    trigger: () => React.createElement("span", null,
      triggerLabel ?? "",
      IconComp ? React.createElement(IconComp, { size: 16 }) : null,
    ),
  });
}
// registry: AccordionItem: AccordionItemAdapter
```

**Step 4** — no changes to `catalog.ts` or `fields.tsx` are needed. The existing
`isIconPicker` routing picks up `triggerIcon` automatically, and plain string
fields get a `TextControl`.

---

## Invariants preserved

- The renderer package (`@pds/a2ui-react`) was **not forked** — the adapter lives
  in `registry.ts`, which is the documented seam.
- `bun run check:roundtrip` stays green — the new props are optional and existing
  fixtures contain no `IconButton` nodes.
- The Zod schema remains the single source of truth — the catalog descriptor,
  inspector control, and validation all derive from the one `.extend()` call in
  `zod-source.ts`.
- No `any`-cast escapes beyond the existing `AnyComponent` exception already in
  `registry.ts`.
