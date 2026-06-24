/**
 * Ajv validators built from catalog.json.
 *
 * The catalog is JSON-Schema draft 2020-12 and `$ref`s two external a2ui.org
 * schemas (ComponentCommon, DynamicString) that can't be fetched, so we register
 * local stubs. Each catalog component compiles to a validator keyed by name.
 *
 * Two known catalog gaps (ARCHITECTURE §13) are accommodated so VALID exports pass:
 *  - Layout primitives (Column/Row) aren't in the catalog → structural check only.
 *  - Slot containers type `children` as DynamicString but we emit id-ref arrays
 *    (the unresolved `x-a2ui-slot` overload) → array `children` is checked
 *    structurally and omitted from the schema validation.
 */
import Ajv2020, { type ValidateFunction } from "ajv/dist/2020";
import addFormats from "ajv-formats";
import type { A2UIComponent, A2UIExport } from "./a2ui.types";
import { isA2UILayout } from "./frame";

const COMMON_TYPES_ID =
  "https://a2ui.org/specification/v0_9/common_types.json";

const commonTypesStub = {
  $id: COMMON_TYPES_ID,
  $defs: {
    ComponentCommon: {
      type: "object",
      properties: {
        id: { type: "string" },
        component: { type: "string" },
      },
    },
    DynamicString: {
      type: "object",
      oneOf: [
        {
          type: "object",
          properties: { literalString: { type: "string" } },
          required: ["literalString"],
        },
        {
          type: "object",
          properties: { path: { type: "string" } },
          required: ["path"],
        },
      ],
    },
  },
};

export interface ValidationError {
  componentId: string;
  component: string;
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  errors: ValidationError[];
}

export interface Validators {
  catalogId: string;
  byName: Record<string, ValidateFunction>;
}

export function buildValidators(catalogJson: unknown): Validators {
  const catalog = catalogJson as {
    $id: string;
    catalogId: string;
    components: Record<string, unknown>;
  };

  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  ajv.addSchema(commonTypesStub);
  ajv.addSchema(catalog as object); // resolved by its own $id

  const byName: Record<string, ValidateFunction> = {};
  for (const name of Object.keys(catalog.components)) {
    const ref = `${catalog.$id}#/components/${name}`;
    const validate = ajv.getSchema(ref);
    if (validate) byName[name] = validate as ValidateFunction;
  }

  return { catalogId: catalog.catalogId, byName };
}

function checkLayout(comp: A2UIComponent): ValidationError[] {
  const errors: ValidationError[] = [];
  if (typeof comp.id !== "string") {
    errors.push({
      componentId: String(comp.id),
      component: comp.component,
      message: "layout component is missing a string id",
    });
  }
  if (comp.children !== undefined) {
    if (
      !Array.isArray(comp.children) ||
      !comp.children.every((c) => typeof c === "string")
    ) {
      errors.push({
        componentId: comp.id,
        component: comp.component,
        message: "layout children must be an array of string id refs",
      });
    }
  }
  return errors;
}

export function validate(
  a2ui: A2UIExport,
  validators: Validators,
): ValidationResult {
  const errors: ValidationError[] = [];

  for (const comp of a2ui.surfaceUpdate.components) {
    if (isA2UILayout(comp.component)) {
      errors.push(...checkLayout(comp));
      continue;
    }

    const validateFn = validators.byName[comp.component];
    if (!validateFn) {
      errors.push({
        componentId: comp.id,
        component: comp.component,
        message: `no catalog schema for component "${comp.component}"`,
      });
      continue;
    }

    // Slot children are id-ref arrays the catalog can't yet express → validate
    // the rest of the component and check children structurally.
    let subject: A2UIComponent = comp;
    if (Array.isArray(comp.children)) {
      const { children, ...rest } = comp;
      if (!children.every((c) => typeof c === "string")) {
        errors.push({
          componentId: comp.id,
          component: comp.component,
          message: "slot children must be string id refs",
        });
      }
      subject = rest as A2UIComponent;
    }

    if (!validateFn(subject)) {
      for (const err of validateFn.errors ?? []) {
        errors.push({
          componentId: comp.id,
          component: comp.component,
          message: `${err.instancePath || "/"} ${err.message ?? "invalid"}`,
        });
      }
    }
  }

  return { ok: errors.length === 0, errors };
}
