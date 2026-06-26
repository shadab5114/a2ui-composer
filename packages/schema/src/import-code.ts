/**
 * importCode(code, catalog) — paste real JSX/TSX → an editor `Surface`.
 *
 * This is the inverse of the exporter ([transform.ts]) plus a parse front-end. It
 * is **pure** (no React/DOM) so it belongs in the schema package alongside the
 * other tree transforms. The conversion is descriptor-driven: for every prop we
 * look up its `PropDescriptor.kind` and apply the exact wrapping the rest of the
 * tool expects (content → `{ literalString }`, object → recurse `fields`, array →
 * recurse `itemFields`/`itemVariants`). The renderer, inspector, validation, and
 * export paths are untouched — they cannot tell a pasted node from a dragged one.
 *
 * Scope is broad (arbitrary HTML/CSS): catalog component names pass through 1:1,
 * text-bearing HTML maps to `Text`, every other element maps to the synthetic
 * `Box`, and inline `style` is translated to Box layout props (token-snapped where
 * Box expects a design token, raw CSS otherwise). Anything that cannot be cleanly
 * represented is surfaced as a warning rather than silently dropped.
 *
 * Static evaluation: the input is parsed as a module, so top-level `const`
 * declarations with statically-evaluable values (array/object/primitive literals)
 * are collected into a scope. That scope lets us resolve `{item.field}` prop values
 * and **unroll `arr.map(item => <JSX/>)`** over a literal array into concrete nodes
 * — no runtime, no AI. Lists whose data isn't statically present are surfaced as a
 * warning, not silently dropped.
 */
import { parse, parseExpression } from "@babel/parser";
import type {
  CallExpression,
  Expression,
  JSXAttribute,
  JSXElement,
  JSXFragment,
  JSXMemberExpression,
  JSXNamespacedName,
  JSXIdentifier,
  Node as BabelNode,
  ObjectExpression,
} from "@babel/types";
import type { CatalogModel, ComponentModel, PropDescriptor } from "./catalog.types";
import type { DocNode, NodeId, Surface } from "./doc.types";
import { createNode, newId } from "./factory";
import { FRAME_TYPE } from "./frame";

export interface ImportIssue {
  level: "warning" | "error";
  message: string;
  /** Component / prop context, e.g. `TitleLockup.title`. */
  context?: string;
}

export interface ImportResult {
  surface: Surface;
  warnings: ImportIssue[];
}

export class ImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportError";
  }
}

/** Statically-known bindings (from `const` decls + `.map` loop variables). */
type Scope = Record<string, unknown>;
const EMPTY_SCOPE: Scope = {};

/** A JSX child node, as found in `JSXElement.children` (also covers our roots). */
type JSXChild = JSXElement["children"][number];

// ── HTML element mapping ──────────────────────────────────────────────────────

/** Lowercase HTML tags whose content is text → mapped to the `Text` component. */
const TEXT_TAGS: Record<string, { kind: string; size?: string; bold?: boolean }> = {
  h1: { kind: "title", size: "2xlarge" },
  h2: { kind: "title", size: "xlarge" },
  h3: { kind: "title", size: "large" },
  h4: { kind: "title", size: "medium" },
  h5: { kind: "title", size: "small" },
  h6: { kind: "title", size: "xsmall" },
  p: { kind: "body", size: "medium" },
  span: { kind: "body" },
  label: { kind: "body" },
  small: { kind: "body", size: "small" },
  strong: { kind: "body", bold: true },
  b: { kind: "body", bold: true },
  em: { kind: "body" },
  i: { kind: "body" },
};

/** Valid `Text.primitive` values — only set it when the source tag is one. */
const TEXT_PRIMITIVES = new Set(["h1", "h2", "h3", "h4", "h5", "h6", "p", "span"]);

/** Lowercase HTML tags that map directly onto a catalog component. */
const HTML_TO_CATALOG: Record<string, string> = {
  button: "Button",
  img: "Image",
  a: "TextLink",
};

