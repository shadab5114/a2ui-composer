// @pds/a2ui-schema — pure tree⇆adjacency transforms, catalog model, validation.
// Zero React/DOM imports: this package stays unit-testable.

export * from "./a2ui.types";
export * from "./doc.types";
export * from "./catalog.types";
export * from "./catalog";
export * from "./transform";
export * from "./validate";
export * from "./factory";
export {
  FRAME_TYPE,
  A2UI_COLUMN,
  A2UI_ROW,
  SPACE_TOKENS,
  frameComponentModel,
  frameDefaultProps,
  frameToA2UIComponent,
  isA2UILayout,
} from "./frame";

import catalogJson from "@shadab5114/pds-core/catalog.json";
import { loadCatalog } from "./catalog";
import type { CatalogModel } from "./catalog.types";

/** The raw catalog JSON, imported directly from the design-system package. */
export const rawCatalog: unknown = catalogJson;

/** Lazily-built, memoized normalized catalog model from the real @pds/core catalog. */
let _catalog: CatalogModel | null = null;
export function getCatalog(): CatalogModel {
  if (!_catalog) _catalog = loadCatalog(catalogJson);
  return _catalog;
}
