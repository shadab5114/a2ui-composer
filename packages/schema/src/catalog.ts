/**
 * loadCatalog(json) → a normalized CatalogModel.
 *
 * Derives a PropDescriptor list per component straight from the JSON Schema, so the
 * inspector and palette are fully schema-driven (no hand-written forms).
 *
 * Catalog shape (verified, alpha.3): each component is
 *   allOf: [ <external ComponentCommon ref>, <#/$defs/CatalogComponentCommon>, { inline props } ]
 * External a2ui.org refs do not resolve locally, so we derive from the inline
 * member plus CatalogComponentCommon. Object props are `$ref` to `#/$defs/*Props`;
 * array props resolve `items` (incl. `oneOf` discriminated unions).
 */
import type {
  CatalogModel,
  ComponentModel,
  ItemVariant,
  PropDescriptor,
} from "./catalog.types";
import { frameComponentModel, FRAME_TYPE } from "./frame";

interface RawSchema {
  type?: string;
  description?: string;
  enum?: string[];
  default?: unknown;
  const?: unknown;
  $ref?: string;
  properties?: Record<string, RawSchema>;
  required?: string[];
  items?: RawSchema;
  allOf?: RawSchema[];
  oneOf?: RawSchema[];
  anyOf?: RawSchema[];
  "x-a2ui-slot"?: boolean;
  "x-a2ui-icon-picker"?: boolean;
  [k: string]: unknown;
}

interface RawCatalog {
  catalogId: string;
  components: Record<string, RawSchema>;
  $defs?: Record<string, RawSchema>;
}

/** Allowlist fallback used when the catalog lacks `x-a2ui-slot` (ARCHITECTURE §5.3). */
const SLOT_ALLOWLIST = new Set([FRAME_TYPE, "TileContainer"]);

/** Curated palette grouping — the catalog carries no group metadata. */
const GROUPS: Record<string, string> = {
  Button: "Actions",
  TextLink: "Actions",
  TextLinkCaret: "Actions",
  ButtonGroup: "Actions",
  IconButton: "Actions",
  Text: "Content",
  Image: "Content",
  Badge: "Content",
  BadgeIndicator: "Content",
  ScreenReaderText: "Content",
  TileContainer: "Containers",
  Tilelet: "Containers",
  Accordion: "Containers",
  AccordionItem: "Containers",
  TitleLockup: "Lockups",
  TitleLockupTitle: "Lockups",
  TitleLockupSubtitle: "Lockups",
  TitleLockupEyebrow: "Lockups",
  Caret: "Icons",
  DirectionalIcon: "Icons",
  Tooltip: "Overlay",
};

const MAX_OBJECT_DEPTH = 2;

function isDynamicStringRef(ref: string): boolean {
  return ref.includes("DynamicString");
}

/** True if a schema imposes no constraints (e.g. z.any() → `{}` plus a description). */
function isUnconstrained(s: RawSchema): boolean {
  return (
    s.type === undefined &&
    s.enum === undefined &&
    s.$ref === undefined &&
    s.const === undefined &&
    s.properties === undefined &&
    s.items === undefined &&
    s.oneOf === undefined &&
    s.anyOf === undefined &&
    s.allOf === undefined
  );
}