/** Component-name suffixes stripped when matching an unknown tag to the catalog. */
const COMPONENT_SUFFIXES = ["Component", "Widget", "View", "Cmp"];

/** Map `TileletComponent` → `Tilelet` when only the suffixed name was used. */
function stripComponentSuffix(tag: string): string | null {
  for (const suffix of COMPONENT_SUFFIXES) {
    if (tag.length > suffix.length && tag.endsWith(suffix)) {
      const base = tag.slice(0, -suffix.length);
      if (/^[A-Z]/.test(base)) return base;
    }
  }
  return null;
}

// ── CSS → Box-prop translation ────────────────────────────────────────────────

/** Space token scale (px) — used to snap CSS lengths to the nearest VDS token. */
const SPACE_SCALE: Array<[number, string]> = [
  [0, "0"], [4, "1X"], [8, "2X"], [12, "3X"], [16, "4X"], [24, "6X"], [32, "8X"],
];
const RADIUS_SCALE: Array<[number, string]> = [
  [0, "0"], [4, "small"], [8, "medium"], [12, "large"],
];

const JUSTIFY_CSS: Record<string, string> = {
  "flex-start": "start",
  start: "start",
  center: "center",
  "flex-end": "end",
  end: "end",
  "space-between": "between",
  "space-around": "around",
};
const ALIGN_CSS: Record<string, string> = {
  "flex-start": "start",
  start: "start",
  center: "center",
  "flex-end": "end",
  end: "end",
  stretch: "stretch",
};

function parsePx(v: unknown): number | null {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const m = v.trim().match(/^(-?\d+(?:\.\d+)?)(px)?$/);
    if (m) return parseFloat(m[1]);
  }
  return null;
}

/** Snap a px length to the nearest scale token. Returns the token + whether it was exact. */
function snap(px: number, scale: Array<[number, string]>): { token: string; exact: boolean } {
  let best = scale[0];
  for (const entry of scale) {
    if (Math.abs(entry[0] - px) < Math.abs(best[0] - px)) best = entry;
  }
  return { token: best[1], exact: best[0] === px };
}

// ── Static evaluation of JSX expression values ────────────────────────────────

/** Marker returned for AST we cannot statically serialize (functions, calls, …). */
const UNSERIALIZABLE = Symbol("unserializable");

/**
 * Convert a Babel expression to a plain JS value against `scope`, or
 * `UNSERIALIZABLE` if it depends on runtime state not present in scope.
 */
function evalNode(node: BabelNode | null | undefined, scope: Scope = EMPTY_SCOPE): unknown {
  if (!node) return undefined;
  switch (node.type) {
    case "StringLiteral":
    case "NumericLiteral":
    case "BooleanLiteral":
      return node.value;
    case "NullLiteral":
      return null;
    case "Identifier":
      if (node.name === "undefined") return undefined;
      return node.name in scope ? scope[node.name] : UNSERIALIZABLE;
    case "MemberExpression":
    case "OptionalMemberExpression": {
      const obj = evalNode(node.object as BabelNode, scope);
      if (obj === UNSERIALIZABLE || obj == null || typeof obj !== "object") return UNSERIALIZABLE;
      let key: string | number | null = null;
      if (!node.computed && node.property.type === "Identifier") key = node.property.name;
      else if (node.computed) {
        const k = evalNode(node.property as BabelNode, scope);
        if (typeof k === "string" || typeof k === "number") key = k;
      }
      if (key === null) return UNSERIALIZABLE;
      return (obj as Record<string | number, unknown>)[key];
    }
    case "TemplateLiteral": {
      let out = "";
      for (let i = 0; i < node.quasis.length; i++) {
        out += node.quasis[i].value.cooked ?? node.quasis[i].value.raw;
        if (i < node.expressions.length) {
          const v = evalNode(node.expressions[i] as BabelNode, scope);
          if (v === UNSERIALIZABLE || v == null || typeof v === "object") return UNSERIALIZABLE;
          out += String(v);
        }
      }
      return out;
    }
    case "UnaryExpression":
      if (node.operator === "-") {
        const inner = evalNode(node.argument, scope);
        return typeof inner === "number" ? -inner : UNSERIALIZABLE;
      }
      return UNSERIALIZABLE;
    case "ArrayExpression": {
      const out: unknown[] = [];
      for (const el of node.elements) {
        if (el === null) {
          out.push(null);
        } else if (el.type === "SpreadElement") {
          const spread = evalNode(el.argument, scope);
          if (!Array.isArray(spread)) return UNSERIALIZABLE;
          out.push(...spread);
        } else {
          const v = evalNode(el, scope);
          if (v === UNSERIALIZABLE) return UNSERIALIZABLE;
          out.push(v);
        }
      }
      return out;
    }
    case "ObjectExpression":
      return evalObject(node, scope);
    case "ParenthesizedExpression":
      return evalNode(node.expression, scope);
    default:
      return UNSERIALIZABLE;
  }
}

