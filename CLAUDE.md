# Working notes for Claude Code

This repo is specified in ARCHITECTURE.md — read it first and follow the milestone
order in §10. Do not expand MVP scope (§2).

Tooling is Bun: `bun install`, `bun add`, `bun run <script>`, `bunx <tool>`,
`bun run --filter <pkg> <script>`. Never use npm/pnpm/npx.

## Package access (non-obvious)

The design system + tokens live on **GitHub Packages**, not public npm:

- `@shadab5114/pds-core@1.0.0-alpha.4` — real React components + `catalog.json`
- `@shadab5114/pdesign-tokens@1.0.0-alpha.2` — CSS-variable design tokens

`.npmrc` points the `@shadab5114` scope at `https://npm.pkg.github.com` and reads
the auth token from the `NODE_AUTH_TOKEN` env var. `bun install` needs that env
var set to a GitHub PAT with `read:packages`.

The catalog is imported directly from the package: `@shadab5114/pds-core/catalog.json`
(see ARCHITECTURE §"get catalog.json by importing from @pds-core/catalog.json").
There is no separate `packages/catalog` workspace — the package is the single source.

## Validation + descriptors: Zod (NOT Ajv)

Pivoted away from Ajv. The design system's own **Zod schemas** (`@shadab5114/
pds-core/schemas`, zod v4) are the single source of truth for BOTH:

- **Validation** — a node's props are checked with `Schema.safeParse` (the exact
  contract the components enforce). See `validate.ts` + `zod-source.ts`.
- **Descriptors** — each schema is converted with `z.toJSONSchema(...)` and fed to
  `loadCatalog`, so palette/inspector stay schema-driven from one source.

`zod-source.ts` owns this: it imports the per-component schemas, marks slot props
via `.meta({ "x-a2ui-slot": true })` (which `z.toJSONSchema` emits into the JSON
view), builds the JSON views, and exposes `getCatalog()` + `buildValidators()`.
Content `children` is `z.any()` → an unconstrained `{}` view → classified as
`content`; other unconstrained/record props (renderIcon, viewportOverride) are
skipped + warned. catalog.json is now used only for the `catalogId`.

## Invariants you must preserve

- The renderer package (`@pds/a2ui-react`) is the single rendering path, shared by
  the composer preview and the sandbox. Never fork it.
- The schema package (`@pds/a2ui-schema`) is pure (no React) and is the only home
  for tree⇆adjacency transforms. Keep `bun run check:roundtrip` green.
- A node is droppable only if it is a slot container. Slots are marked on the Zod
  schema with `.meta({ "x-a2ui-slot": true })` (TileContainer); `Frame` is the
  synthetic layout primitive. (An allowlist fallback remains in `catalog.ts` in
  case a slot ever lacks the marker.)
- Page layout is flex auto-layout, never absolute x/y.
- `registry.ts` is the single swap point between stand-ins and `@pds/core`.

## Catalog facts (verified from alpha.3)

- Each component = `allOf: [ComponentCommon(ext), CatalogComponentCommon, {inline props}]`.
  External `a2ui.org` refs do not resolve locally — derive props from the inline
  member + `CatalogComponentCommon.weight`.
- Object props are `$ref` to `#/$defs/*Props` (e.g. `Tilelet.badge` → `BadgeProps`).
- Array props: `ButtonGroup.items` → `type: array, items: $ref ButtonGroupItem`
  (a `oneOf` discriminated by `kind`).
- `IconButton.renderIcon` is `type: object` (a render-prop) and cannot serialize —
  flagged as a known gap (ARCHITECTURE §13.3).
- `Frame` is synthetic (not in catalog); it serializes to A2UI `Column`/`Row`.

No automated test framework in the MVP (§2). Verify each milestone's acceptance
check manually before committing; keep `bun run check:roundtrip` green.

## Known catalog gaps (ARCHITECTURE §13) — surface, don't silently work around

1. No layout primitives in catalog → MVP adds synthetic `Frame` → A2UI Column/Row.
2. `children` content-vs-slot overload → no `x-a2ui-slot`, so allowlist fallback.
3. `IconButton.renderIcon` is a function prop → not serializable; needs an icon enum.
4. `AccordionItem.header` typed string but semantically object → normalize later.
