// @pds/a2ui-schema — pure tree⇆adjacency transforms, catalog model, validation.
// Zero React/DOM imports: this package stays unit-testable.

export * from "./a2ui.types";
export * from "./doc.types";
export * from "./catalog.types";
export { loadCatalog } from "./catalog";
export * from "./transform";
export * from "./validate";
export * from "./factory";
export { importCode, ImportError } from "./import-code";
export type { ImportResult, ImportIssue } from "./import-code";
export { getCatalog, buildValidators, rawCatalog, ICON_NAMES } from "./zod-source";
export type { Validators } from "./zod-source";
export {
  FRAME_TYPE,
  A2UI_COLUMN,
  A2UI_ROW,
  SPACE_TOKENS,
  frameComponentModel,
  frameDefaultProps,
  isA2UILayout,
} from "./frame";

// `getCatalog`, `buildValidators`, and `rawCatalog` are sourced from the design
// system's Zod schemas (see ./zod-source) — the single source of truth for both
// the descriptor model and validation.