function evalObject(
  node: ObjectExpression,
  scope: Scope,
): Record<string, unknown> | typeof UNSERIALIZABLE {
  const out: Record<string, unknown> = {};
  for (const prop of node.properties) {
    if (prop.type === "SpreadElement") {
      const spread = evalNode(prop.argument, scope);
      if (spread === UNSERIALIZABLE || !isPlainObject(spread)) return UNSERIALIZABLE;
      Object.assign(out, spread);
      continue;
    }
    if (prop.type !== "ObjectProperty" || prop.computed) return UNSERIALIZABLE;
    const key =
      prop.key.type === "Identifier"
        ? prop.key.name
        : prop.key.type === "StringLiteral"
          ? prop.key.value
          : null;
    if (key === null) return UNSERIALIZABLE;
    const value = evalNode(prop.value as BabelNode, scope);
    if (value === UNSERIALIZABLE) return UNSERIALIZABLE;
    out[key] = value;
  }
  return out;
}

// ── Descriptor-driven value coercion ──────────────────────────────────────────

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Coerce a statically-evaluated JS value into internal DocNode prop shape, guided
 * by the prop's descriptor (mirrors the wrapping the exporter unwinds).
 */
function coerceValue(
  value: unknown,
  desc: PropDescriptor | undefined,
  ctx: string,
  warnings: ImportIssue[],
): unknown {
  if (value === UNSERIALIZABLE) {
    warnings.push({
      level: "warning",
      context: ctx,
      message: `value is not statically serializable (function/variable/expression) — dropped.`,
    });
    return undefined;
  }

  if (!desc) return value; // unknown prop: pass through (already warned by caller)

  switch (desc.kind) {
    case "content":
      // Already a DynamicString? keep it. A bare string becomes a literal.
      if (isPlainObject(value) && ("literalString" in value || "path" in value)) return value;
      if (typeof value === "string") return { literalString: value };
      if (typeof value === "number" || typeof value === "boolean") {
        return { literalString: String(value) };
      }
      return value;

    case "object": {
      if (!isPlainObject(value)) return value;
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value)) {
        const field = desc.fields?.find((f) => f.name === k);
        out[k] = coerceValue(v, field, `${ctx}.${k}`, warnings);
      }
      return out;
    }

    case "array": {
      if (!Array.isArray(value)) return value;
      return value.map((item, i) => coerceArrayItem(item, desc, `${ctx}[${i}]`, warnings));
    }

    default:
      return value;
  }
}

function coerceArrayItem(
  item: unknown,
  desc: PropDescriptor,
  ctx: string,
  warnings: ImportIssue[],
): unknown {
  if (!isPlainObject(item)) return item;

  // Discriminated union (e.g. ButtonGroup.items keyed by `kind`).
  if (desc.itemVariants?.length && desc.itemDiscriminator) {
    const discValue = item[desc.itemDiscriminator];
    const variant = desc.itemVariants.find((v) => v.value === discValue);
    const fields = variant?.fields;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(item)) {
      const field = fields?.find((f) => f.name === k);
      out[k] = coerceValue(v, field, `${ctx}.${k}`, warnings);
    }
    return out;
  }

  // Homogeneous object items.
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(item)) {
    const field = desc.itemFields?.find((f) => f.name === k);
    out[k] = coerceValue(v, field, `${ctx}.${k}`, warnings);
  }
  return out;
}

