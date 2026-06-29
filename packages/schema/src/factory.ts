/**
 * Pure factories for editor nodes and surfaces. Lives in `schema` (no React) so the
 * store and dev fixtures share one source of truth for default props.
 */
import { nanoid } from "nanoid";
import type { CatalogModel, ComponentModel, PropDescriptor } from "./catalog.types";
import type { DocNode, Surface } from "./doc.types";
import { FRAME_TYPE, SLOT_TYPE } from "./frame";

export const newId = (): string => nanoid(8);

/**
 * Empty `Slot` nodes for each object-slot prop a component declares (cap/header/
 * footer on ComposableTileContainer). Materialising these up-front means the canvas
 * always shows the named slot zones as droppable targets — the editor's signal that
 * the component accepts children in those regions. Empty zones are editor-only
 * scaffolding: the exporter drops a slot that has no children and no props.
 */
export function emptySlotNodesFor(model: ComponentModel | undefined): DocNode[] {
  if (!model) return [];
  const out: DocNode[] = [];
  for (const p of model.props) {
    if (p.objectSlot) {
      out.push({ id: newId(), type: SLOT_TYPE, props: {}, children: [], editorMeta: { slotOf: p.name } });
    }
  }
  return out;
}

// Inline SVG data-URI used for placeholder images so no network is required.
const PLACEHOLDER_IMG =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='240'%3E%3Crect width='400' height='240' fill='%23e8e8e8'/%3E%3Ctext x='200' y='125' text-anchor='middle' font-family='sans-serif' font-size='18' fill='%23aaa'%3EImage%3C/text%3E%3C/svg%3E";

/**
 * Per-component rich example data. Values must match the internal doc format:
 *   • content props  → { literalString: "..." }
 *   • plain strings  → "..."   (e.g. Accordion item header, which is string not content)
 *   • object props   → { subField: value, ... }
 *   • enum / bool    → the literal value
 */
const RICH_DEFAULTS: Record<string, Record<string, unknown>> = {
  Button: {
    kind: "primary",
    children: { literalString: "Get Started" },
  },

  TextLink: {
    kind: "standalone",
    size: "large",
    children: { literalString: "Learn More" },
  },

  TextLinkCaret: {
    iconPosition: "right",
    children: { literalString: "View All Details" },
  },

  ButtonGroup: {
    surface: "lightPrimary",
    items: [
      { kind: "primary",  children: { literalString: "Get Started" } },
      { kind: "textLink", children: { literalString: "Learn More" } },
    ],
  },

  IconButton: {
    kind: "ghost",
    surface: "lightPrimary",
    ariaLabel: "Action button",
  },

  Text: {
    kind: "body",
    size: "medium",
    children: { literalString: "The quick brown fox jumps over the lazy dog. This is sample body copy to help you visualise the layout." },
  },

  Caret: {
    direction: "right",
  },

  DirectionalIcon: {
    name: "right-arrow",
  },

  Tooltip: {
    title: "Helpful tip",
    children: { literalString: "Hover for more info" },
  },

  Badge: {
    backgroundColor: "blue",
    children: { literalString: "New" },
  },

  BadgeIndicator: {
    kind: "numbered",
    surface: "lightPrimary",
    children: "3",
  },

  Image: {
    src: PLACEHOLDER_IMG,
    alt: "Placeholder image",
    width: "100%",
    height: "240px",
    objectFit: "cover",
  },

  TileContainer: {
    surface: "lightPrimary",
    dropShadow: "subtle",
    padding: "16px",
    borderRadius: "8px",
  },

  // eyebrow / title / subtitle are object-kind props; seed their content sub-field.
  TitleLockup: {
    eyebrow:  { children: { literalString: "Category Label" } },
    title:    { children: { literalString: "Main Title Heading" } },
    subtitle: { children: { literalString: "Supporting subtitle text that provides additional context about this section." } },
    surface: "lightPrimary",
  },

  TitleLockupTitle: {
    size: "titleLarge",
    children: { literalString: "Title Heading" },
  },

  TitleLockupSubtitle: {
    size: "bodyMedium",
    children: { literalString: "Subtitle description text" },
  },

  TitleLockupEyebrow: {
    size: "bodySmall",
    children: { literalString: "Category Label" },
  },

  ScreenReaderText: {
    children: { literalString: "Screen reader only content" },
  },

  Tilelet: {
    eyebrow:  { children: { literalString: "Feature" } },
    title:    { children: { literalString: "Card Title" } },
    subtitle: { children: { literalString: "Short supporting description for this tile." } },
    image: { src: PLACEHOLDER_IMG, alt: "Tile image", width: "100%", height: "200px", objectFit: "cover" },
    imagePosition: "aboveText",
    surface: "lightPrimary",
    dropShadow: "subtle",
  },

  // Accordion items: header is a plain string (not content/DynamicString per schema).
  // children inside items IS content → { literalString }.
  Accordion: {
    behavior: "singleOpen",
    bottomLine: true,
    padding: "standard",
    surface: "lightPrimary",
    triggerAlignment: "top",
    triggerElement: "icon",
    items: [
      {
        header: "How do I track my order?",
        children: { literalString: "You can track your order from the Orders page in your account, or via the tracking link in your confirmation email." },
        opened: true,
      },
      {
        header: "What is the return policy?",
        children: { literalString: "Most items can be returned within 30 days of delivery for a full refund, provided they are in their original condition." },
        opened: false,
      },
      {
        header: "How do I contact support?",
        children: { literalString: "Reach our support team 24/7 via live chat, or call us at 1-800-000-0000." },
        opened: false,
      },
    ],
  },

  AccordionItem: {
    header: "How do I get started?",
    children: { literalString: "Getting started is easy — sign in to your account and follow the on-screen setup steps." },
    opened: true,
  },

  Box: {
    direction: "vertical",
    gap: "2X",
    padding: "0",
  },
};