function localDefName(ref: string): string | null {
  const m = ref.match(/#\/\$defs\/([A-Za-z0-9_]+)$/);
  return m ? m[1] : null;
}

/** Merge inline properties across allOf members and resolved local $defs. */
function collectProperties(
  schema: RawSchema,
  defs: Record<string, RawSchema>,
): { properties: Record<string, RawSchema>; required: Set<string> } {
  const properties: Record<string, RawSchema> = {};
  const required = new Set<string>();

  const absorb = (s: RawSchema | undefined): void => {
    if (!s) return;
    if (s.$ref) {
      const name = localDefName(s.$ref);
      // Only follow local refs (e.g. CatalogComponentCommon); external a2ui.org
      // structural refs (id/component) are intentionally skipped.
      if (name && defs[name]) absorb(defs[name]);
      return;
    }
    if (s.properties) {
      for (const [k, v] of Object.entries(s.properties)) properties[k] = v;
    }
    if (s.required) for (const r of s.required) required.add(r);
    if (s.allOf) for (const m of s.allOf) absorb(m);
  };

  absorb(schema);
  return { properties, required };
}

function resolveFields(
  objSchema: RawSchema,
  defs: Record<string, RawSchema>,
  warnings: string[],
  depth: number,
  ownerLabel: string,
): PropDescriptor[] {
  if (depth > MAX_OBJECT_DEPTH) return [];
  const { properties, required } = collectProperties(objSchema, defs);
  const out: PropDescriptor[] = [];
  for (const [name, propSchema] of Object.entries(properties)) {
    if (name === "component") continue;
    const desc = derivePropDescriptor(
      name,
      propSchema,
      defs,
      required.has(name),
      warnings,
      depth,
      ownerLabel,
    );
    if (desc) out.push(desc);
  }
  return out;
}

function deriveArray(
  name: string,
  schema: RawSchema,
  defs: Record<string, RawSchema>,
  warnings: string[],
  depth: number,
  ownerLabel: string,
): Pick<PropDescriptor, "itemFields" | "itemVariants" | "itemDiscriminator"> {
  const items = schema.items;
  if (!items) return {};

  let itemDef: RawSchema | undefined = items;
  if (items.$ref) {
    const defName = localDefName(items.$ref);
    if (defName && defs[defName]) itemDef = defs[defName];
  }
  if (!itemDef) return {};

  // z.toJSONSchema emits discriminated unions as `anyOf`; raw catalog used `oneOf`.
  const union = itemDef.oneOf ?? itemDef.anyOf;
  if (union && union.length > 0) {
    const discriminator = "kind";
    const variants: ItemVariant[] = [];
    for (const variant of union) {
      const fields = resolveFields(
        variant,
        defs,
        warnings,
        depth + 1,
        `${ownerLabel}.${name}[]`,
      ).filter((f) => f.name !== discriminator);
      const disc = variant.properties?.[discriminator];
      const values = disc?.enum ?? (disc?.const != null ? [String(disc.const)] : []);
      for (const value of values) variants.push({ value, fields });
    }
    return { itemVariants: variants, itemDiscriminator: discriminator };
  }

  const itemFields = resolveFields(
    itemDef,
    defs,
    warnings,
    depth + 1,
    `${ownerLabel}.${name}[]`,
  );
  return { itemFields };
}

function derivePropDescriptor(
  name: string,
  schema: RawSchema,
  defs: Record<string, RawSchema>,
  required: boolean,
  warnings: string[],
  depth: number,
  ownerLabel: string,
): PropDescriptor | null {
  const base = { name, required, description: schema.description };

  // An unconstrained schema (z.any() → `{}` after toJSONSchema) is either the
  // DynamicString `children` content slot, or a non-serializable opaque prop.
  if (isUnconstrained(schema)) {
    if (name === "children") return { ...base, kind: "content" };
    warnings.push(
      `${ownerLabel}.${name}: unconstrained prop (z.any) that is not content — skipped.`,
    );
    return null;
  }

  // $ref: content (DynamicString) or nested object (*Props)
  if (schema.$ref) {
    if (isDynamicStringRef(schema.$ref)) {
      return { ...base, kind: "content" };
    }
    const defName = localDefName(schema.$ref);
    if (defName && defs[defName]) {
      const fields = resolveFields(
        defs[defName],
        defs,
        warnings,
        depth + 1,
        `${ownerLabel}.${name}`,
      );
      return { ...base, kind: "object", fields };
    }
    // Unresolvable external ref that is not DynamicString → treat as free text.
    return { ...base, kind: "string" };
  }

  if (schema.enum && schema.enum.length > 0) {
    return {
      ...base,
      kind: "enum",
      options: schema.enum.slice(),
      default: schema.default,
      ...(schema["x-a2ui-icon-picker"] ? { isIconPicker: true } : {}),
    };
  }

  switch (schema.type) {
    case "boolean":
      return { ...base, kind: "bool", default: schema.default ?? false };
    case "number":
    case "integer":
      return { ...base, kind: "number", default: schema.default };
    case "array": {
      const arr = deriveArray(name, schema, defs, warnings, depth, ownerLabel);
      return { ...base, kind: "array", ...arr };
    }
    case "object": {
      if (schema.properties) {
        const fields = resolveFields(
          schema,
          defs,
          warnings,
          depth + 1,
          `${ownerLabel}.${name}`,
        );
        return { ...base, kind: "object", fields };
      }
      // type:object with no shape = a function/render-prop (e.g. IconButton.renderIcon).
      // Cannot serialize (ARCHITECTURE §13.3). Skip it and surface a warning.
      warnings.push(
        `${ownerLabel}.${name}: opaque object prop (likely a render function) — not serializable; skipped.`,
      );
      return null;
    }
    case "string":
      return { ...base, kind: "string", default: schema.default };
    default:
      return { ...base, kind: "string", default: schema.default };
  }
}

function deriveComponent(
  name: string,
  schema: RawSchema,
  defs: Record<string, RawSchema>,
  warnings: string[],
): ComponentModel {
  const { properties, required } = collectProperties(schema, defs);
  const props: PropDescriptor[] = [];
  let slotProp: string | undefined;

  for (const [propName, propSchema] of Object.entries(properties)) {
    if (propName === "component") continue;

    const markedSlot = propSchema["x-a2ui-slot"] === true;
    const allowlistedSlot =
      propName === "children" && SLOT_ALLOWLIST.has(name);
    const isSlot = markedSlot || allowlistedSlot;

    if (isSlot) {
      slotProp = propName;
      continue; // slot children are managed on the canvas, not the inspector
    }

    const desc = derivePropDescriptor(
      propName,
      propSchema,
      defs,
      required.has(propName),
      warnings,
      0,
      name,
    );
    if (desc) props.push(desc);
  }

  return {
    name,
    group: GROUPS[name] ?? "Other",
    description: schema.description,
    props,
    slotProp,
    isSlotContainer: slotProp !== undefined,
  };
}

export function loadCatalog(json: unknown): CatalogModel {
  const raw = json as RawCatalog;
  const defs = raw.$defs ?? {};
  const warnings: string[] = [];

  const components: Record<string, ComponentModel> = {};
  for (const [name, schema] of Object.entries(raw.components)) {
    components[name] = deriveComponent(name, schema, defs, warnings);
  }

  // Inject the synthetic Frame layout primitive (ARCHITECTURE §13.1).
  components[FRAME_TYPE] = frameComponentModel;

  // Warn loudly if no slot was marked — we fell back to the allowlist.
  const hasMarkedSlot = Object.values(raw.components).some((c) =>
    JSON.stringify(c).includes("x-a2ui-slot"),
  );
  if (!hasMarkedSlot) {
    warnings.push(
      "catalog.json has no `x-a2ui-slot` keyword; using allowlist fallback for slot containers (Frame, TileContainer). Add x-a2ui-slot to fix (ARCHITECTURE §5.3).",
    );
  }

  const order = Object.keys(components);
  const groups: Record<string, string[]> = {};
  for (const name of order) {
    const g = components[name].group;
    (groups[g] ??= []).push(name);
  }

  return { catalogId: raw.catalogId, components, order, groups, warnings };
}