// ── JSX helpers ───────────────────────────────────────────────────────────────

function jsxName(
  name: JSXIdentifier | JSXMemberExpression | JSXNamespacedName,
): string {
  if (name.type === "JSXIdentifier") return name.name;
  if (name.type === "JSXNamespacedName") return `${name.namespace.name}:${name.name.name}`;
  // JSXMemberExpression, e.g. <Foo.Bar/>
  const obj =
    name.object.type === "JSXMemberExpression" ? jsxName(name.object) : name.object.name;
  return `${obj}.${name.property.name}`;
}

/** Pull the JS value out of a JSX attribute (`foo="x"`, `foo={…}`, or bare `foo`). */
function attrValue(attr: JSXAttribute, scope: Scope): unknown {
  const v = attr.value;
  if (v === null || v === undefined) return true; // bare boolean attribute
  if (v.type === "StringLiteral") return v.value;
  if (v.type === "JSXExpressionContainer") {
    if (v.expression.type === "JSXEmptyExpression") return undefined;
    return evalNode(v.expression as BabelNode, scope);
  }
  return UNSERIALIZABLE; // JSXElement / JSXFragment as an attribute value
}

function isElementChild(node: BabelNode): boolean {
  return node.type === "JSXElement" || node.type === "JSXFragment";
}

