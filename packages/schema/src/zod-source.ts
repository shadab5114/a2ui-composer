/**
 * The design system's own Zod schemas are the single source of truth for BOTH
 * validation and the descriptor model (tech-stack pivot away from Ajv).
 *
 *  - Validation: a node's props are checked with `Schema.safeParse` — the exact
 *    contract the components enforce at runtime.
 *  - Descriptors: each schema is converted with `z.toJSONSchema(...)` and fed to
 *    `loadCatalog`, so the inspector/palette stay schema-driven with no second
 *    source.
 *  - The content-vs-slot `children` overload is resolved by marking slot props on
 *    the Zod schema with `.meta({ "x-a2ui-slot": true })`, which `z.toJSONSchema`
 *    emits into the JSON-Schema view (ARCHITECTURE §5.3).
 */
import { z, type ZodType } from "zod";
import { schemas as rawSchemas } from "@shadab5114/pds-core/schemas";
import catalogJson from "@shadab5114/pds-core/catalog.json";
import { loadCatalog } from "./catalog";
import type { CatalogModel } from "./catalog.types";

/** Components whose `children` is a slot (id refs), not content. */
const SLOT_CONTAINERS = new Set(["TileContainer"]);

type SchemaMap = Record<string, ZodType>;

const catalogId = (catalogJson as { catalogId: string }).catalogId;

/** Component names the catalog actually exposes (excludes item-only schemas). */
const componentNames: string[] = Object.keys(
  (catalogJson as { components: Record<string, unknown> }).components,
);

/** Attach the slot marker to a slot container's `children` field. */
function augment(name: string, schema: ZodType): ZodType {
  if (!SLOT_CONTAINERS.has(name)) return schema;
  const obj = schema as unknown as {
    shape?: { children?: ZodType };
    extend?: (shape: Record<string, ZodType>) => ZodType;
  };
  if (obj.shape?.children && typeof obj.extend === "function") {
    return obj.extend({
      children: obj.shape.children.meta({ "x-a2ui-slot": true }),
    });
  }
  return schema;
}

/** name → augmented Zod schema (the validators). */
const zodSchemas: SchemaMap = (() => {
  const map: SchemaMap = {};
  const all = rawSchemas as unknown as SchemaMap;
  for (const name of componentNames) {
    const schema = all[`${name}Schema`];
    if (schema) map[name] = augment(name, schema);
  }
  return map;
})();

interface JsonView {
  $defs?: Record<string, unknown>;
  [k: string]: unknown;
}

/** Build a catalog.json-shaped object from the Zod schemas' JSON-Schema views. */
function buildRawCatalogFromZod(): unknown {
  const components: Record<string, unknown> = {};
  const mergedDefs: Record<string, unknown> = {};

  for (const [name, schema] of Object.entries(zodSchemas)) {
    const view = z.toJSONSchema(schema, {
      unrepresentable: "any",
    }) as JsonView;
    if (view.$defs) {
      Object.assign(mergedDefs, view.$defs);
      delete view.$defs;
    }
    components[name] = view;
  }

  return { catalogId, $id: catalogId, components, $defs: mergedDefs };
}

let _catalog: CatalogModel | null = null;
export function getCatalog(): CatalogModel {
  if (!_catalog) _catalog = loadCatalog(buildRawCatalogFromZod());
  return _catalog;
}

export interface Validators {
  catalogId: string;
  byName: Record<string, ZodType>;
}

export function buildValidators(): Validators {
  return { catalogId, byName: zodSchemas };
}

/** Raw catalog metadata, still sourced from the package for the catalog id. */
export const rawCatalog: unknown = catalogJson;