/** Returns a readable mock string for a content prop — fallback for components not in RICH_DEFAULTS. */
function contentPlaceholder(propName: string, componentName: string): string {
  switch (propName.toLowerCase()) {
    case "eyebrow":                    return "Eyebrow";
    case "title": case "heading":      return "Title Heading";
    case "subtitle": case "subheading": return "Subtitle text";
    case "description": case "body":   return "Description text goes here";
    case "label":                      return "Label";
    case "caption":                    return "Caption";
    case "children": case "text":      return componentName;
    default: return propName.charAt(0).toUpperCase() + propName.slice(1);
  }
}

/** Build one default item for an array prop — used only for components not in RICH_DEFAULTS. */
function defaultItemFor(p: PropDescriptor, componentName: string): Record<string, unknown> | null {
  const seedFields = (fields: PropDescriptor[]): Record<string, unknown> => {
    const item: Record<string, unknown> = {};
    for (const f of fields) {
      if (f.default !== undefined) item[f.name] = f.default;
      else if (f.kind === "content") item[f.name] = { literalString: contentPlaceholder(f.name, componentName) };
      else if (f.kind === "enum" && f.options?.length) item[f.name] = f.options[0];
    }
    return item;
  };
  if (p.itemVariants?.length && p.itemDiscriminator) {
    const v = p.itemVariants[0];
    return { [p.itemDiscriminator]: v.value, ...seedFields(v.fields) };
  }
  if (p.itemFields?.length) {
    const item = seedFields(p.itemFields);
    return Object.keys(item).length ? item : null;
  }
  return null;
}

/**
 * Default props for a fresh node.
 * Priority: RICH_DEFAULTS (curated example) › schema default › generic placeholder.
 */
export function defaultPropsFor(model: ComponentModel): Record<string, unknown> {
  const rich = RICH_DEFAULTS[model.name];
  const props: Record<string, unknown> = rich ? { ...rich } : {};

  for (const p of model.props) {
    if (props[p.name] !== undefined) continue; // already set by rich example

    if (p.default !== undefined) {
      props[p.name] = p.default;
    } else if (!rich) {
      // Generic seeding only for components with no curated example.
      if (p.kind === "content") {
        props[p.name] = { literalString: contentPlaceholder(p.name, model.name) };
      } else if (p.kind === "enum" && p.options?.length) {
        props[p.name] = p.options[0];
      } else if (p.kind === "array") {
        const item = defaultItemFor(p, model.name);
        if (item) props[p.name] = [item];
      }
    }
  }

  return props;
}

export function createNode(
  catalog: CatalogModel,
  type: string,
  id: string = newId(),
): DocNode {
  const model = catalog.components[type];
  if (!model) throw new Error(`Unknown component type: ${type}`);
  const node: DocNode = { id, type, props: defaultPropsFor(model) };
  if (model.isSlotContainer) node.children = [];
  return node;
}

export function createSurface(
  catalog: CatalogModel,
  opts: { id?: string; name?: string } = {},
): Surface {
  const id = opts.id ?? newId();
  const root = createNode(catalog, FRAME_TYPE);
  return {
    id,
    name: opts.name ?? "Screen",
    root: root.id,
    nodes: { [root.id]: root },
  };
}