/** Concatenate JSXText runs into a single trimmed string (collapsing whitespace). */
function textOf(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

// ── CSS translation ───────────────────────────────────────────────────────────

function translateStyle(
  style: Record<string, unknown>,
  ctx: string,
  warnings: ImportIssue[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const warnOffToken = (prop: string, raw: unknown, token: string) =>
    warnings.push({
      level: "warning",
      context: ctx,
      message: `${prop}: ${String(raw)} snapped to nearest token "${token}".`,
    });

  const isFlex = style.display === "flex" || style.display === "inline-flex";
  const isGrid = style.display === "grid" || style.display === "inline-grid";

  for (const [prop, raw] of Object.entries(style)) {
    switch (prop) {
      case "display":
        if (isGrid || isFlex || raw === "block" || raw === undefined) break;
        warnings.push({ level: "warning", context: ctx, message: `display: ${String(raw)} not supported — treated as a flex Box.` });
        break;
      case "flexDirection":
        out.direction = raw === "row" || raw === "row-reverse" ? "horizontal" : "vertical";
        break;
      case "gap":
      case "rowGap":
      case "columnGap":
      case "gridGap":
      case "gridRowGap":
      case "gridColumnGap": {
        const n = parsePx(raw);
        if (n === null) { out.gap = raw; break; }
        const { token, exact } = snap(n, SPACE_SCALE);
        out.gap = token;
        if (!exact) warnOffToken("gap", raw, token);
        break;
      }
      case "padding": {
        const n = parsePx(raw);
        if (n === null) { out.padding = raw; break; }
        const { token, exact } = snap(n, SPACE_SCALE);
        out.padding = token;
        if (!exact) warnOffToken("padding", raw, token);
        break;
      }
      case "justifyContent": {
        const mapped = JUSTIFY_CSS[String(raw)];
        if (mapped) out.justify = mapped;
        else warnings.push({ level: "warning", context: ctx, message: `justifyContent: ${String(raw)} has no Box equivalent — dropped.` });
        break;
      }
      case "alignItems": {
        const mapped = ALIGN_CSS[String(raw)];
        if (mapped) out.align = mapped;
        else warnings.push({ level: "warning", context: ctx, message: `alignItems: ${String(raw)} has no Box equivalent — dropped.` });
        break;
      }
      case "gridTemplateColumns":
        warnings.push({ level: "warning", context: ctx, message: `${prop}: grid mapped to a wrapping flex row (Box wrap) — the exact column count is not pinned.` });
        break;
      case "gridTemplateRows":
      case "gridAutoFlow":
      case "gridAutoColumns":
      case "gridAutoRows":
        warnings.push({ level: "warning", context: ctx, message: `${prop}: grid-specific layout has no Box equivalent — dropped.` });
        break;
      case "width": out.width = String(raw); break;
      case "height": out.height = String(raw); break;
      case "background":
      case "backgroundColor": out.background = String(raw); break;
      case "overflow":
      case "overflowX":
      case "overflowY": out.overflow = String(raw); break;
      case "borderRadius": {
        const n = parsePx(raw);
        if (n === null) { out.borderRadius = raw; break; }
        const { token, exact } = snap(n, RADIUS_SCALE);
        out.borderRadius = token;
        if (!exact) warnOffToken("borderRadius", raw, token);
        break;
      }
      case "border": {
        // "1px solid #ccc" → borderWidth + borderColor
        const m = String(raw).match(/^(\d+(?:\.\d+)?px)\s+\w+\s+(.+)$/);
        if (m) { out.borderWidth = m[1]; out.borderColor = m[2]; }
        else out.borderWidth = String(raw);
        break;
      }
      case "borderWidth": out.borderWidth = String(raw); break;
      case "borderColor": out.borderColor = String(raw); break;
      default:
        warnings.push({ level: "warning", context: ctx, message: `CSS property "${prop}" is not supported by Box — dropped.` });
    }
  }

  // A flex/grid container with no explicit direction defaults to a row.
  if ((isFlex || isGrid) && out.direction === undefined && style.flexDirection === undefined) {
    out.direction = "horizontal";
  }
  // A grid is a reflowing row of cards → a wrapping flex Box.
  if (isGrid) out.wrap = true;
  return out;
}

// ── Node construction ─────────────────────────────────────────────────────────

interface BuildCtx {
  catalog: CatalogModel;
  nodes: Record<NodeId, DocNode>;
  warnings: ImportIssue[];
}

/** Resolve a JSX tag to a catalog/Box/Text type plus seeded props. */
function resolveTag(
  tag: string,
  catalog: CatalogModel,
): { type: string; seedProps: Record<string, unknown>; textTag: boolean; aliasedFrom?: string } {
  if (HTML_TO_CATALOG[tag]) {
    return { type: HTML_TO_CATALOG[tag], seedProps: {}, textTag: false };
  }
  if (TEXT_TAGS[tag]) {
    const t = TEXT_TAGS[tag];
    const seed: Record<string, unknown> = { kind: t.kind };
    if (t.size) seed.size = t.size;
    if (t.bold) seed.bold = true;
    if (TEXT_PRIMITIVES.has(tag)) seed.primitive = tag;
    return { type: "Text", seedProps: seed, textTag: true };
  }
  // Other lowercase HTML → Box layout primitive.
  if (tag[0] === tag[0].toLowerCase()) {
    return { type: FRAME_TYPE, seedProps: {}, textTag: false };
  }
  // Capitalized → a catalog component. Try the exact name, then a suffix-stripped
  // alias (e.g. `TileletComponent` → `Tilelet`) before giving up.
  if (catalog.components[tag]) return { type: tag, seedProps: {}, textTag: false };
  const base = stripComponentSuffix(tag);
  if (base && catalog.components[base]) {
    return { type: base, seedProps: {}, textTag: false, aliasedFrom: tag };
  }
  return { type: tag, seedProps: {}, textTag: false };
}

function makeBox(ctx: BuildCtx): DocNode {
  const node = createNode(ctx.catalog, FRAME_TYPE);
  node.children = [];
  return node;
}

/** Build a `Text` node carrying a literal string (used for loose text runs). */
function makeText(ctx: BuildCtx, text: string): NodeId {
  const id = newId();
  ctx.nodes[id] = { id, type: "Text", props: { kind: "body", children: { literalString: text } } };
  return id;
}

function buildElement(el: JSXElement, ctx: BuildCtx, scope: Scope): NodeId {
  const tag = jsxName(el.openingElement.name);
  const { type, seedProps, textTag, aliasedFrom } = resolveTag(tag, ctx.catalog);
  const model: ComponentModel | undefined = ctx.catalog.components[type];

  if (aliasedFrom) {
    ctx.warnings.push({
      level: "warning",
      context: aliasedFrom,
      message: `mapped <${aliasedFrom}> to catalog component "${type}".`,
    });
  } else if (!model && type === tag && /^[A-Z]/.test(tag)) {
    ctx.warnings.push({
      level: "warning",
      context: tag,
      message: `"${tag}" is not in the catalog — kept as-is; it will render as a fallback box and may fail export.`,
    });
  }

  const props: Record<string, unknown> = { ...seedProps };

  for (const attr of el.openingElement.attributes) {
    if (attr.type === "JSXSpreadAttribute") {
      // Statically-resolvable spread (e.g. {...tile}) is folded in; otherwise warn.
      const spread = evalNode(attr.argument as BabelNode, scope);
      if (isPlainObject(spread)) {
        for (const [k, v] of Object.entries(spread)) {
          const desc = model?.props.find((p) => p.name === k);
          const coerced = coerceValue(v, desc, `${tag}.${k}`, ctx.warnings);
          if (coerced !== undefined) props[k] = coerced;
        }
      } else {
        ctx.warnings.push({ level: "warning", context: tag, message: `spread attribute {...} cannot be resolved statically — dropped.` });
      }
      continue;
    }
    const name = attr.name.type === "JSXIdentifier" ? attr.name.name : jsxName(attr.name);

    if (name === "key" || name === "ref") continue;
    if (name === "className" || name === "class") {
      ctx.warnings.push({ level: "warning", context: `${tag}.className`, message: `className cannot be resolved (no external stylesheet) — dropped.` });
      continue;
    }
    if (name === "style") {
      const raw = attrValue(attr, scope);
      if (isPlainObject(raw)) {
        const boxProps = translateStyle(raw, `${tag}.style`, ctx.warnings);
        if (type === FRAME_TYPE) Object.assign(props, boxProps);
        else if (Object.keys(boxProps).length) {
          ctx.warnings.push({ level: "warning", context: `${tag}.style`, message: `inline style on <${tag}> is not a layout Box — style dropped.` });
        }
      }
      continue;
    }

    const desc = model?.props.find((p) => p.name === name);
    if (model && !desc && name !== model.slotProp) {
      ctx.warnings.push({ level: "warning", context: `${tag}.${name}`, message: `"${name}" is not a known prop of ${type} — kept as a raw value.` });
    }
    const coerced = coerceValue(attrValue(attr, scope), desc, `${tag}.${name}`, ctx.warnings);
    if (coerced !== undefined) props[name] = coerced;
  }

  const id = newId();
  const node: DocNode = { id, type, props };

  const isSlot = model?.isSlotContainer ?? type === FRAME_TYPE;
  const contentDesc = model?.props.find((p) => p.name === "children" && p.kind === "content");

  if (isSlot) {
    node.children = appendChildren(el.children, ctx, scope);
  } else if (contentDesc || textTag) {
    // Non-container with a `children` content prop → fold text into a literal.
    const text = collectText(el, ctx, tag, scope);
    if (text && props.children === undefined) props.children = { literalString: text };
  } else if (el.children.some(isElementChild)) {
    ctx.warnings.push({ level: "warning", context: tag, message: `<${tag}> is not a container — its child elements were dropped.` });
  }

  ctx.nodes[id] = node;
  return id;
}

/** Build child node ids for a slot container, turning loose text runs into Text nodes. */
function appendChildren(children: JSXChild[], ctx: BuildCtx, scope: Scope): NodeId[] {
  const ids: NodeId[] = [];
  for (const child of children) {
    switch (child.type) {
      case "JSXElement":
        ids.push(buildElement(child, ctx, scope));
        break;
      case "JSXFragment":
        ids.push(...appendChildren(child.children, ctx, scope)); // inline fragments
        break;
      case "JSXText": {
        const text = textOf(child.value);
        if (text) ids.push(makeText(ctx, text));
        break;
      }
      case "JSXExpressionContainer": {
        if (child.expression.type === "JSXEmptyExpression") break;
        ids.push(...buildChildExpression(child.expression as BabelNode, ctx, scope));
        break;
      }
      default:
        break;
    }
  }
  return ids;
}

/**
 * Resolve a `{ … }` child expression into nodes: `arr.map(...)` unrolls over a
 * static array, `cond && <X/>` / `cond ? <A/> : <B/>` pick a branch, a bare
 * `<X/>` builds directly, and a resolvable string becomes a Text node.
 */
function buildChildExpression(expr: BabelNode, ctx: BuildCtx, scope: Scope): NodeId[] {
  switch (expr.type) {
    case "JSXElement":
      return [buildElement(expr, ctx, scope)];
    case "JSXFragment":
      return appendChildren(expr.children, ctx, scope);
    case "ParenthesizedExpression":
      return buildChildExpression(expr.expression as BabelNode, ctx, scope);
    case "CallExpression": {
      const ids = unrollMap(expr, ctx, scope);
      if (ids) return ids;
      ctx.warnings.push({
        level: "warning",
        message: `dynamic list could not be unrolled — its data is not statically present in the snippet; paste the data array alongside the markup, or fix it after import.`,
      });
      return [];
    }
    case "LogicalExpression": {
      if (expr.operator === "&&") {
        const left = evalNode(expr.left, scope);
        if (left === UNSERIALIZABLE) {
          ctx.warnings.push({ level: "warning", message: `conditional child {cond && …} could not be resolved — dropped.` });
          return [];
        }
        return left ? buildChildExpression(expr.right as BabelNode, ctx, scope) : [];
      }
      break;
    }
    case "ConditionalExpression": {
      const test = evalNode(expr.test, scope);
      if (test === UNSERIALIZABLE) {
        ctx.warnings.push({ level: "warning", message: `conditional child {a ? b : c} could not be resolved — dropped.` });
        return [];
      }
      return buildChildExpression((test ? expr.consequent : expr.alternate) as BabelNode, ctx, scope);
    }
    default:
      break;
  }
  const v = evalNode(expr, scope);
  if (typeof v === "string" && v.trim()) return [makeText(ctx, v.trim())];
  if (v === UNSERIALIZABLE) {
    ctx.warnings.push({ level: "warning", message: `dynamic child {expression} could not be resolved — dropped.` });
  }
  return [];
}

/**
 * Unroll `arr.map((item, i) => <JSX/>)` over a statically-known array into one
 * node per element. Returns null when the call isn't a recognizable `.map` over a
 * resolvable array (the caller then emits a warning).
 */
function unrollMap(call: CallExpression, ctx: BuildCtx, scope: Scope): NodeId[] | null {
  const callee = call.callee;
  if (callee.type !== "MemberExpression" && callee.type !== "OptionalMemberExpression") return null;
  if (callee.computed || callee.property.type !== "Identifier" || callee.property.name !== "map") {
    return null;
  }
  const arr = evalNode(callee.object as BabelNode, scope);
  if (!Array.isArray(arr)) return null;

  const cb = call.arguments[0];
  if (!cb || (cb.type !== "ArrowFunctionExpression" && cb.type !== "FunctionExpression")) return null;
  const p0 = cb.params[0];
  const p1 = cb.params[1];
  const itemName = p0 && p0.type === "Identifier" ? p0.name : null;
  const idxName = p1 && p1.type === "Identifier" ? p1.name : null;

  let tpl: BabelNode | null;
  if (cb.body.type === "BlockStatement") {
    const ret = cb.body.body.find((s) => s.type === "ReturnStatement");
    tpl = ret && ret.argument ? ret.argument : null;
  } else {
    tpl = cb.body;
  }
  if (!tpl) return null;

  const ids: NodeId[] = [];
  arr.forEach((el, i) => {
    const childScope: Scope = { ...scope };
    if (itemName) childScope[itemName] = el;
    if (idxName) childScope[idxName] = i;
    ids.push(...buildChildExpression(tpl as BabelNode, ctx, childScope));
  });
  return ids;
}

function collectText(el: JSXElement, ctx: BuildCtx, tag: string, scope: Scope): string {
  const parts: string[] = [];
  for (const child of el.children) {
    if (child.type === "JSXText") {
      const t = textOf(child.value);
      if (t) parts.push(t);
    } else if (child.type === "JSXExpressionContainer" && child.expression.type !== "JSXEmptyExpression") {
      const v = evalNode(child.expression as BabelNode, scope);
      if (typeof v === "string") parts.push(v);
      else if (v === UNSERIALIZABLE)
        ctx.warnings.push({ level: "warning", context: tag, message: `dynamic text {expression} could not be resolved — dropped.` });
    } else if (isElementChild(child)) {
      ctx.warnings.push({ level: "warning", context: tag, message: `<${tag}> mixes text and elements — nested elements were dropped.` });
    }
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

// ── Parsing ───────────────────────────────────────────────────────────────────

/** Parse a bare expression snippet (one or many roots) into a JSX fragment. */
function parseFragment(code: string): JSXFragment {
  let expr: Expression;
  try {
    expr = parseExpression(`<>${code}</>`, { plugins: ["jsx", "typescript"], errorRecovery: false });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new ImportError(`Could not parse the pasted code as JSX: ${msg}`);
  }
  if (expr.type !== "JSXFragment") throw new ImportError("The pasted code is not a JSX element.");
  return expr;
}

/**
 * Parse the input. Tries a full module parse first so top-level `const`
 * declarations become a static scope and JSX statements become roots; falls back
 * to a bare-expression fragment parse for snippets that aren't a valid module.
 */
function parseInput(code: string): { scope: Scope; roots: JSXChild[] } {
  const trimmed = code.trim();
  if (!trimmed) throw new ImportError("Nothing to import — the snippet is empty.");

  try {
    const file = parse(trimmed, { sourceType: "module", plugins: ["jsx", "typescript"] });
    const scope: Scope = {};
    const roots: JSXChild[] = [];
    for (const stmt of file.program.body) {
      if (stmt.type === "VariableDeclaration") {
        for (const d of stmt.declarations) {
          if (d.id.type === "Identifier" && d.init) {
            const v = evalNode(d.init as BabelNode, scope);
            if (v !== UNSERIALIZABLE) scope[d.id.name] = v;
          }
        }
      } else if (stmt.type === "ExpressionStatement") {
        const ex = stmt.expression;
        if (ex.type === "JSXElement" || ex.type === "JSXFragment") roots.push(ex);
      }
    }
    if (roots.length > 0) return { scope, roots };
  } catch {
    // Not a valid module — fall through to the fragment parser below.
  }

  return { scope: {}, roots: parseFragment(trimmed).children };
}

// ── Entry point ───────────────────────────────────────────────────────────────

export function importCode(code: string, catalog: CatalogModel): ImportResult {
  const { scope, roots } = parseInput(code);
  const ctx: BuildCtx = { catalog, nodes: {}, warnings: [] };

  const root = makeBox(ctx);
  ctx.nodes[root.id] = root;
  root.children = appendChildren(roots, ctx, scope);

  if (root.children.length === 0) {
    throw new ImportError("No renderable elements were found in the pasted code.");
  }

  const surface: Surface = {
    id: newId(),
    name: "Imported",
    root: root.id,
    nodes: ctx.nodes,
  };

  return { surface, warnings: ctx.warnings };
}
